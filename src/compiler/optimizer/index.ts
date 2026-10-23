
export { optimize } from "./optimizer";

export type {
  OptimizationOptions,
  OptimizationResult,
} from "./optimizer";

export type { OptimizationLog } from "./constantPropagation";

export { constantPropagation } from "./constantPropagation";
export { constantFolding } from "./constantFolding";
export { commonSubexpressionElimination } from "./commonSubexpressionElimination";
export { copyPropagation } from "./copyPropogation";
export { deadCodeElimination } from "./deadCodeElimination";