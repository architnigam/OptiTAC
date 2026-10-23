import type { TACInstruction } from '../ir';
import { passes, sameOutcome } from '../lab';
import { executeTAC } from '../verification/interpreter';
import { isNumeric } from '../numeric';

export const featureNames = ['Instructions', 'Constant assignments', 'Copy assignments', 'Constant binary expressions', 'Repeated expressions', 'Unused targets', 'Divisions / remainders'];
export function features(ir: TACInstruction[]): number[] {
  const uses = new Set<string>();
  const expressions = new Set<string>();
  let constants = 0, copies = 0, binaryConstants = 0, repeats = 0, traps = 0;
  for (const i of ir) {
    if (i.kind === 'return') uses.add(i.value);
    if (i.kind === 'assign') { uses.add(i.value); if (isNumeric(i.value)) constants++; else copies++; }
    if (i.kind === 'binary') {
      uses.add(i.left); uses.add(i.right);
      if (isNumeric(i.left) && isNumeric(i.right)) binaryConstants++;
      const operands = ['+', '*'].includes(i.operator) ? [i.left, i.right].sort() : [i.left, i.right];
      const key = `${operands[0]}|${i.operator}|${operands[1]}`;
      if (expressions.has(key)) repeats++;
      expressions.add(key);
      if (['/', '%'].includes(i.operator)) traps++;
    }
  }
  return [ir.length, constants, copies, binaryConstants, repeats,
    ir.filter(i => i.kind !== 'return' && !uses.has(i.target)).length, traps];
}
export function isolatedScores(ir: TACInstruction[]) {
  const baseline = executeTAC(ir);
  return passes.map(pass => {
    const run = pass.run(structuredClone(ir));
    return { id: pass.id, name: pass.name, rewrites: run.logs.length,
      preserved: sameOutcome(baseline, executeTAC(run.instructions)) };
  });
}
export function syntheticIR(seed: number): TACInstruction[] {
  let state = seed >>> 0;
  const random = (max: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
  const ir: TACInstruction[] = [];
  const names: string[] = [];
  const add = (i: Omit<Extract<TACInstruction, {kind:'assign'}>, 'id'> | Omit<Extract<TACInstruction, {kind:'binary'}>, 'id'>) => { ir.push({ ...i, id: ir.length + 1 }); names.push(i.target); };
  add({ kind: 'assign', target: 'v0', value: String(1 + random(20)) });
  const count = 3 + random(22);
  for (let n = 1; n <= count; n++) {
    const target = `v${n}`;
    const left = names[random(names.length)];
    const kind = random(6);
    if (kind === 0) add({ kind: 'assign', target, value: String(random(30)) });
    else if (kind === 1) add({ kind: 'assign', target, value: left });
    else if (kind === 2) add({ kind: 'binary', target, left: String(random(9)), operator: '+', right: String(random(9)) });
    else if (kind === 3 && ir.some(i => i.kind === 'binary')) {
      const prior = ir.find(i => i.kind === 'binary')!;
      if (prior.kind === 'binary') add({ ...prior, target });
    } else add({ kind: 'binary', target, left, operator: ['+', '-', '*', '%'][random(4)], right: String(1 + random(8)) });
  }
  ir.push({ id: ir.length + 1, kind: 'return', value: names[random(names.length)] });
  return ir;
}
interface Sample { id: string; x: number[]; y: number[] }
export interface ScoutModel { train: Sample[]; test: Sample[]; mean: number[]; scale: number[] }
export function trainScout(): ScoutModel {
  const samples = Array.from({ length: 240 }, (_, i) => {
    const ir = syntheticIR(8137 + i * 7919);
    return { id: `synthetic-${i + 1}`, x: features(ir), y: isolatedScores(ir).map(s => s.rewrites) };
  });
  // Fixed index split is deterministic. Holdout examples never participate in fitting or neighbor selection.
  const train = samples.filter((_, i) => i % 5 !== 0);
  const test = samples.filter((_, i) => i % 5 === 0);
  const mean = featureNames.map((_, j) => train.reduce((sum, s) => sum + s.x[j], 0) / train.length);
  const scale = mean.map((m, j) => Math.sqrt(train.reduce((sum, s) => sum + (s.x[j] - m) ** 2, 0) / train.length) || 1);
  return { train, test, mean, scale };
}
export function predict(model: ScoutModel, x: number[]) {
  const neighbors = model.train.map(sample => ({ ...sample,
    distance: Math.sqrt(x.reduce((sum, value, j) => sum + ((value - sample.x[j]) / model.scale[j]) ** 2, 0)) }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, 5);
  const exact = neighbors.filter(n => n.distance < 1e-10);
  const selected = exact.length ? exact : neighbors;
  const weights = selected.map(n => exact.length ? 1 : 1 / (n.distance + 0.000001));
  const scores = passes.map((_, j) => selected.reduce((sum, n, i) => sum + n.y[j] * weights[i], 0) / weights.reduce((a, b) => a + b, 0));
  const winner = scores.indexOf(Math.max(...scores));
  return { scores, winner, neighbors };
}
export function evaluateScout(model: ScoutModel) {
  const trainWinners = model.train.map(s => s.y.indexOf(Math.max(...s.y)));
  const majority = passes.map((_, j) => trainWinners.filter(w => w === j).length);
  const baselineWinner = majority.indexOf(Math.max(...majority));
  let absolute = 0, correct = 0, baselineCorrect = 0;
  for (const s of model.test) {
    const prediction = predict(model, s.x);
    absolute += s.y.reduce((sum, value, j) => sum + Math.abs(value - prediction.scores[j]), 0);
    const maximum = Math.max(...s.y);
    if (s.y[prediction.winner] === maximum) correct++;
    if (s.y[baselineWinner] === maximum) baselineCorrect++;
  }
  return { trainCount: model.train.length, testCount: model.test.length, k: 5, correct, baselineCorrect,
    topChoiceAccuracy: correct / model.test.length, baselineAccuracy: baselineCorrect / model.test.length,
    meanAbsoluteError: absolute / (model.test.length * passes.length) };
}
let cached: ScoutModel | undefined;
export function scout(ir: TACInstruction[]) {
  const model = cached ??= trainScout();
  const input = features(ir);
  const prediction = predict(model, input);
  const measured = isolatedScores(ir);
  const actualMax = Math.max(...measured.map(s => s.rewrites));
  return { features: input, ...prediction, measured, evaluation: evaluateScout(model),
    matched: measured[prediction.winner].rewrites === actualMax,
    outOfRange: input.some((value, j) => value < Math.min(...model.train.map(s => s.x[j])) || value > Math.max(...model.train.map(s => s.x[j]))) };
}
export type ScoutReport = ReturnType<typeof scout>;
