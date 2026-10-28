import { useCallback, useEffect, useRef, useState } from 'react';
import type { Analysis } from './core/analyze';
import type { Language } from './core/types';
import { numberText } from './core/numbers';
import { examples, steps } from './lab/content';
import { Code, Fold, FlowView, OptimizeView, ResultsView, Tree, TypeView } from './lab/Views';
import { programSummary } from './lab/format';
import { NativeArtifacts } from './lab/NativeArtifacts';
import './App.css';
interface Settings {
    source: string;
    language: Language;
    inputText: string;
    budget: number;
    mutation: boolean;
    ml: boolean;
    example: string;
}
interface NativeResult {
    available: boolean;
    success?: boolean;
    compiler: string;
    dialect: string;
    diagnostics: string;
    wrapper: boolean;
}
interface RecordRun {
    id: number;
    analysis: Analysis;
    settings: Settings;
}
const initial: Settings = { source: examples[0].source, language: examples[0].language, inputText: examples[0].inputs, budget: 20000, mutation: false, ml: true, example: examples[0].id };
const stampKey = 'optitac-lab-challenges-v2';
const saved = () => { try {
    const data: unknown = JSON.parse(localStorage.getItem(stampKey) || '[]');
    return Array.isArray(data) ? data.filter((x): x is string => typeof x === 'string' && examples.some(e => e.id === x)) : [];
}
catch {
    return [];
} };
function App() {
    const [form, setForm] = useState<Settings>(initial);
    const [record, setRecord] = useState<RecordRun>();
    const [native, setNative] = useState<{
        id: number;
        data?: NativeResult;
    }>();
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    const [step, setStep] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [scope, setScope] = useState(false);
    const [selectedToken, setSelectedToken] = useState(0);
    const [answer, setAnswer] = useState('');
    const [feedback, setFeedback] = useState('');
    const [earned, setEarned] = useState(saved);
    const worker = useRef<Worker | null>(null), latest = useRef(0), pending = useRef<Settings>(initial), nativeAbort = useRef<AbortController | null>(null), sourceBox = useRef<HTMLTextAreaElement>(null);
    const createWorker = useCallback(() => {
        const w = new Worker(new URL('./core/worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (event: MessageEvent<{
            id: number;
            result?: Analysis;
            error?: string;
        }>) => {
            if (event.data.id !== latest.current)
                return;
            setBusy(false);
            if (event.data.error || !event.data.result) {
                setError(event.data.error || 'Analysis worker returned no result.');
                return;
            }
            const analysis = event.data.result, id = event.data.id, settings = { ...pending.current };
            setRecord({ id, analysis, settings });
            setNative({ id });
            nativeAbort.current?.abort();
            const abort = new AbortController();
            nativeAbort.current = abort;
            const timer = setTimeout(() => abort.abort(), 7000);
            void fetch('/api/native-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: analysis.source, language: analysis.language, snippet: analysis.program?.snippet ?? false }), signal: abort.signal })
                .then(async (response) => { if (!response.ok)
                throw new Error('Native service is unavailable in this deployment.'); return await response.json() as NativeResult; })
                .then(data => { if (id === latest.current)
                setNative({ id, data }); })
                .catch(() => { if (id === latest.current)
                setNative({ id, data: { available: false, compiler: 'not available', dialect: analysis.language === 'c' ? 'c11' : 'c++14', diagnostics: 'Native syntax service could not be reached. The visual interpreter still supports the documented subset; no native-check claim is made.', wrapper: false } }); })
                .finally(() => clearTimeout(timer));
        };
        w.onerror = () => { setBusy(false); setError('The analysis worker stopped. Retry analysis; the previous result has not been replaced.'); };
        worker.current = w;
        return w;
    }, []);
    useEffect(() => { const w = createWorker(); latest.current = 1; pending.current = initial; w.postMessage({ id: 1, ...initial, inputs: initial.inputText.split('\n') }); return () => { w.terminate(); worker.current = null; nativeAbort.current?.abort(); }; }, [createWorker]);
    useEffect(() => { try {
        localStorage.setItem(stampKey, JSON.stringify(earned));
    }
    catch { /* Challenges work without persistence. */ } }, [earned]);
    useEffect(() => { if (!playing)
        return; const timer = setTimeout(() => { if (step < steps.length - 1)
        setStep(step + 1);
    else
        setPlaying(false); }, 1800); return () => clearTimeout(timer); }, [playing, step]);
    const analysis = record?.analysis, active = steps[step], stale = !!record && (form.source !== record.settings.source || form.language !== record.settings.language || form.inputText !== record.settings.inputText || form.budget !== record.settings.budget || form.mutation !== record.settings.mutation || form.ml !== record.settings.ml);
    const nativeData = native?.id === record?.id ? native?.data : undefined, nativePending = !!record && native?.id === record.id && !native?.data, nativeRejected = nativeData?.available === true && nativeData.success === false;
    const example = examples.find(e => e.id === form.example);
    function submit() { setBusy(true); setError(''); setPlaying(false); setFeedback(''); nativeAbort.current?.abort(); latest.current++; pending.current = { ...form }; const w = worker.current ?? createWorker(); w.postMessage({ id: latest.current, ...form, inputs: form.inputText.split('\n').map(s => s.replace(/\\n/g, '\n')) }); }
    function cancel() { latest.current++; worker.current?.terminate(); worker.current = null; nativeAbort.current?.abort(); setBusy(false); setError('Analysis cancelled. Previous evidence remains available.'); }
    function load(id: string) { const e = examples.find(e => e.id === id)!; setForm({ ...form, source: e.source, language: e.language, inputText: e.inputs, example: e.id }); setAnswer(''); setFeedback(''); setPlaying(false); }
    function checkAnswer() { if (!analysis || stale || busy || nativePending || nativeRejected)
        return; const result = analysis.reference[0]; if (!result || result.status === 'limited' || result.status === 'error') {
        setFeedback('This execution has no challenge answer. Resolve its diagnostic first.');
        return;
    } const expected = result.status === 'undefined' ? 'undefined' : result.stdout ? result.stdout.trimEnd() : numberText(result.returnValue!.value); if (answer.replace(/\\n/g, '\n').trimEnd() === expected) {
        setFeedback('Correct. Your prediction agrees with the observed first case.');
        if (record?.settings.example)
            setEarned(previous => previous.includes(record.settings.example) ? previous : [...previous, record.settings.example]);
    }
    else
        setFeedback('Not quite. Follow the loop, type conversions and short-circuit paths, then try again. You can inspect Results for the observed answer.'); }
    function selectToken(index: number) { setSelectedToken(index); if (!analysis || stale)
        return; const token = analysis.tokens[index]; const lines = form.source.split('\n'); const offset = lines.slice(0, token.line - 1).reduce((n, line) => n + line.length + 1, 0) + token.column - 1; sourceBox.current?.focus(); sourceBox.current?.setSelectionRange(offset, offset + token.text.length); }
    function exportEvidence() { if (!record)
        return; const data = { format: 'optitac-guarded-lab-v1', record, native: nativeData, contract: 'Bounded concrete evidence for a documented C/C++ scalar subset; not universal equivalence.' }; const json = JSON.stringify(data, (_, v) => typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0)) ? { number: Object.is(v, -0) ? '-0' : String(v) } : v, 2); const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'optitac-evidence.json'; link.click(); URL.revokeObjectURL(url); }
    return <main className="lab-app">
  <header className="app-header"><a className="brand" href="#" onClick={e => e.preventDefault()}><span className="brand-mark">oT</span><span>optiTAC<small>THE INTERACTIVE COMPILER LAB</small></span></a><div className="header-actions"><span className="challenge-count">★ {earned.length} discoveries</span><button onClick={() => setScope(!scope)} aria-expanded={scope}>{scope ? 'Close scope' : 'What can it run?'}</button></div></header>
  {scope && <section className="scope-panel"><h2>A clear execution contract.</h2><div className="scope-columns"><div><h3>Visual execution</h3><p>C/C++ scalar programs: initialized or uninitialized declarations, assignments, casts, unary/binary operators, if/else, while/for, break/continue, block scope, scalar functions and bounded recursion. Basic printf/scanf, cout/cin and numeric math helpers are supported.</p></div><div><h3>Native syntax checking</h3><p>The local GCC/G++ service checks a broader C11/C++14 translation unit, including supported standard headers, classes and containers. Submitted programs are never executed as native binaries by this service.</p></div><div><h3>Explicit boundaries</h3><p>Arrays, general pointers, templates, class execution, macros, full standard-library behavior and arbitrary C/C++ programs are outside the visual interpreter. Unsupported constructs stop visibly. Validation covers the supplied cases, not every possible input.</p></div></div></section>}
  <section className="intro"><div><p className="eyebrow">LESS NAVIGATION. MORE DISCOVERY.</p><h1>Write a program.<br /><em>Follow the evidence.</em></h1><p>Six stops, one workspace. See how C and C++ become instructions—and challenge the transformations along the way.</p></div><div className="intro-note"><span>NEW IN THE LAB</span><strong>Learn. Search. Check.</strong><p>A trained ML advisor guides optimization search. Behavior checks and boundary probes keep the evidence visible.</p></div></section>
  <div className="workspace"><aside className="editor-pane"><div className="pane-heading"><h2>Your program</h2><span>{form.source.split('\n').length} lines</span></div><div className="editor-controls"><label>Language<select aria-label="Language" value={form.language} onChange={e => setForm({ ...form, language: e.target.value as Language, example: '' })}><option value="c">C · C11</option><option value="cpp">C++ · C++14</option></select></label><label>Try an example<select aria-label="Example" value={form.example} onChange={e => load(e.target.value)}><option value="" disabled>Custom program</option>{examples.map(e => <option key={e.id} value={e.id}>{e.name}{earned.includes(e.id) ? ' ★' : ''}</option>)}</select></label></div><label className="sr-only" htmlFor="source">Source code</label><textarea ref={sourceBox} id="source" spellCheck={false} value={form.source} onChange={e => setForm({ ...form, source: e.target.value, example: '' })}/><button className="analyze-button" disabled={busy} onClick={submit}>{busy ? 'Analyzing in background…' : 'Analyze program'}<span>→</span></button>{busy && <button className="cancel-button" onClick={cancel}>Cancel analysis</button>}<p className="editor-status" role="status">{error || (stale ? 'Source or settings changed. Analyze again to refresh the evidence.' : busy ? 'The compiler is working in a Web Worker; the editor stays responsive.' : record ? 'Evidence ready. Choose a step to inspect it.' : 'Ready when you are.')}</p><Fold title="Input cases & search settings" open><label className="field-label" htmlFor="inputs">One stdin case per line · empty means no input</label><textarea className="input-cases" id="inputs" value={form.inputText} onChange={e => setForm({ ...form, inputText: e.target.value })}/><p className="muted">Up to 12 cases. Use \n inside a case for a literal newline.</p><label className="budget-label">Execution budget<select aria-label="Execution budget" value={form.budget} onChange={e => setForm({ ...form, budget: Number(e.target.value) })}><option value={20000}>20,000 interpreter steps</option><option value={100000}>100,000 interpreter steps</option></select></label><label className="mutation-option"><input type="checkbox" checked={form.ml} onChange={e => setForm({ ...form, ml: e.target.checked })}/>Use trained ML guidance</label><label className="mutation-option"><input type="checkbox" checked={form.mutation} onChange={e => setForm({ ...form, mutation: e.target.checked })}/>Include one deliberately broken candidate</label><p className="muted">An optional bug-hunt experiment. It is never eligible for selection.</p></Fold><div className="editor-bottom"><button disabled={!record || busy} onClick={exportEvidence}>Export evidence ↓</button><button disabled={!analysis || busy} onClick={() => { if (step === 5)
        setStep(0); setPlaying(!playing); }}>{playing ? 'Pause walkthrough' : 'Play walkthrough ▷'}</button></div>
   <Fold title={`Quick challenge${earned.includes(form.example) ? ' · solved ★' : ''}`}><p>{example?.mission ?? 'Predict the first case’s stdout, or the typed return number if it prints nothing. Enter undefined for detected undefined behavior.'}</p><label className="field-label" htmlFor="prediction">Your prediction · omit the trailing newline</label><input id="prediction" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="e.g. sum=15"/><button disabled={!analysis || stale || busy || nativePending || nativeRejected} onClick={checkAnswer}>Check prediction</button>{feedback && <p className="prediction-feedback" role="status">{feedback}</p>}</Fold>
  </aside>
  <section className="evidence-pane" aria-label="Compiler evidence"><div className="evidence-heading"><p className="eyebrow">THE WORKFLOW</p><span>{record ? `${record.analysis.inputs.length} input case${record.analysis.inputs.length === 1 ? '' : 's'}` : 'Preparing…'}</span></div><nav className="stepper" aria-label="Compiler stages">{steps.map((s, i) => <button key={s.id} aria-pressed={step === i} className={step === i ? 'active' : ''} onClick={() => { setStep(i); setPlaying(false); }}><span>{String(i + 1).padStart(2, '0')}</span><strong>{s.name}</strong></button>)}</nav>
   {record && <div className="native-status"><span className={nativePending ? 'pending' : nativeRejected ? 'failed' : nativeData?.available ? 'passed' : 'unavailable'}>{nativePending ? 'Native check running' : nativeRejected ? 'Native compiler rejected input' : nativeData?.available ? 'Native syntax passed' : 'Native checker unavailable'}</span>{nativeData && <details><summary>{nativeData.compiler} · {nativeData.dialect}{nativeData.wrapper ? ' · snippet wrapper' : ''}</summary><Code>{nativeData.diagnostics}</Code></details>}</div>}
   <div className="step-title"><div><p className="eyebrow">STEP {step + 1} OF SIX · {active.hint.toUpperCase()}</p><h2>{active.name}</h2></div><button onClick={() => { setStep(step === 5 ? 0 : step + 1); setPlaying(false); }}>{step === 5 ? 'Back to tokens ↶' : 'Next step →'}</button></div>
   {stale && <p className="notice">You are viewing the last submitted program. Analyze again to apply edits.</p>}
   <Fold title="What happens here?" open><p>{active.why}</p></Fold>
   {busy && !analysis ? <div className="loading"><span className="loading-dot"/>Analyzing the program, constructing control flow and checking routes…</div> : analysis && <div className="stage-content" key={`${record?.id}-${step}`}>
    {analysis.diagnostic && <div className="diagnostic" role="alert"><strong>{nativeData?.success ? 'Native syntax is valid; visual execution is unavailable' : analysis.diagnostic.code === 'UNSUPPORTED' ? 'Visual execution stops here' : `${analysis.diagnostic.stage}: ${analysis.diagnostic.code}`}</strong><p>{analysis.diagnostic.message}</p><small>Line {analysis.diagnostic.line}, column {analysis.diagnostic.column}</small></div>}
    {active.id === 'tokens' && <><div className="token-summary"><span><b>{analysis.tokens.filter(t => t.category === 'Operator').length}</b> operators</span><span><b>{analysis.tokens.filter(t => t.category === 'Delimiter').length}</b> delimiters</span><span><b>{Math.max(0, analysis.tokens.length - 1)}</b> source tokens incl. directives</span></div><div className="token-list" aria-label="Classified tokens">{analysis.tokens.map((t, i) => <button key={i} className={`${t.category === 'Operator' ? 'operator' : t.category === 'Delimiter' ? 'delimiter' : ''} ${selectedToken === i ? 'selected' : ''}`} aria-pressed={selectedToken === i} onClick={() => selectToken(i)}><code>{t.text}</code><small>{t.category}</small></button>)}</div>{analysis.tokens[selectedToken] && <p className="token-location">{analysis.tokens[selectedToken].category} · line {analysis.tokens[selectedToken].line}, column {analysis.tokens[selectedToken].column}. {analysis.tokens[selectedToken].category === 'Operator' ? 'This performs or controls an operation; it is not classified as punctuation.' : ''}</p>}<Fold title="Complete token ledger"><div className="table-wrap"><table><thead><tr><th>Lexeme</th><th>Category</th><th>Line : column</th></tr></thead><tbody>{analysis.tokens.map((t, i) => <tr key={i}><td><code>{t.text}</code></td><td>{t.category}</td><td>{t.line}:{t.column}</td></tr>)}</tbody></table></div></Fold></>}
    {active.id === 'syntax' && analysis.program && <><p className="muted">{programSummary(analysis.program)}</p><Tree value={analysis.program}/><Fold title="Raw abstract syntax tree"><Code>{JSON.stringify(analysis.program, null, 2)}</Code></Fold><Fold title="Precedence and evaluation order"><p>Unary operators precede multiplication/division/remainder, then addition/subtraction, shifts, comparisons, equality, bitwise operations, logical AND/OR, conditional selection and assignment. Assignment associates right-to-left.</p><p>Logical AND/OR and conditional expressions are lazy. Reads/writes that depend on unspecified operand order are rejected rather than evaluated using JavaScript’s convenient order.</p></Fold></>}
    {active.id === 'types' && analysis.program && <TypeView analysis={analysis}/>}
    {active.id === 'flow' && analysis.original && <FlowView analysis={analysis}/>}
    {active.id === 'flow' && nativeData?.success && <Fold title="Compile-only native C/C++ artifacts" open={!analysis.original}><NativeArtifacts source={analysis.source} language={analysis.language} snippet={analysis.program?.snippet ?? false}/></Fold>}
    {['optimize', 'results'].includes(active.id) && (nativePending || nativeRejected) ? <p className="notice warning">{nativePending ? 'Execution claims are withheld while the independent native syntax check is pending.' : 'Native compilation rejected this translation unit. Execution results are withheld; fix its diagnostics first.'}</p> : <>{active.id === 'optimize' && analysis.original && <OptimizeView analysis={analysis}/>}{active.id === 'results' && <ResultsView analysis={analysis}/>}</>}
    {!analysis.program && active.id !== 'tokens' && !analysis.diagnostic && <p className="empty">Submit a supported program to produce this artifact.</p>}
   </div>}
   <nav className="step-footer" aria-label="Step navigation"><button disabled={step === 0} onClick={() => { setStep(step - 1); setPlaying(false); }}>← Previous</button><span>{playing ? 'Guided replay of completed analysis' : 'Explore freely · no locked steps'}</span><button disabled={step === 5} onClick={() => { setStep(step + 1); setPlaying(false); }}>Next →</button></nav>
  </section></div><footer className="app-footer"><span>optiTAC · a compiler you can question</span><span>Local analysis · explicit language boundaries · evidence over accuracy claims</span></footer>
 </main>;
}
export default App;

