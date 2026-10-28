# OptiTAC research extension: targeted probes and failure reduction

This extends the existing C/C++ compiler pipeline and optimization visualizer. It does not replace the project idea. The trained forest still ranks optimization passes; actual interpreter observations decide candidate eligibility.

## Research question

Within a fixed eight-input testing budget, does propagating affine input relationships through the compiler IR expose more seeded transformation faults than fixed boundary values or uniform random values? Can a detected failure be reduced to simpler stdin and a shorter ordered pass sequence while retaining replayable evidence?

The implemented contribution to evaluate is an integrated, bounded diagnostic workflow. Affine analysis, boundary testing, mutation testing and reduction are established techniques. This report does not claim a new mathematical algorithm, first implementation, formal verification, or publication acceptance.

## Implementation

### Comparison-targeted generation

`src/core/research/probes.ts` maps initial straight-line integer reads in `main` to stdin columns. It supports C++ stream input and simple C `scanf` sequences containing `%d`. Unsupported input formats, non-integer reads and unknown input-producing calls disable this mapping rather than asserting an incorrect relationship.

A bounded forward worklist propagates affine expressions through IR names, copies, additions/subtractions, constant multiplication and simple assignments. Join points retain only identical facts; updates and unknown expressions discard facts. The worklist is capped at 600 visits. Only `main` is analyzed; this is not interprocedural symbolic execution.

For a comparison, the generator varies one input column while holding the others at the supplied seed, proposes floor/ceiling values around the affine equality boundary and nearby integers, and distributes proposals across targets. This does not solve full path constraints or prove that a branch will execute. Overflow and nonlinear behavior can invalidate the heuristic; concrete execution determines whether a proposal is eligible. Remaining slots use fixed-value fallback probes.

Three strategies are available in the existing input settings:

- **Comparison-targeted + fixed fallback**: the default.
- **Fixed boundary baseline**: values including 0, ±1, ±2, ±4 and 8.
- **Seeded random baseline**: uniform integers in [-256, 256].

All strategies deduplicate supplied inputs and generate at most eight probes. Reference executions are bounded to 2,000 steps. A probe is eligible only when the AST returns a defined result and original IR agrees. Undefined, unsupported and limited references are shown and excluded. Original-IR disagreement prevents optimized acceptance. Every accepted candidate must also match all eligible probes.

### Joint input and route reduction

`src/core/research/diagnose.ts` replays at most three rejected candidates per analysis, with at most 64 oracle calls per candidate. Each oracle checks the AST, original IR and replayed transformation sequence with the same input and a 2,000-step bound. A timeout cannot establish a mismatch.

The reducer alternates between:

1. Replacing individual integer input values with strictly simpler values: 0, ±1, truncation toward half, or one step toward zero. Token count stays unchanged.
2. Deleting individual actions from the ordered transformation sequence.

A reduction is retained only if the reference remains defined, original IR agrees, and the candidate still disagrees. After a complete pass with no retained reduction, the result is locally irreducible under these operations. If the budget expires, the UI explicitly withholds minimality. This is not a globally smallest input, shortest arbitrary pass sequence, or minimized source program.

Actual source, typed outcomes, stdout, pass sequence, reduced input, oracle count and reduction log are included in the normal JSON evidence export. Production optimization selection never uses an injected fault or a diagnostic replay as an accepted transformation.

### Built-in demonstration

Choose **Research demo: find the hidden fault**. The original program reads `n` and an unused second value, returns 7 when `n == 137`, and otherwise returns 2. A localized experiment changes the branch return from 7 to 8 and remains permanently ineligible for selection.

- Supplied stdin `300 999` produces 2 in both versions and misses the fault.
- Fixed probes miss this particular comparison boundary.
- Targeted probing reaches `137 999` and observes 7 versus 8.
- Reduction removes the irrelevant second input's magnitude, retaining `137 0` and the localized mutation action.

Switch strategies, analyze again and inspect the rejected experiment in **Optimize → Autopsy**. Detailed probe provenance and benchmark summaries are in the existing ML advisor panel. No extra top-level navigation is introduced.

## Reproducible seeded-fault experiment

The saved [corpus](corpus.json) contains 120 C/C++ fixtures: twelve variants in each of ten families. They cover rare positive/negative branches, off-by-one comparisons, aliases, two-input affine conditions, conditions after loops, short-circuit conditions, nonlinear controls, side-effect removal and an incorrect division rewrite.

Faults are injected deliberately into IR. They are not discovered bugs in GCC or OptiTAC's production passes. The supplied seed input must miss each fault, and reference AST must agree with original IR. Each strategy then uses exactly eight probes per fixture: 960 probes per complete evaluation. Random testing is also repeated across 32 published seeds with the same per-fixture budget.

| Strategy | Detected seeded faults out of 120 |
| --- | ---: |
| Comparison-targeted + fallback | 110 |
| Fixed boundaries | 2 |
| Uniform random, default seed | 5 |
| Uniform random, mean across 32 seeds | 8.41 |

Random replications ranged from 0 to 14 detected faults. The nonlinear control family was detected in only 2/12 cases by both targeted and fixed testing: targeted synthesis falls back when the relation is nonlinear.

All 110 targeted witnesses replayed after reduction and were locally irreducible under the configured operations. Input strings shortened in 98 cases; transformation routes shortened in all 110. These figures measure the specified reducer and seeded corpus, not global minimality or user comprehension.

As negative controls, the four actual optimization passes were separately checked on the targeted inputs: **3,840 comparisons, zero disagreements**. This is finite observation evidence, not proof that the passes are universally correct.

The complete [evaluation](evaluation.json) records corpus SHA-256, per-case outcomes, per-family results, all random seeds, reduction summaries and limitations. The compact in-app summary is generated from the same run.

Verification on 28 October 2026: **280 tests passed, zero failed, zero skipped**. Build and lint passed. Browser verification passed for all ten examples, targeted-versus-fixed ablation, the `137 0` reduced failure, ML evidence, detailed logs, native artifacts and mobile layout. No browser page errors were recorded.

## Limits and next research requirements

- The corpus intentionally emphasizes affine boundaries supported by the generator and therefore favors this technique. It is not an independent real-world benchmark.
- Most faults target a narrow branch. Neither these outcomes nor the small ML development challenge set establish generalization to production compilers.
- Uniform random and fixed values are simple baselines. Comparisons against stronger symbolic/concolic generators and budget-aware fuzzers are still needed before a broad superiority claim.
- AST and IR execution share numeric primitives. The existing native differential test suite provides a separate check; this experiment does not use native execution as its oracle.
- There is no path-completeness guarantee, SMT solver, automatic source reduction, global minimality or human-learning study.
- Native checking remains compile-only. All submitted-source probing and diagnosis use the bounded visual interpreter.

A defensible project description is: **“An ML-assisted compiler visualizer with affine-comparison-targeted testing and replayable input/pass-sequence failure reduction.”** The implementation supports research experiments; novelty and publication readiness remain to be demonstrated through a broader related-work comparison and independent evaluation.

## Reproduce

```powershell
npm run evaluate:research
npm run evaluate:ml
npm test
npm run build
npm run lint
npm run dev
```

Run native regression tests and browser compilation checks sequentially on this Windows machine to avoid compiler time-limit contention. The model artifact and original ML training corpus are unchanged by this extension.
