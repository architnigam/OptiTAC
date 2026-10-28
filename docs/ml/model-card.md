# OptiTAC: ML-guided optimization with a boundary-input audit

## What is implemented

The current application uses a real, trained **multi-output random forest regressor** to predict the static-cost reduction of each of four optimization passes. The bundled artifact is loaded inside the analysis worker; no API, network model or Python installation is required. Training is an offline, reproducible development command, not an action performed on user submissions.

The advisor ranks which pass to expand first at each beam-search state. The beam still retains candidates by **measured** cost, and every eligible candidate must match the AST reference's stdout and typed return. A predicted saving never authorizes a rewrite. Turning off `Use trained ML guidance` runs the same guarded search with default pass ordering.

The Optimize view contains a compact **ML advisor + boundary audit** panel. Expand it to inspect predictions versus measured savings, tree-path feature contributions, all input features, model provenance, holdout metrics and generated-input results. Detailed transformation logs remain in the existing fourth Logs tab.

## Training data and targets

- **1,376 unique generated C/C++ programs**, covering ten broad families: constant chains, constant branches, bounded loops, early returns, scalar functions, lexical scopes, input joins, floating point, unreachable tails and return-join tails.
- **4,784 measured IR states**, including original and successive transformed states. Exact duplicate source programs are removed. A duplicate crossing structural groups causes training to fail.
- For each state, the actual four compiler passes are run separately. The target for each pass is `(cost_before - cost_after) / max(1, cost_before)`.
- Source AST, original/state IR and each labeled transformation must agree on two interpreter inputs (`0` and `3`). A failing state is excluded and counted. This training run rejected zero states.
- Twenty-seven static IR features describe control flow, expressions, temporary definitions, effects, calls and unreachable instructions. Feature extraction does not execute candidate optimization passes or consult their measured labels.

The target measures the project's documented **static IR cost proxy**. It does not measure execution time, energy, vulnerability probability or semantic correctness. AST and IR share numeric primitives; their agreement is not an independent native oracle. Existing native differential development tests remain a separate check.

Raw generated source programs and their groups are saved in [dataset.json](dataset.json). The evaluation records the dataset SHA-256, fixed random seed and model identity.

## Split, fitting and calibration

All numeric and C/C++ language variants of a structural template stay in one partition. There are **80 template groups**: 50 training, 10 validation, 10 calibration and 10 test groups. These contain 2,972 / 612 / 652 / 548 states respectively.

Two configurations are fit on training data only: 24 trees with depth 5, and 40 trees with depth 7. Both use bootstrap resampling, randomized feature subsets, squared-error splits and a minimum leaf size of six. The lower validation MAE chooses the deployed configuration. No test labels enter fitting, feature ranges or calibration. Broad program families still appear in every split, so the holdout measures related synthetic structures rather than arbitrary-program generalization.

For each pass, a separate calibration partition supplies the 90th-percentile absolute residual. The UI scales this residual band to the current IR cost. These are empirical error bands, **not correctness confidence, probability of safety, or guaranteed coverage on new code**. Forest path contributions explain changes relative to the average root prediction; they are not causal feature importance.

If a feature falls outside the training minimum/maximum envelope, inference is marked out-of-distribution and the default pass order is used for that state. Missing/incompatible artifacts also fall back. This is a simple envelope check, not a comprehensive distribution-shift detector. Predictions may remain visible when unused, labeled accordingly.

## Measured results

The held-out synthetic test partition has 548 states, including 312 with at least one positive saving. Best-pass agreement accepts any tied optimum.

| Metric | Random forest | Training-mean baseline | Zero-prediction baseline |
| --- | ---: | ---: | ---: |
| Mean absolute gain-ratio error | 0.00450 | 0.08993 | 0.06152 |
| Best-pass agreement, ties accepted | 100.0% | 59.9% | 50.0% |
| Agreement on positive-saving states | 100.0% | 29.5% | 12.2% |

The 100% value is limited to this particular synthetic test partition. It does **not** mean the model or compiler is universally accurate. Raw records, alternative validation configurations and per-pass band coverage are in [evaluation.json](evaluation.json).

Regression verification on 28 October 2026: **269 tests passed, zero failed, zero skipped**. Tests recompute the held-out pass labels and prediction error from the saved source corpus, check split isolation and duplicate removal, exercise fallback and ML-off behavior, and verify rejection of a transformation that fails a generated negative input. Production build and lint also passed.

The final browser run passed with the frozen model: active guidance on the default program, ML-off comparison, exported prediction evidence, boundary-audit display, all nine existing examples, detailed logs, native artifacts and expanded mobile panels. No browser page errors were recorded.

A separate hand-selected development challenge set evaluates **17 programs at three candidate budgets** (1, 8 and 32): 51 paired ML/default searches. ML found a lower static cost in 3 comparisons, tied in 48 and was worse in zero. All accepted observation checks matched. The model's raw best-pass prediction agreed on 16/17 programs; its envelope allowed guidance on 11/17 original programs. These cases were used during development, so this is an integration challenge set, not an independent external benchmark or evidence of runtime speedup. Details: [challenge-evaluation.json](challenge-evaluation.json).

## Boundary-input audit

For suitable integer stdin, the audit now defaults to affine-comparison-targeted probes with fixed-value fallback. Fixed and seeded-random modes are available as ablations. It deduplicates supplied cases and caps generation at eight probes. Each probe has at most 2,000 interpreter steps. Only defined AST executions that agree with original IR are eligible. Every candidate must also match these eligible probes; a candidate timeout is rejected as inconclusive. The [research-extension report](../research/report.md) explains the generator, automatic input/pass reduction and its seeded-fault evaluation.

Undefined, unsupported and limited references are displayed and excluded from validation. AST/original-IR disagreement stops optimized acceptance. A regression test injects a transformation that preserves the supplied positive input but changes a negative-only branch; the generated `-1` probe rejects it. Probes run in the existing bounded interpreter; the native service remains compile-only.

This adds concrete failure evidence, not exhaustive correctness checking. It is not a cybersecurity vulnerability scanner or OS sandbox, and no IoT hardware or security classifier is claimed.

## Contribution and related work

The implemented contribution is the combination of **ML-ranked search, inspectable prediction error, conservative fallback, behavior guards and generated boundary probes** within a compiler-learning workflow. No claim is made that these individual techniques or their broad combination are unprecedented. A publication would need an external benchmark suite, stronger comparisons and/or a controlled learning study.

- [CompilerGym](https://compilergym.com/llvm/index.html) provides established compiler phase-ordering research infrastructure.
- [Random forest regression](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestRegressor.html) describes the established learning family. This project implements its own small TypeScript forest; it does not depend on scikit-learn.
- [Grouped splitting](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupShuffleSplit.html) motivates keeping related samples together. This project uses a deterministic disjoint four-way group split.
- [Alive2](https://github.com/AliveToolkit/alive2) uses symbolic verification of LLVM transformations; OptiTAC's finite observation checks offer a narrower assurance level.
- [VisOpt](https://doi.org/10.1145/3641554.3701832) is closely related educational optimization-visualization work.

## Reproduce

```powershell
npm run train:ml
npm run evaluate:ml
npm test
npm run build
npm run lint
npm run dev
```

Training writes the model and evaluation artifacts. It uses fixed seed `2801026` and source-template definitions in `scripts/ml/train.ts`. Retraining after changing data or algorithms requires rerunning evaluation and updating this card; the current numbers are not a permanent promise. Training and evaluation do not execute submitted C/C++ as native binaries. The test command uses one worker to reduce contention on Windows; run native differential tests and browser compilation checks sequentially.
