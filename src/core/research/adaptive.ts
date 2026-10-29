import { bitCount } from './portfolio';

export interface Decision { input: string; origin: string; reward: number; steps: number; newChallenges: number; newAnchors: number }
/** Online scheduling: only completed observations may update an arm. No matrix lookahead. */
export class EvidenceScheduler {
    readonly history: Decision[] = [];
    private arms = new Map<string, { count: number; reward: number; steps: number }>();
    private mask = 0;
    private anchors = 0;
    choose<T extends { origin: string }>(pending: T[]): number {
        const provided = pending.findIndex(p => p.origin === 'provided');
        if (provided >= 0) return provided;
        let best = -Infinity, index = 0;
        pending.forEach((p, i) => {
            const arm = this.arms.get(p.origin);
            const score = !arm ? Infinity : arm.reward / arm.steps + Math.sqrt(2 * Math.log(this.history.length + 1) / arm.count) / Math.sqrt(arm.steps / arm.count);
            if (score > best) { best = score; index = i; }
        });
        return index;
    }
    observe(input: string, origin: string, mask: number, anchors: number, steps: number) {
        const newChallenges = bitCount(mask & ~this.mask), newAnchors = bitCount(anchors & ~this.anchors);
        const reward = newChallenges + 2 * newAnchors;
        const arm = this.arms.get(origin) ?? { count: 0, reward: 0, steps: 0 };
        arm.count++; arm.reward += reward; arm.steps += Math.max(1, steps);
        this.arms.set(origin, arm); this.mask |= mask; this.anchors |= anchors;
        this.history.push({ input, origin, reward, steps, newChallenges, newAnchors });
    }
}
