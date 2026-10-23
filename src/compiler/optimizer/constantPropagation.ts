
import type { TACInstruction } from "../ir";
import { isNumeric } from '../numeric';

export interface OptimizationLog {
  pass: string;
  instructionId: number;
  before: string;
  after: string;
  reason: string;
}

const isNumber = (value: string) =>
  isNumeric(value);

function text(instruction: TACInstruction): string {
  if (instruction.kind === "assign") {
    return `${instruction.target} = ${instruction.value}`;
  }
  if (instruction.kind === "binary") {
    return `${instruction.target} = ${instruction.left} ${instruction.operator} ${instruction.right}`;
  }
  return `return ${instruction.value}`;
}

export function constantPropagation(
  instructions: TACInstruction[]
): { instructions: TACInstruction[]; logs: OptimizationLog[] } {
  const constants = new Map<string, string>();
  const logs: OptimizationLog[] = [];
  const result: TACInstruction[] = [];

  for (const instruction of instructions) {
    if (instruction.kind === "return") {
      const value = constants.get(instruction.value) ?? instruction.value;
      const updated = { ...instruction, value };

      if (value !== instruction.value) {
        logs.push({
          pass: "Constant Propagation",
          instructionId: instruction.id,
          before: text(instruction),
          after: text(updated),
          reason: "Replaced a variable with its known constant value."
        });
      }

      result.push(updated);
      continue;
    }

    if (instruction.kind === "assign") {
      const value = constants.get(instruction.value) ?? instruction.value;

      // Reassignment invalidates the old value of this variable.
      constants.delete(instruction.target);

      const updated = { ...instruction, value };

      if (value !== instruction.value) {
        logs.push({
          pass: "Constant Propagation",
          instructionId: instruction.id,
          before: text(instruction),
          after: text(updated),
          reason: "Replaced a variable with its known constant value."
        });
      }

      if (isNumber(value)) {
        constants.set(instruction.target, value);
      }

      result.push(updated);
      continue;
    }

    // A binary instruction changes its target's value.
    const left = constants.get(instruction.left) ?? instruction.left;
    const right = constants.get(instruction.right) ?? instruction.right;

    constants.delete(instruction.target);

    const updated = { ...instruction, left, right };

    if (left !== instruction.left || right !== instruction.right) {
      logs.push({
        pass: "Constant Propagation",
        instructionId: instruction.id,
        before: text(instruction),
        after: text(updated),
        reason: "Replaced operands with known constant values."
      });
    }

    result.push(updated);
  }

  return { instructions: result, logs };
}
