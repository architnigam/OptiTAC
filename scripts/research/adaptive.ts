import { readFile, writeFile } from 'node:fs/promises';
import { compileTest } from '../../src/core/testHelpers';
import { auditAdequacy, type FaultFamily } from '../../src/core/research/adequacy';
import { executeAST } from '../../src/core/runtime';
import { executeIR } from '../../src/core/ir';
import { matchRuns } from '../../src/core/guard';
import { inject } from './evaluate';
import type { Language } from '../../src/core/types';
export async function evaluate() {
    const corpus = JSON.parse(await readFile('docs/research/corpus.json', 'utf8')) as { id: string; source: string; language: Language; family: string; input: string }[];
    const rows = corpus.map(f => {
        const { program, ir } = compileTest(f.source, f.language);
        const excluded: FaultFamily = f.family === 'comparison-off-by-one' ? 'comparison' : f.family === 'rare-side-effect' ? 'effect' : f.family === 'division-rewrite' ? 'arithmetic' : 'literal';
        const policies = ['full-pool', 'fifo-64', 'adaptive-64'].map(policy => {
            const adaptive = policy !== 'full-pool';
            const audit = auditAdequacy(program, ir, ir, [f.input], [], 20000, { excluded, adaptive, fifo: policy === 'fifo-64' });
            // Inject only after scheduling and suite selection, never reward the scheduler with evaluation labels.
            const faulty = inject(ir, f.family);
            let detected = false;
            for (const k of audit.portfolio.indices) {
                const p = audit.probes[k], reference = executeAST(program, p.input, 500, false);
                const baseline = executeIR(program, ir, p.input, 500, false), subject = executeIR(program, faulty, p.input, 500, false);
                if (matchRuns(reference, baseline) && subject.status !== 'limited' && !matchRuns(reference, subject)) detected = true;
            }
            return { policy, detected, executions: audit.executions, planningSteps: audit.planningSteps, replaySteps: audit.portfolio.cost, tests: audit.portfolio.indices.length };
        });
        return { id: f.id, policies };
    });
    const summary = ['full-pool', 'fifo-64', 'adaptive-64'].map(policy => {
        const p = rows.flatMap(r => r.policies.filter(p => p.policy === policy));
        return { policy, detected: p.filter(r => r.detected).length, cases: p.length, executions: p.reduce((n, r) => n + r.executions, 0), planningSteps: p.reduce((n, r) => n + r.planningSteps, 0), replaySteps: p.reduce((n, r) => n + r.replaySteps, 0) };
    });
    const report = { summary, limitations: ['Synthetic development corpus, not independent program holdout.', 'Cost-aware exploration is a heuristic; no bandit regret or equivalence guarantee.', 'Step totals count interpreter work, not wall-clock performance.', 'Shared numeric oracle remains a limitation.'], rows };
    await writeFile('docs/research/adaptive-evaluation.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(summary, null, 2));
}
