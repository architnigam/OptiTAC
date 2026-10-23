
import type { TACInstruction } from "../ir";
import { isNumeric } from '../numeric';
import type { OptimizationLog } from "./constantPropagation";

function text(instruction: TACInstruction): string {
  if (instruction.kind === "assign") {
    return `${instruction.target} = ${instruction.value}`;
  }
  if (instruction.kind === "binary") {
    return `${instruction.target} = ${instruction.left} ${instruction.operator} ${instruction.right}`;
  }
  return `return ${instruction.value}`;
}

export function copyPropagation(
  instructions: TACInstruction[]
): { instructions: TACInstruction[]; logs: OptimizationLog[] } {
  const copies = new Map<string, string>();
  const logs: OptimizationLog[] = [];
  const result: TACInstruction[] = [];

  function resolve(value: string): string {
    const visited = new Set<string>();

    while (copies.has(value) && !visited.has(value)) {
      visited.add(value);
      value = copies.get(value)!;
    }

    return value;
  }

  function invalidate(target: string) {
    copies.delete(target);

    for (const [name, source] of copies) {
      if (source === target) {
        copies.delete(name);
      }
    }
  }

  for (const instruction of instructions) {
    if (instruction.kind === "return") {
      const value = resolve(instruction.value);
      const updated = { ...instruction, value };

      if (value !== instruction.value) {
        logs.push({
          pass: "Copy Propagation",
          instructionId: instruction.id,
          before: text(instruction),
          after: text(updated),
          reason: "Replaced a temporary copy with its source."
        });
      }

      result.push(updated);
      continue;
    }

    if (instruction.kind === "assign") {
      const value = resolve(instruction.value);
      invalidate(instruction.target);

      const updated = { ...instruction, value };

      if (value !== instruction.value) {
        logs.push({
          pass: "Copy Propagation",
          instructionId: instruction.id,
          before: text(instruction),
          after: text(updated),
          reason: "Replaced a copied variable with its source."
        });
      }

      if (!isNumeric(value)) {
        copies.set(instruction.target, value);
      }

      result.push(updated);
      continue;
    }

    const left = resolve(instruction.left);
    const right = resolve(instruction.right);

    invalidate(instruction.target);

    const updated = { ...instruction, left, right };

    if (left !== instruction.left || right !== instruction.right) {
      logs.push({
        pass: "Copy Propagation",
        instructionId: instruction.id,
        before: text(instruction),
        after: text(updated),
        reason: "Replaced copied operands with their sources."
      });
    }

    result.push(updated);
  }

  return { instructions: result, logs };
}
