import { describe, expect, it } from 'vitest';
import { allPasses, compileLab, sameOutcome } from './lab';
import { runJourney } from './journey';
import { evaluateScout, features, isolatedScores, predict, scout, syntheticIR, trainScout } from './ml/scout';
import { executeTAC } from './verification/interpreter';

type Expr = { value: number } | { op: string; left: Expr; right: Expr };
function render(e: Expr): string { return 'value' in e ? String(e.value) : `(${render(e.left)} ${e.op} ${render(e.right)})`; }
function oracle(e: Expr): number {
  if ('value' in e) return e.value;
  const a = oracle(e.left), b = oracle(e.right);
  if ((e.op === '/' || e.op === '%') && b === 0) throw Error(e.op === '/' ? 'Division by zero.' : 'Modulo by zero.');
  switch (e.op) { case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return a/b;case '%':return a%b; default:throw Error('Bad oracle operator'); }
}
let seed = 96731;
const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
function expression(depth: number): Expr { return depth === 0 ? {value:random(9)} : {op:['+','-','*','/','%'][random(5)],left:expression(depth-1),right:expression(depth-1)}; }
const corpus = Array.from({length:60},(_,i)=>expression(1+i%3));
const subsets = Array.from({length:32},(_,mask)=>allPasses.filter((_,i)=>mask & (1<<i)));

describe('Independent arithmetic oracle across every pass subset',()=> {
  it.each(subsets.map((enabled,i)=>({enabled,i})))('preserves corpus with subset $i',({enabled})=> {
    for (const e of corpus) {
      let expected;
      try { expected = { success:true,returnValue:oracle(e) }; }
      catch(error) { expected = {success:false,error:(error as Error).message}; }
      const run=compileLab(`return ${render(e)};`,enabled);
      expect(sameOutcome(run.baseline,expected),render(e)).toBe(true);
      expect(sameOutcome(run.final,expected),render(e)).toBe(true);
      expect(run.firstDivergence,render(e)).toBe(-1);
    }
  });
});
describe('Numeric and language regressions',()=> {
  it.each(['return 0 * (0 - 1);','return (0 - 1) * 0;','return 0 / (0 - 2);','return (0 - 2) % 2;'])('preserves signed zero: %s', source=> {
    const r=compileLab(source);expect(Object.is(r.baseline.returnValue,-0)).toBe(true);expect(Object.is(r.final.returnValue,-0)).toBe(true);expect(r.firstDivergence).toBe(-1);
  });
  it('preserves explicit overflow and NaN computations',()=> {
    const huge='1'+'0'.repeat(200);
    const r=compileLab(`float a = ${huge} * ${huge}; return a - a;`);
    expect(Number.isNaN(r.final.returnValue)).toBe(true);expect(r.firstDivergence).toBe(-1);
  });
  it.each([
    {source:'int a = 2\nreturn a;',stage:'syntax'},
    {source:'int a = 2; return missing;',stage:'types'},
    {source:'int a = 2; int a = 3; return a;',stage:'types'},
    {source:'int a = 2.5; return a;',stage:'types'},
    {source:'return @;',stage:'tokens'},
    {source:'int a = a + 1; return a;',stage:'types'},
  ])('stops at $stage while keeping earlier artifacts',({source,stage})=> {
    const r=runJourney(source);expect(r.error?.stage).toBe(stage);expect(r.result).toBeUndefined();
    if(stage!=='tokens')expect(r.tokens.length).toBeGreaterThan(0);
    if(stage==='types')expect(r.ast).toBeDefined();
  });
  it('exposes symbols and complete stage outcomes',()=> {
    const r=runJourney('int a = 2; float b = a + 0.5; return b;');
    expect(r.completed).toEqual(['tokens','syntax','types','tac','optimize','verify']);expect(r.symbols.map(s=>s.name)).toEqual(['a','b']);expect(r.result?.final.returnValue).toBe(2.5);
  });
  it('reports oversize input without hanging',()=> { expect(runJourney(' '.repeat(20001)).error?.message).toContain('20,000'); });
  it('bounds trace growth for large learning programs',()=> {
    const source=Array.from({length:251},(_,i)=>`int a${i}=${i};`).join('')+'return a0;';
    const r=runJourney(source);expect(r.error?.stage).toBe('tac');expect(r.error?.message).toContain('250 TAC');
  });
  it('keeps stored traces independent of later variable writes',()=> {
    const r=runJourney('int a=2; int b=a+3; return b;');
    expect(r.result?.baseline.trace?.[0].variables).toEqual({a:2});
  });
});
describe('Local machine learning with observable validation',()=> {
  const model=trainScout();
  it('uses a deterministic, disjoint 192/48 sample split',()=> {
    expect(model.train).toHaveLength(192);expect(model.test).toHaveLength(48);
    expect(model.test.some(t=>model.train.some(s=>s.id===t.id))).toBe(false);
    expect(model.scale.every(n=>n>0&&Number.isFinite(n))).toBe(true);
  });
  it('never uses held-out labels for prediction',()=> {
    const x=features(syntheticIR(7));const before=predict(model,x);
    const changed={...model,test:model.test.map(s=>({...s,y:[999,999,999,999,999]}))};
    expect(predict(changed,x).scores).toEqual(before.scores);
    expect(before.neighbors.every(n=>model.train.some(s=>s.id===n.id))).toBe(true);
  });
  it('reports measured evaluation rather than a fixed accuracy claim',()=> {
    const metrics=evaluateScout(model);expect(metrics.testCount).toBe(48);
    expect(metrics.topChoiceAccuracy).toBeGreaterThanOrEqual(0);expect(metrics.topChoiceAccuracy).toBeLessThanOrEqual(1);
    expect(Number.isFinite(metrics.meanAbsoluteError)).toBe(true);
    console.log('SCOUT_EVALUATION',JSON.stringify(metrics));
  });
  it.each(Array.from({length:60},(_,i)=>i+1))('preserves synthetic IR case %i in every isolated pass',seed=> {
    const ir=syntheticIR(seed*8191);expect(executeTAC(ir).success).toBe(true);expect(isolatedScores(ir).every(s=>s.preserved)).toBe(true);
  });
  it('validates a prediction against actual isolated passes',()=> {
    const r=compileLab('int a=7; int b=a+2; return b;');const report=scout(r.original);
    expect(report.measured.map(s=>s.rewrites)).toEqual(isolatedScores(r.original).map(s=>s.rewrites));
    expect(report.scores.every(n=>Number.isFinite(n)&&n>=0)).toBe(true);expect(report.neighbors).toHaveLength(5);
  });
});
