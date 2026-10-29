import { useId, useState } from 'react';
import { graphlib, layout } from '@dagrejs/dagre';
import type { BasicBlock } from '../core/optimizer';
import { expressionText, instructionText } from '../core/ir';

export function ControlFlowGraph({ blocks, selected, onSelect }: { blocks: BasicBlock[]; selected: string; onSelect: (id: string) => void }) {
    const [functionName, setFunctionName] = useState('main');
    const [zoom, setZoom] = useState(1);
    const marker = useId().replace(/:/g, '');
    const functions = [...new Set(blocks.map(b => b.function))];
    const active = functions.includes(functionName) ? functionName : functions[0];
    const visible = blocks.filter(b => b.function === active);
    if (visible.length > 250) return <p className="notice">This function has {visible.length} blocks, above the 250-block diagram limit. The full IR remains available.</p>;
    const graph = new graphlib.Graph({ multigraph: true }).setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 35, marginy: 25 }).setDefaultEdgeLabel(() => ({}));
    graph.setNode('@entry', { label: 'Entry', width: 110, height: 42 });
    graph.setNode('@exit', { label: 'Exit', width: 110, height: 42 });
    const descriptions = new Map<string, { title: string; detail: string; condition: boolean }>();
    visible.forEach(b => {
        const last = b.instructions.at(-1), condition = last?.kind === 'branch';
        const meaningful = b.instructions.filter(i => !['label', 'scope', 'jump'].includes(i.kind));
        const detail = condition ? expressionText(last.condition) : meaningful.slice(0, 2).map(instructionText).join('; ') || 'Continue';
        descriptions.set(b.id, { title: condition ? 'Condition' : last?.kind === 'return' ? 'Return' : 'Block', detail, condition });
        graph.setNode(b.id, { width: condition ? 250 : 230, height: condition ? 100 : 76 });
    });
    if (visible[0]) graph.setEdge('@entry', visible[0].id, { label: '', width: 0, height: 0 }, 'entry');
    visible.forEach(b => {
        const conditional = b.instructions.at(-1)?.kind === 'branch';
        b.successors.forEach((id, i) => { if (visible.some(v => v.id === id)) graph.setEdge(b.id, id, { label: conditional ? i === 0 ? 'True' : 'False' : '', width: conditional ? 35 : 0, height: conditional ? 16 : 0 }, String(i)); });
        if (!b.successors.length) graph.setEdge(b.id, '@exit', { label: '', width: 0, height: 0 }, 'exit');
    });
    layout(graph);
    const width = graph.graph().width ?? 400, height = graph.graph().height ?? 300;
    const shorten = (s: string) => s.length > 29 ? s.slice(0, 28) + '…' : s;
    return <section className="control-flow-graph" aria-label="Connected control-flow graph">
        <div className="syntax-tree-controls"><label>Function<select aria-label="CFG function" value={active} onChange={e => { setFunctionName(e.target.value); const first = blocks.find(b => b.function === e.target.value); if (first) onSelect(first.id); }}>{functions.map(f => <option key={f}>{f}</option>)}</select></label><label>Zoom<select aria-label="CFG zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={0.5}>50%</option><option value={0.75}>75%</option><option value={1}>100%</option></select></label></div>
        <p className="muted">Follow arrows from Entry to Exit. Diamonds are conditions; True and False mark their branches. Arrows returning to earlier blocks represent loops. Select a block to see its full instructions below.</p>
        <div className="syntax-tree-canvas cfg-canvas" tabIndex={0} aria-label="Scrollable control-flow diagram"><svg width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${active} control flow`}>
            <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6b855c"/></marker></defs>
            {graph.edges().map(e => { const edge = graph.edge(e); return <g key={`${e.v}-${e.w}-${e.name}`}><path className="cfg-edge" d={edge.points.map((p: { x: number; y: number }, i: number) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke="#6b855c" strokeWidth="1.8" markerEnd={`url(#${marker})`}/>{edge.label && <text x={edge.x} y={edge.y} textAnchor="middle" className="syntax-edge-label">{edge.label}</text>}</g>; })}
            {graph.nodes().map(id => { const n = graph.node(id), d = descriptions.get(id), terminal = !d; return <g key={id} transform={`translate(${n.x},${n.y})`} className={`cfg-node ${id === selected ? 'is-selected' : ''}`} role={terminal ? undefined : 'button'} tabIndex={terminal ? undefined : 0} aria-label={terminal ? n.label : `${id}: ${d.title}: ${d.detail}`} onClick={() => { if (!terminal) onSelect(id); }} onKeyDown={e => { if (!terminal && ['Enter', ' '].includes(e.key)) { e.preventDefault(); onSelect(id); } }}>
                <title>{terminal ? n.label : `${id}\n${d.detail}`}</title>
                {d?.condition ? <polygon points={`0,${-n.height / 2} ${n.width / 2},0 0,${n.height / 2} ${-n.width / 2},0`}/> : <rect x={-n.width / 2} y={-n.height / 2} width={n.width} height={n.height} rx={terminal ? 21 : 8}/>}
                <text textAnchor="middle" y={terminal ? 4 : -12} className="syntax-node-label">{terminal ? n.label : `${d.title} · ${id.split(':').at(-1)}`}</text>{d && <text textAnchor="middle" y="9" className="syntax-node-detail">{shorten(d.detail)}</text>}
            </g>; })}
        </svg></div>
    </section>;
}
