# OptiTAC · C/C++ Compiler Lab

A local, interactive compiler lab with a simple source editor and six stages: Tokens, Syntax, Types, Flow & IR, Optimize, and Results. Guided replay, small prediction challenges, and persistent discovery stars add interaction without hiding the compiler artifacts.

## Run

```powershell
npm install
npm run dev
```

Open the localhost URL printed by Vite. The visual engine runs in a browser worker. A localhost Vite service supplies **compile-only** GCC/G++ diagnostics and optional native compiler dumps. Submitted programs are never executed by that service. No API key, remote AI service, or model download is required.

GCC/G++ are optional for visual analysis, but required for native checks and dumps. The service prefers the installed MSYS2 UCRT compiler; set `OPTITAC_CC` / `OPTITAC_CXX` to override it. Native dialects are C11 and C++14. It accepts documented standard headers, rejects custom includes/macros, and limits source size and compilation time. This is not a security sandbox.

## What is implemented

- Positioned, selectable tokens with operators correctly separated from delimiters, including unary/compound/alternative C++ operators.
- Parsing, lexical scope and type checking for scalar C/C++ programs with branches, loops, functions, recursion, casts, input and output.
- Typed three-address IR, control-flow blocks, scope handling, and instruction traces.
- Worklist conditional constant propagation, reachability, backward liveness, conservative dead-temporary elimination, and jump cleanup.
- Bounded beam search over optimization orders, guarded by AST-versus-IR observations on supplied test inputs.
- A bundled, offline-trained random forest ranks optimization passes, explains feature contributions, and falls back to default ordering outside its training envelope.
- Automatically generated integer boundary-input probes check candidate behavior beyond the supplied cases; undefined and limited probes are explicitly excluded.
- Affine-comparison-targeted input generation, fixed/random ablations, and bounded reduction of failing stdin and ordered pass sequences.
- A validation-quality witness matrix, structural-anchor-preserving exact suite selection, unresolved challenge reporting, and quarantine of actual selected-IR disagreements found by the wider audit.
- Autopsy, Counterfactual, Structure, and detailed Logs tabs, including intermediate-pass navigation and rejected-candidate counterexamples.
- Real GCC original-tree, GIMPLE, CFG and optimized-GIMPLE artifacts for broader C/C++ constructs such as classes and standard containers.
- JSON evidence export, stale-result handling, responsive layout, and cancellable worker analysis.

## Accuracy and scope

The visual interpreter implements a documented scalar subset, **not all of C/C++**. Integers use checked signed 32-bit semantics; integer division truncates toward zero. Float operations round to binary32. Unsupported constructs, undefined behavior, and execution limits are reported explicitly. Broader native syntax acceptance does not imply visual execution support.

Optimization validation compares complete stdout and typed return values for up to 12 supplied input cases and eight eligible generated boundary probes. Passing those cases is evidence, not a proof for every possible input. Equal timeouts or undefined behavior never count as successful validation. The optional deliberately broken candidate is always ineligible for selection. ML only ranks search expansion; it never decides whether a transformation is correct.

The active model was trained on 1,376 unique generated source programs and 4,784 measured IR states, partitioned by whole structural template. Read the [model card and novelty details](docs/ml/model-card.md) for training, baselines, measured results and limitations. The current portal uses this model; the earlier nearest-neighbor Scout code is historical.

The [research-extension report](docs/research/report.md) documents targeted testing and automatic failure diagnosis, including a reproducible 120-fixture seeded-fault experiment, 32 random-baseline replications and explicit method limitations. Try **Research demo: find the hidden fault**, then inspect Optimize → Autopsy and compare the targeted/fixed input strategies.

The [witness-portfolio study](docs/research/evidence-portfolios.md) tests whether preserving source branch outcomes and comparison-center proposals prevents mutation-only suite compression from missing held-out fault operators. It reports planning overhead, exact/greedy comparisons and limits; it does not claim established publication novelty.

See [implementation, novelty, and limitations](docs/compiler-lab.md) for the full contract and evaluation details. Earlier Compiler Town reports and slides describe a historical version; the active application is `src/App.tsx`, `src/core`, and `src/lab`. The legacy `src/compiler` engine is retained for its existing tests and is not the active UI engine.

## Verification

```powershell
npm run build
npm run lint
npm test
node scripts/lab-browser.mjs
npm run train:ml
npm run evaluate:ml
npm run evaluate:research
npm run evaluate:evidence
```

The browser check uses the bundled Playwright runtime and Microsoft Edge available on this development machine. Compiler differential tests compare fixed, generated development fixtures with local GCC/G++; they do not expose arbitrary native execution through the application. Tests report their native cases as skipped if the compiler is unavailable. Browser screenshots and machine-readable verification results are written under ignored `tmp/lab/`.
