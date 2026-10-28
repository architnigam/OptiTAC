import { writeFile } from 'node:fs/promises';
import { examples } from '../../src/lab/content';
import { analyze, observationsMatch } from '../../src/core/analyze';
import { routePasses, cost } from '../../src/core/optimizer';
import { predictForest } from '../../src/core/ml/forest';
import { features } from '../../src/core/ml/features';
import artifact from '../../src/core/ml/model.json';
import type { Language } from '../../src/core/types';

export async function evaluate() {
    const fixtures = [
        ...examples.filter(e => !['native', 'undefined', 'boundary-demo'].includes(e.id)).map(e => ({ name: e.id, source: e.source, language: e.language, inputs: e.inputs.split('\n') })),
        { name: 'recursive-fibonacci', source: 'int f(int n){if(n<2)return n;return f(n-1)+f(n-2);}int main(){int n;cin>>n;return f(n);}', language: 'cpp' as Language, inputs: ['5', '7'] },
        { name: 'dynamic-join', source: 'int main(){int n;cin>>n;int z=1;if(n>3)z=7;else z=9;return z+2;}', language: 'cpp' as Language, inputs: ['1', '5'] },
        { name: 'lazy-effects', source: 'int main(){int n;cin>>n;int x=0;if(n || (x=3)){}return x;}', language: 'cpp' as Language, inputs: ['0', '3'] },
        { name: 'nested-loop', source: 'int main(){int n;cin>>n;int s=0;for(int i=0;i<n;i++){for(int j=0;j<3;j++){if(j==1)continue;s+=i+j;}}return s;}', language: 'cpp' as Language, inputs: ['0', '4'] },
        { name: 'float-rounding', source: 'int main(){float x=16777216.0f;float y=x+1.0f;return (int)(y-x);}', language: 'cpp' as Language, inputs: [''] },
        { name: 'negative-division', source: 'int main(){int n;cin>>n;return n/2+n%2;}', language: 'cpp' as Language, inputs: ['-7', '7'] },
        { name: 'negative-only-branch', source: 'int main(){int n;cin>>n;if(n<0)return 7;return 9;}', language: 'cpp' as Language, inputs: ['3'] },
        { name: 'scope-and-break', source: 'int main(){int n;cin>>n;int x=4;for(int i=0;i<n;i++){int x=i+2;if(x>5)break;cout<<x;}return x;}', language: 'cpp' as Language, inputs: ['2', '6'] },
        { name: 'unreachable-output', source: 'int main(){int n;cin>>n;int z=3+4;return n+z;int a=4+5;int b=a*2;cout<<b;return b;}', language: 'cpp' as Language, inputs: ['2', '6'] },
        { name: 'unreachable-loop', source: 'int main(){int n;cin>>n;int z=2*3;return n+z;for(int i=0;i<4;i++){cout<<i;}return 0;}', language: 'cpp' as Language, inputs: ['1', '3'] },
    ];
    const rows = fixtures.map(fixture => {
        const comparisons = [1, 8, 32].map(candidateBudget => {
            const baseline = analyze(fixture.source, fixture.language, fixture.inputs, 20000, false, { useML: false, candidateBudget });
            const guided = analyze(fixture.source, fixture.language, fixture.inputs, 20000, false, { useML: true, candidateBudget });
            for (const result of [baseline, guided]) {
                if (result.diagnostic || result.searchStatus !== 'validated' || result.costAfter > result.costBefore || !result.optimizedRuns.every((r, i) => observationsMatch(result.reference[i], r)) || result.candidates.some(c => c.accepted && c.checks.some(k => !k.matched))) throw Error(`Benchmark validation failed: ${fixture.name} ${JSON.stringify(result.diagnostic)}`);
            }
            return { candidateBudget, baselineCost: baseline.costAfter, guidedCost: guided.costAfter, baselineCandidates: baseline.candidates.length, guidedCandidates: guided.candidates.length, guidedStates: guided.candidates.filter(c => c.prediction).length, eligibleProbes: guided.guard.filter(g => g.status === 'eligible').length, excludedProbes: guided.guard.filter(g => g.status !== 'eligible').length, allAcceptedObservationsMatch: true };
        });
        const first = analyze(fixture.source, fixture.language, fixture.inputs, 20000, false, { stress: false, candidateBudget: 1 });
        const predicted = predictForest(artifact.trees, features(first.original!));
        const actual = routePasses.map(p => (cost(first.original!) - cost(p.run(first.original!, first.program!).ir)) / Math.max(1, cost(first.original!)));
        return { name: fixture.name, modelStatus: first.ml?.status, bestPassPredictionMatched: Math.max(...actual) - actual[predicted.indexOf(Math.max(...predicted))] < 1e-9, comparisons };
    });
    const paired = rows.flatMap(r => r.comparisons);
    const report = { modelId: artifact.id, programs: fixtures.length, pairedSearches: paired.length, budgets: [1, 8, 32], modelReadyPrograms: rows.filter(r => r.modelStatus === 'ready').length, rawBestPassAgreement: rows.filter(r => r.bestPassPredictionMatched).length / rows.length, guidedBetter: paired.filter(r => r.guidedCost < r.baselineCost).length, equal: paired.filter(r => r.guidedCost === r.baselineCost).length, guidedWorse: paired.filter(r => r.guidedCost > r.baselineCost).length, observationFailures: 0, rows, limitations: ['Small, hand-selected challenge set used during development, not an independent external benchmark.', 'These exact source programs are not added to training, but related structural families may be represented.', 'Static cost comparisons do not establish runtime performance improvements.'] };
    await writeFile('docs/ml/challenge-evaluation.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
}
