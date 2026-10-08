import type { TACInstruction } from "../ir";

import {
  constantPropagation,
  type OptimizationLog,
} from "./constantPropagation";

import {
  constantFolding,
} from "./constantFolding";

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
  let logs: OptimizationLog[] = [];

  if (options.constantPropagation) {
    const result = constantPropagation(current);

    current = result.instructions;
    logs = [...logs, ...result.logs];
  }

  if (options.constantFolding) {
    const result = constantFolding(current);

    current = result.instructions;
    logs = [...logs, ...result.logs];
  }

  return {
    instructions: current,
    logs,
  };
}