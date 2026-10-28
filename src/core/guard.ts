import { executeAST } from './runtime';
import { executeIR, type IRProgram } from './ir';
import type { CProgram, RunResult } from './types';
import { generateProbes, type ProbeStrategy } from './research/probes';
export interface GuardCase { input: string; reference: RunResult; status: 'eligible' | 'undefined' | 'limited' | 'unsupported' | 'lowering-mismatch'; reason?: string; kind?: 'comparison' | 'fixed' | 'random'; line?: number }
export function matchRuns(a: RunResult, b: RunResult) {
    return a.status === 'returned' && b.status === 'returned' && a.stdout === b.stdout && a.returnValue?.type === b.returnValue?.type && Object.is(a.returnValue?.value, b.returnValue?.value);
}
/** Deterministic, bounded integer stdin probes, not a fuzzer or vulnerability scanner. */
export function guardInputs(inputs: string[]): string[] {
    const first = inputs.find(s => /^\s*-?\d+(?:\s+-?\d+)*\s*$/.test(s));
    if (!first) return [];
    const tokens = first.trim().split(/\s+/);
    if (tokens.length > 8 || tokens.some(t => !Number.isSafeInteger(Number(t)) || Number(t) < -2147483648 || Number(t) > 2147483647)) return [];
    const probes = new Set<string>(), existing = new Set(inputs.map(s => s.trim().replace(/\s+/g, ' ')));
    for (const value of [0, -1, 1, 2]) for (let index = 0; index < Math.min(tokens.length, 3); index++) {
        const copy = [...tokens]; copy[index] = String(value); const text = copy.join(' ');
        if (!existing.has(text)) probes.add(text);
    }
    return [...probes].slice(0, 8);
}
export function buildGuard(program: CProgram, ir: IRProgram, inputs: string[], maxSteps: number, strategy: ProbeStrategy = 'targeted'): GuardCase[] {
    return generateProbes(ir, inputs, strategy).map(probe => {
        const { input } = probe;
        const reference = executeAST(program, input, Math.min(maxSteps, 2000), false);
        if (reference.status !== 'returned') return { ...probe, reference, status: reference.status === 'undefined' ? 'undefined' : reference.status === 'limited' ? 'limited' : 'unsupported' };
        const original = executeIR(program, ir, input, Math.min(maxSteps, 2000), false);
        return { ...probe, reference, status: original.status === 'limited' ? 'limited' : matchRuns(reference, original) ? 'eligible' : 'lowering-mismatch' };
    });
}
