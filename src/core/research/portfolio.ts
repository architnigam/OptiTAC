/** Exact bounded maximum-coverage selector; no probabilities or correctness guarantees. */
export interface CoverageRow { mask: number; cost: number; anchors?: number }
export interface Portfolio { indices: number[]; mask: number; anchors: number; covered: number; cost: number; states: number }
export const bitCount = (mask: number) => { let count = 0; while (mask) { mask &= mask - 1; count++; } return count; };
export function exactPortfolio(rows: CoverageRow[], budget = 8): Portfolio {
    if (!Number.isInteger(budget) || budget < 0 || budget > 8 || rows.length > 24 || rows.some(r => !Number.isInteger(r.mask) || r.mask < 0 || r.mask >= 1024 || !Number.isInteger(r.anchors ?? 0) || (r.anchors ?? 0) < 0 || (r.anchors ?? 0) >= 64 || !Number.isFinite(r.cost) || r.cost < 0)) throw Error('Portfolio limits: 24 rows, 10 challenge bits, 6 structural anchors, budget 0–8, finite nonnegative costs.');
    type State = { indices: number[]; mask: number; anchors: number; cost: number };
    const states = new Map<string, State>([['0:0', { indices: [], mask: 0, anchors: 0, cost: 0 }]]);
    rows.forEach((row, index) => {
        for (const old of [...states.values()]) {
            if (old.indices.length >= budget) continue;
            const mask = old.mask | row.mask;
            const anchors = old.anchors | (row.anchors ?? 0);
            if (mask === old.mask && anchors === old.anchors) continue;
            const next = { indices: [...old.indices, index], mask, anchors, cost: old.cost + row.cost };
            const key = `${mask | (anchors << 10)}:${next.indices.length}`, previous = states.get(key);
            if (!previous || next.cost < previous.cost) states.set(key, next);
        }
    });
    const best = [...states.values()].sort((a, b) => bitCount(b.anchors) - bitCount(a.anchors) || bitCount(b.mask) - bitCount(a.mask) || a.indices.length - b.indices.length || a.cost - b.cost || a.indices.join(',').localeCompare(b.indices.join(',')))[0];
    return { ...best, covered: bitCount(best.mask), states: states.size };
}
export function greedyPortfolio(rows: CoverageRow[], budget = 8): Portfolio {
    const indices: number[] = []; let mask = 0, anchors = 0, cost = 0;
    while (indices.length < budget) {
        const choices = rows.map((r, i) => ({ i, gain: bitCount(r.mask & ~mask) + 11 * bitCount((r.anchors ?? 0) & ~anchors), cost: r.cost })).filter(r => !indices.includes(r.i) && r.gain > 0).sort((a, b) => b.gain - a.gain || a.cost - b.cost || a.i - b.i);
        if (!choices.length) break;
        const row = choices[0]; indices.push(row.i); mask |= rows[row.i].mask; anchors |= rows[row.i].anchors ?? 0; cost += row.cost;
    }
    return { indices, mask, anchors, cost, covered: bitCount(mask), states: 0 };
}
