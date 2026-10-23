import { instructionText, outcome, type Snapshot } from './compiler/lab';
import type { ExecutionResult } from './compiler/verification/interpreter';

const descriptions: Record<string, string> = {
  'Constant propagation': 'Substitutes known constant values into operands and return expressions. A later pass may fold the resulting arithmetic.',
  'Constant folding': 'Evaluates arithmetic with numeric operands. Division/modulo by zero and non-finite results are left as computations.',
  'Common subexpressions': 'Reuses a previously computed expression when its operands and stored result remain valid.',
  'Copy propagation': 'Replaces copied variables with their sources while invalidating copies when a target is overwritten.',
  'Dead code elimination': 'Scans backward for needed values and removes unused results. Potentially trapping division and modulo remain observable.',
};

export default function StepLogDetails({ snapshot, baseline }: { snapshot: Snapshot; baseline: ExecutionResult }) {
  const ids = Array.from(new Set([...snapshot.before, ...snapshot.after].map(i => i.id)));
  const changes = ids.map(id => {
    const before = snapshot.before.find(i => i.id === id);
    const after = snapshot.after.find(i => i.id === id);
    const status = !before ? 'Added' : !after ? 'Removed' : instructionText(before) === instructionText(after) ? 'Unchanged' : 'Modified';
    return { id, before, after, status };
  });
  return <div className="detailed-step">
    <p className="pass-description">{descriptions[snapshot.pass] ?? 'Controlled fault injection replaces the return operand. This experiment is deliberately separate from normal optimization.'}</p>
    <dl className="log-facts"><div><dt>Round</dt><dd>{snapshot.round || 'Fault experiment'}</dd></div><div><dt>Modified</dt><dd>{changes.filter(c => c.status === 'Modified').length}</dd></div><div><dt>Removed</dt><dd>{changes.filter(c => c.status === 'Removed').length}</dd></div><div><dt>Unchanged</dt><dd>{changes.filter(c => c.status === 'Unchanged').length}</dd></div></dl>
    <h4>Complete pass input / output</h4>
    <div className="code-pair"><div><h4>Input TAC</h4><pre>{snapshot.before.map(i => `#${i.id}  ${instructionText(i)}`).join('\n') || '(empty)'}</pre></div><div><h4>Output TAC</h4><pre>{snapshot.after.map(i => `#${i.id}  ${instructionText(i)}`).join('\n') || '(empty)'}</pre></div></div>
    <h4>Instruction change ledger</h4>
    <div className="log-table-scroll"><table><thead><tr><th>ID / status</th><th>Before → after</th><th>Recorded explanation</th></tr></thead><tbody>{changes.map(c => <tr key={c.id} className={c.status === 'Unchanged' ? '' : 'changed-row'}><td>#{c.id}<strong>{c.status}</strong></td><td><code>{c.before ? instructionText(c.before) : '(absent)'}</code><span className="ledger-arrow">↓</span><code>{c.after ? instructionText(c.after) : '(removed)'}</code></td><td>{snapshot.logs.filter(l => l.instructionId === c.id).map(l => l.reason).join(' ') || (c.status === 'Unchanged' ? 'No rewrite was recorded for this instruction.' : snapshot.round === 0 ? 'Return operand deliberately changed by the fault experiment.' : 'No rewrite explanation was recorded.')}</td></tr>)}</tbody></table></div>
    <h4>Behavior comparison</h4>
    <div className="outcome-pair"><div><span>Original program</span><code>{outcome(baseline)}</code></div><div><span>After this pass</span><code>{outcome(snapshot.observed)}</code></div></div>
    <p className="hint">Successful returns are compared with Object.is; errors are compared by their messages. These are concrete interpreter observations.</p>
    <h4>Execution trace after this pass</h4>
    <p className="hint">Actual execution order and variable values after each instruction. Execution stops at the first return or error; subsequent instructions are not executed.</p>
    <ol className="execution-trace">{snapshot.observed.trace?.map((entry, i) => {
      const instruction = snapshot.after.find(t => t.id === entry.instructionId);
      return <li key={i}><div><span className="trace-number">{i + 1}</span><code>#{entry.instructionId} {instruction ? instructionText(instruction) : entry.kind}</code></div><p className="trace-state">{Object.entries(entry.variables).map(([name, value]) => `${name} = ${Object.is(value, -0) ? '-0' : String(value)}`).join(' · ') || 'No variables stored.'}</p>{entry.error && <p className="warning">Execution stopped: {entry.error}</p>}{entry.returnValue !== undefined && <p className="checkpoint">Returned {String(entry.returnValue)}; execution stopped.</p>}</li>;
    })}</ol>
    {!snapshot.observed.trace?.length && <p className="log-empty">No instructions were executed.</p>}
    {!snapshot.observed.success && !snapshot.observed.trace?.some(e => e.error) && <p className="warning">Execution finished without returning a value.</p>}
    <h4>Recorded rewrite explanations</h4>
  </div>;
}
