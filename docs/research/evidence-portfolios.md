# Anchor-preserving witness portfolios

## Purpose and research claim

OptiTAC now assesses the quality of its validation inputs, in addition to comparing program outputs. The extension constructs controlled local IR fault challenges, records which inputs distinguish them, preserves structural input anchors during suite compression, reports unresolved challenges and quarantines an actual selected candidate if the wider audit finds disagreement.

The research hypothesis is: **when compressing compiler-validation inputs, preserving source branch outcomes and comparison-center proposals reduces overfitting to the mutation operators used for selection.** This is narrower than claiming that mutation adequacy proves compiler correctness.

This is an implemented research candidate, not established publication novelty. Mutation testing, coverage-aware test selection, boundary testing, exact finite optimization and compiler validation already have substantial prior work. A first-of-its-kind claim is not made. The prospective contribution is the compiler-specific, optimizer-provenance-aware integration, explicit evidence-debt accounting and operator-holdout evaluation protocol; broader independent comparisons remain necessary.

## Method

1. **Input pool:** supplied inputs plus interleaved comparison-targeted, fixed and seeded-random proposals; at most 24 distinct inputs.
2. **Eligible observations:** run AST, original IR and selected IR separately, bounded to 500 steps each. Source undefined behavior, unsupported execution and limits are excluded rather than counted as successes. Original-IR disagreement stops optimized acceptance.
3. **Local challenges:** up to ten controlled mutations across integer literals, relational operators, arithmetic operators and output effects. Sites touched by the chosen optimization route's rewrite logs are prioritized within mutation families. IR above 3,000 instructions skips challenge generation with an explicit notice. Only selected challenge copies are materialized.
4. **Witness matrix:** each eligible input records which challenges it distinguishes. Mutation timeouts are inconclusive, never counted as detected faults. A survivor is unresolved, not automatically equivalent or unreachable.
5. **Structural anchors:** observe both outcomes of two source-IR branch sites through a read-only interpreter callback, and retain center proposals for two affine-comparison groups. The generator-center anchors are heuristic input obligations, not solver-proven path reachability. Outcomes absent from the input pool remain unknown.
6. **Exact bounded selection:** select at most eight inputs with the lexicographic objective below. The full matrix and chosen rows are visible and exported.
7. **Quarantine:** a disagreement between the actual selected IR and a defined reference on a wider audit input is distinct from a controlled challenge detection. The selected candidate is rejected, original IR is restored, and failure reduction is attempted. Controlled challenge copies never enter production optimization selection.

The compact suite is a replay artifact; it does not replace the supplied-input checks or silently remove existing guards. The core API enables this audit explicitly through `evidenceAudit`; the portal enables it by default and provides an off switch.

## Finite optimization problem

For each input t, let A(t) be its structural-anchor mask, M(t) its distinguished-challenge mask, and C(t) its observed AST/original/selected replay-step proxy. Choose S, with |S| ≤ 8, to maximize lexicographically:

```
( |union A(t)|, |union M(t)|, -|S|, -sum C(t) ), for t in S.
```

The dynamic program retains minimum cost for each `(anchor mask, challenge mask, selected count)` while processing input rows one at a time. Its transitions skip the next row or include it and union its masks. Rows adding neither kind of evidence can be omitted because costs are nonnegative and smaller suites are preferred.

Induction over processed rows establishes optimality for this finite matrix and objective: each subset either contains the next row or does not, and only a cheapest representative for identical masks/count is needed. The implementation uses snapshots per row to prevent selecting an input twice. It is checked against independent exhaustive enumeration on 80 small matrices. A separate regression instance demonstrates an exact result of ten covered challenges where greedy obtains eight; exact and greedy tied in the actual pilot corpus.

There are at most ten challenge bits and six anchor bits. This finite optimum says nothing about all program inputs, all faults, or semantic equivalence. C(t) is an interpreter-step proxy, not CPU time.

## Operator-family holdout protocol

The pilot reuses the existing 120-fixture seeded-fault corpus. For each fixture:

- Exclude the entire evaluation fault family from shadow challenge generation: literal, comparison, arithmetic or effect.
- Build the input pool, matrix and selected suites without executing or inspecting the held-out faulty IR.
- Only after selection, inject the evaluation fault and measure detection by each suite.
- Compare provided-only, eight targeted inputs, mutation-only exact compression, branch-only compression, anchor-preserving greedy and anchor-preserving exact selection.

This is **operator-family holdout, not independent program holdout**. No new model is trained on the held-out results. The fixed random-forest optimization advisor remains unchanged; this experiment isolates the validation mechanism.

## Pilot results

| Method | Held-out faults detected / 120 | Total replay inputs | Replay-step proxy |
| --- | ---: | ---: | ---: |
| Provided only | 0 | 120 | 7,692 |
| Targeted, eight per fixture | 110 | 960 | 62,010 |
| Mutation-only exact | 49 | 144 | 8,910 |
| Branch-outcome-only exact | 98 | 230 | 15,218 |
| Branch + boundary anchors, greedy | 110 | 242 | 15,962 |
| Branch + boundary anchors, exact | 110 | 242 | 15,962 |

The anchored suites used **74.8% fewer replay inputs** than the targeted-eight baseline while retaining its observed fault detection on this corpus. This is suite compression, not an end-to-end performance result.

All four compact methods distinguished the same 193 recorded shadow challenges across the corpus. Nevertheless, mutation-only selection missed the evaluation fault in 71 cases despite saturating the challenge coverage available in its pool. This illustrates why coverage of known mutations cannot be interpreted as coverage of unseen faults.

Planning cost was **11,556 interpreter executions and 269,760 steps**, paid before selection. That overhead is explicitly retained in the report. Offline held-out scoring is additional evaluation work. There is no claim that the new audit makes initial analysis faster.

The [raw report](evidence-evaluation.json) contains per-case suites, input values, excluded operators, planning cost, DP state counts and the source-corpus fingerprint. The compact in-app report is generated from the same experiment. Reproduce with `npm run evaluate:evidence`.

Verification on 28 October 2026: **290 tests passed, zero failed, zero skipped**. Production build and lint passed. Browser checks passed for the matrix, compact selection, held-out ablations, evidence export, ten examples, failure diagnosis, native artifacts and expanded mobile panels, with no page errors.

## Limitations and prior work

- This corpus was designed earlier to emphasize affine comparisons. It favors the existing input generator and is not an external benchmark. Fault variants and operator groups are correlated; no significance or population-generalization claim is made.
- Greedy tied exact selection on the pilot. A publication cannot claim practical superiority of the DP on this evidence; its role is an exact bounded reference.
- Branch and boundary anchors are capped and cannot establish complete path coverage. Equivalent and unreachable mutants are not automatically classified.
- AST and IR still share numeric primitives. This extension does not remove common-mode oracle defects; native differential development tests remain a separate check.
- A real learning study, production-compiler bug corpus or stronger independent semantic oracle would be needed for broader claims.

Closely related primary sources that must be acknowledged:

- [EvoSuite mutation-based whole-suite generation](https://eprints.whiterose.ac.uk/id/eprint/86827/) already optimizes test suites toward detecting mutants.
- [Greedy suite minimization using mutation coverage](https://tugraz.elsevierpure.com/en/publications/an-empirical-study-of-greedy-test-suite-minimization-techniques-u/) evaluates related reduction strategies and budget constraints.
- [Mutation-based many-objective minimization](https://ieeexplore.ieee.org/abstract/document/8118518) already combines mutation score with coverage and cost. Combining branch coverage and mutation coverage alone is not a novelty claim.
- [LLVM bugpoint](https://prereleases.llvm.org/11.0.0/rc3/docs/Bugpoint.html) already reduces compiler failures and optimization sequences.
- [PROM](https://issl-uk.com/publications/cgo25.pdf) addresses reliability of learned code-analysis and optimization models.

The candidate paper question is therefore the specific bounded compiler-evidence mechanism and its held-out behavior, not the invention of mutation testing, set cover or uncertainty handling. Publication novelty remains a question for a systematic related-work review and independent evaluation.

## In the portal

Open Optimize and inspect **Can these tests expose a wrong rewrite?** The witness matrix shows detected, matched and inconclusive cells; selected rows are highlighted. The accounting section records anchors, planning executions and replay cost. The operator-held-out section exposes both positive and negative ablation findings. Normal JSON evidence export includes the full per-run audit.

Native checking remains compile-only. No submitted C/C++ is executed as a native binary by this feature.
