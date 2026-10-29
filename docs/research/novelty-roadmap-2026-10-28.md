# OptiTAC: researched extension roadmap

Research date: 28 October 2026. This is a targeted review of primary papers, author/project pages and official documentation, interpreted against the current OptiTAC implementation. It is not an exhaustive systematic literature review or a certificate of originality. Features below are proposals, not claims of implementation.

## Recommendation

Keep the compiler pipeline and choose one central research question. The strongest practical extension is **adaptive validation under a total cost budget**. The most different security extension is **paired-execution evidence preservation during optimization and test-suite compression**. Incremental evidence repair is a useful alternative if fast editing and interactive analysis are the priority.

Whichever path is selected, first improve the benchmark and oracle independence. Adding a larger model, a chatbot, a new optimization name, or another visualization alone would not resolve the present research-evidence limitations.

| Priority / role | Proposed extension | Fit with current code | Relative effort | Main evaluation burden |
| --- | --- | --- | --- | --- |
| 1: practical research focus | Adaptive validation-budget allocation | High | Medium–high | Total-cost comparison against current fixed audit and directed testing |
| 2: most different security direction | Paired-execution security witnesses | Medium–high | High | Relational properties, paired test selection and independent security examples |
| 3: interactive systems direction | Incremental evidence repair after edits | High | Medium–high | Correct invalidation, edit histories, stale-evidence attacks |
| Foundation, not headline alone | Independent semantics / small certificate checker | High | High | Definedness/refinement model, trusted-core separation |
| Numerical / semantics direction | Assumption-sensitive optimization contracts | Medium | Medium–high | Independent numerical/semantic oracle and external cases |
| Tool / computing-education direction | Evidence-calibrated learning experiments | High | Medium engineering; study time substantial | Real participants, transfer tasks and confidence calibration |
| Optional, lower fit without hardware | Cross-target / IoT optimization transfer | Medium–low | High | Toolchains and actual device measurements |

Effort estimates are judgments about relative scope, not delivery promises. Research evaluation can take longer than the feature implementation.

## 1. Adaptive validation under a total budget

### What to add

Introduce a controller that decides what to spend the next unit of analysis effort on: a targeted input, another random/input-region probe, a new shadow fault, an unresolved comparison, or a bounded solver check. It should stop with an explicit unresolved state when the budget runs out.

A first implementation can use a transparent cost-aware heuristic. A later contextual-bandit policy can learn from observed cost and evidence gains. Features might include rewrite type, unknown branch outcomes, surviving challenges, recent disagreement, and measured interpreter/solver cost. ML never overrides a concrete mismatch or converts unknown into proved-correct.

### Why it fits OptiTAC

The existing portfolio experiment accounts for 11,556 planning executions before compact replay. The next question is not merely whether the final suite is small, but whether useful evidence can be obtained with less **total** work. The current beam search, probe strategies and shadow matrix already supply actions, costs and feedback.

### Research hypothesis

Can an adaptive controller retain held-out fault detection while reducing total analysis cost compared with spending a fixed budget on every validation component?

### Prior work and remaining distinction to investigate

[Optimuzz, PLDI 2025](https://prosys.kaist.ac.kr/optimuzz/) already directs fuzzing toward compiler optimizations and uses translation validation. It includes scheduling and targeted mutation. Therefore, “directed compiler fuzzing” or “ML choosing tests” would not be new claims.

The proposed narrow angle is joint scheduling of several evidence-producing activities within an interactive compiler-validation budget, with unresolved-evidence accounting and independent fault-family evaluation. Whether this exact formulation is sufficiently distinct needs deeper comparison; this review does not establish an open gap.

### Required experiment

- Freeze an independently sourced program corpus and held-out fault operators before tuning.
- Compare fixed allocation, current exact portfolio, cost-aware greedy, a basic bandit and the proposed policy.
- Count AST, IR, challenge and solver executions, feature extraction and planning overhead. Report wall time separately.
- Measure detection versus total budget, time to first useful counterexample, valid-probe rate and unresolved cases.
- Include cases where the controller loses. Do not count timeouts as detected semantic faults.

This is the recommended first direction because it addresses a measured weakness of the existing system without requiring a new compiler front end.

## 2. Paired-execution security evidence

### What to add

Allow the user to mark input positions as public or secret and declare which outputs may reveal secret information. Run paired inputs with identical public values and different secret values. Compare source and optimized control-flow traces, using the existing branch observer as a starting point.

Distinguish four outcomes: a source-level leak preserved, a new optimized-level model leak, a removed model leak, and an ordinary functional regression. Initially analyze branch-trace behavior only; memory/cache claims require a memory model and backend/hardware analysis absent from the current interpreter.

The interesting extension to the current portfolio is that a security witness consists of **two executions**. Keeping only one side can destroy the evidence. Select suites that preserve these pair dependencies and charge for the number of distinct executions, accounting for pairs that share an input. A pair-aware graph or hypergraph formulation is more appropriate than treating every row as independent unary evidence.

### Research hypothesis

Does pair-aware witness compression preserve more held-out functional and secret-dependent trace violations than ordinary unary coverage-based compression under the same execution budget?

### Prior work and remaining distinction to investigate

[ct-verif, USENIX Security 2016](https://www.usenix.org/conference/usenixsecurity16/technical-sessions/presentation/almeida) already verifies constant-time properties of optimized LLVM code. [BINSEC/REL](https://binsec.github.io/nutshells/sp-20.html) analyzes relational security properties at binary level and studies compiler preservation. Constant-time analysis itself is not a new feature category.

[Mutation testing with hyperproperties](https://pmc.ncbi.nlm.nih.gov/articles/PMC8550165/) already connects mutation testing to properties over multiple executions. Therefore, “mutation testing plus paired runs” also cannot be claimed as unprecedented.

The candidate angle is bounded, optimizer-provenance-linked mixed functional/security witness selection, paired-cost accounting, and visual evidence preservation. It is a focused hypothesis to investigate, not confirmed novelty.

### Required experiment

- Use independently sourced scalar cryptographic/constant-time examples where the supported subset is sufficient; record excluded cases.
- Compare unary selection, treating pairs as independent units, shared-execution-cost pair selection, and retaining all pairs.
- Measure lost security witnesses, distinct execution count, functional-fault detection and solver/oracle cost.
- Evaluate held-out transformations and programs. Keep source leaks separate from optimizer-introduced leaks.
- Label interpreter-level trace findings accurately. Equal interpreter steps are not measured constant-time execution on a real CPU.

This is the strongest route if the objective is a visibly different compiler-plus-security project, but it has a larger correctness burden than direction 1.

## 3. Incremental evidence repair after source edits

### What to add

Build a dependency graph linking source bindings and blocks to IR instructions, optimization assumptions, generated input obligations and observed witnesses. After an edit, identify what remains valid, recheck dependent evidence and recompute only the affected portion. Preserve the current stale-result behavior until invalidation and rechecking complete.

Use explicit cache keys for semantics, input, IR state, pass implementation/version and execution limits. Hash equality alone is insufficient when an analysis depends on facts outside the hashed block. A cache reuse decision should have inspectable dependencies.

### Research hypothesis

Can dependency-based repair retain the detection of full reanalysis across realistic edit histories while substantially reducing total revalidation work?

### Prior work

[Incremental Verification of Compiler Optimizations, NFM 2014](https://verify.inf.usi.ch/publications/2014/incremental-verification-compiler-optimizations) already reuses safety invariants across transformations. General incremental verification and test-impact analysis also predate this project. Caching tests by itself is not novel.

The narrower candidate is repair of OptiTAC's hybrid evidence artifacts—observations, branch/boundary anchors, challenge matrices and locally checked rewrite premises—under edits and pass-order changes.

### Required experiment

Collect real edit histories or an independently designed edit corpus: variable renames, condition changes, shadowing, I/O changes, helper-function edits, type changes and pass implementation updates. Compare full reanalysis, function-level caching and dependency-level repair. Report latency, invalidations, missed regressions, reuse rate and memory cost. Include adversarial stale-evidence cases. A single incorrectly reused acceptance is material.

## 4. Independent semantic checks and assurance labels

### What to add

Create a small independent checker for a carefully specified loop-free integer fragment, using bit-vector or exact arithmetic semantics. Do not import the current shared numeric helpers. Emit local proof obligations for supported rewrites and verify them independently. Keep unsupported loops, I/O and floating point outside the proof claim until their semantics are modeled.

Expose distinct statuses: observed on inputs, checked over a finite domain, solver-validated within stated bounds, unsupported and inconclusive. Do not replace all statuses with “verified.” Model C definedness and refinement rather than asserting naive equality on undefined source behavior.

### Prior work and value

[Alive2, PLDI 2021](https://web.tecnico.ulisboa.pt/nuno.lopes/pubs.php?id=alive2-pldi21) already performs SMT-based bounded LLVM translation validation. Adding Z3 or a proof button is not an original research contribution.

This is nevertheless an important foundation: AST and IR currently share numeric primitives. Their agreement can miss a shared semantic defect. A separately implemented checker makes subsequent experimental claims stronger and can support a paper about assurance-aware evidence reuse or budget allocation.

### Required experiment

Inject deliberate shared-oracle defects, such as incorrect signed division or unchecked overflow, into a controlled test harness. Verify that AST/IR agreement misses those cases while the independent checker distinguishes them. Evaluate against reviewed native fixtures separately. State what remains trusted, including parsing and the formal fragment specification.

## 5. Assumption-sensitive optimization contracts

### What to add

Attach explicit semantic assumptions to transformations: signed versus unsigned arithmetic, overflow rules, numeric precision, permitted error, and side-effect constraints. Show which assumptions justify an optimization and generate distinguishing inputs when an assumption is changed.

For example, `(x + 1) > x` can be simplified under appropriate signed-C definedness assumptions, while unsigned wraparound changes the reasoning. A source operation invoking undefined behavior is not a valid counterexample proving the compiler wrong. Supporting this comparison requires adding unsigned types or explicitly modeled alternative semantics; the current scalar engine does not already implement them.

For numeric programs, add high-precision reference computations and user-declared error tolerances, and visualize accuracy/cost trade-offs. Keep these separate from strict behavior-preserving optimization.

### Prior work

[STACK, SOSP 2013](https://people.csail.mit.edu/nickolai/papers/wang-stack.pdf) studies security-relevant code removed because of undefined behavior. [The PLDI 2025 UB performance study](https://pldi25.sigplan.org/details/pldi-2025-papers/15/Exploiting-Undefined-Behavior-in-C-C-Programs-for-Optimization-A-Study-on-the-Perf) demonstrates that UB/optimization questions remain an active research area; it does not make UB explanation itself new.

[Herbie](https://herbie.uwplse.org/) and its [research papers](https://herbie.uwplse.org/papers.html) already optimize floating-point accuracy, precision/cost trade-offs and numeric debugging. This is a crowded area. A general floating-point optimizer would be a weak originality claim.

The candidate contribution would need to be the specific assumption-provenance/evidence mechanism or a validated teaching benefit, not another error plot.

## 6. A study of confidence and optimization understanding

### What to add

Use the current portal to run an experiment comparing ordinary step-by-step visualization, visible failing examples, and failing examples plus unresolved-evidence disclosure. Ask users to judge unseen transformations and report confidence, rather than merely answering questions already shown in the interface.

### Research hypothesis

Does showing what the tests fail to establish reduce unjustified confidence while retaining or improving correct optimization judgments?

### Prior work and opportunity

[VisOpt, SIGCSE 2025](https://graz.elsevierpure.com/en/publications/visopt-visualization-of-compiler-optimizations-for-computer-scien) evaluated an optimization teaching tool and reported improved self-efficacy without a significant overall learning-outcome improvement. [Programming-language misconception tutoring, OOPSLA 2024](https://cs.brown.edu/people/sk/Publications/Papers/Published/lk-smol-tutor/) already provides automated misconception-focused instruction. Neither a visualizer nor an adaptive quiz alone is a new research claim.

OptiTAC can instead investigate confidence calibration around evidence, undefined behavior and unseen optimization faults. This needs actual participants and a sound study design. Use a power analysis, counterbalancing/randomization where appropriate, unseen transfer tasks, delayed retention if feasible, and suitable consent/privacy procedures. Do not invent participant data or infer educational improvement from test-suite results.

This is the most direct tool/education-paper route if access to learners and a research supervisor is available.

## 7. Optional IoT / cross-target extension

Add a target profile and compare which routes preserve semantics and perform well across architectures or devices. Keep source-level semantics, estimated instruction cost and actual hardware measurements visibly separate. Predicting energy or latency requires target-specific data; the existing static IR weights are not energy measurements.

[LLVM MLGO](https://llvm.org/docs/MLGO.html) already supplies machine-learning-guided compiler optimization infrastructure, so “ML optimizes code for a device” is not a novel claim. A research question could concern how much validated evidence transfers to an unseen target and when the advisor should abstain or request new measurements.

This requires additional toolchains and, for runtime/energy claims, actual hardware measurements. It is lower priority without those resources. Keep the portal's native service compile-only; any authorized offline device experiment is a separate workflow. No native-execution capability should be silently added.

## Evaluation work needed before more feature claims

1. **Freeze external program holdouts.** The existing 120 fixtures are deliberately structured around supported affine comparisons. Operator-family holdout is not independent program holdout.
2. **Add an independent oracle for a declared fragment.** AST/IR agreement currently shares numeric assumptions.
3. **Count total costs.** Include generation, model inference, planning, mutation execution, solver calls and replay. Keep static IR cost separate from runtime speed.
4. **Use stronger baselines.** Greedy tied exact selection on the existing pilot. Do not claim a practical DP advantage without new evidence. Directed compiler testing and symbolic checking are important comparison categories.
5. **Publish exclusions and negative results.** Unsupported arrays, pointers, templates, interprocedural conditions and native-runtime behavior cannot be treated as passing cases.
6. **Version the experiment.** Freeze code, corpus provenance, seeds, training split, operator holdout, time limits and result aggregation before scoring final holdouts.

[LLVM Opt Benchmark's maintained successor](https://github.com/dtcxzyw/llvm-opt-benchmark-nightly) is a source of real LLVM IR research artifacts, but it is not directly executable by OptiTAC's current custom IR interpreter. It would require an LLVM-backed research harness, not simply importing it and claiming coverage. [Optimuzz's public artifacts](https://github.com/prosyslab/optimuzz) are another comparison resource for an LLVM-backed workflow.

## Recommended choice

For the existing project and codebase: pursue **adaptive total-budget validation**, supported by an independent small semantic checker and external holdouts. This addresses a concrete measured limitation of the current audit.

For a larger, visibly different security project addition: pursue **paired-execution evidence preservation**, including pair-aware suite selection and model-level leak classification. Study the relational-security and hyperproperty prior work before claiming an original method.

For an education-oriented publication: use the current implementation as an experimental instrument and evaluate confidence calibration and transfer. Additional algorithms are not a substitute for the human evidence required by that claim.

All three recommendations preserve OptiTAC's compiler-pipeline identity. None is certified globally novel by this targeted review. The next research step is a precise problem formulation and related-work comparison for one selected direction, not implementing every item on this list.
