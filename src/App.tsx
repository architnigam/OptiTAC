import { useEffect, useMemo, useState } from 'react';
import { allPasses, instructionText, outcome, passes } from './compiler/lab';
import { runJourney, type Stage } from './compiler/journey';
import { scout } from './compiler/ml/scout';
import { places, presets, questions, type Place } from './town/content';
import { ShopArt } from './town/ShopArt';
import { Code, Fold, OptimizationView, Quiz, ScoutView, SyntaxView, TacView, TokenView, TypesView, VerificationView } from './town/StageViews';
import './App.css';

type View = 'town' | 'pipeline' | Place;
const stampKey = 'optitac-passport-v1';
function savedStamps(): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(stampKey) || '[]'); return Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === 'string' && questions.some(q => q.id === x)))] : []; }
  catch { return []; }
}
function App() {
  const [view, setView] = useState<View>('town');
  const [source, setSource] = useState(presets[0].source);
  const [example, setExample] = useState('0');
  const [enabled, setEnabled] = useState(allPasses);
  const [fault, setFault] = useState(false);
  const [journey, setJourney] = useState(() => runJourney(presets[0].source));
  const [earned, setEarned] = useState(savedStamps);
  const [visited, setVisited] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('Your first parcel is ready. Visit any shop to look inside.');
  const result = journey.result;
  const report = useMemo(() => result ? scout(result.original) : undefined, [result]);
  const shop = places.find(p => p.id === view);
  const stageIndex = places.findIndex(p => p.id === view);
  const stale = source !== journey.source || (result && (fault !== result.injectFault || JSON.stringify(enabled) !== JSON.stringify(result.enabled)));
  useEffect(() => { try { localStorage.setItem(stampKey, JSON.stringify(earned)); } catch { /* Session still works without storage. */ } }, [earned]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setCursor(previous => {
      const maximum = journey.error ? places.findIndex(p => p.id === journey.error?.stage) : 5;
      return previous < maximum ? previous + 1 : previous;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [playing, journey]);
  useEffect(() => {
    const maximum = journey.error ? places.findIndex(p => p.id === journey.error?.stage) : 5;
    if (cursor >= maximum && playing) { const timer = setTimeout(() => setPlaying(false), 0); return () => clearTimeout(timer); }
  }, [cursor, journey, playing]);
  function visit(next: View) {
    setView(next); setPlaying(false);
    if (places.some(p => p.id === next)) setVisited(previous => previous.includes(next) ? previous : [...previous, next]);
  }
  function compile() {
    const next = runJourney(source, enabled, fault);
    setJourney(next); setCursor(0); setPlaying(false);
    setNotice(next.error ? `Parcel stopped at ${places.find(p => p.id === next.error?.stage)?.name}. Earlier artifacts are still available.` : 'Parcel compiled. Visit the shops or play its journey through town.');
  }
  function earn(id: string) { setEarned(previous => previous.includes(id) ? previous : [...previous, id]); }
  function download() {
    const data = { format: 'optitac-town-v1', semantics: 'JavaScript Number; concrete execution observations', journey, scout: report };
    const json = JSON.stringify(data, (_, value) => typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)) ? { numericValue: Object.is(value, -0) ? '-0' : String(value) } : value, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'optitac-journey.json'; link.click(); URL.revokeObjectURL(url);
  }
  const status = (id: string) => journey.error?.stage === id ? 'Stopped here' : journey.completed.includes(id as Stage) ? 'Parcel ready' : ['scout', 'arcade'].includes(id) ? id === 'scout' ? result ? 'Scout ready' : 'Needs TAC' : 'Open to all' : 'Awaiting parcel';
  const stageHasArtifact = view === 'tokens' ? journey.tokens.length > 0 : view === 'syntax' ? Boolean(journey.ast) : view === 'types' ? journey.completed.includes('syntax') : Boolean(result);
  const current = places[cursor];
  return <main className="portal">
    <header className="site-header"><a href="#town" className="brand" onClick={e => { e.preventDefault(); visit('town'); }}><span className="brand-symbol">oT</span><span>optiTAC<small>COMPILER TOWN</small></span></a><nav aria-label="Main navigation"><button className={view === 'town' ? 'active' : ''} onClick={() => visit('town')}>Town map</button><button className={view === 'pipeline' ? 'active' : ''} onClick={() => visit('pipeline')}>Pipeline express</button><button className={view === 'arcade' ? 'active' : ''} onClick={() => visit('arcade')}>Challenges <span>{earned.length}/7</span></button></nav><span className="header-note">A place to see how code works.</span></header>
    <div className="portal-layout"><aside className="source-sidebar"><div className="sidebar-heading"><span className="overline">YOUR PARCEL</span><span className="parcel-icon" aria-hidden="true">▧</span></div><h2>A program for the town.</h2><label className="field-label" htmlFor="example">Choose a delivery</label><select id="example" value={example} onChange={e => { setExample(e.target.value); setSource(presets[Number(e.target.value)].source); }}><option value="" disabled>Custom program</option>{presets.map((p, i) => <option value={i} key={p.name}>{p.name}</option>)}</select><p className="delivery-goal">{example === '' ? 'Your own program, the same compiler journey.' : presets[Number(example)].goal}</p><label className="field-label" htmlFor="source">MiniC source</label><textarea id="source" value={source} spellCheck={false} onChange={e => { setSource(e.target.value); setExample(''); }} /><p className="source-hint">int / float · arithmetic · parentheses · return</p><button className="compile-button" onClick={compile}>Send through town <span>→</span></button><p role="status" className="compile-notice">{stale ? 'Source or settings changed. Send again to refresh the parcel.' : notice}</p><details className="sidebar-options"><summary>Passes & experiments</summary><fieldset><legend>Selected optimization passes</legend>{passes.map(p => <label key={p.id}><input type="checkbox" checked={enabled.includes(p.id)} onChange={e => setEnabled(e.target.checked ? [...enabled, p.id] : enabled.filter(id => id !== p.id))} />{p.name}</label>)}</fieldset><label className="fault-option"><input type="checkbox" checked={fault} onChange={e => setFault(e.target.checked)} />Inject a wrong return (demo)</label><p className="source-hint">The fault is a controlled experiment, not a normal optimization.</p></details><button className="export-button" onClick={download}>Export journey evidence ↓</button><section className="passport"><p className="overline">YOUR COMPILER PASSPORT</p><div className="stamp-row" aria-label={`${earned.length} of 7 stamps earned`}>{questions.map((q, i) => <button key={q.id} title={places[i].name} aria-label={`${places[i].name}: ${earned.includes(q.id) ? 'stamp earned' : 'challenge available'}`} className={earned.includes(q.id) ? 'earned' : ''} onClick={() => visit(q.id)}>{earned.includes(q.id) ? '✓' : i + 1}</button>)}</div><p>{earned.length} of 7 stamps · {visited.length} places visited</p>{earned.length > 0 && <button className="text-button" onClick={() => setEarned([])}>Reset passport</button>}</section></aside>
    <div className="destination">
      {view === 'town' && <><section className="town-intro"><div><p className="overline">WELCOME TO COMPILER TOWN</p><h1>A little town.<br /><em>A whole compiler.</em></h1><p>Bring a program. Visit the workshops. Find out what each stage makes of it.</p></div><div className="town-sign"><span>THIS WAY TO</span><strong>The working pipeline</strong><button onClick={() => visit('pipeline')}>Take the express ↗</button></div></section><section className="town-map" aria-label="Compiler town map"><div className="map-caption"><span>THE WORKSHOP DISTRICT</span><span>Click a building to step inside</span></div><div className="shop-grid">{places.map(p => <button className={`shop ${p.color}`} key={p.id} onClick={() => visit(p.id)} aria-label={`Visit ${p.name}: ${p.role}`}><span className="shop-number">{p.number}</span><ShopArt shop={p} /><strong>{p.name}</strong><span className="shop-role">{p.role}</span><small className={journey.error?.stage === p.id ? 'stopped' : ''}>{status(p.id)} {earned.includes(p.id) && '· ★'}</small></button>)}</div><div className="town-street" aria-hidden="true"><span>← FRONTEND LANE</span><span className="street-parcel">▧</span><span>EVIDENCE WALK →</span></div><div className="map-footer"><span>Each stop explains one part of the journey.</span><span>All doors are open. Explore in any order.</span></div></section><section className="town-bottom"><div><span className="overline">A SCOUT, NOT AN ORACLE</span><h3>A prediction you can question.</h3><p>Our local ML scout suggests a pass to investigate. Then the compiler measures what actually happens.</p><button className="text-button" onClick={() => visit('scout')}>Meet the scout →</button></div><div><span className="overline">LEARN BY NOTICING</span><h3>Shorter is not always safer.</h3><p>Send the hidden-trap delivery to discover why deleting unused code can erase a runtime error.</p><button className="text-button" onClick={() => { setSource(presets[1].source); setExample('1'); setNotice('Hidden trap loaded. Send it through town to inspect the error.'); }}>Load the hidden trap →</button></div></section></>}
      {view === 'pipeline' && <section className="pipeline-page"><p className="overline">PIPELINE EXPRESS</p><h1>The whole journey.</h1><div className="replay-controls"><button className="primary" onClick={() => { if (!playing && cursor >= (journey.error ? places.findIndex(p => p.id === journey.error?.stage) : 5)) setCursor(0); setPlaying(!playing); }}>{playing ? 'Pause journey' : 'Play journey'}</button><button onClick={() => { setCursor(0); setPlaying(false); }}>Rewind</button><span>Visual replay · compilation already executed</span></div><div className="pipeline-track" aria-label="Pipeline stages">{places.slice(0,6).map((p, i) => <button key={p.id} className={`${i === cursor ? 'current' : ''} ${journey.error?.stage === p.id ? 'failed' : ''}`} aria-pressed={cursor === i} onClick={() => { setCursor(i); setPlaying(false); }}><span className="pipeline-node">{i === cursor ? '▧' : journey.completed.includes(p.id as Stage) ? '✓' : i + 1}</span><strong>{p.role.split(' & ')[0]}</strong><small>{status(p.id)}</small></button>)}</div><div className="express-stats"><div><span>Source tokens</span><strong>{journey.tokens.length ? journey.tokens.length - 1 : '—'}</strong></div><div><span>Original → optimized TAC</span><strong>{result ? `${result.original.length} → ${result.instructions.length}` : '—'}</strong></div><div><span>Recorded pass steps</span><strong>{result?.snapshots.length ?? '—'}</strong></div><div><span>Observed outcome</span><strong>{result ? result.firstDivergence < 0 ? 'Preserved' : 'Diverged' : 'Stopped'}</strong></div></div><div className="express-payload"><div className="payload-title"><h2>{current.name}</h2><button className="text-button" onClick={() => visit(current.id)}>Step inside →</button></div>{journey.error?.stage === current.id ? <pre className="error" role="alert">{journey.error.message}</pre> : current.id === 'tokens' ? <div className="compact-tokens">{journey.tokens.map((t,i) => <code key={i}>{t.lexeme || 'EOF'}</code>)}</div> : current.id === 'syntax' ? <Code lines={journey.ast ? [JSON.stringify(journey.ast, null, 2)] : ['Awaiting syntax tree.']} /> : current.id === 'types' ? <Code lines={journey.symbols.map(s => `${s.dataType} ${s.name} · initialized=${s.initialized}`)} /> : current.id === 'tac' ? <Code lines={result?.original.map(instructionText) ?? ['Awaiting TAC.']} /> : current.id === 'optimize' ? <Code lines={result?.instructions.map(instructionText) ?? ['Awaiting optimization.']} /> : <Code lines={result ? [`Original:  ${outcome(result.baseline)}`, `Optimized: ${outcome(result.final)}`] : ['Awaiting execution.']} />}</div></section>}
      {shop && <section className={`shop-interior ${shop.color}`} key={view}><div className="breadcrumbs"><button onClick={() => visit('town')}>Town map</button><span>/</span><span>{shop.name}</span></div><header className="shop-heading"><div><p className="overline">STOP {shop.number} / {shop.role.toUpperCase()}</p><h1>{shop.name}</h1><p>{shop.label}.</p></div><ShopArt shop={shop} /></header><div className="interior-body"><Fold title="Why this stop exists" open><p>{shop.why}</p></Fold>{stale && <p className="feedback">You are inspecting the last compiled parcel. Send again to apply your changes.</p>}{journey.error?.stage === view && <pre className="error" role="alert">{journey.error.message}</pre>}{view !== 'arcade' && !stageHasArtifact && <p className="empty-note">{journey.error ? `The parcel stopped at ${places.find(p => p.id === journey.error?.stage)?.name}. Fix the source and send it again to produce this artifact.` : 'Send a program through town to inspect this stage.'}</p>}
        {view === 'tokens' && journey.tokens.length > 0 && <TokenView journey={journey} />}{view === 'syntax' && <SyntaxView journey={journey} />}{view === 'types' && journey.completed.includes('syntax') && <TypesView journey={journey} />}{view === 'tac' && result && <TacView result={result} />}{view === 'optimize' && result && <OptimizationView key={JSON.stringify([journey.source, result.enabled, result.injectFault])} result={result} />}{view === 'verify' && result && <VerificationView result={result} />}{view === 'scout' && report && <ScoutView report={report} onInvestigate={() => visit('optimize')} />}
        {view === 'arcade' ? <><div className="challenge-intro"><h2>{earned.length === 7 ? 'Your passport is complete.' : 'Seven small discoveries.'}</h2><p>One stamp for each correct answer. Wrong answers explain the idea, and you can try again. Stamps stay in this browser when storage is available.</p></div>{questions.map(q => <Quiz key={q.id} place={q.id} earned={earned} onEarn={earn} />)}</> : <Quiz key={view} place={view as Place} earned={earned} onEarn={earn} />}
        <nav className="neighbor-shops" aria-label="Neighboring shops">{stageIndex > 0 ? <button onClick={() => visit(places[stageIndex - 1].id)}>← {places[stageIndex - 1].name}</button> : <button onClick={() => visit('town')}>← Town map</button>}{stageIndex < places.length - 1 && <button onClick={() => visit(places[stageIndex + 1].id)}>{places[stageIndex + 1].name} →</button>}</nav></div></section>}
    </div></div><footer className="site-footer"><span>optiTAC · Compiler Town</span><span>Local compilation. Local ML. Your source stays in this page.</span><span>JavaScript numeric semantics · straight-line MiniC subset</span></footer>
  </main>;
}
export default App;

