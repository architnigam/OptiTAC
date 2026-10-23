# Compiler Town: implementation notes

## Changes
The workbench is now an eight-stop spatial learning portal with a reusable source parcel. Each pipeline stop has stage-specific artifacts, a short explanation and expandable long sections. Pipeline Express keeps the whole-route view concise and offers replay controls. A seven-question passport rewards correct answers once per question; progress persists in localStorage when available. There are no locks, fake XP for compilation, accounts or source uploads.

The previous optimization tools remain inside Repair Garage, including the fourth Logs tab, per-pass/round navigation, complete TAC, a change ledger, rewrite reasons and actual interpreter variable-state traces. Watchtower separates runtime errors from successful execution. The controlled injected-fault option remains explicitly labelled.

## New modules
- src/compiler/journey.ts: progressive frontend execution and retention of earlier artifacts on later failures.
- src/compiler/ml/scout.ts: deterministic synthetic corpus, training-only scaling, k=5 weighted regression, isolated-pass labels and held-out evaluation.
- src/compiler/numeric.ts: consistent scientific-notation recognition and signed-zero-preserving serialization for constant folding.
- src/town/content.ts: places, sample deliveries and questions.
- src/town/ShopArt.tsx: code-native shop illustrations.
- src/town/StageViews.tsx: stage explanations, artifact views, experiments and challenges.
- src/compiler/portal.test.ts: independent arithmetic-oracle tests, stage regressions, numerical regressions and ML checks.

## Correctness work
The expanded oracle tests cover all 32 optimization-pass subsets for 60 generated expression trees. Signed zero is now preserved when constant folding writes numeric operands; scientific notation is recognized consistently across passes. Oversize programs are rejected before expensive replay. Erroring programs are compared using their actual errors; this is not proof of C semantics or universal equivalence.

## ML interpretation
Predicting isolated rewrite counts is intentionally separate from optimization safety. The model is checked against measured compiler outcomes, not trusted to decide correctness. The visible nearest neighbors, features, baseline and held-out score make its limits inspectable. The synthetic score is 43 of 48 top choices versus 42 of 48 for a majority-pass baseline, with ties accepted. No statistically significant advantage or external generalization is claimed.

## Novelty position
Spatial artifact continuity, error-aware optimization experiments, counterfactual omissions and an evidence-checked ML recommendation form the proposed integrated contribution. Existing tools already provide pass debugging, optimization explanations and translation validation. A wider tool comparison and controlled learner study would be needed to establish a publishable education or systems contribution.
