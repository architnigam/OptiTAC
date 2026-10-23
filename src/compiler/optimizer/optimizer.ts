
import type { TACInstruction } from "../ir";

import {
  constantPropagation,
  type OptimizationLog,
} from "./constantPropagation";

import { constantFolding } from "./constantFolding";
import { commonSubexpressionElimination } from "./commonSubexpressionElimination";
import { copyPropagation } from "./copyPropogation";
import { deadCodeElimination } from "./deadCodeElimination";

export interface OptimizationOptions {
  constantPropagation: boolean;
  constantFolding: boolean;
}

export interface OptimizationResult {
  instructions: TACInstruction[];
  logs: OptimizationLog[];
}

export function optimize(
  instructions: TACInstruction[],
  options: OptimizationOptions
): OptimizationResult {
  let current = [...instructions];
  const logs: OptimizationLog[] = [];

  // Repeat because one optimization may enable another.
  for (let iteration = 0; iteration < 10; iteration++) {
    const before = JSON.stringify(current);

    if (options.constantPropagation) {
      const result = constantPropagation(current);
      current = result.instructions;
      logs.push(...result.logs);
    }

    if (options.constantFolding) {
      const result = constantFolding(current);
      current = result.instructions;
      logs.push(...result.logs);
    }

    {
      const result = commonSubexpressionElimination(current);
      current = result.instructions;
      logs.push(...result.logs);
    }

    {
      const result = copyPropagation(current);
      current = result.instructions;
      logs.push(...result.logs);
    }

    {
      const result = deadCodeElimination(current);
      current = result.instructions;
      logs.push(...result.logs);
    }

    if (JSON.stringify(current) === before) {
      break;
    }
  }

  return { instructions: current, logs };
}