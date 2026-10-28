import { tokenize } from './lexer';
import { CParser } from './parser';
import { check } from './semantics';
import { executeAST } from './runtime';
import { executeIR, generateIR, type IRProgram } from './ir';
import { basicBlocks, cost, instructionCount, routePasses, stable, type Rewrite } from './optimizer';
import { CompileFault, type CProgram, type Diagnostic, type Language, type Lexeme, type RunResult, type SymbolRow } from './types';
import { advise, rankedPasses, type Advice } from './ml/advisor';
import { buildGuard, matchRuns, type GuardCase } from './guard';
import type { ProbeStrategy } from './research/probes';
import { diagnoseFailure, returnMutation, branchMutation, type FailureEvidence } from './research/diagnose';
import { auditAdequacy, type AdequacyAudit } from './research/adequacy';
export interface SearchOptions { useML?: boolean; stress?: boolean; candidateBudget?: number; probeStrategy?: ProbeStrategy; diagnose?: boolean; mutationKind?: 'return' | 'branch'; evidenceAudit?: boolean }
export function observationsMatch(a: RunResult, b: RunResult): boolean {
    return matchRuns(a, b);
}
export interface RouteCandidate {
    id: number;
    route: string[];
    score: number;
    instructions: number;
    accepted: boolean;
    reason: string;
    logs: Rewrite[];
    ir: IRProgram;
    checks: {
        input: string;
        reference: RunResult;
        candidate: RunResult;
        matched: boolean;
        origin?: 'provided' | 'boundary' | 'adequacy';
    }[];
    iterations: number;
    prediction?: { gain: number; actualGain: number; parentCost: number };
    failure?: FailureEvidence;
}
export interface Analysis {
    source: string;
    language: Language;
    inputs: string[];
    tokens: Lexeme[];
    program?: CProgram;
    symbols: SymbolRow[];
    original?: IRProgram;
    optimized?: IRProgram;
    diagnostic?: Diagnostic;
    reference: RunResult[];
    originalRuns: RunResult[];
    optimizedRuns: RunResult[];
    candidates: RouteCandidate[];
    route: string[];
    searchStatus: 'not-run' | 'validated' | 'inconclusive' | 'unsafe';
    blocks: ReturnType<typeof basicBlocks>;
    costBefore: number;
    costAfter: number;
    ml?: Advice;
    mlEnabled: boolean;
    guard: GuardCase[];
    probeStrategy: ProbeStrategy;
    adequacy?: AdequacyAudit;
    counterfactuals: {
        pass: string;
        cost: number;
        instructions: number;
        preserved: boolean;
    }[];
}
export function searchRoutes(program: CProgram, original: IRProgram, inputs: string[], reference: RunResult[], maxSteps: number, tryMutation = false, options: SearchOptions = {}, guard: GuardCase[] = []): {
    best: IRProgram;
    route: string[];
    candidates: RouteCandidate[];
    status: Analysis['searchStatus'];
} {
    if (reference.some(r => r.status !== 'returned'))
        return { best: original, route: [], candidates: [], status: reference.some(r => r.status === 'limited') ? 'inconclusive' : 'unsafe' };
    let best = { ir: original, route: [] as string[], score: cost(original) };
    let beam = [best];
    const candidates: RouteCandidate[] = [];
    const seen = new Set([stable(original)]);
    const budget = Math.max(1, Math.min(32, options.candidateBudget ?? 32));
    const compare = (ir: IRProgram): RouteCandidate['checks'] => [
        ...inputs.map((input, index) => { const candidate = executeIR(program, ir, input, maxSteps, false); return { input, reference: reference[index], candidate, matched: observationsMatch(reference[index], candidate), origin: 'provided' as const }; }),
        ...guard.filter(g => g.status === 'eligible').map(g => { const candidate = executeIR(program, ir, g.input, Math.min(maxSteps, 2000), false); return { input: g.input, reference: g.reference, candidate, matched: observationsMatch(g.reference, candidate), origin: 'boundary' as const }; }),
    ];
    for (let depth = 0; depth < 4 && candidates.length < budget; depth++) {
        const next: typeof beam = [];
        for (const parent of beam) {
            const ranking = rankedPasses(parent.ir, options.useML !== false);
            for (const pass of ranking.passes) {
                if (candidates.length >= budget)
                    break;
                const transformed = pass.run(parent.ir, program);
                const key = stable(transformed.ir);
                if (seen.has(key))
                    continue;
                seen.add(key);
                const route = [...parent.route, pass.id];
                const checks = compare(transformed.ir);
                const accepted = checks.every(c => c.matched);
                const score = cost(transformed.ir);
                const predicted = ranking.advice?.status === 'ready' ? ranking.advice.scores.find(s => s.pass === pass.id) : undefined;
                candidates.push({ id: candidates.length + 1, route, score, instructions: instructionCount(transformed.ir), accepted, reason: accepted ? `Matched stdout and typed return value on ${inputs.length} provided and ${checks.length - inputs.length} eligible boundary input case(s).` : checks.some(c => c.candidate.status === 'limited') ? 'Rejected as inconclusive: candidate exceeded the execution budget.' : 'Rejected: candidate disagreed with the AST reference or encountered a diagnostic.', logs: transformed.logs, ir: transformed.ir, checks, iterations: transformed.iterations, ...(predicted ? { prediction: { gain: predicted.predictedGain, actualGain: cost(parent.ir) - score, parentCost: cost(parent.ir) } } : {}) });
                if (accepted) {
                    const child = { ir: transformed.ir, route, score };
                    next.push(child);
                    if (score < best.score || (score === best.score && instructionCount(child.ir) < instructionCount(best.ir)))
                        best = child;
                }
            }
        }
        beam = next.sort((a, b) => a.score - b.score || instructionCount(a.ir) - instructionCount(b.ir) || a.route.join().localeCompare(b.route.join())).slice(0, 3);
        if (!beam.length)
            break;
    }
    if (tryMutation) {
        // Localized experiments start from original IR so an optimization cannot erase the mutation site.
        const localized = options.mutationKind === 'branch';
        const mutated = localized ? branchMutation(original) : returnMutation(best.ir);
        const checks = compare(mutated);
        const reason = localized ? stable(mutated) === stable(original) ? 'No applicable integer-literal return was found in an immediate branch successor. This experiment is ineligible; no fault or counterexample is claimed.' : 'Localized return-literal mutation experiment. The provided input may miss it; inspect generated probes. This experiment is never eligible for selection.' : 'Deliberately broken return + 1 candidate. This experiment is never eligible for selection; the case comparisons expose its counterexample.';
        candidates.push({ id: candidates.length + 1, route: localized ? ['branch-mutation'] : [...best.route, 'mutation'], score: cost(mutated), instructions: instructionCount(mutated), accepted: false, reason, logs: [], ir: mutated, checks, iterations: 0 });
    }
    return { best: best.ir, route: best.route, candidates, status: 'validated' };
}
export function analyze(source: string, language: Language = 'cpp', inputs: string[] = [''], maxSteps = 20000, tryMutation = false, options: SearchOptions = {}): Analysis {
    const result: Analysis = { source, language, inputs: inputs.length ? inputs : [''], tokens: [], symbols: [], reference: [], originalRuns: [], optimizedRuns: [], candidates: [], route: [], searchStatus: 'not-run', blocks: [], costBefore: 0, costAfter: 0, counterfactuals: [], guard: [], mlEnabled: options.useML !== false, probeStrategy: options.probeStrategy ?? 'targeted' };
    try {
        if (inputs.length > 12)
            throw new CompileFault('limit', 'INPUT_CASES', 'Use at most 12 input cases.');
        if (inputs.some(s => s.length > 4000))
            throw new CompileFault('limit', 'INPUT_LIMIT', 'Each input case is limited to 4,000 characters.');
        if (!Number.isInteger(maxSteps) || maxSteps < 100 || maxSteps > 100000)
            throw new CompileFault('limit', 'BUDGET', 'Execution budget must be between 100 and 100,000 steps.');
        if (options.candidateBudget !== undefined && (!Number.isInteger(options.candidateBudget) || options.candidateBudget < 1 || options.candidateBudget > 32))
            throw new CompileFault('limit', 'SEARCH_BUDGET', 'Candidate budget must be an integer from 1 to 32.');
        result.tokens = tokenize(source, language);
        result.program = new CParser(result.tokens, language).parse();
        result.symbols = check(result.program);
        result.original = generateIR(result.program);
        result.reference = result.inputs.map(input => executeAST(result.program!, input, maxSteps, true));
        result.originalRuns = result.inputs.map(input => executeIR(result.program!, result.original!, input, maxSteps, true));
        for (let i = 0; i < result.reference.length; i++) {
            const a = result.reference[i], b = result.originalRuns[i];
            if (a.status === 'limited' || b.status === 'limited') {
                result.searchStatus = 'inconclusive';
                continue;
            }
            if (a.status === 'returned' && !observationsMatch(a, b))
                throw new CompileFault('runtime', 'LOWERING_MISMATCH', 'AST and unoptimized IR disagree. No optimized result is accepted.');
            if (a.status !== 'returned' && (a.status !== b.status || a.diagnostic?.code !== b.diagnostic?.code))
                throw new CompileFault('runtime', 'LOWERING_MISMATCH', 'AST and IR diagnostic behavior disagree. No optimized result is accepted.');
        }
        result.ml = advise(result.original);
        if (options.stress !== false && result.reference.every(r => r.status === 'returned')) result.guard = buildGuard(result.program, result.original, result.inputs, maxSteps, options.probeStrategy);
        if (result.guard.some(g => g.status === 'lowering-mismatch')) throw new CompileFault('runtime', 'LOWERING_MISMATCH', 'A generated boundary input exposed AST/IR disagreement. No optimized result is accepted.');
        const search = result.searchStatus === 'inconclusive' ? { best: result.original, route: [], candidates: [], status: 'inconclusive' as const } : searchRoutes(result.program, result.original, result.inputs, result.reference, maxSteps, tryMutation, options, result.guard);
        result.optimized = search.best;
        result.route = search.route;
        result.candidates = search.candidates;
        if (options.diagnose !== false) for (const c of result.candidates.filter(c => !c.accepted).slice(0, 3)) {
            const failed = c.checks.find(k => k.reference.status === 'returned' && k.candidate.status !== 'limited' && !k.matched);
            if (failed) c.failure = diagnoseFailure(result.program, result.original, failed.input, c.route, maxSteps);
        }
        result.searchStatus = search.status;
        result.optimizedRuns = result.inputs.map(input => executeIR(result.program!, search.best, input, maxSteps, true));
        if (options.evidenceAudit && search.status === 'validated') {
            const hotIds = result.candidates.filter(c => c.accepted && c.route.every((id, k) => result.route[k] === id)).flatMap(c => c.logs.map(l => l.id));
            result.adequacy = auditAdequacy(result.program, result.original, search.best, result.inputs, result.route, maxSteps, { hotIds });
            if (result.adequacy.probes.some(p => p.status === 'lowering-mismatch')) {
                result.optimized = undefined; result.optimizedRuns = []; result.route = []; result.searchStatus = 'unsafe';
                throw new CompileFault('runtime', 'LOWERING_MISMATCH', 'The evidence audit exposed AST/original-IR disagreement. Optimized output is withheld.');
            }
            const failed = result.adequacy.probes.filter(p => p.status === 'subject-mismatch');
            if (failed.length) {
                const chosen = result.candidates.find(c => c.accepted && c.route.join() === result.route.join());
                if (chosen) {
                    chosen.accepted = false; chosen.reason = 'Quarantined: an additional evidence-audit input exposed an actual disagreement. Original IR was restored.';
                    chosen.checks.push(...failed.map(p => ({ input: p.input, reference: p.reference!, candidate: p.subject!, matched: false, origin: 'adequacy' as const })));
                    chosen.failure = diagnoseFailure(result.program, result.original, failed[0].input, chosen.route, maxSteps);
                }
                result.adequacy.quarantined = true; result.optimized = result.original; result.optimizedRuns = result.originalRuns; result.route = [];
            }
        }
        result.blocks = basicBlocks(result.optimized);
        result.costBefore = cost(result.original);
        result.costAfter = cost(result.optimized);
        if (search.status === 'validated')
            result.counterfactuals = [...new Set(result.route)].map(pass => { let ir = result.original!; for (const id of result.route.filter(id => id !== pass))
                ir = routePasses.find(p => p.id === id)!.run(ir, result.program!).ir; return { pass, cost: cost(ir), instructions: instructionCount(ir), preserved: result.inputs.every((input, index) => observationsMatch(result.reference[index], executeIR(result.program!, ir, input, maxSteps, false))) && result.guard.filter(g => g.status === 'eligible').every(g => observationsMatch(g.reference, executeIR(result.program!, ir, g.input, Math.min(maxSteps, 2000), false))) }; });
    }
    catch (error) {
        result.diagnostic = error instanceof CompileFault ? error.diagnostic : { stage: 'runtime', code: 'INTERNAL', message: error instanceof Error ? error.message : String(error), line: 1, column: 1 };
    }
    return result;
}

