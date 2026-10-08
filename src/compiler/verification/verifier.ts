import type { TACInstruction } from "../ir";

import {
  executeTAC,
  type ExecutionResult,
} from "./interpreter";

export interface VerificationResult {
  passed: boolean;
  original: ExecutionResult;
  optimized: ExecutionResult;
  message: string;
}

export function verifyOptimization(
  original: TACInstruction[],
  optimized: TACInstruction[]
): VerificationResult {
  const originalResult = executeTAC(original);
  const optimizedResult = executeTAC(optimized);

  if (
    originalResult.success &&
    optimizedResult.success &&
    originalResult.returnValue ===
      optimizedResult.returnValue
  ) {
    return {
      passed: true,
      original: originalResult,
      optimized: optimizedResult,
      message:
        "The optimized program preserved the observed result.",
    };
  }

  return {
    passed: false,
    original: originalResult,
    optimized: optimizedResult,
    message:
      "The original and optimized programs produced different results.",
  };
}