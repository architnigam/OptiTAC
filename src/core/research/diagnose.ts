import { executeIR, type IRProgram } from '../ir';
import { executeAST } from '../runtime';
import { routePasses } from '../optimizer';
import { matchRuns } from '../guard';
import type { CProgram, RunResult } from '../types';
export interface FailureEvidence {
    seedInput: string; input: string; originalRoute: string[]; route: string[];
    status: 'reproduced' | 'inconclusive'; oracleCalls: number; budget: number;
    localMinimal: boolean; reason: string; log: string[];
    reference?: RunResult; original?: RunResult; candidate?: RunResult;
}
export function returnMutation(ir: IRProgram): IRProgram {
    const out = structuredClone(ir), main = out.functions.find(f => f.name === 'main'); if (!main) return out;
    let changed = false;
    main.instructions = main.instructions.map(i => {
        if (i.kind !== 'return' || !i.value) return i;
        changed = true;
        return { ...i, value: { kind: 'binary', op: '+', left: i.value, right: { kind: 'literal', data: { type: 'int', value: 1 }, line: i.line, column: i.column }, line: i.line, column: i.column } };
    });
    if (!changed) main.instructions.push({ id: 999999, kind: 'return', value: { kind: 'literal', data: { type: 'int', value: 1 }, line: 1, column: 1 }, line: 1, column: 1 });
    return out;
}
export function branchMutation(ir: IRProgram): IRProgram {
    const out = structuredClone(ir), code = out.functions.find(f => f.name === 'main')?.instructions || [];
    for (const branch of code) if (branch.kind === 'branch') for (const label of [branch.yes, branch.no]) {
        const start = code.findIndex(i => i.kind === 'label' && i.name === label);
        for (let n = start + 1; start >= 0 && n < code.length; n++) {
            const i = code[n]; if (['label', 'branch', 'jump'].includes(i.kind)) break;
            if (i.kind === 'return') {
                if (i.value?.kind === 'literal' && i.value.data.type === 'int' && i.value.data.value < 2147483647) { i.value.data.value++; return out; }
                break;
            }
        }
    }
    return out;
}
export function replayRoute(program: CProgram, original: IRProgram, route: string[]): IRProgram {
    let ir = original;
    for (const action of route) {
        if (action === 'mutation') ir = returnMutation(ir);
        else if (action === 'branch-mutation') ir = branchMutation(ir);
        else { const pass = routePasses.find(p => p.id === action); if (!pass) throw Error('Unknown replay action: ' + action); ir = pass.run(ir, program).ir; }
    }
    return ir;
}
export function mismatch(reference: RunResult, candidate: RunResult) {
    return reference.status === 'returned' && candidate.status !== 'limited' && !matchRuns(reference, candidate);
}
export function simplerInputs(input: string): string[] {
    if (!/^\s*-?\d+(?:\s+-?\d+)*\s*$/.test(input)) return [];
    const values = input.trim().split(/\s+/).map(Number);
    if (values.some(v => !Number.isSafeInteger(v))) return [];
    const weight = values.reduce((sum, v) => sum + Math.abs(v), 0), result = new Set<string>();
    for (let k = 0; k < values.length; k++) for (const v of [0, 1, -1, Math.trunc(values[k] / 2), values[k] - Math.sign(values[k])]) {
        const next = [...values]; next[k] = v;
        if (next.reduce((sum, n) => sum + Math.abs(n), 0) < weight) result.add(next.join(' '));
    }
    return [...result];
}
/** Bounded joint input/route reduction. Minimal only under the documented local reductions. */
export function diagnoseFailure(program: CProgram, originalIR: IRProgram, seedInput: string, originalRoute: string[], maxSteps: number, budget = 64, replay = replayRoute): FailureEvidence {
    budget = Math.max(1, Math.min(64, Math.trunc(budget)));
    const base: FailureEvidence = { seedInput, input: seedInput, originalRoute: [...originalRoute], route: [...originalRoute], status: 'inconclusive', oracleCalls: 0, budget, localMinimal: false, reason: '', log: [] };
    const cache = new Map<string, { reference: RunResult; original: RunResult; candidate: RunResult; failed: boolean }>();
    const steps = Math.min(maxSteps, 2000);
    const oracle = (input: string, route: string[]) => {
        const key = JSON.stringify([input, route]); if (cache.has(key)) return cache.get(key);
        if (base.oracleCalls >= budget) return;
        base.oracleCalls++;
        try {
            const reference = executeAST(program, input, steps, false), original = executeIR(program, originalIR, input, steps, false);
            const candidate = executeIR(program, replay(program, originalIR, route), input, steps, false);
            const result = { reference, original, candidate, failed: matchRuns(reference, original) && mismatch(reference, candidate) };
            cache.set(key, result); return result;
        } catch { return; }
    };
    if (!oracle(seedInput, originalRoute)?.failed) { base.reason = 'The failure could not be replayed within the 2,000-step diagnostic budget. No reduction or minimality is claimed.'; return base; }
    base.status = 'reproduced';
    let changed = true, complete = true;
    while (changed && complete) {
        changed = false;
        for (const next of simplerInputs(base.input)) {
            const result = oracle(next, base.route);
            if (!result) { complete = false; break; }
            if (result.failed) { base.log.push(`Input ${JSON.stringify(base.input)} → ${JSON.stringify(next)}; mismatch preserved.`); base.input = next; changed = true; break; }
        }
        if (changed || !complete) continue;
        for (let k = 0; k < base.route.length; k++) {
            const next = base.route.filter((_, i) => i !== k), result = oracle(base.input, next);
            if (!result) { complete = false; break; }
            if (result.failed) { base.log.push(`Removed route action ${k + 1} (${base.route[k]}); mismatch preserved.`); base.route = next; changed = true; break; }
        }
    }
    base.localMinimal = complete;
    const replayed = oracle(base.input, base.route)!;
    base.reference = replayed.reference; base.original = replayed.original; base.candidate = replayed.candidate;
    base.reason = complete ? 'Replayed mismatch. No single route-action deletion or configured smaller integer input preserves an eligible mismatch. This is local minimality, not a globally smallest program or input.' : 'Replayed mismatch. The oracle-call budget was exhausted before all local reductions could be checked; no minimality claim is made.';
    return base;
}
