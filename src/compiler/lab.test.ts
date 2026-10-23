import { describe, expect, it } from 'vitest';
import { allPasses, compileLab, sameOutcome } from './lab';
import { executeTAC } from './verification/interpreter';
import { constantFolding } from './optimizer/constantFolding';

describe('Review 2 evidence pipeline', () => {
  it('records independent variable states and stops tracing at return', () => {
    const r = compileLab('int a = 2; int b = a + 3; return b; int unused = 9;', []);
    expect(r.baseline.trace?.map(e => e.instructionId)).toEqual([1, 2, 3, 4]);
    expect(r.baseline.trace?.[0].variables).toEqual({ a: 2 });
    expect(r.baseline.trace?.[1].variables).toEqual({ a: 2, $t1: 5 });
    expect(r.baseline.trace?.at(-1)?.returnValue).toBe(5);
    expect(r.baseline.trace?.at(-1)?.variables).not.toHaveProperty('unused');
  });
  it('records the faulting instruction without inventing a result', () => {
    const r = compileLab('int a = 8; int unused = a / 0; return a;');
    const fault = r.final.trace?.at(-1);
    expect(fault?.error).toBe('Division by zero.');
    expect(fault?.variables).not.toHaveProperty('$t1');
    expect(r.final.trace?.some(e => e.kind === 'return')).toBe(false);
  });
  it('optimizes arithmetic and records every checkpoint', () => {
    const r = compileLab('int a = 10; int b = a + 5; return b * 2;');
    expect(r.final.returnValue).toBe(30);
    expect(r.instructions.length).toBeLessThan(r.original.length);
    expect(r.snapshots.every(s => s.preserved)).toBe(true);
    expect(r.converged).toBe(true);
  });
  it.each(['/', '%'])('preserves an unused %s zero trap', operator => {
    const r = compileLab(`int a = 8; int unused = a ${operator} 0; return a;`);
    expect(r.baseline.success).toBe(false);
    expect(r.final.error).toBe(r.baseline.error);
    expect(r.firstDivergence).toBe(-1);
  });
  it('identifies a deliberately injected divergence', () => {
    const r = compileLab('int a = 4; return a;', allPasses, true);
    expect(r.snapshots[r.firstDivergence].pass).toContain('Injected fault');
    expect(r.final.returnValue).toBe(5);
    expect(r.counterfactuals.every(c => c.preserved)).toBe(true);
  });
  it('supports all passes disabled', () => {
    const r = compileLab('return 2 + 3;', []);
    expect(r.instructions).toEqual(r.original);
    expect(r.snapshots).toHaveLength(0);
  });
  it('rejects undeclared identifiers', () => {
    expect(() => compileLab('return missing;')).toThrow('not declared');
  });
  it('does not collide with a user t1 identifier', () => {
    expect(compileLab('int t1 = 8; int b = 2 + 3; return t1 + b;').final.returnValue).toBe(13);
  });
  it('executes scientific notation produced by folding', () => {
    expect(compileLab('float a = 0.00000001; return a * a;').final.returnValue).toBeCloseTo(1e-16, 25);
  });
  it('keeps overflow expressions executable', () => {
    const input = [{ id: 1, kind: 'binary' as const, target: 'x', left: '1e308', operator: '*', right: '1e308' }, { id: 2, kind: 'return' as const, value: 'x' }];
    expect(sameOutcome(executeTAC(input), executeTAC(constantFolding(input).instructions))).toBe(true);
  });
  it('omission comparisons rerun the pipeline', () => {
    const r = compileLab('int a = 10; return a + 2;');
    expect(r.counterfactuals).toHaveLength(5);
    expect(r.counterfactuals.find(c => c.pass === 'Constant folding')!.delta).toBeGreaterThan(0);
  });
  it('keeps snapshot copies independent', () => {
    const r = compileLab('return 4 + 5;');
    const before = JSON.stringify(r.snapshots[0]);
    r.instructions[0].id = 999;
    expect(JSON.stringify(r.snapshots[0])).toBe(before);
  });
  it('distinguishes no return from a successful result', () => {
    const r = compileLab('int a = 2;');
    expect(r.final.error).toBe('Program did not return a value.');
    expect(r.firstDivergence).toBe(-1);
  });
  it('preserves a deterministic 40-program arithmetic corpus', () => {
    for (let n = 1; n <= 40; n++) {
      const r = compileLab(`int a = ${n}; int b = a * 3; int c = b + 7; int unused = 99; return c % 5;`);
      expect(r.final.returnValue).toBe((n * 3 + 7) % 5);
      expect(r.firstDivergence).toBe(-1);
    }
  });
});
