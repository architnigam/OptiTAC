import { expect, it } from 'vitest';
import { definiteWrites, liveness, basicBlocks } from './optimizer';
import type { Expr } from './types';
import type { Instruction } from './ir';
import { compileTest } from './testHelpers';
const pos = { line: 1, column: 1 };
const name = (name: string): Expr => ({ kind: 'name', name, ...pos });
const literal: Expr = { kind: 'literal', data: { type: 'int', value: 1 }, ...pos };
const assign: Expr = { kind: 'assign', op: '=', name: 'x', value: literal, ...pos };
it('preserves the previous value across optional short-circuit and ternary writes', () => {
    for (const expression of [
        { kind: 'binary', op: '&&', left: name('flag'), right: assign, ...pos },
        { kind: 'conditional', condition: name('flag'), yes: assign, no: literal, ...pos },
    ] as Expr[]) {
        const code: Instruction[] = [{ kind: 'compute', target: '$t0', expression, id: 1, ...pos }, { kind: 'return', value: name('x'), id: 2, ...pos }];
        expect(liveness(code).before[0].has('x')).toBe(true);
        expect(definiteWrites(expression).has('x')).toBe(false);
    }
});
it('kills a value assigned on both conditional paths, but not by a possibly failing scanf', () => {
    expect(definiteWrites({ kind: 'conditional', condition: name('flag'), yes: assign, no: assign, ...pos }).has('x')).toBe(true);
    expect(definiteWrites({ kind: 'call', name: 'scanf', args: [{ kind: 'unary', op: '&', argument: name('x'), ...pos }], ...pos }).has('x')).toBe(false);
});
it('solves loops and exposes block boundary sets matching instruction-level fixed points', () => {
    const { ir } = compileTest('int main(){int n;cin>>n;int x=0;while(x<n)x++;return x;}');
    const code = ir.functions[0].instructions, live = liveness(code);
    for (const block of basicBlocks(ir)) {
        expect(new Set(block.liveIn)).toEqual(live.before[block.start]);
        expect(new Set(block.liveOut)).toEqual(live.after[block.end]);
    }
    expect(live.iterations).toBeGreaterThan(1);
    expect(basicBlocks(ir).some(b => b.liveIn.some(n => n.startsWith('x#')))).toBe(true);
});
