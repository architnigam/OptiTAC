# OptiTAC / Compiler Town

An interactive compiler-learning portal built with React, TypeScript and Vite. Write a small program, send it through town, and inspect the artifact at each shop.

## Run locally

```powershell
npm install
npm run dev
```

Open the local address printed by Vite. Compilation, nearest-neighbor inference and synthetic-model evaluation run in the browser. There is no API key, remote model or backend service. The application does not send source code over the network.

## Explore

- **Token Post**: selectable tokens, kinds, lexemes, positions and the full token ledger.
- **Syntax Studio**: expandable AST, grammar and operator-precedence explanations.
- **Type Registry**: semantic diagnostics and a symbol table.
- **TAC Forge**: stable instruction IDs, reserved temporaries and lowering explanations.
- **Repair Garage**: Autopsy, Counterfactual, Structure and detailed Logs views.
- **Watchtower**: original/optimized outcomes, traces and error preservation.
- **Scout Office**: local ML predictions checked against isolated-pass measurements.
- **Challenge Hall**: seven questions, explanatory feedback and persistent passport stamps.
- **Pipeline Express**: play, pause, rewind and select stages in a visual replay of completed compilation. It is not a timing benchmark.

The first delivery is compiled automatically. Editing source or settings leaves a stale-parcel message until **Send through town** is clicked. Earlier successful artifacts remain available if a later frontend stage fails. JSON evidence export includes the journey and scout report; non-finite numbers and signed zero use tagged numeric values rather than silently losing their meaning.

## Language and semantics

Supported: initialized `int`/`float` declarations, identifiers, literals, arithmetic `+ - * / %`, parentheses and return expressions. Write negatives as `0 - n`; unary minus is not parsed. Runtime numbers use JavaScript Number, not fixed-width C integers. For example `5 / 2` is `2.5`. Division and remainder by zero are explicit interpreter errors. A matching error is a preserved observation, not a successful execution.

No branches, loops, functions, external runtime inputs, CFG analysis or symbolic proof are implemented. Learning programs are limited to 20,000 source characters and 250 TAC instructions to bound trace growth. Five selected optimization passes run in a fixed order to convergence or ten rounds. Instruction count is not runtime speed.

## Local ML scout

`src/compiler/ml/scout.ts` implements a distance-weighted multi-output k-nearest-neighbor regressor with k=5. It stores 192 synthetic TAC training examples and holds out 48, using a deterministic generator and split. Seven structural features are standardized with training data only. Labels are isolated-pass rewrite counts, measured independently on original TAC. The model suggests a pass to investigate; it does not reorder the pipeline or certify optimization safety.

Current held-out results: 43/48 top-choice agreement (89.6%, ties accepted), versus 42/48 (87.5%) for the majority-pass baseline; mean absolute rewrite-count error 1.025. Structurally similar programs can occur in both splits. The one-case gain is not statistical evidence or a guarantee for arbitrary programs. All prediction/measurement disagreements remain visible.

## Validation

```powershell
npm test
npm run build
npm run lint
```

The suite includes an independent arithmetic oracle over 60 generated expressions and all 32 enabled-pass subsets (1,920 program/subset combinations), 60 synthetic IR cases checked across all five isolated passes, numeric/error regressions, stage-failure retention and ML split/prediction checks. These finite checks do not establish universal compiler correctness.

Browser QA: `node scripts/town-browser.mjs`. The script uses the Codex-bundled Playwright path and Microsoft Edge on this workstation; adapt its import for another machine. It covers all eight shops, challenge feedback and storage, replay, detailed logs, omissions, preserved traps, controlled injected faults, disabled passes, export, mobile layout and offline compilation/inference.

## Project presentation

`output/presentations/OptiTAC-Compiler-Town-Presentation.pptx` explains each stage, the experiments, ML method and measured results, tests, novelty and limits. Speaker notes include demonstration guidance and sources. Build source: `scripts/build-town-deck.mjs`; local export/finalization: `scripts/finalize-town-deck.mjs`. These presentation scripts use the bundled artifact runtime and are workstation-specific.

## Related foundations

- Nearest-neighbor regression: https://scikit-learn.org/stable/modules/neighbors.html
- LLVM optimization debugging: https://llvm.org/docs/OptBisect.html
- LLVM optimization remarks: https://llvm.org/docs/Remarks.html
- Alive2 translation validation: https://github.com/AliveToolkit/alive2

The proposed contribution is an integrated spatial learning workflow that connects compiler artifacts, error-aware experiments, counterfactual omissions and auditable ML predictions. Global novelty, publication acceptance and improved learning outcomes have not been established.
