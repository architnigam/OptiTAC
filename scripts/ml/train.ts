import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tokenize } from '../../src/core/lexer';
import { CParser } from '../../src/core/parser';
import { check } from '../../src/core/semantics';
import { generateIR, executeIR } from '../../src/core/ir';
import { executeAST } from '../../src/core/runtime';
import { matchRuns } from '../../src/core/guard';
import { cost, routePasses, stable } from '../../src/core/optimizer';
import { features, featureNames } from '../../src/core/ml/features';
import { fitForest, predictForest, seeded, type Row } from '../../src/core/ml/forest';
import type { Language } from '../../src/core/types';

const seed = 2801026;
const families = ['constant-chains', 'constant-branches', 'bounded-loops', 'early-returns', 'scalar-functions', 'lexical-scopes', 'input-joins', 'floating-point', 'unreachable-tails', 'return-join-tails'];
function sourceFor(family: number, shape: number, variant: number) {
    const a = 2 + variant % 7, b = 1 + (variant * 3) % 5, k = shape + 1;
    const language: Language = variant % 2 ? 'cpp' : 'c';
    const input = language === 'cpp' ? 'cin>>n;' : 'scanf("%d",&n);';
    const out = (e: string) => language === 'cpp' ? `cout<<"value="<<(${e})<<endl;` : `printf("value=%d\\n",(${e}));`;
    const chain = Array.from({ length: k }, (_, i) => `int v${i}=${i ? 'v' + (i - 1) : a}+${b};`).join('');
    let body = '', helper = '';
    switch (family) {
        case 0: body = `${chain}int z=v${k - 1}+n;${out('z')}return z;`; break;
        case 1: body = `int z=n;${Array.from({ length: k }, (_, i) => `if(${a}+${b}>${i})z+=${b};else z-=1;`).join('')}${out('z')}return z;`; break;
        case 2: body = `int z=0;for(int i=0;i<${k + 1};i++){z+=n+${b};${Array.from({ length: k }, () => 'if(0)z+=4;').join('')}}${out('z')}return z;`; break;
        case 3: body = `${chain}if(${a}>0){${out('n')}return n+${a};}${Array.from({ length: k }, () => 'n+=3;').join('')}return n;`; break;
        case 4: helper = `int helper(int x){${chain}return x+v${k - 1};}`; body = `${chain}int z=helper(n)+v${k - 1};${out('z')}return z;`; break;
        case 5: body = `int z=n;${Array.from({ length: k }, (_, i) => `{int n=${a + i};int x=n+${b};z+=x;}`).join('')}${out('z')}return z;`; break;
        case 6: body = `int z=${a};if(n>${b})z=${a + b};else z=${b};${Array.from({ length: k }, (_, i) => `int v${i}=z+${i};z=v${i};`).join('')}${out('z')}return z;`; break;
        case 7: body = `double z=${a}.5;${Array.from({ length: k }, () => `z=z+${b}.25;`).join('')}int r=(int)z+n;${out('r')}return r;`; break;
        case 8: body = `int z=${a}+${b};return n+z;${chain}${out(`v${k - 1}`)}return v${k - 1};`; break;
        case 9: body = `int z=${a}*${b};if(n>${b}){${out('z')}return z;}return n;${chain}${out(`v${k - 1}`)}return v${k - 1};`; break;
    }
    return { language, source: `${language === 'cpp' ? '#include <iostream>\nusing namespace std;\n' : '#include <stdio.h>\n'}${helper}int main(){int n;${input}${body}}` };
}
const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil((values.length + 1) * q) - 1)] || 0;
function metrics(rows: Row[], prediction: (x: number[]) => number[]) {
    let error = 0, correct = 0, activeCorrect = 0, active = 0, regret = 0;
    rows.forEach(row => {
        const p = prediction(row.x), winner = p.indexOf(Math.max(...p)), best = Math.max(...row.y);
        error += mean(p.map((v, k) => Math.abs(v - row.y[k])));
        const hit = best - row.y[winner] < 1e-9;
        if (hit) correct++;
        if (best > 1e-9) { active++; if (hit) activeCorrect++; }
        regret += best - row.y[winner];
    });
    return { rows: rows.length, maeGainRatio: error / rows.length, topChoiceAgreement: correct / rows.length, informativeRows: active, informativeAgreement: active ? activeCorrect / active : null, meanRegretRatio: regret / rows.length };
}
export async function train() {
    const random = seeded(seed), groups = families.flatMap((_, family) => Array.from({ length: 8 }, (_, shape) => `${family}:${shape}`));
    for (let i = groups.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]]; }
    const n = groups.length, trainEnd = Math.floor(n * 0.625), validationEnd = Math.floor(n * 0.75), calibrationEnd = Math.floor(n * 0.875);
    const split = { train: groups.slice(0, trainEnd), validation: groups.slice(trainEnd, validationEnd), calibration: groups.slice(validationEnd, calibrationEnd), test: groups.slice(calibrationEnd) };
    const rows: Row[] = [], manifest: { group: string; language: Language; source: string; inputs: string[] }[] = [];
    const sourceGroups = new Map<string, string>();
    let rejectedStates = 0;
    console.log('Generating source programs and measuring actual pass transformations…');
    for (let family = 0; family < families.length; family++) for (let shape = 0; shape < 8; shape++) for (let variant = 0; variant < 18; variant++) {
        const group = `${family}:${shape}`, { source, language } = sourceFor(family, shape, variant), inputs = ['0', '3'];
        const previousGroup = sourceGroups.get(source);
        if (previousGroup !== undefined) {
            if (previousGroup !== group) throw new Error('A duplicate program crossed structural template groups.');
            continue;
        }
        sourceGroups.set(source, group);
        const program = new CParser(tokenize(source, language), language).parse(); check(program);
        const reference = inputs.map(input => executeAST(program, input, 5000, false));
        if (reference.some(r => r.status !== 'returned')) throw new Error('Invalid generated fixture: ' + source);
        manifest.push({ group, source, language, inputs });
        let ir = generateIR(program); const seen = new Set<string>();
        for (let step = 0; step < 5; step++) {
            const key = stable(ir);
            if (!seen.has(key)) {
                seen.add(key);
                if (!inputs.every((input, i) => matchRuns(reference[i], executeIR(program, ir, input, 5000, false)))) { rejectedStates++; break; }
                const after = routePasses.map(pass => pass.run(ir, program).ir);
                if (after.every(next => inputs.every((input, i) => matchRuns(reference[i], executeIR(program, next, input, 5000, false))))) {
                    const before = Math.max(1, cost(ir));
                    rows.push({ group, x: features(ir), y: after.map(next => (cost(ir) - cost(next)) / before) });
                } else rejectedStates++;
            }
            if (step < 4) ir = routePasses[step].run(ir, program).ir;
        }
    }
    const subset = (name: keyof typeof split) => rows.filter(r => split[name].includes(r.group));
    const training = subset('train'), validation = subset('validation'), calibration = subset('calibration'), test = subset('test');
    const baseline = routePasses.map((_, k) => mean(training.map(r => r.y[k])));
    const candidates = [{ trees: 24, depth: 5 }, { trees: 40, depth: 7 }].map(config => {
        console.log('Fitting random forest', config);
        const trees = fitForest(training, config.trees, config.depth, seed);
        return { config, trees, validation: metrics(validation, x => predictForest(trees, x)) };
    });
    candidates.sort((a, b) => a.validation.maeGainRatio - b.validation.maeGainRatio);
    const selected = candidates[0], predict = (x: number[]) => predictForest(selected.trees, x);
    const residualBand = routePasses.map((_, k) => quantile(calibration.map(r => Math.abs(predict(r.x)[k] - r.y[k])), 0.9));
    const ranges = featureNames.map((_, k) => ({ min: Math.min(...training.map(r => r.x[k])), max: Math.max(...training.map(r => r.x[k])) }));
    const testMetrics = metrics(test, predict), baselineMetrics = metrics(test, () => baseline);
    const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    const model = { schema: 1, id: 'optitac-rf-v1-' + digest.slice(0, 12), seed, algorithm: 'multi-output random forest regression', features: featureNames, actions: routePasses.map(p => p.id), trees: selected.trees, ranges, residualBand, baseline, config: selected.config };
    const report = {
        schema: 1, modelId: model.id, seed, datasetSha256: digest, programs: manifest.length, states: rows.length, rejectedStates,
        families, split, counts: { train: training.length, validation: validation.length, calibration: calibration.length, test: test.length },
        configurations: candidates.map(({ config, validation }) => ({ ...config, validation })), selected: selected.config,
        test: testMetrics, meanBaseline: baselineMetrics, zeroBaseline: metrics(test, () => routePasses.map(() => 0)),
        residualBand, testBandCoverage: routePasses.map((_, k) => mean(test.map(r => Math.abs(predict(r.x)[k] - r.y[k]) <= residualBand[k] ? 1 : 0))),
        limitations: ['Synthetic, in-distribution evaluation; broad families occur in all splits.', 'Whole structural-template groups and their numeric/language variants stay in one split.', 'Labels measure static IR cost reduction, not CPU performance or semantic correctness.', 'Residual bands are calibration-set error quantiles, not correctness confidence or guaranteed coverage on new code.', 'AST and IR share numeric primitives. No native-execution oracle is used in model training.'],
    };
    await mkdir('src/core/ml', { recursive: true }); await mkdir('docs/ml', { recursive: true });
    await writeFile('src/core/ml/model.json', JSON.stringify(model));
    await writeFile('src/core/ml/evaluation.json', JSON.stringify(report, null, 2) + '\n');
    await writeFile('docs/ml/dataset.json', JSON.stringify(manifest, null, 2) + '\n');
    await writeFile('docs/ml/evaluation.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ programs: report.programs, states: report.states, counts: report.counts, test: testMetrics, baseline: baselineMetrics, rejectedStates }, null, 2));
}
