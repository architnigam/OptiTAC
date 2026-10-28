# Compiler Lab: implementation and novelty

## Project workflow

1. Choose C11 or C++14, an example, or a source program. Enter independent stdin cases in the input settings.
2. Analyze runs lexical, syntax and semantic stages in a Web Worker. The editor remains responsive and the analysis can be cancelled.
3. Inspect six stage tabs. Token selection highlights the original source; syntax and type artifacts explain accepted and rejected constructs.
4. Flow & IR shows typed lowering, real control-flow successors and live-variable sets. For broader programs, request GCC artifacts separately.
5. Optimize exposes candidate routes, before/after IR, omitted-pass counterfactuals, structure and detailed intermediate logs.
6. Results compares the AST reference, original IR and selected IR on each supplied input, including stdout, typed return, status and execution trace. Export preserves evidence and special numeric values.

Native checking is compile-only, as selected by the project owner. The native service never runs submitted programs. GCC syntax rejection prevents the UI from presenting a successful execution claim. Native compiler unavailability and visual-subset rejection remain distinct conditions.

## Research-oriented contribution

The contribution is an **inspectable, observation-guarded optimization-route laboratory**. It combines established algorithms into one educational and experimental workflow:

- Conditional constant propagation uses a worklist and joins facts on discovered incoming edges. Typed folding respects the interpreter's numeric contract.
- Reachability removes unreachable instructions. Backward liveness iterates to a fixed point. Dead-temporary elimination removes only safe unused literals/copies; it retains potentially erroneous operations and effects.
- Beam search explores pass orders with width 3, depth 4 and at most 32 distinct transformed candidates. Static cost assigns compute 3, branch 2, other executable instructions 1, and structural instructions 0. This is a cost proxy, not measured runtime speedup.
- Each candidate must match the AST reference's complete stdout and typed return for every supplied case. The original IR is checked too. Unsuccessful, undefined or limited runs cannot validate a candidate.
- An optional deliberately incorrect return mutation demonstrates a concrete counterexample. It is always excluded from selection, even if supplied inputs fail to expose it.
- Counterfactuals omit one pass from the chosen fixed route and replay the remainder. They explain route interaction; they are not a fresh beam search or causal proof of global optimality.
- The native artifact view puts the educational IR beside real GCC representations, while keeping native compilation separate from visual interpretation.
- A trained multi-output random forest predicts per-pass static-cost savings and guides expansion order. Its predictions, calibration errors and tree-path explanations are visible. An envelope check abstains on unsupported feature ranges.
- Generated integer boundary probes add bounded behavior comparisons. A negative-input regression test demonstrates a bad transformation rejected despite matching its supplied positive input.

This is a substantive project contribution, not a claim that random forests, beam search, dataflow analysis or differential testing are newly invented. Publication would require literature comparison, a defined research question, independent benchmark programs, ablations and external evaluation. No universal uniqueness or acceptance claim is made. The active system now includes a trained model and an explicit ML-on/ML-off setting. See the [model card](ml/model-card.md) for the implemented contribution and evaluation.

## Visual language contract

Supported constructs include scalar int/float/double/bool/char values, declarations, lexical scopes, assignment and compound assignment, prefix/postfix updates, arithmetic/comparison/bitwise/logical operators, short-circuit evaluation, ternary expressions, casts, if/else, while/for, break/continue, scalar functions and bounded recursion. Supported adapters include selected printf/scanf/puts/putchar/math operations and successful C++ cin/cout operations. The parser recognizes standard includes and using namespace std. C `_Bool` and stdbool aliases are distinguished from C++ keywords.

Signed integers are 32-bit and checked for overflow. Division truncates toward zero; zero division, invalid shifts and uninitialized reads are diagnosed. Float values round through binary32; double values use binary64. ASCII character semantics, signed zero, formatted output rounding and lexical binding identity are preserved. Unsupported wide integer literals are rejected rather than silently truncated; spell INT_MIN as `-2147483647 - 1` within this contract. Some implementation-defined operations are deliberately diagnosed instead of assuming host behavior.

The visual interpreter excludes pointers, arrays, classes, templates, general preprocessing, arbitrary standard libraries and operating-system facilities. Stream adapter names cannot be shadowed in the visual subset. printf supports selected d/f/lf/g/c/s conversions and bounded widths; scanf supports selected d/f/lf/c conversions. Unsupported format flags, non-finite input and unsupported stream-failure behavior are explicit diagnostics. These restrictions appear as limitations rather than fabricated execution output.

The default execution budget is 20,000 steps, configurable up to 100,000; call depth is limited to 48, stdout to 16,000 characters and displayed trace to 160 events. Up to 12 test inputs are compared. Budget exhaustion means inconclusive. AST and IR have separate control-flow execution paths but share numeric primitives, so their agreement alone cannot detect every shared numeric defect. Native differential fixtures provide an additional independent check.

## Broader C/C++ support

The localhost service invokes GCC/G++ with C11/C++14, strict syntax diagnostics, source/time/output limits, and an allowlist of standard headers. Native source checking uses syntax-only mode. Artifact generation uses `-S -O1` with tree/GIMPLE/CFG dumps; temporary assembly and dumps are removed afterward. It does not assemble, link or execute a submitted program. This enables inspection of classes, containers and other native constructs without pretending that the scalar interpreter implements them.

Compiler configuration is local and optional. No source is sent to a remote model or external API. Compile limits do not constitute an OS security sandbox. The development differential suite separately compiles and runs fixed generated fixtures; that test harness is not an application endpoint.

## Evaluation

Verified on 27 October 2026: **254 tests passed, zero failed, zero skipped**; production build and lint passed. The complete browser workflow passed with no page errors, including native artifact generation and mobile layout checks. `npm run dev` startup was also confirmed.

Updated on 28 October 2026: **269 tests passed, zero failed, zero skipped** after integration of the trained forest and generated boundary-input audit. Build and lint passed. The model's synthetic holdout and separate paired search evaluation are documented in the [model card](ml/model-card.md).

The active engine tests cover operator categories, lexical modes, scopes, short-circuiting, functions/recursion, typed arithmetic, formatted I/O, undefined behavior, limits, optimizers and counterexamples. Native differential coverage includes 240 generated integer expressions, 100 generated loop/function programs and 14 fixed C/C++ fixtures. A separate matrix checks 16 optimization-pass subsets across 16 input cases. Existing legacy engine tests remain in the suite but are separate from the active engine's coverage.

Browser verification covers all nine examples, six stages, source selection, detailed logs, evidence export, challenge persistence, intentional-candidate rejection, undefined behavior, native syntax rejection, broader native artifacts and narrow mobile layouts. Machine-readable results and screenshots are generated under `tmp/lab/`. A passing test suite demonstrates the checked cases; it cannot establish 100% correctness for arbitrary C/C++ programs.

## Technical references

- [LLVM pass documentation](https://llvm.org/docs/Passes.html): established optimization and dataflow context.
- [GCC compilation options](https://gcc.gnu.org/onlinedocs/gcc/Overall-Options.html): syntax-only and compilation-stage behavior.
- [C11 committee draft](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf): language semantics reference.
- [Alive2](https://github.com/AliveToolkit/alive2): related translation-validation work; OptiTAC's finite observation checks are not Alive2-style formal verification.
