# Adaptive validation evidence — 29 October 2026

## Implemented contribution candidate
OptiTAC now combines online test-generator scheduling, bounded shadow-fault discrimination, branch/boundary anchors, exact compact witness selection, and actual-candidate quarantine. The UI exposes each scheduling decision and its measured cost rather than presenting a generic confidence score.

Enable **Budgeted adaptive audit (experimental)** under input settings. The full finite audit remains the default because reduced budgets can miss faults. Existing supplied checks and optimization guards run independently. Start with `npm run dev`; reproduce the experiment with `npm run evaluate:adaptive`.

## Algorithm
The scheduler chooses from deduplicated supplied, comparison-targeted, fixed and seeded-random proposals. Supplied inputs have priority; previously untried generators receive exploration priority. Thereafter the score combines cumulative marginal evidence per interpreter step and a count/cost exploration bonus. Reward is newly distinguished shadow challenges plus twice newly observed structural anchors. Updates use completed observations only, never future matrix cells or held-out evaluation labels. This is a cost-aware exploration heuristic, not a learned policy or a bandit regret guarantee.

Before each input it reserves enough executions for the AST, original IR, selected IR and every generated shadow challenge. The experimental limit is 64 interpreter executions, at most 500 steps each. Reservations may leave budget unused. Timeouts remain inconclusive. Exact suite selection applies only to observed rows; untested proposals are recorded explicitly. JSON exports include the scheduling trace.

## Measured pilot
The existing 120-program synthetic corpus excludes the evaluation fault's entire operator family from shadow generation. The evaluation fault is injected after scheduling and suite selection.

| Policy | Faults detected | Planning executions | Planning steps | Compact replay steps |
|---|---:|---:|---:|---:|
| Full finite pool | 110/120 | 11,556 | 269,760 | 15,962 |
| Fixed order, budget 64 | 109/120 | 7,296 | 166,194 | 15,916 |
| Adaptive, budget 64 | 109/120 | 7,296 | 166,194 | 15,916 |

The bounded runs used 38.4% fewer planning interpreter steps but lost one detected fault. Adaptive scheduling tied fixed ordering: this pilot does not demonstrate scheduling superiority. These are interpreter work counts, not wall-clock speedups. No budget was selected on an independent validation cohort; this is exploratory development evidence.

## Publication position and next experiments
This is a reproducible research implementation, not established publication novelty. Mutation testing, coverage scheduling, compiler fuzzing and translation validation already exist. Relevant prior work includes [Optimuzz](https://prosys.kaist.ac.kr/optimuzz/), [Alive2](https://github.com/AliveToolkit/alive2), and [hyperproperty mutation testing](https://pmc.ncbi.nlm.nih.gov/articles/PMC8550165/).

A defensible research question is whether cost-aware evidence allocation can improve unseen optimization-fault detection per total validation work while explicitly retaining unresolved evidence. Establishing that requires independent real-program holdouts, multiple budgets and seeds, uniform/random/cost-greedy/targeted baselines, independently implemented numeric or native compile-time validation oracles, and confidence intervals. Current AST/IR numeric primitives are shared; generated faults and affine-friendly synthetic inputs limit generalization. Full C/C++ execution and universal correctness are not claimed.

## Files
`src/core/research/adaptive.ts` implements scheduling; `adequacy.ts` integrates bounded execution; `src/lab/AdequacyView.tsx` renders the trail; `scripts/research/adaptive.ts` reproduces the experiment. Raw measurements are in `docs/research/adaptive-evaluation.json`.
