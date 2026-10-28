import { useState } from 'react';
import type { AdequacyAudit } from '../core/research/adequacy';
import { bitCount } from '../core/research/portfolio';
import experiment from '../core/research/evidence-evaluation.json';
export function AdequacyView({ audit }: { audit: AdequacyAudit | undefined }) {
    const [active, setActive] = useState(0);
    if (!audit) return <p className="muted">Validation-quality audit is off or the reference run is ineligible. Enable “Audit validation blind spots” in the input settings.</p>;
    const probe = audit.probes[active], selected = audit.portfolio.indices;
    return <section className="ml-panel adequacy-panel" aria-label="Validation-quality audit">
        <div className="pane-heading"><h3>Can these tests expose a wrong rewrite?</h3><span>{audit.survivors.length} unresolved challenges</span></div>
        <p>Provided inputs distinguish {bitCount(audit.providedMask)}/{audit.challenges.length} local fault challenges. The selected audit suite distinguishes {audit.portfolio.covered}/{audit.challenges.length} using {selected.length} inputs.</p>
        {audit.quarantined && <p className="notice warning">The audit found an actual selected-IR disagreement. That candidate was quarantined and original IR restored.</p>}
        <p className="muted">These intentionally incorrect IR copies never enter optimization selection. A detected challenge measures test discrimination, not the probability that your compiler is correct.</p>
        <p className="muted">{audit.note}</p>
        <details className="fold"><summary>Operator-held-out experiment & ablations</summary><div>
            <p>The evaluation fault's entire operator family is excluded from shadow generation. Test selection completes before that fault is evaluated. This measures transfer beyond the known challenge set on a synthetic corpus.</p>
            <div className="table-wrap"><table><thead><tr><th>Suite selection</th><th>Unseen faults detected</th><th>Total replay tests</th></tr></thead><tbody>{experiment.summary.filter(s => ['targeted-eight', 'mutation-only-exact', 'branch-only-exact', 'anchor-preserving-exact', 'anchor-preserving-greedy'].includes(s.name)).map(s => <tr key={s.name}><td>{s.name}</td><td>{s.heldOutDetected}/{s.cases}</td><td>{s.tests}</td></tr>)}</tbody></table></div>
            <p>In {experiment.misleadingMutationSaturation}/{experiment.cases} cases, a mutation-only compact suite covered every challenge distinguishable in its pool yet missed the held-out fault. More known challenges alone would not establish correctness.</p>
            <p className="notice">This reuses the earlier 120-program synthetic corpus: operator-family holdout, not independent program holdout. Exact and greedy anchor-preserving selection tied on this corpus. Planning required {experiment.planningExecutions.toLocaleString()} executions before replay; the smaller suite is not an end-to-end speedup.</p>
        </div></details>
        <details className="fold"><summary>Witness matrix & unresolved evidence</summary><div>
            <p>Select an input to inspect which controlled changes it distinguishes. Highlighted rows belong to the exact compact suite.</p>
            <div className="table-wrap"><table className="witness-matrix"><thead><tr><th>stdin / status</th>{audit.challenges.map((c, k) => <th key={c.id} title={`${c.description} ${c.function} / line ${c.line}`}>C{k + 1}</th>)}</tr></thead><tbody>{audit.probes.map((p, i) => <tr key={p.input} className={selected.includes(i) ? 'selected-witness' : ''}><td><button onClick={() => setActive(i)} aria-pressed={active === i}>{selected.includes(i) ? '★ ' : ''}{p.input || '(empty)'}</button><small>{p.status} · {p.origin}</small></td>{audit.challenges.map((c, k) => <td key={c.id} title={p.cells[k] || p.status}>{p.cells[k] === 'detected' ? '✓' : p.cells[k] === 'matched' ? '·' : '?'}</td>)}</tr>)}</tbody></table></div>
            {probe && <p className="notice">Selected input {JSON.stringify(probe.input)}: {probe.status}. ✓ = mismatch exposed; · = observations matched; ? = unavailable or limited. A timeout is not a detected fault.</p>}
            <ul>{audit.challenges.map((c, k) => <li key={c.id}><b>C{k + 1} · {c.family}</b> — {c.description} {c.function}, line {c.line}. {audit.portfolio.mask & (1 << k) ? 'Distinguished by selected suite.' : audit.poolMask & (1 << k) ? 'Distinguishable in pool, omitted under selection budget.' : 'Unresolved in this bounded input pool; possibly equivalent, unreachable, unsupported or simply untested.'}</li>)}</ul>
        </div></details>
        <details className="fold"><summary>Branch anchors, exact selection & cost accounting</summary><div>
            <p>The selector first preserves structural anchors: observed outcomes at two source-IR branch sites and two generator-defined comparison-center groups. It then maximizes distinguished challenges, minimizes suite size, and minimizes a replay-step proxy. Up to ten challenges, six anchor bits, 24 inputs and eight selected tests keep the dynamic program finite.</p>
            <p>{bitCount(audit.portfolio.anchors)} structural anchors selected / {bitCount(audit.poolAnchors)} observed in the eligible pool. Generator-center anchors are heuristic proposals, not proof that a path is reachable.</p>
            <ul>{audit.anchorSites.map(s => <li key={`${s.function}:${s.instruction}`}>{s.function}, line {s.line}, IR #{s.instruction}</li>)}</ul>
            <p>Planning used <b>{audit.executions} interpreter executions</b> and {audit.planningSteps.toLocaleString()} interpreter steps, bounded to {audit.maxSteps} per execution. The proposed compact suite has a {audit.portfolio.cost}-step replay proxy. Planning is additional work; this is not a runtime-speedup claim.</p>
            <p>{audit.portfolio.states.toLocaleString()} dynamic-program states retained. Optimality applies only to this finite recorded matrix and the stated lexicographic objective. It is not global test adequacy, semantic equivalence, or coverage of every possible fault.</p>
            <p className="muted">The compact suite does not replace supplied input checks. Existing guards remain authoritative; extra eligible audit inputs can quarantine an actual faulty selected candidate. AST and IR still share numeric primitives.</p>
        </div></details>
    </section>;
}
