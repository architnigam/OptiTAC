import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compileTest } from '../../src/core/testHelpers';
import { executeAST } from '../../src/core/runtime';
import { executeIR, type IRProgram } from '../../src/core/ir';
import { matchRuns } from '../../src/core/guard';
import { diagnoseFailure, replayRoute, mismatch } from '../../src/core/research/diagnose';
import { generateProbes, type ProbeStrategy } from '../../src/core/research/probes';
import type { CProgram, Language } from '../../src/core/types';
import { routePasses } from '../../src/core/optimizer';

const families = ['rare-positive', 'rare-negative', 'comparison-off-by-one', 'affine-alias', 'two-input-affine', 'after-loop', 'short-circuit', 'nonlinear-control', 'rare-side-effect', 'division-rewrite'];
export function inject(ir: IRProgram, family: string): IRProgram {
    const next = structuredClone(ir); let changed = false;
    for (const fn of next.functions) for (const i of fn.instructions) {
        if (family === 'rare-side-effect') {
            if (i.kind === 'output') { i.value = { kind: 'string', value: '', line: i.line, column: i.column }; changed = true; }
            if ((i.kind === 'compute' || i.kind === 'evaluate') && i.expression.kind === 'call' && i.expression.name === 'printf') { i.expression = { kind: 'literal', data: { type: 'int', value: 0 }, line: i.line, column: i.column }; changed = true; }
            continue;
        }
        if (family === 'division-rewrite') {
            if (i.kind === 'compute' && i.expression.kind === 'binary' && i.expression.op === '/') { i.expression.op = '*'; changed = true; }
            continue;
        }
        if (family === 'comparison-off-by-one' && i.kind === 'compute' && i.expression.kind === 'binary' && i.expression.op === '<') { i.expression.op = '<='; changed = true; }
        else if (family !== 'comparison-off-by-one' && i.kind === 'return' && i.value?.kind === 'literal' && i.value.data.value === 7) { i.value.data.value = 8; changed = true; }
    }
    if (!changed) throw Error('Mutation site not found.'); return next;
}
export async function evaluate() {
    const corpus = families.flatMap((family, f) => Array.from({ length: 12 }, (_, variant) => {
        const t = family === 'nonlinear-control' ? [1, 2, 4, 8, 16, 23, 41, 67, 89, 113, 149, 191][variant] : 17 + ((variant * 37 + f * 19) % 184);
        const language: Language = variant % 2 ? 'cpp' : 'c';
        const input = language === 'cpp' ? 'cin>>n>>pad;' : 'scanf("%d %d",&n,&pad);';
        let condition = `n==${t}`, prefix = '';
        if (family === 'rare-negative') condition = `n==-${t}`;
        if (family === 'comparison-off-by-one') condition = `n<${t}`;
        if (family === 'affine-alias') { prefix = 'int x=n+9;'; condition = `x==${t + 9}`; }
        if (family === 'two-input-affine') condition = `3*n+pad==${3 * t + 5}`;
        if (family === 'after-loop') prefix = 'int z=0;for(int i=0;i<3;i++)z+=i;';
        if (family === 'short-circuit') condition = `n==${t} && n>0`;
        if (family === 'nonlinear-control') condition = `n*n==${t * t}`;
        if (family === 'division-rewrite') condition = `n>=${t}`;
        const body = family === 'rare-side-effect' ? `{${language === 'cpp' ? 'cout<<"A";' : 'printf("A");'}return 7;}` : family === 'division-rewrite' ? 'return n/2;' : 'return 7;';
        return { id: `${family}:${variant}`, family, language, input: family === 'two-input-affine' ? '300 5' : family === 'division-rewrite' ? '0 999' : '300 999', source: `${language === 'cpp' ? '#include <iostream>\nusing namespace std;\n' : '#include <stdio.h>\n'}int main(){int n,pad;${input}${prefix}if(${condition})${body}return 2;}` };
    }));
    const randomSeeds = Array.from({ length: 32 }, (_, i) => (Math.imul(i + 1, 2654435761) + 20261028) >>> 0);
    const rows = corpus.map(fixture => {
        const { program, ir } = compileTest(fixture.source, fixture.language), faulty = inject(ir, fixture.family);
        const provided = executeAST(program, fixture.input, 2000, false);
        if (!matchRuns(provided, executeIR(program, ir, fixture.input, 2000, false)) || !matchRuns(provided, executeIR(program, faulty, fixture.input, 2000, false))) throw Error('Seed input exposed fault or source/IR disagreement: ' + fixture.id);
        const strategies = (['fixed', 'random', 'targeted'] as ProbeStrategy[]).map(strategy => {
            const probes = generateProbes(ir, [fixture.input], strategy, 8); let eligible = 0; const witnesses: string[] = [];
            for (const probe of probes) {
                const reference = executeAST(program, probe.input, 2000, false), original = executeIR(program, ir, probe.input, 2000, false);
                if (!matchRuns(reference, original)) continue;
                eligible++; if (mismatch(reference, executeIR(program, faulty, probe.input, 2000, false))) witnesses.push(probe.input);
            }
            return { strategy, probes: probes.length, eligible, detected: witnesses.length > 0, witnesses };
        });
        const witness = strategies.find(s => s.strategy === 'targeted')!.witnesses[0];
        let validPassComparisons = 0, validPassDisagreements = 0;
        for (const pass of routePasses) {
            const transformed = pass.run(ir, program).ir;
            for (const probe of generateProbes(ir, [fixture.input], 'targeted', 8)) {
                const reference = executeAST(program, probe.input, 2000, false);
                if (!matchRuns(reference, executeIR(program, ir, probe.input, 2000, false))) continue;
                validPassComparisons++; if (!matchRuns(reference, executeIR(program, transformed, probe.input, 2000, false))) validPassDisagreements++;
            }
        }
        if (validPassDisagreements) throw Error('A real optimization pass disagreed on the negative-control inputs: ' + fixture.id);
        const replay = (p: CProgram, original: IRProgram, route: string[]) => route.reduce((state, action) => action === 'seeded-fault' ? inject(state, fixture.family) : replayRoute(p, state, [action]), original);
        const reduced = witness ? diagnoseFailure(program, ir, witness, ['constants', 'jumps', 'seeded-fault'], 2000, 64, replay) : undefined;
        if (reduced?.status === 'reproduced' && !mismatch(executeAST(program, reduced.input, 2000, false), executeIR(program, replay(program, ir, reduced.route), reduced.input, 2000, false))) throw Error('Reduced evidence did not replay.');
        const randomTrials = randomSeeds.map(seed => {
            const probes = generateProbes(ir, [fixture.input], 'random', 8, seed);
            return probes.map(p => { const ref = executeAST(program, p.input, 2000, false); return matchRuns(ref, executeIR(program, ir, p.input, 2000, false)) && mismatch(ref, executeIR(program, faulty, p.input, 2000, false)); }).some(Boolean);
        });
        return { id: fixture.id, family: fixture.family, strategies, randomTrials, validPassComparisons, validPassDisagreements, reduction: reduced ? { status: reduced.status, localMinimal: reduced.localMinimal, oracleCalls: reduced.oracleCalls, inputBefore: reduced.seedInput, inputAfter: reduced.input, routeBefore: reduced.originalRoute.length, routeAfter: reduced.route.length } : null };
    });
    const summary = (strategy: ProbeStrategy) => { const checks = rows.map(r => r.strategies.find(s => s.strategy === strategy)!); return { strategy, detected: checks.filter(c => c.detected).length, total: rows.length, detectionRate: checks.filter(c => c.detected).length / rows.length, probes: checks.reduce((sum, c) => sum + c.probes, 0), eligible: checks.reduce((sum, c) => sum + c.eligible, 0) }; };
    const counts = randomSeeds.map((_, k) => rows.filter(r => r.randomTrials[k]).length);
    const report = { schema: 1, corpusSha256: createHash('sha256').update(JSON.stringify(corpus)).digest('hex'), cases: corpus.length, maxProbesPerCase: 8, maxSteps: 2000, summary: (['fixed', 'random', 'targeted'] as ProbeStrategy[]).map(summary), randomReplications: { seeds: randomSeeds, counts, meanDetected: counts.reduce((s, n) => s + n, 0) / counts.length, minDetected: Math.min(...counts), maxDetected: Math.max(...counts), maxProbesPerReplication: corpus.length * 8 }, reductions: { reproduced: rows.filter(r => r.reduction?.status === 'reproduced').length, locallyMinimal: rows.filter(r => r.reduction?.localMinimal).length, inputShortened: rows.filter(r => r.reduction && r.reduction.inputAfter.length < r.reduction.inputBefore.length).length, routeShortened: rows.filter(r => r.reduction && r.reduction.routeAfter < r.reduction.routeBefore).length }, byFamily: families.map(family => ({ family, results: (['fixed', 'random', 'targeted'] as ProbeStrategy[]).map(strategy => ({ strategy, detected: rows.filter(r => r.family === family && r.strategies.find(s => s.strategy === strategy)!.detected).length, total: 12 })) })), limitations: ['Synthetic seeded faults, not discovered production compiler bugs.', 'The corpus was constructed to exercise supported comparison boundaries; this favors the targeted strategy on affine cases.', 'A nonlinear family is included to expose the method boundary.', 'Equal maximum and actual probe counts are reported; reference AST and original IR share numeric primitives.', 'Reduced means locally irreducible under single action deletion and the documented integer simplifications, not globally minimal source.'], rows };
    await mkdir('docs/research', { recursive: true });
    await writeFile('docs/research/corpus.json', JSON.stringify(corpus, null, 2) + '\n');
    Object.assign(report, { negativeControls: { comparisons: rows.reduce((s, r) => s + r.validPassComparisons, 0), disagreements: rows.reduce((s, r) => s + r.validPassDisagreements, 0) } });
    await writeFile('docs/research/evaluation.json', JSON.stringify(report, null, 2) + '\n');
    await writeFile('src/core/research/evaluation.json', JSON.stringify({ ...report, rows: undefined, byFamily: undefined }, null, 2) + '\n');
    console.log(JSON.stringify({ cases: report.cases, summary: report.summary, reductions: report.reductions, randomReplications: report.randomReplications }, null, 2));
}
