import type { Analysis } from '../core/analyze';
import modelEvaluation from '../core/ml/evaluation.json';
import { routeName } from './format';

const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
export function MLView({ analysis }: { analysis: Analysis }) {
    const advice = analysis.ml, report = modelEvaluation;
    if (!advice) return null;
    const eligible = analysis.guard.filter(g => g.status === 'eligible').length;
    const predictions = analysis.candidates.filter(c => c.prediction);
    return <section className="ml-panel" aria-label="ML advisor and boundary audit">
        <div className="pane-heading"><h3>ML advisor + boundary audit</h3><span>{analysis.mlEnabled ? advice.status === 'ready' ? 'Trained model active' : 'Default-order fallback' : 'ML guidance off'}</span></div>
        <p>{analysis.mlEnabled ? advice.reason : 'Default pass ordering is active. Predictions remain visible for comparison.'}</p>
        <p className="muted">A trained random forest predicts static cost reduction. It cannot authorize a rewrite or change the interpreter’s semantics.</p>
        <details className="fold"><summary>Predictions, evidence & why</summary><div>
            <div className="table-wrap"><table><thead><tr><th>Pass on original IR</th><th>Predicted saving</th><th>Calibration error band</th></tr></thead><tbody>{advice.scores.map(s => <tr key={s.pass}><td>{routeName([s.pass])}</td><td>{s.predictedGain.toFixed(2)}</td><td>{s.low.toFixed(2)} – {s.high.toFixed(2)}</td></tr>)}</tbody></table></div>
            <p className="muted">Units are the existing static IR cost proxy. Bands use the 90th-percentile absolute errors on a separate calibration split; they are not correctness confidence or guaranteed coverage.</p>
            <h4>Features affecting the top prediction</h4><p>Tree-path contributions relative to the forest’s root prediction. These explain the prediction, not the correctness of a transformation.</p>
            <ul>{advice.explanation.map(e => <li key={e.feature}>{e.feature}: {e.contribution >= 0 ? '+' : ''}{e.contribution.toFixed(2)} cost units</li>)}</ul>
            <details className="fold"><summary>All measured IR features</summary><div className="table-wrap"><table><thead><tr><th>Feature</th><th>Value</th><th>Training envelope</th></tr></thead><tbody>{advice.features.map(f => <tr key={f.name}><td>{f.name}</td><td>{f.value}</td><td>{f.outside ? 'Outside — default-order fallback' : 'Inside'}</td></tr>)}</tbody></table></div></details>
            <h4>Predicted versus measured candidate savings</h4>{predictions.length ? <div className="table-wrap"><table><thead><tr><th>Candidate / last pass</th><th>Predicted</th><th>Measured</th><th>Observation checks</th></tr></thead><tbody>{predictions.map(c => <tr key={c.id}><td>#{c.id} · {routeName([c.route.at(-1)!])}</td><td>{c.prediction!.gain.toFixed(2)}</td><td>{c.prediction!.actualGain}</td><td>{c.accepted ? 'Matched' : 'Rejected'}</td></tr>)}</tbody></table></div> : <p>No model-guided transformed candidates in this run.</p>}
        </div></details>
        <details className="fold"><summary>Training & independent holdout results</summary><div>
            <p><b>{report.programs.toLocaleString()} generated C/C++ programs</b> produced {report.states.toLocaleString()} measured IR states across {report.families.length} program families. Each state is labeled by running the actual four optimization passes and checking two interpreter inputs.</p>
            <p>Split by whole structural template: {report.split.train.length} training / {report.split.validation.length} validation / {report.split.calibration.length} calibration / {report.split.test.length} test groups. Numeric and language variants stay together. Validation selects tree depth; calibration sets the error bands; test data is reserved for reporting.</p>
            <div className="table-wrap"><table><thead><tr><th>Untouched synthetic test set</th><th>Random forest</th><th>Training-mean baseline</th></tr></thead><tbody><tr><td>Best-pass agreement (ties accepted)</td><td>{percent(report.test.topChoiceAgreement)}</td><td>{percent(report.meanBaseline.topChoiceAgreement)}</td></tr><tr><td>Mean absolute gain-ratio error</td><td>{report.test.maeGainRatio.toFixed(4)}</td><td>{report.meanBaseline.maeGainRatio.toFixed(4)}</td></tr><tr><td>Mean best-pass regret ratio</td><td>{report.test.meanRegretRatio.toFixed(4)}</td><td>{report.meanBaseline.meanRegretRatio.toFixed(4)}</td></tr></tbody></table></div>
            <p className="notice">These are {report.test.rows} synthetic held-out states, including {report.test.informativeRows} with a positive best saving. Similar broad program families occur in every split. This is not an accuracy guarantee on arbitrary C/C++, a runtime speedup, or a measure of compiler correctness.</p>
            <p className="muted">Model: <code>{advice.modelId}</code> · {report.selected.trees} trees · maximum depth {report.selected.depth} · reproducible seed {report.seed}. Retrain locally with <code>npm run train:ml</code>. Raw dataset and evaluation are in <code>docs/ml/</code>.</p>
        </div></details>
        <details className="fold"><summary>Boundary-input audit · {eligible}/{analysis.guard.length} eligible probes</summary><div>
            <p>Integer stdin probes replace individual values with 0, −1, 1 and 2, up to eight cases. Only defined AST runs that agree with original IR are eligible. Every selected candidate must match those eligible probes too.</p>
            {analysis.guard.length ? <div className="table-wrap"><table><thead><tr><th>Generated stdin</th><th>Reference audit</th><th>Evidence</th></tr></thead><tbody>{analysis.guard.map(g => <tr key={g.input}><td><code>{g.input}</code></td><td>{g.status}</td><td>{g.status === 'eligible' ? 'Included in candidate checks' : g.reference.diagnostic?.message || 'Inconclusive; excluded from validation'}</td></tr>)}</tbody></table></div> : <p>No suitable integer stdin was supplied, or boundary probes were disabled. No extra coverage is claimed.</p>}
            <p className="muted">Each probe has at most 2,000 interpreter steps. This is bounded stress testing, not a vulnerability scanner, exhaustive testing, or a security sandbox.</p>
        </div></details>
    </section>;
}
