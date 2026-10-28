import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compileTest } from '../../src/core/testHelpers';
import { executeAST } from '../../src/core/runtime';
import { executeIR } from '../../src/core/ir';
import { matchRuns } from '../../src/core/guard';
import { auditAdequacy, type FaultFamily } from '../../src/core/research/adequacy';
import { exactPortfolio, greedyPortfolio, bitCount } from '../../src/core/research/portfolio';
import { generateProbes } from '../../src/core/research/probes';
import { inject } from './evaluate';
import type { Language } from '../../src/core/types';

export async function evaluate() {
    const corpus = JSON.parse(await readFile('docs/research/corpus.json', 'utf8')) as { id: string; family: string; source: string; language: Language; input: string }[];
    const rows = corpus.map(fixture => {
        const { ir, program } = compileTest(fixture.source, fixture.language);
        const excluded: FaultFamily = fixture.family === 'comparison-off-by-one' ? 'comparison' : fixture.family === 'rare-side-effect' ? 'effect' : fixture.family === 'division-rewrite' ? 'arithmetic' : 'literal';
        const audit = auditAdequacy(program, ir, ir, [fixture.input], [], 20000, { excluded });
        if (audit.challenges.some(c => c.family === excluded)) throw Error('Held-out fault family leaked into selection.');
        const matrix = audit.probes.map(p => ({ mask: p.mask, anchors: p.status === 'eligible' ? p.anchors : 0, cost: p.cost }));
        const mutationOnly = exactPortfolio(matrix.map(r => ({ ...r, anchors: 0 })), 8), greedy = greedyPortfolio(matrix, 8);
        const branchOnly = exactPortfolio(matrix.map(r => ({ ...r, anchors: r.anchors & 15 })), 8);
        // The evaluation fault is injected only AFTER the pool, matrix and suites are fixed.
        const heldOut = inject(ir, fixture.family);
        const suites = [
            { name: 'provided-only', indices: audit.probes.map((p, k) => p.origin === 'provided' ? k : -1).filter(k => k >= 0) },
            { name: 'targeted-eight', indices: generateProbes(ir, [fixture.input], 'targeted').map(p => audit.probes.findIndex(r => r.input === p.input)).filter(k => k >= 0) },
            { name: 'mutation-only-exact', indices: mutationOnly.indices },
            { name: 'branch-only-exact', indices: branchOnly.indices },
            { name: 'anchor-preserving-greedy', indices: greedy.indices },
            { name: 'anchor-preserving-exact', indices: audit.portfolio.indices },
        ].map(suite => {
            let mask = 0, anchors = 0, detected = false, replaySteps = 0;
            for (const index of suite.indices) {
                const probe = audit.probes[index]; mask |= probe.mask; anchors |= probe.anchors; replaySteps += probe.cost;
                const reference = executeAST(program, probe.input, 500, false), baseline = executeIR(program, ir, probe.input, 500, false), candidate = executeIR(program, heldOut, probe.input, 500, false);
                if (matchRuns(reference, baseline) && candidate.status !== 'limited' && !matchRuns(reference, candidate)) detected = true;
            }
            return { name: suite.name, tests: suite.indices.length, challenges: bitCount(mask), anchors: bitCount(anchors), heldOutDetected: detected, replaySteps, inputs: suite.indices.map(k => audit.probes[k].input) };
        });
        const anchored = suites.at(-1)!, mutation = suites[2];
        if (anchored.challenges !== audit.portfolio.covered || anchored.anchors !== bitCount(audit.portfolio.anchors)) throw Error('Selected matrix failed to replay.');
        return { id: fixture.id, family: fixture.family, excluded, challengeCount: audit.challenges.length, poolInputs: audit.probes.length, planningExecutions: audit.executions, planningSteps: audit.planningSteps, selectionStates: audit.portfolio.states, misleadingMutationSaturation: mutation.challenges === bitCount(audit.poolMask) && !mutation.heldOutDetected, suites };
    });
    const names = rows[0].suites.map(s => s.name);
    const summary = names.map(name => { const selected = rows.map(r => r.suites.find(s => s.name === name)!); return { name, heldOutDetected: selected.filter(s => s.heldOutDetected).length, cases: rows.length, tests: selected.reduce((sum, s) => sum + s.tests, 0), replaySteps: selected.reduce((sum, s) => sum + s.replaySteps, 0), challengeDetections: selected.reduce((sum, s) => sum + s.challenges, 0), structuralAnchors: selected.reduce((sum, s) => sum + s.anchors, 0) }; });
    const report = { version: 'witness-portfolio-v1', corpusSha256: createHash('sha256').update(JSON.stringify(corpus)).digest('hex'), cases: rows.length, maxSelectedTests: 8, maxPoolInputs: 24, maxChallenges: 10, maxBranchAnchors: 4, maxBoundaryAnchors: 2, stepLimit: 500, summary, planningExecutions: rows.reduce((sum, r) => sum + r.planningExecutions, 0), planningSteps: rows.reduce((sum, r) => sum + r.planningSteps, 0), misleadingMutationSaturation: rows.filter(r => r.misleadingMutationSaturation).length, limitations: ['Reuses the existing synthetic corpus; this is operator-family holdout, not independent program holdout.', 'Mutation generation, coverage-based selection and branch coverage all have prior work.', 'Exact means optimal for the finite recorded matrix and lexicographic objective only.', 'Planning costs are paid before suite selection; replay compression is not end-to-end speedup.', 'Unseen evaluation fault family is excluded from shadow generation and is evaluated after selection.', 'Boundary anchors preserve generator center proposals, not solver-proven path reachability.', 'Shared AST/IR numeric primitives and bounded execution remain limitations.'], rows };
    await writeFile('docs/research/evidence-evaluation.json', JSON.stringify(report, null, 2) + '\n');
    await writeFile('src/core/research/evidence-evaluation.json', JSON.stringify({ ...report, rows: undefined }, null, 2) + '\n');
    console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
}
