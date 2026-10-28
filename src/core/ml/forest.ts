/** Small, serializable multi-output random forest. Training is offline, never on user code. */
export interface Tree {
    value: number[];
    feature?: number;
    threshold?: number;
    left?: Tree;
    right?: Tree;
}
export interface Row { x: number[]; y: number[]; group: string }
export function seeded(seed: number) {
    let state = seed >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function predictTree(tree: Tree, x: number[]): number[] {
    while (tree.feature !== undefined && tree.left && tree.right)
        tree = x[tree.feature] <= tree.threshold! ? tree.left : tree.right;
    return tree.value;
}
export function predictForest(trees: Tree[], x: number[]): number[] {
    if (!trees.length) throw new Error('An untrained forest cannot predict.');
    const values = trees.map(tree => predictTree(tree, x));
    return values[0].map((_, k) => values.reduce((sum, value) => sum + value[k], 0) / values.length);
}
export function fitForest(rows: Row[], count: number, depth: number, seed: number, minLeaf = 6): Tree[] {
    if (!rows.length || rows.some(r => r.x.some(x => !Number.isFinite(x)) || r.y.some(y => !Number.isFinite(y)))) throw new Error('Training requires finite nonempty data.');
    const random = seeded(seed), outputs = rows[0].y.length, features = rows[0].x.length;
    const grow = (sample: Row[], level: number): Tree => {
        const value = Array.from({ length: outputs }, (_, k) => sample.reduce((sum, r) => sum + r.y[k], 0) / sample.length);
        const node: Tree = { value };
        if (level >= depth || sample.length < minLeaf * 2) return node;
        let bestLoss = sample.reduce((sum, r) => sum + r.y.reduce((s, y, k) => s + (y - value[k]) ** 2, 0), 0);
        let best: { feature: number; threshold: number } | undefined;
        const choices = Array.from({ length: features }, (_, i) => i);
        for (let i = choices.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
        for (const feature of choices.slice(0, Math.ceil(features * 0.7))) {
            const sorted = [...sample].sort((a, b) => a.x[feature] - b.x[feature]);
            const left = Array(outputs).fill(0) as number[], right = value.map(v => v * sample.length);
            const squares = sample.reduce((sum, r) => sum + r.y.reduce((s, y) => s + y * y, 0), 0);
            for (let i = 0; i < sorted.length - 1; i++) {
                sorted[i].y.forEach((y, k) => { left[k] += y; right[k] -= y; });
                const n = i + 1, m = sorted.length - n;
                if (n < minLeaf || m < minLeaf || sorted[i].x[feature] === sorted[i + 1].x[feature]) continue;
                const loss = squares - left.reduce((s, v, k) => s + v * v / n + right[k] * right[k] / m, 0);
                if (loss < bestLoss - 1e-10) { bestLoss = loss; best = { feature, threshold: (sorted[i].x[feature] + sorted[i + 1].x[feature]) / 2 }; }
            }
        }
        if (best) {
            node.feature = best.feature; node.threshold = best.threshold;
            node.left = grow(sample.filter(r => r.x[best.feature] <= best.threshold), level + 1);
            node.right = grow(sample.filter(r => r.x[best.feature] > best.threshold), level + 1);
        }
        return node;
    };
    return Array.from({ length: count }, () => grow(Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)]), 0));
}
export function contributions(trees: Tree[], x: number[], output: number): number[] {
    const result = x.map(() => 0);
    for (let node of trees) while (node.feature !== undefined && node.left && node.right) {
        const feature = node.feature, next = x[feature] <= node.threshold! ? node.left : node.right;
        result[feature] += (next.value[output] - node.value[output]) / trees.length;
        node = next;
    }
    return result;
}
