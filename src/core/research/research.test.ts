import { describe, expect, it } from 'vitest';
import { compileTest } from '../testHelpers';
import { generateProbes } from './probes';
import { diagnoseFailure, replayRoute, mismatch, simplerInputs } from './diagnose';
import { executeAST } from '../runtime';
import { executeIR } from '../ir';
import { analyze } from '../analyze';
import { stable } from '../optimizer';

describe('Comparison-targeted probe synthesis', () => {
    it('finds a distant comparison boundary that fixed values miss', () => {
        const { ir } = compileTest('int main(){int n;cin>>n;if(n==137)return 7;return 2;}');
        expect(generateProbes(ir, ['300']).some(p => p.input === '137' && p.kind === 'comparison')).toBe(true);
        expect(generateProbes(ir, ['300'], 'fixed').some(p => p.input === '137')).toBe(false);
    });
    it('propagates aliases and solves affine comparisons for two stdin columns', () => {
        const { ir } = compileTest('int main(){int n,m;cin>>n>>m;int x=3*n+m;if(x==416)return 7;return 2;}');
        const probes = generateProbes(ir, ['300 5']);
        expect(probes.map(p => p.input)).toContain('137 5');
        expect(probes.every(p => p.reason.length > 0)).toBe(true);
    });
    it('maps initial C scanf integer reads', () => {
        const { ir } = compileTest('int main(){int n;scanf("%d",&n);if(n<-71)return 7;return 2;}', 'c');
        expect(generateProbes(ir, ['300']).map(p => p.input)).toContain('-71');
    });
    it('does not infer affine boundaries through nonlinear expressions or unknown input-producing calls', () => {
        const nonlinear = compileTest('int main(){int n;cin>>n;if(n*n==169)return 7;return 2;}');
        expect(generateProbes(nonlinear.ir, ['300']).every(p => p.kind === 'fixed')).toBe(true);
        const call = compileTest('int f(){int x;cin>>x;return x;}int main(){int x=f();int n;cin>>n;if(n==71)return 7;return 2;}');
        expect(generateProbes(call.ir, ['300 8']).every(p => p.kind === 'fixed')).toBe(true);
    });
    it('deduplicates and caps every strategy at the same maximum probe budget', () => {
        const { ir } = compileTest('int main(){int n;cin>>n;if(n>71)return 7;return 2;}');
        for (const strategy of ['targeted', 'fixed', 'random'] as const) {
            const p = generateProbes(ir, ['300'], strategy);
            expect(p).toHaveLength(8); expect(new Set(p.map(v => v.input)).size).toBe(8);
            expect(p.some(v => v.input === '300')).toBe(false);
            expect(p).toEqual(generateProbes(ir, ['300'], strategy));
        }
    });
});
describe('Replayable joint input / route reduction', () => {
    it('finds and reduces a localized fault missed by supplied and fixed inputs', () => {
        const source = 'int main(){int n,pad;cin>>n>>pad;if(n==137)return 7;return 2;}';
        const fixed = analyze(source, 'cpp', ['300 999'], 20000, true, { mutationKind: 'branch', probeStrategy: 'fixed' });
        expect(fixed.candidates.at(-1)?.checks.every(c => c.matched)).toBe(true);
        expect(fixed.candidates.at(-1)?.failure).toBeUndefined();
        const targeted = analyze(source, 'cpp', ['300 999'], 20000, true, { mutationKind: 'branch' });
        const experiment = targeted.candidates.at(-1)!;
        expect(experiment.checks[0].matched).toBe(true);
        expect(experiment.checks.some(c => c.origin === 'boundary' && !c.matched)).toBe(true);
        expect(experiment.failure?.input).toBe('137 0');
        expect(experiment.failure?.localMinimal).toBe(true);
        expect(experiment.accepted).toBe(false);
        expect(targeted.optimizedRuns[0].returnValue?.value).toBe(2);
    });
    it('shrinks irrelevant stdin and removes unnecessary passes while preserving a mismatch', () => {
        const { program, ir } = compileTest('int main(){int n,pad;cin>>n>>pad;int z=2+3;return n+z;}');
        const before = stable(ir), result = diagnoseFailure(program, ir, '128 999', ['constants', 'liveness', 'mutation'], 20000);
        expect(result.status).toBe('reproduced'); expect(result.input).toBe('0 0');
        expect(result.route).toEqual(['mutation']); expect(result.localMinimal).toBe(true);
        expect(result.oracleCalls).toBeLessThanOrEqual(64); expect(stable(ir)).toBe(before);
        expect(mismatch(executeAST(program, result.input), executeIR(program, replayRoute(program, ir, result.route), result.input))).toBe(true);
    });
    it('does not call budget exhaustion a minimal counterexample', () => {
        const { program, ir } = compileTest('int main(){int n;cin>>n;return n;}');
        const result = diagnoseFailure(program, ir, '100', ['mutation'], 20000, 1);
        expect(result.status).toBe('reproduced'); expect(result.localMinimal).toBe(false); expect(result.oracleCalls).toBe(1);
    });
    it('does not treat timeouts or undefined references as mismatch evidence', () => {
        const limited = compileTest('int main(){while(1){}return 2;}');
        expect(diagnoseFailure(limited.program, limited.ir, '', ['mutation'], 100).status).toBe('inconclusive');
        const undefinedProgram = compileTest('int main(){return 1/0;}');
        expect(diagnoseFailure(undefinedProgram.program, undefinedProgram.ir, '', ['mutation'], 20000).status).toBe('inconclusive');
    });
    it('only proposes strictly simpler same-arity integer inputs', () => {
        const values = simplerInputs('10 -3');
        expect(values.every(s => s.split(' ').length === 2 && s.split(' ').map(Number).reduce((a, n) => a + Math.abs(n), 0) < 13)).toBe(true);
        expect(simplerInputs('hello')).toEqual([]);
    });
    it('connects reduced evidence to the active analysis and keeps the experiment ineligible', () => {
        const r = analyze('int main(){int n;cin>>n;int x=2+3;return n+x;}', 'cpp', ['128'], 20000, true);
        const candidate = r.candidates.at(-1)!;
        expect(candidate.route.at(-1)).toBe('mutation'); expect(candidate.accepted).toBe(false);
        expect(candidate.failure?.status).toBe('reproduced'); expect(candidate.failure?.route).toEqual(['mutation']);
        expect(r.optimizedRuns[0].returnValue?.value).toBe(133);
    });
});
