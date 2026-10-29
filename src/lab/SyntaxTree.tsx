import { useEffect, useRef, useState } from 'react';

interface Node { id: string; label: string; detail: string; relation: string; line?: number; children: Node[] }
function tree(value: unknown, id = 'root', relation = ''): Node {
    if (value === null || typeof value !== 'object') return { id, relation, label: String(value), detail: '', children: [] };
    const n = value as Record<string, unknown>;
    const kind = String(n.kind ?? (n.functions ? 'Program' : n.body && n.params ? 'Function' : n.name ? 'Parameter' : 'Node'));
    const labels: Record<string, string> = { decl: 'Declaration', expr: 'Expression', assign: 'Assignment', binary: 'Binary operator', unary: 'Unary operator', name: 'Identifier', literal: 'Literal', string: 'String', block: 'Block', group: 'Declarations', if: 'If', while: 'While', for: 'For', return: 'Return', input: 'Read input', output: 'Write output', call: 'Function call', conditional: 'Conditional', cast: 'Cast', break: 'Break', continue: 'Continue', empty: 'Empty statement' };
    const data = n.data as { value?: number; type?: string } | undefined;
    const detail = [n.op, n.name, n.type, data ? `${data.value} (${data.type})` : undefined, n.kind === 'string' ? `“${n.value}”` : undefined, n.postfix ? 'postfix' : undefined, n.constant ? 'const' : undefined].filter(v => v !== undefined && v !== '').join(' · ');
    const children: Node[] = [];
    for (const [key, v] of Object.entries(n)) {
        if (['kind', 'name', 'type', 'op', 'data', 'line', 'column', 'constant', 'postfix', 'snippet', 'language'].includes(key) || v === undefined || (key === 'value' && n.kind === 'string')) continue;
        if (Array.isArray(v)) v.forEach((item, i) => children.push(tree(item, `${id}/${key}/${i}`, `${key} ${i + 1}`)));
        else children.push(tree(v, `${id}/${key}`, key));
    }
    return { id, relation, label: labels[kind] ?? kind, detail, line: typeof n.line === 'number' ? n.line : undefined, children };
}
export function SyntaxTree({ value }: { value: unknown }) {
    const canvas = useRef<HTMLDivElement>(null);
    const [depth, setDepth] = useState(4), [zoom, setZoom] = useState(1);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState('root');
    const root = tree(value);
    const nodes: { node: Node; x: number; y: number; hidden: boolean }[] = [];
    const edges: { from: number; to: number; relation: string }[] = [];
    let leaves = 0, clipped = false;
    function layout(node: Node, level: number): number {
        const index = nodes.length;
        const hidden = node.children.length > 0 && (level >= depth || collapsed.has(node.id));
        nodes.push({ node, x: 0, y: 30 + level * 130, hidden });
        const childIndices: number[] = [];
        if (!hidden) for (const child of node.children) {
            if (nodes.length >= 400) { clipped = true; break; }
            const childIndex = layout(child, level + 1); childIndices.push(childIndex); edges.push({ from: index, to: childIndex, relation: child.relation });
        }
        nodes[index].x = childIndices.length ? (nodes[childIndices[0]].x + nodes[childIndices.at(-1)!].x) / 2 : 110 + leaves++ * 210;
        return index;
    }
    layout(root, 0);
    const rootX = nodes[0].x;
    useEffect(() => { if (canvas.current) canvas.current.scrollLeft = Math.max(0, rootX * zoom - canvas.current.clientWidth / 2); }, [rootX, zoom]);
    const width = Math.max(400, leaves * 210 + 10), height = Math.max(...nodes.map(n => n.y)) + 110;
    const current = nodes.find(n => n.node.id === selected)?.node;
    function toggle(id: string) { setCollapsed(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
    return <section className="syntax-tree" aria-label="Visual abstract syntax tree">
        <div className="syntax-tree-controls"><label>Visible levels <select aria-label="Tree depth" value={depth} onChange={e => setDepth(Number(e.target.value))}><option value={2}>3</option><option value={4}>5</option><option value={8}>9</option><option value={40}>All (up to 400 nodes)</option></select></label><label>Zoom <select aria-label="Tree zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={0.5}>50%</option><option value={0.75}>75%</option><option value={1}>100%</option><option value={1.25}>125%</option></select></label><button onClick={() => { setCollapsed(new Set()); setDepth(4); setZoom(1); setSelected('root'); }}>Reset tree</button></div>
        <p className="muted">Read from top to bottom. Lines connect parents to children; labels explain each child's role. Select a node to inspect it. Scroll to explore wide trees.</p>
        {clipped && <p className="notice">Showing the first 400 visible nodes. Choose fewer levels or collapse a branch to inspect another part.</p>}
        <div ref={canvas} className="syntax-tree-canvas" tabIndex={0} aria-label="Scrollable syntax tree diagram">
            <svg width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Program syntax nodes and connecting branches">
                {edges.map(({ from, to, relation }) => { const a = nodes[from], b = nodes[to]; return <g key={`${from}-${to}`}><path d={`M ${a.x} ${a.y + 65} V ${b.y - 28} H ${b.x} V ${b.y}`} fill="none" stroke="#94a88a" strokeWidth="1.5"/><text x={b.x + 6} y={b.y - 9} className="syntax-edge-label">{relation}</text></g>; })}
                {nodes.map(({ node, x, y, hidden }) => <g key={node.id} transform={`translate(${x - 90},${y})`} className={`syntax-card ${selected === node.id ? 'is-selected' : ''}`} role="button" tabIndex={0} aria-label={`${node.label} ${node.detail}${node.line ? ` line ${node.line}` : ''}`} onClick={() => setSelected(node.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(node.id); } }}>
                    <title>{node.label}{node.detail ? `: ${node.detail}` : ''}{node.line ? ` — line ${node.line}` : ''}</title><rect width="180" height="65" rx="8"/><text x="12" y="23" className="syntax-node-label">{node.label}</text><text x="12" y="43" className="syntax-node-detail">{node.detail.length > 23 ? node.detail.slice(0, 22) + '…' : node.detail}</text>{node.children.length > 0 && <text x="166" y="22" textAnchor="end" className="syntax-node-hint">{hidden ? '+' : '−'}</text>}
                </g>)}
            </svg>
        </div>
        <div className="syntax-node-inspector" aria-live="polite">{current ? <><strong>{current.label}</strong>{current.detail && <code>{current.detail}</code>}{current.line && <span>Source line {current.line}</span>}{current.children.length > 0 && <button onClick={() => { if (nodes.find(n => n.node.id === selected)?.hidden && !collapsed.has(selected)) setDepth(Math.min(40, depth + 2)); else toggle(selected); }}>{nodes.find(n => n.node.id === selected)?.hidden ? 'Expand branch' : 'Collapse branch'}</button>}</> : 'Select a visible node to inspect it.'}</div>
    </section>;
}
