import type { IRProgram } from '../ir';
import { successors } from '../ir';
import { children, cost, instructionExpr } from '../optimizer';
import type { Expr } from '../types';

export const featureNames = ['instructions', 'static cost', 'functions', 'computations', 'literal temporaries', 'copy temporaries', 'branches', 'literal branches', 'jumps', 'fallthrough jumps', 'labels', 'scope markers', 'declarations', 'initializations', 'returns', 'input operations', 'output operations', 'unreachable instructions', 'binary expressions', 'literals', 'name reads', 'literal binary expressions', 'function calls', 'casts', 'updates', 'assignments', 'unused temporary definitions'];
export function features(ir: IRProgram): number[] {
    const x = featureNames.map(() => 0); x[1] = cost(ir); x[2] = ir.functions.length;
    const names = new Map<string, number>(), temps: string[] = [];
    const visit = (e: Expr) => {
        if (e.kind === 'binary') { x[18]++; if (e.left.kind === 'literal' && e.right.kind === 'literal') x[21]++; }
        if (e.kind === 'literal') x[19]++;
        if (e.kind === 'name') { x[20]++; names.set(e.name, (names.get(e.name) || 0) + 1); }
        if (e.kind === 'call') x[22]++;
        if (e.kind === 'cast') x[23]++;
        if (e.kind === 'unary' && ['++', '--'].includes(e.op)) x[24]++;
        if (e.kind === 'assign') x[25]++;
        children(e).forEach(visit);
    };
    for (const fn of ir.functions) {
        // Temporary names restart per function; isolate their use counts.
        names.clear(); temps.length = 0;
        const code = fn.instructions, edges = successors(code), seen = new Set<number>(), queue = code.length ? [0] : [];
        while (queue.length) { const n = queue.pop()!; if (seen.has(n)) continue; seen.add(n); queue.push(...edges[n]); }
        x[17] += code.length - seen.size;
        code.forEach((i, index) => {
            x[0]++;
            if (i.kind === 'compute') { x[3]++; temps.push(i.target); if (i.expression.kind === 'literal') x[4]++; if (i.expression.kind === 'name') x[5]++; }
            if (i.kind === 'branch') { x[6]++; if (i.condition.kind === 'literal') x[7]++; }
            if (i.kind === 'jump') { x[8]++; const next = code[index + 1]; if (next?.kind === 'label' && next.name === i.label) x[9]++; }
            const map: Record<string, number> = { label: 10, scope: 11, declare: 12, initialize: 13, return: 14, input: 15, output: 16 };
            if (map[i.kind] !== undefined) x[map[i.kind]]++;
            const expr = instructionExpr(i); if (expr) visit(expr);
        });
        x[26] += temps.filter(t => !names.has(t)).length;
    }
    return x;
}
