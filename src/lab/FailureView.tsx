import type { FailureEvidence } from '../core/research/diagnose';
import { routeName, runLabel } from './format';
export function FailureView({ failure }: { failure: FailureEvidence | undefined }) {
    if (!failure) return null;
    return <section className="ml-panel failure-evidence" aria-label="Reduced failure evidence"><h3>Automatic failure diagnosis</h3>
        <p>{failure.reason}</p><p className="muted">{failure.oracleCalls}/{failure.budget} replay-oracle calls · at most 2,000 interpreter steps per execution.</p>
        {failure.status === 'reproduced' && <><div className="table-wrap"><table><thead><tr><th>Evidence</th><th>Before reduction</th><th>After reduction</th></tr></thead><tbody><tr><td>stdin</td><td><code>{JSON.stringify(failure.seedInput)}</code></td><td><code>{JSON.stringify(failure.input)}</code></td></tr><tr><td>Pass sequence</td><td>{routeName(failure.originalRoute)}</td><td>{routeName(failure.route)}</td></tr></tbody></table></div>
        <div className="table-wrap"><table><thead><tr><th>Replayed execution</th><th>Typed return / status</th><th>stdout</th></tr></thead><tbody>{[['AST reference', failure.reference], ['Original IR', failure.original], ['Reduced candidate', failure.candidate]].map(([name, value]) => { const run = value as typeof failure.reference; return <tr key={String(name)}><td>{String(name)}</td><td>{runLabel(run)}</td><td><code>{JSON.stringify(run?.stdout || '')}</code></td></tr>; })}</tbody></table></div>
        <details className="fold"><summary>Reduction log</summary><div>{failure.log.length ? <ol>{failure.log.map((entry, i) => <li key={i}>{entry}</li>)}</ol> : <p>No smaller eligible failure was found under the configured local reductions.</p>}</div></details></>}
        <p className="muted">Only defined reference executions that agree with original IR qualify. Timeouts cannot establish a failure. The source program is retained; reduction applies to stdin values and ordered pass actions, not source statements. Export evidence saves this replay.</p>
    </section>;
}
