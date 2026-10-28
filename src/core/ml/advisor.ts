import artifact from './model.json';
import evaluation from './evaluation.json';
import { contributions, predictForest, type Tree } from './forest';
import { features, featureNames } from './features';
import type { IRProgram } from '../ir';
import { cost, routePasses } from '../optimizer';

interface Model { schema: number; id: string; features: string[]; actions: string[]; trees: Tree[]; ranges: { min: number; max: number }[]; residualBand: number[] }
export interface Advice {
    modelId: string;
    status: 'ready' | 'out-of-distribution' | 'unavailable';
    reason: string;
    scores: { pass: string; predictedGain: number; low: number; high: number }[];
    features: { name: string; value: number; outside: boolean }[];
    explanation: { feature: string; contribution: number }[];
}
export const modelEvaluation = evaluation;
export function advise(ir: IRProgram, model: Model = artifact as Model): Advice {
    const base: Advice = { modelId: model?.id || 'unavailable', status: 'unavailable', reason: '', scores: [], features: [], explanation: [] };
    try {
        if (model.schema !== 1 || model.features.join() !== featureNames.join() || model.actions.join() !== routePasses.map(p => p.id).join() || model.ranges.length !== featureNames.length || !model.trees.length) throw Error('Incompatible or missing model artifact.');
        const x = features(ir), scale = Math.max(1, cost(ir));
        base.features = x.map((value, k) => ({ name: featureNames[k], value, outside: value < model.ranges[k].min || value > model.ranges[k].max }));
        const prediction = predictForest(model.trees, x);
        if (prediction.length !== routePasses.length || prediction.some(v => !Number.isFinite(v)) || model.residualBand.length !== routePasses.length || model.residualBand.some(v => !Number.isFinite(v) || v < 0)) throw Error('Non-finite model prediction.');
        base.scores = prediction.map((ratio, k) => ({ pass: model.actions[k], predictedGain: ratio * scale, low: Math.max(0, (ratio - model.residualBand[k]) * scale), high: Math.min(scale, (ratio + model.residualBand[k]) * scale) })).sort((a, b) => b.predictedGain - a.predictedGain);
        const winner = model.actions.indexOf(base.scores[0].pass);
        base.explanation = contributions(model.trees, x, winner).map((value, k) => ({ feature: featureNames[k], contribution: value * scale })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).filter(v => Math.abs(v.contribution) > 1e-8).slice(0, 5);
        const outside = base.features.filter(f => f.outside);
        base.status = outside.length ? 'out-of-distribution' : 'ready';
        base.reason = outside.length ? `Outside the training feature envelope: ${outside.map(f => f.name).join(', ')}. Default pass ordering is used for this state.` : 'The trained forest ranks pass expansion order. Measured cost and behavior checks still decide acceptance.';
        return base;
    } catch (error) { return { ...base, status: 'unavailable', scores: [], explanation: [], reason: error instanceof Error ? error.message : String(error) }; }
}
export function rankedPasses(ir: IRProgram, enabled: boolean) {
    const advice = enabled ? advise(ir) : undefined;
    return { advice, passes: advice?.status === 'ready' ? [...routePasses].sort((a, b) => advice.scores.find(s => s.pass === b.id)!.predictedGain - advice.scores.find(s => s.pass === a.id)!.predictedGain) : routePasses };
}
