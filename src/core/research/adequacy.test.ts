import { describe, expect, it, vi } from 'vitest';
import { exactPortfolio, greedyPortfolio, bitCount, type CoverageRow } from './portfolio';
import { auditAdequacy, shadowFaults } from './adequacy';
import { compileTest } from '../testHelpers';
import { analyze } from '../analyze';
import { branchMutation } from './diagnose';
import { routePasses, stable } from '../optimizer';
import { executeIR } from '../ir';

describe('Exact bounded branch-anchored witness selection', () => {
    it('matches independent exhaustive subset enumeration on 80 finite matrices', () => {
        let state = 71; const rand = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
        for (let trial = 0; trial < 80; trial++) {
            const rows: CoverageRow[] = Array.from({ length: 8 }, () => ({ mask: rand(64), anchors: rand(64), cost: rand(20) }));
            const budget = trial % 4;
            const exhaustive = Array.from({ length: 1 << rows.length }, (_, subset) => { const indices = rows.map((_, k) => k).filter(k => subset & (1 << k)); return { indices, mask: indices.reduce((m, k) => m | rows[k].mask, 0), anchors: indices.reduce((m, k) => m | (rows[k].anchors || 0), 0), cost: indices.reduce((m, k) => m + rows[k].cost, 0) }; }).filter(s => s.indices.length <= budget).sort((a, b) => bitCount(b.anchors) - bitCount(a.anchors) || bitCount(b.mask) - bitCount(a.mask) || a.indices.length - b.indices.length || a.cost - b.cost)[0];
            const actual = exactPortfolio(rows, budget);
            expect([bitCount(actual.anchors), actual.covered, actual.indices.length, actual.cost]).toEqual([bitCount(exhaustive.anchors), bitCount(exhaustive.mask), exhaustive.indices.length, exhaustive.cost]);
        }
    });
    it('retains a rare branch witness that a mutation-only compact suite discards', () => {
        const rows = [{ mask: 1, anchors: 1, cost: 1 }, { mask: 1, anchors: 2, cost: 3 }];
        expect(exactPortfolio(rows).indices).toHaveLength(2);
        expect(exactPortfolio(rows.map(r => ({ ...r, anchors: 0 }))).indices).toEqual([0]);
    });
    it('finds an optimum on a finite instance where greedy misses two challenges', () => {
        const rows = [{ mask: 63, cost: 1 }, { mask: 207, cost: 2 }, { mask: 816, cost: 2 }];
        expect(greedyPortfolio(rows, 2).covered).toBe(8);
        expect(exactPortfolio(rows, 2).covered).toBe(10);
    });
    it('rejects unbounded or malformed portfolio inputs', () => {
        expect(() => exactPortfolio([{ mask: 1024, cost: 0 }])).toThrow();
        expect(() => exactPortfolio([{ mask: 1, cost: NaN }])).toThrow();
        expect(() => exactPortfolio([], 9)).toThrow();
        expect(exactPortfolio([], 0).indices).toEqual([]);
    });
});
describe('Validation quality and quarantine', () => {
    const source = 'int main(){int n,pad;cin>>n>>pad;if(n==137)return 7;return 2;}';
    it('keeps held-out mutation families out of the shadow matrix', () => {
        const { ir } = compileTest(source), before = stable(ir);
        expect(shadowFaults(ir, 'literal').every(m => m.family !== 'literal')).toBe(true);
        expect(stable(ir)).toBe(before);
    });
    it('reports unseen-fault blindspots without calling shadow adequacy a correctness proof', () => {
        const { program, ir } = compileTest(source);
        const audit = auditAdequacy(program, ir, ir, ['300 999'], [], 20000, { excluded: 'literal' });
        expect(audit.probes.some(p => p.input === '137 999')).toBe(true);
        expect(audit.portfolio.indices.some(k => audit.probes[k].input.startsWith('137 '))).toBe(true);
        expect(bitCount(audit.portfolio.anchors & 15)).toBe(2);
        expect(audit.portfolio.anchors & 16).toBeTruthy();
        expect(audit.executions).toBeLessThanOrEqual(24 * 13);
    });
    it('records actual selected-IR failures separately from controlled challenges', () => {
        const { program, ir } = compileTest(source);
        const audit = auditAdequacy(program, ir, branchMutation(ir), ['300 999'], [], 20000);
        expect(audit.probes.some(p => p.status === 'subject-mismatch' && p.input.startsWith('137 '))).toBe(true);
        expect(audit.probes.filter(p => p.status === 'subject-mismatch').every(p => p.mask === 0)).toBe(true);
    });
    it('does not count mutation timeouts as detected faults', () => {
        const { program, ir } = compileTest('int main(){int n;cin>>n;int i=0;while(i<n)i++;return i;}');
        const audit = auditAdequacy(program, ir, ir, ['3'], [], 20000);
        for (const p of audit.probes) p.cells.forEach((cell, k) => { if (cell === 'limited') expect(p.mask & (1 << k)).toBe(0); });
        expect(audit.maxSteps).toBe(500);
    });
    it('quarantines a real route disagreement found outside the selected fixed probes', () => {
        const cheaperSource = source.replace('return 2;}', 'return 2;return 99;}');
        const { ir } = compileTest(cheaperSource), faulty = branchMutation(ir);
        faulty.functions[0].instructions = faulty.functions[0].instructions.filter(i => !(i.kind === 'return' && i.value?.kind === 'literal' && i.value.data.value === 99));
        const mock = vi.spyOn(routePasses[0], 'run').mockReturnValue({ ir: faulty, logs: [], iterations: 0 });
        try {
            const result = analyze(cheaperSource, 'cpp', ['300 999'], 20000, false, { useML: false, candidateBudget: 1, probeStrategy: 'fixed', evidenceAudit: true });
            expect(result.diagnostic).toBeUndefined(); expect(result.adequacy?.quarantined).toBe(true);
            expect(result.route).toEqual([]); expect(result.candidates[0].accepted).toBe(false);
            expect(result.optimizedRuns[0].returnValue?.value).toBe(2);
        } finally { mock.mockRestore(); }
    });
    it('observes branch outcomes without changing interpreter results', () => {
        const { program, ir } = compileTest(source); const edges: boolean[] = [];
        const normal = executeIR(program, ir, '137 0', 20000, false);
        const observed = executeIR(program, ir, '137 0', 20000, false, (_, __, taken) => edges.push(taken));
        expect(observed).toEqual(normal); expect(edges).toContain(true);
    });
});
