import { Lexer, Parser, SemanticAnalyzer, IRGenerator } from './index';
import type { TACInstruction } from './ir';
import { executeTAC, type ExecutionResult } from './verification/interpreter';
import { constantPropagation, type OptimizationLog } from './optimizer/constantPropagation';
import { constantFolding } from './optimizer/constantFolding';
import { commonSubexpressionElimination } from './optimizer/commonSubexpressionElimination';
import { copyPropagation } from './optimizer/copyPropogation';
import { deadCodeElimination } from './optimizer/deadCodeElimination';

export const passes = [
  { id: 'propagate', name: 'Constant propagation', run: constantPropagation },
  { id: 'fold', name: 'Constant folding', run: constantFolding },
  { id: 'reuse', name: 'Common subexpressions', run: commonSubexpressionElimination },
  { id: 'copy', name: 'Copy propagation', run: copyPropagation },
  { id: 'dead', name: 'Dead code elimination', run: deadCodeElimination },
];
export const allPasses = passes.map(p => p.id);
export function instructionText(i: TACInstruction): string {
  if (i.kind === 'return') return `return ${i.value}`;
  return `${i.target} = ${i.kind === 'assign' ? i.value : `${i.left} ${i.operator} ${i.right}`}`;
}
export function outcome(r: ExecutionResult): string {
  return r.success ? `return ${r.returnValue}` : `error: ${r.error}`;
}
export function sameOutcome(a: ExecutionResult, b: ExecutionResult): boolean {
  return a.success === b.success && (a.success ? Object.is(a.returnValue, b.returnValue) : a.error === b.error);
}
export interface Snapshot {
  pass: string; round: number; before: TACInstruction[]; after: TACInstruction[];
  logs: OptimizationLog[]; observed: ExecutionResult; preserved: boolean;
}
export function replay(original: TACInstruction[], enabled = allPasses, injectFault = false) {
  let current = structuredClone(original);
  const baseline = executeTAC(original, true);
  const snapshots: Snapshot[] = [];
  let converged = false;
  for (let round = 1; round <= 10; round++) {
    const start = JSON.stringify(current);
    for (const pass of passes.filter(p => enabled.includes(p.id))) {
      const before = structuredClone(current);
      const result = pass.run(current);
      current = result.instructions;
      const observed = executeTAC(current, true);
      snapshots.push({ pass: pass.name, round, before, after: structuredClone(current), logs: result.logs, observed, preserved: sameOutcome(baseline, observed) });
    }
    if (start === JSON.stringify(current)) { converged = true; break; }
  }
  if (injectFault) {
    const before = structuredClone(current);
    current = current.map(i => i.kind === 'return' ? { ...i, value: String((baseline.returnValue ?? 0) + 1) } : i);
    const observed = executeTAC(current, true);
    snapshots.push({ pass: 'Injected fault: return + 1 (demo only)', round: 0, before, after: structuredClone(current), logs: [], observed, preserved: sameOutcome(baseline, observed) });
  }
  return { instructions: current, baseline, final: executeTAC(current, true), snapshots, converged,
    firstDivergence: snapshots.findIndex(s => !s.preserved) };
}
export function compileLab(source: string, enabled = allPasses, injectFault = false) {
  if (source.length > 20000) throw new Error('Please keep programs below 20,000 characters.');
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens).parse();
  const semantic = new SemanticAnalyzer().analyze(ast);
  if (!semantic.success) throw new Error(semantic.errors.map(e => e.message).join('\n'));
  const original = new IRGenerator().generate(ast).getInstructions();
  return { source, enabled, injectFault, tokens, ast, symbols: semantic.symbols.getAll(), original,
    ...investigate(original, enabled, injectFault) };
}
export function investigate(original: TACInstruction[], enabled = allPasses, injectFault = false) {
  if (original.length > 250) throw new Error('Please keep learning programs below 250 TAC instructions so traces stay readable.');
  const run = replay(original, enabled, injectFault);
  const normalCount = injectFault ? replay(original, enabled).instructions.length : run.instructions.length;
  const counterfactuals = passes.filter(p => enabled.includes(p.id)).map(pass => {
    const omitted = replay(original, enabled.filter(id => id !== pass.id));
    return { pass: pass.name, count: omitted.instructions.length,
      delta: omitted.instructions.length - normalCount,
      preserved: sameOutcome(run.baseline, omitted.final) };
  });
  return { ...run, counterfactuals };
}
export type LabResult = ReturnType<typeof compileLab>;
