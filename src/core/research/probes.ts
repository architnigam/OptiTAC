import { successors, type IRProgram } from '../ir';
import { children, instructionExpr, stable, writes } from '../optimizer';
import type { Expr } from '../types';
export type ProbeStrategy = 'targeted' | 'fixed' | 'random';
export interface Probe { input: string; reason: string; kind: 'comparison' | 'fixed' | 'random'; line?: number; boundarySite?: string }
interface Affine { c: number; a: number[] }
const equivalent = (a: Map<string, Affine>, b: Map<string, Affine>) => a.size === b.size && [...a].every(([k, v]) => stable(v) === stable(b.get(k)));
export function integerSeed(inputs: string[]): number[] | undefined {
    const first = inputs.find(s => /^\s*-?\d+(?:\s+-?\d+)*\s*$/.test(s));
    if (!first) return;
    const values = first.trim().split(/\s+/).map(Number);
    if (values.length > 8 || values.some(n => !Number.isInteger(n) || n < -2147483648 || n > 2147483647)) return;
    return values;
}
/** Conservative affine propagation proposes inputs; it does not prove path reachability. */
export function generateProbes(ir: IRProgram, inputs: string[], strategy: ProbeStrategy = 'targeted', budget = 8, randomSeed = 20261028): Probe[] {
    const seed = integerSeed(inputs); if (!seed) return [];
    budget = Math.max(0, Math.min(8, Math.trunc(budget)));
    const existing = new Set(inputs.map(s => s.trim().replace(/\s+/g, ' '))), out: Probe[] = [];
    const add = (values: number[], reason: string, kind: Probe['kind'], line?: number, boundarySite?: string) => {
        if (out.length >= budget || values.some(v => !Number.isInteger(v) || v < -2147483648 || v > 2147483647)) return;
        const input = values.join(' '); if (existing.has(input)) return;
        existing.add(input); out.push({ input, reason, kind, ...(line ? { line } : {}), ...(boundarySite ? { boundarySite } : {}) });
    };
    const code = ir.functions.find(f => f.name === 'main')?.instructions || [];
    if (strategy === 'targeted' && code.length) {
        const types = new Map(code.filter(i => i.kind === 'declare').map(i => [i.name, i.type]));
        const inputAt = new Map<number, { name: string; column: number }[]>(); let column = 0;
        // Only straight-line, initial reads have a predictable stdin-column mapping.
        for (const i of code) {
            if (['branch', 'jump', 'return'].includes(i.kind)) break;
            const expr = instructionExpr(i); let names: string[] = [];
            if (expr?.kind === 'call' && !['scanf', 'printf', 'puts', 'putchar', 'abs', 'sqrt', 'pow', 'fabs'].includes(expr.name)) { inputAt.clear(); break; }
            if (expr?.kind === 'call' && expr.name === 'scanf' && !(expr.args[0]?.kind === 'string' && /^\s*(?:%d\s*)+$/.test(expr.args[0].value))) { inputAt.clear(); break; }
            if (i.kind === 'input') names = i.names;
            if (expr?.kind === 'call' && expr.name === 'scanf' && expr.args[0]?.kind === 'string' && /^\s*(?:%d\s*)+$/.test(expr.args[0].value))
                names = expr.args.slice(1).flatMap(e => e.kind === 'unary' && e.op === '&' && e.argument.kind === 'name' ? [e.argument.name] : []);
            if (names.some(name => types.get(name) !== 'int')) { inputAt.clear(); break; }
            if (names.length) { inputAt.set(i.id, names.map(name => ({ name, column: column++ }))); }
        }
        const literal = (n: number): Affine => ({ c: n, a: seed.map(() => 0) });
        const safe = (value: Affine): Affine | undefined => [value.c, ...value.a].every(Number.isSafeInteger) ? value : undefined;
        const linear = (e: Expr, env: Map<string, Affine>): Affine | undefined => {
            if (e.kind === 'literal' && ['int', 'bool', 'char'].includes(e.data.type)) return literal(e.data.value);
            if (e.kind === 'name') return env.get(e.name);
            if (e.kind === 'unary' && ['+', '-'].includes(e.op)) { const v = linear(e.argument, env); return v && safe({ c: e.op === '-' ? -v.c : v.c, a: v.a.map(n => e.op === '-' ? -n : n) }); }
            if (e.kind === 'binary') {
                const l = linear(e.left, env), r = linear(e.right, env); if (!l || !r) return;
                if (e.op === '+' || e.op === '-') { const sign = e.op === '+' ? 1 : -1; return safe({ c: l.c + sign * r.c, a: l.a.map((n, k) => n + sign * r.a[k]) }); }
                if (e.op === '*' && (!l.a.some(Boolean) || !r.a.some(Boolean))) { const [v, k] = !l.a.some(Boolean) ? [r, l.c] : [l, r.c]; return safe({ c: v.c * k, a: v.a.map(n => n * k) }); }
            }
            return;
        };
        const proposals = new Map<string, Probe[]>();
        const inspect = (e: Expr, env: Map<string, Affine>, line: number) => {
            if (e.kind === 'binary' && ['<', '<=', '>', '>=', '==', '!='].includes(e.op)) {
                const l = linear(e.left, env), r = linear(e.right, env);
                if (l && r) {
                    const a = l.a.map((v, k) => v - r.a[k]), c = l.c - r.c;
                    for (let k = 0; k < a.length; k++) if (a[k]) {
                        const boundary = -(c + a.reduce((sum, v, j) => sum + (j === k ? 0 : v * seed[j]), 0)) / a[k];
                        if (!Number.isFinite(boundary)) continue;
                        const values = [...new Set([Math.floor(boundary), Math.ceil(boundary), Math.floor(boundary) - 1, Math.ceil(boundary) + 1])];
                        const key = `${line}:${k}:${a.join(',')}:${c}`;
                        if (!proposals.has(key)) proposals.set(key, values.map(value => { const copy = [...seed]; copy[k] = value; return { input: copy.join(' '), reason: `Affine comparison boundary at line ${line}; vary stdin column ${k + 1} while keeping other columns at the supplied seed.`, kind: 'comparison' as const, line, ...([Math.floor(boundary), Math.ceil(boundary)].includes(value) ? { boundarySite: key } : {}) }; }));
                    }
                }
            }
            children(e).forEach(child => inspect(child, env, line));
        };
        const edges = successors(code), incoming: (Map<string, Affine> | undefined)[] = code.map(() => undefined);
        incoming[0] = new Map(); const queue = [0]; let visits = 0;
        while (queue.length && visits++ < 600) {
            const n = queue.shift()!, i = code[n], env = new Map(incoming[n]!); const e = instructionExpr(i);
            if (e) inspect(e, env, i.line);
            const value = e ? linear(e.kind === 'assign' ? e.value : e, env) : undefined;
            if (e) writes(e).forEach(name => env.delete(name));
            if (i.kind === 'compute') { if (value && e?.kind !== 'assign') env.set(i.target, value); else env.delete(i.target); }
            if (i.kind === 'declare' || i.kind === 'initialize') { if (value && types.get(i.name) === 'int') env.set(i.name, value); else env.delete(i.name); }
            if (e?.kind === 'assign' && e.op === '=' && value) env.set(e.name, value);
            if (i.kind === 'input') i.names.forEach(name => env.delete(name));
            for (const read of inputAt.get(i.id) || []) if (read.column < seed.length && types.get(read.name) === 'int') { const v = literal(0); v.a[read.column] = 1; env.set(read.name, v); }
            for (const next of edges[n]) {
                const old = incoming[next], joined = old ? new Map([...old].filter(([name, v]) => stable(v) === stable(env.get(name)))) : new Map(env);
                if (!old || !equivalent(old, joined)) { incoming[next] = joined; if (!queue.includes(next)) queue.push(next); }
            }
        }
        // Round-robin across targets prevents one predicate from consuming the whole budget.
        const targets = [...proposals.values()];
        for (let rank = 0; rank < 4; rank++) for (const target of targets) if (target[rank]) { const p = target[rank]; add(p.input.split(' ').map(Number), p.reason, p.kind, p.line, p.boundarySite); }
    }
    if (strategy === 'random') {
        let state = randomSeed >>> 0;
        for (let trial = 0; trial < 80 && out.length < budget; trial++) {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            const copy = [...seed]; copy[trial % Math.min(seed.length, 3)] = state % 513 - 256;
            add(copy, 'Seeded uniform integer baseline in [-256, 256].', 'random');
        }
    } else for (const value of [0, -1, 1, 2, -2, 4, -4, 8, -8, 16, -16]) for (let k = 0; k < Math.min(seed.length, 3); k++) { const copy = [...seed]; copy[k] = value; add(copy, 'Fixed boundary-value baseline / targeted-search fallback.', 'fixed'); }
    return out;
}
