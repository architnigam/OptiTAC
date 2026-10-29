import { EvidenceScheduler, type Decision } from './adaptive';
import { executeIR, type IRProgram } from '../ir';
import { executeAST } from '../runtime';
import { instructionExpr, stable } from '../optimizer';
import { matchRuns } from '../guard';
import { generateProbes } from './probes';
import { exactPortfolio, type Portfolio } from './portfolio';
import type { CProgram, Expr, RunResult } from '../types';

export type FaultFamily = 'literal' | 'comparison' | 'arithmetic' | 'effect';
export interface ShadowFault { id: string; family: FaultFamily; function: string; instruction: number; line: number; description: string; ir: IRProgram }
/** Round-robin families prevent the cap being filled by just literal mutations. */
export function shadowFaults(ir: IRProgram, excluded?: FaultFamily, hotIds: number[] = []): ShadowFault[] {
    if (ir.functions.reduce((sum, f) => sum + f.instructions.length, 0) > 3000) return [];
    type Pending = Omit<ShadowFault, 'ir'> & { f: number; n: number; expression: Expr };
    const groups: Record<FaultFamily, Pending[]> = { literal: [], comparison: [], arithmetic: [], effect: [] };
    const comparison: Record<string, string> = { '<': '<=', '<=': '<', '>': '>=', '>=': '>', '==': '!=', '!=': '==' };
    for (let f = 0; f < ir.functions.length; f++) for (let n = 0; n < ir.functions[f].instructions.length; n++) {
        const i = ir.functions[f].instructions[n], e = instructionExpr(i);
        let family: FaultFamily | undefined, expression: Expr | undefined, description = '';
        if (e?.kind === 'literal' && e.data.type === 'int' && e.data.value < 2147483647) { family = 'literal'; expression = { ...e, data: { ...e.data, value: e.data.value + 1 } }; description = 'Increment an integer literal.'; }
        if (e?.kind === 'binary' && comparison[e.op]) { family = 'comparison'; expression = { ...e, op: comparison[e.op] }; description = `Replace ${e.op} with ${comparison[e.op]}.`; }
        if (e?.kind === 'binary' && ['+', '-', '*', '/'].includes(e.op)) { family = 'arithmetic'; expression = { ...e, op: e.op === '+' ? '-' : '+' }; description = `Replace arithmetic ${e.op} with ${expression.op}.`; }
        if (i.kind === 'output') { family = 'effect'; expression = { kind: 'string', value: '', line: i.line, column: i.column }; description = 'Suppress one stream output event.'; }
        if (e?.kind === 'call' && ['printf', 'puts', 'putchar'].includes(e.name)) { family = 'effect'; expression = { kind: 'literal', data: { type: 'int', value: 0 }, line: i.line, column: i.column }; description = 'Replace an output call by zero, dropping its effect.'; }
        if (!family || family === excluded || !expression) continue;
        if (!['compute', 'evaluate', 'branch', 'declare', 'initialize', 'return', 'output'].includes(i.kind) || stable(expression) === stable(e)) continue;
        groups[family].push({ id: `${ir.functions[f].name}:${i.id}:${family}`, family, function: ir.functions[f].name, instruction: i.id, line: i.line, description, f, n, expression });
    }
    for (const group of Object.values(groups)) group.sort((a, b) => Number(hotIds.includes(b.instruction)) - Number(hotIds.includes(a.instruction)));
    const out: ShadowFault[] = [];
    for (let rank = 0; rank < 10 && out.length < 10; rank++) for (const family of Object.keys(groups) as FaultFamily[]) if (groups[family][rank] && out.length < 10) {
        const pending = groups[family][rank], copy = structuredClone(ir), target = copy.functions[pending.f].instructions[pending.n], expression = structuredClone(pending.expression);
        if (target.kind === 'compute' || target.kind === 'evaluate') target.expression = expression;
        else if (target.kind === 'branch') target.condition = expression;
        else (target as { value?: Expr }).value = expression;
        const { f: _f, n: _n, expression: _expression, ...metadata } = pending; void _f; void _n; void _expression;
        out.push({ ...metadata, ir: copy });
    }
    return out;
}
export interface AdequacyProbe {
    input: string; origin: string; status: 'eligible' | 'reference-undefined' | 'reference-limited' | 'unsupported' | 'lowering-mismatch' | 'subject-limited' | 'subject-mismatch';
    mask: number; anchors: number; cost: number; cells: ('detected' | 'matched' | 'limited')[];
    reference?: RunResult; subject?: RunResult;
}
export interface AdequacyAudit {
    version: 'witness-portfolio-v1'; subjectRoute: string[];
    challenges: Omit<ShadowFault, 'ir'>[]; probes: AdequacyProbe[]; portfolio: Portfolio;
    providedMask: number; poolMask: number; survivors: string[];
    anchorSites: { function: string; instruction: number; line: number }[];
    poolAnchors: number;
    boundarySites: string[];
    executions: number; planningSteps: number; maxSteps: number;
    scheduling?: { policy: string; executionBudget: number; remainingInputs: number; stop: string; decisions: Decision[] };
    quarantined: boolean;
    note: string;
}
export function witnessPool(ir: IRProgram, inputs: string[]) {
    const seen = new Set<string>(), pool: { input: string; origin: string; boundarySites: string[] }[] = [];
    const add = (input: string, origin: string, boundarySite?: string) => {
        if (input.length > 4000) return; const key = input.trim().replace(/\s+/g, ' ');
        if (seen.has(key)) { const old = pool.find(p => p.input.trim().replace(/\s+/g, ' ') === key)!; if (boundarySite && !old.boundarySites.includes(boundarySite)) old.boundarySites.push(boundarySite); return; }
        if (pool.length >= 24) return; seen.add(key); pool.push({ input, origin, boundarySites: boundarySite ? [boundarySite] : [] });
    };
    inputs.slice(0, 12).forEach(input => add(input, 'provided'));
    const variants = ['targeted', 'fixed', 'random'] as const;
    const queues = variants.map(strategy => generateProbes(ir, inputs, strategy));
    for (let rank = 0; rank < 8; rank++) queues.forEach((q, k) => { if (q[rank]) add(q[rank].input, variants[k], q[rank].boundarySite); });
    return pool;
}
export function auditAdequacy(program: CProgram, original: IRProgram, subject: IRProgram, inputs: string[], subjectRoute: string[], maxSteps: number, options: { excluded?: FaultFamily; hotIds?: number[]; budget?: number; adaptive?: boolean; executionBudget?: number; fifo?: boolean } = {}): AdequacyAudit {
    if (options.executionBudget !== undefined && (!Number.isFinite(options.executionBudget) || options.executionBudget < 0)) throw Error('Audit execution budget must be finite and nonnegative.');
    const faults = shadowFaults(subject, options.excluded, options.hotIds), steps = Math.min(maxSteps, 500);
    const sites = original.functions.flatMap(fn => fn.instructions.filter(i => i.kind === 'branch').map(i => ({ function: fn.name, instruction: i.id, line: i.line }))).sort((a, b) => Number(options.hotIds?.includes(b.instruction)) - Number(options.hotIds?.includes(a.instruction))).slice(0, 2);
    const pool = witnessPool(original, inputs), boundarySites = [...new Set(pool.flatMap(p => p.boundarySites))].slice(0, 2);
    const audit: AdequacyAudit = { version: 'witness-portfolio-v1', subjectRoute: [...subjectRoute], challenges: faults.map(({ ir: _ir, ...rest }) => { void _ir; return rest; }), probes: [], portfolio: { indices: [], mask: 0, anchors: 0, covered: 0, cost: 0, states: 1 }, providedMask: 0, poolMask: 0, survivors: [], anchorSites: sites, boundarySites, poolAnchors: 0, executions: 0, planningSteps: 0, maxSteps: steps, quarantined: false, note: faults.length ? 'Coverage concerns only the generated, capped challenge set.' : 'No shadow challenges generated: no supported sites, all sites excluded, or the 3,000-instruction audit limit was exceeded. No mutation-adequacy claim is made.' };
    const run = (fn: () => RunResult) => { const result = fn(); audit.executions++; audit.planningSteps += result.steps; return result; };
    const scheduler = new EvidenceScheduler(), pending = [...pool];
    const executionBudget = Math.max(0, Math.min(312, Math.floor(options.executionBudget ?? 64)));
    while (pending.length) {
        // Reserve a complete row before starting: never truncate a comparison into a false match.
        if (options.adaptive && audit.executions + 3 + faults.length > executionBudget) break;
        const proposal = pending.splice(options.adaptive && !options.fifo ? scheduler.choose(pending) : 0, 1)[0];
        const startSteps = audit.planningSteps;
        let observedMask = 0, observedAnchors = 0;
        try {
        const reference = run(() => executeAST(program, proposal.input, steps, false));
        const probe: AdequacyProbe = { ...proposal, status: 'eligible', mask: 0, anchors: 0, cost: reference.steps, cells: [] };
        audit.probes.push(probe);
        if (reference.status !== 'returned') { probe.status = reference.status === 'undefined' ? 'reference-undefined' : reference.status === 'limited' ? 'reference-limited' : 'unsupported'; continue; }
        const baseline = run(() => executeIR(program, original, proposal.input, steps, false, (fn, id, taken) => { const site = sites.findIndex(s => s.function === fn && s.instruction === id); if (site >= 0) probe.anchors |= 1 << (site * 2 + Number(taken)); }));
        probe.cost += baseline.steps;
        if (baseline.status === 'limited') { probe.status = 'reference-limited'; continue; }
        if (!matchRuns(reference, baseline)) { probe.status = 'lowering-mismatch'; probe.reference = reference; probe.subject = baseline; continue; }
        const actual = run(() => executeIR(program, subject, proposal.input, steps, false));
        probe.cost += actual.steps;
        if (actual.status === 'limited') { probe.status = 'subject-limited'; continue; }
        if (!matchRuns(reference, actual)) { probe.status = 'subject-mismatch'; probe.reference = reference; probe.subject = actual; continue; }
        proposal.boundarySites.forEach(site => { const k = boundarySites.indexOf(site); if (k >= 0) probe.anchors |= 1 << (4 + k); });
        for (let k = 0; k < faults.length; k++) {
            const mutated = run(() => executeIR(program, faults[k].ir, proposal.input, steps, false));
            const state = mutated.status === 'limited' ? 'limited' : matchRuns(reference, mutated) ? 'matched' : 'detected';
            probe.cells.push(state); if (state === 'detected') probe.mask |= 1 << k;
        }
        observedMask = probe.mask; observedAnchors = probe.anchors;
        audit.poolMask |= probe.mask; audit.poolAnchors |= probe.anchors; if (proposal.origin === 'provided') audit.providedMask |= probe.mask;
    }
        finally { scheduler.observe(proposal.input, proposal.origin, observedMask, observedAnchors, audit.planningSteps - startSteps); }
    }
    if (options.adaptive) audit.scheduling = { policy: options.fifo ? 'fixed proposal order' : 'cost-aware online exploration heuristic', executionBudget, remainingInputs: pending.length, stop: pending.length ? 'Execution budget reached; untested inputs remain.' : 'Finite proposal pool exhausted; correctness remains unproved.', decisions: scheduler.history };
    audit.portfolio = exactPortfolio(audit.probes.map(p => ({ mask: p.mask, cost: p.cost, anchors: p.status === 'eligible' ? p.anchors : 0 })), options.budget ?? 8);
    audit.survivors = faults.filter((_, k) => !(audit.portfolio.mask & (1 << k))).map(f => f.id);
    return audit;
}
