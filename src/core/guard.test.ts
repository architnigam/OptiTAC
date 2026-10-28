import { describe, expect, it, vi } from 'vitest';
import { guardInputs, buildGuard } from './guard';
import { analyze, searchRoutes } from './analyze';
import { compileTest } from './testHelpers';
import { routePasses } from './optimizer';
import { executeAST } from './runtime';
describe('Bounded boundary-input audit', () => {
    it('rejects a transformation that passes supplied inputs but fails a generated negative input', () => {
        const { program, ir } = compileTest('int main(){int n;cin>>n;if(n<0)return 7;return 9;}');
        const guard = buildGuard(program, ir, ['3'], 20000), bad = structuredClone(ir);
        for (const fn of bad.functions) for (const i of fn.instructions) if (i.kind === 'return' && i.value?.kind === 'literal' && i.value.data.value === 7) i.value.data.value = 8;
        const mock = vi.spyOn(routePasses[0], 'run').mockReturnValue({ ir: bad, logs: [], iterations: 0 });
        try {
            const result = searchRoutes(program, ir, ['3'], [executeAST(program, '3')], 20000, false, { useML: false, candidateBudget: 1 }, guard);
            expect(result.candidates[0].checks.find(c => c.origin === 'provided')?.matched).toBe(true);
            expect(result.candidates[0].checks.find(c => c.origin === 'boundary' && c.input === '-1')?.matched).toBe(false);
            expect(result.candidates[0].accepted).toBe(false); expect(result.route).toEqual([]);
        } finally { mock.mockRestore(); }
    });
    it('generates deterministic capped probes without reusing supplied cases', () => {
        const result = guardInputs(['5 6 7', '0 6 7']);
        expect(result).toHaveLength(8); expect(new Set(result).size).toBe(result.length);
        expect(result).not.toContain('0 6 7'); expect(result).toEqual(guardInputs(['5 6 7', '0 6 7']));
    });
    it('does not invent integer probes for absent or incompatible stdin', () => {
        for (const input of ['', 'hello', '3.5', '9999999999999999999', '1 2 3 4 5 6 7 8 9']) expect(guardInputs([input])).toEqual([]);
    });
    it('excludes undefined references without treating them as passing cases', () => {
        const r = analyze('int main(){int n;cin>>n;return 12/n;}', 'cpp', ['3']);
        expect(r.guard.find(g => g.input === '0')?.status).toBe('undefined');
        expect(r.candidates.every(c => c.checks.every(k => k.origin !== 'boundary' || k.input !== '0'))).toBe(true);
        expect(r.searchStatus).toBe('validated');
    });
    it('includes defined boundary references in every transformed candidate', () => {
        const r = analyze('int main(){int n;cin>>n;int z=2+3;return z+n;}', 'cpp', ['5']);
        expect(r.candidates.length).toBeGreaterThan(0);
        const eligible = r.guard.filter(g => g.status === 'eligible');
        expect(eligible.length).toBeGreaterThan(0);
        expect(r.candidates.every(c => c.checks.filter(k => k.origin === 'boundary').length === eligible.length)).toBe(true);
    });
    it('reports limited references as excluded and allows explicit ablation', () => {
        const source = 'int main(){int n;cin>>n;if(n<0)while(1){}return 2+3;}';
        const r = analyze(source, 'cpp', ['3']);
        expect(r.guard.find(g => g.input === '-1')?.status).toBe('limited');
        expect(analyze(source, 'cpp', ['3'], 20000, false, { stress: false }).guard).toEqual([]);
    });
});
