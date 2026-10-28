import { describe, expect, it } from 'vitest';
import { fitForest, predictForest, contributions, type Row } from './forest';
import { featureNames, features } from './features';
import { advise, rankedPasses, modelEvaluation as evaluation } from './advisor';
import artifact from './model.json';
import dataset from '../../../docs/ml/dataset.json';
import { compileTest } from '../testHelpers';
import { cost, routePasses, stable } from '../optimizer';
import { analyze, observationsMatch } from '../analyze';
import type { Language } from '../types';

describe('Trained multi-output forest', () => {
    it('learns a signal and trains reproducibly instead of returning fixed scores', () => {
        const rows: Row[] = Array.from({ length: 120 }, (_, i) => ({ group: String(i), x: [i % 2, i % 7], y: [i % 2 ? 1 : 0, i % 2 ? 0 : 1] }));
        const a = fitForest(rows, 8, 4, 71), b = fitForest(rows, 8, 4, 71);
        expect(a).toEqual(b);
        expect(predictForest(a, [0, 3])[1]).toBeGreaterThan(0.9);
        expect(predictForest(a, [1, 3])[0]).toBeGreaterThan(0.9);
    });
    it('path contributions sum to the prediction minus root expectation', () => {
        const { ir } = compileTest('int main(){int x=2+3;return x+1;}');
        const x = features(ir), p = predictForest(artifact.trees, x);
        const roots = artifact.trees.reduce((sum, t) => sum + t.value[0], 0) / artifact.trees.length;
        expect(contributions(artifact.trees, x, 0).reduce((sum, v) => sum + v, 0) + roots).toBeCloseTo(p[0], 10);
    });
    it('keeps all four template-group partitions disjoint', () => {
        const groups = Object.values(evaluation.split).flat();
        expect(groups).toHaveLength(evaluation.families.length * 8); expect(new Set(groups).size).toBe(groups.length);
        expect(dataset).toHaveLength(evaluation.programs);
        expect(new Set(dataset.map(p => p.group))).toEqual(new Set(groups));
        expect(new Set(dataset.map(p => p.source)).size).toBe(dataset.length);
    });
    it('recomputes held-out pass labels and matches the reported independent evaluation', () => {
        const rows: { x: number[]; y: number[] }[] = [];
        for (const fixture of dataset.filter(p => evaluation.split.test.includes(p.group))) {
            const { program, ir: original } = compileTest(fixture.source, fixture.language as Language);
            let ir = original; const seen = new Set<string>();
            for (let step = 0; step < 5; step++) {
                if (!seen.has(stable(ir))) {
                    seen.add(stable(ir));
                    rows.push({ x: features(ir), y: routePasses.map(p => (cost(ir) - cost(p.run(ir, program).ir)) / Math.max(1, cost(ir))) });
                }
                if (step < 4) ir = routePasses[step].run(ir, program).ir;
            }
        }
        expect(rows.length).toBe(evaluation.test.rows);
        const mae = rows.reduce((sum, r) => sum + predictForest(artifact.trees, r.x).reduce((s, p, k) => s + Math.abs(p - r.y[k]), 0) / 4, 0) / rows.length;
        expect(mae).toBeCloseTo(evaluation.test.maeGainRatio, 10);
        expect(mae).toBeLessThan(evaluation.meanBaseline.maeGainRatio);
    }, 30000);
    it('extracts finite features without mutating the IR', () => {
        const { ir } = compileTest('int main(){int n;cin>>n;for(int i=0;i<3;i++)n+=i;return n;}');
        const before = stable(ir), x = features(ir);
        expect(x).toHaveLength(featureNames.length); expect(x.every(Number.isFinite)).toBe(true); expect(stable(ir)).toBe(before);
    });
    it('falls back on missing or incompatible trained artifacts', () => {
        const { ir } = compileTest('int main(){return 2;}');
        expect(advise(ir, { ...artifact, trees: [] }).status).toBe('unavailable');
        expect(advise(ir, { ...artifact, features: ['wrong schema'] }).status).toBe('unavailable');
    });
    it('detects out-of-range structure and preserves default order', () => {
        const { ir } = compileTest('int main(){return 2;}');
        ir.functions = Array.from({ length: 40 }, (_, i) => ({ ...ir.functions[0], name: `f${i}` }));
        expect(advise(ir).status).toBe('out-of-distribution');
        expect(rankedPasses(ir, true).passes.map(p => p.id)).toEqual(routePasses.map(p => p.id));
    });
    it('retains behavior checks with ML on and off, and excludes the broken experiment', () => {
        const source = 'int main(){int n;cin>>n;int z=2*3;if(1)z+=n;else z=9;cout<<z;return z;}';
        for (const useML of [true, false]) {
            const r = analyze(source, 'cpp', ['3'], 20000, true, { useML });
            expect(r.diagnostic).toBeUndefined(); expect(r.mlEnabled).toBe(useML);
            expect(r.candidates.every(c => !c.accepted || c.checks.every(t => t.matched))).toBe(true);
            expect(r.candidates.at(-1)?.accepted).toBe(false);
            expect(observationsMatch(r.reference[0], r.optimizedRuns[0])).toBe(true);
            expect(r.costAfter).toBeLessThanOrEqual(r.costBefore);
        }
    });
    it('does not allow a one-candidate ML search to skip validation', () => {
        const r = analyze('int main(){int n;cin>>n;int z=3+4;return z+n;}', 'cpp', ['2'], 20000, false, { candidateBudget: 1 });
        expect(r.candidates).toHaveLength(1); expect(r.candidates[0].checks.every(c => c.matched)).toBe(true);
        expect(r.guard.some(g => g.status === 'eligible')).toBe(true);
    });
});
