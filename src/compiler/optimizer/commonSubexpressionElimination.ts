
import type { TACInstruction } from "../ir";
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

export function commonSubexpressionElimination(
  instructions: TACInstruction[]
): { instructions: TACInstruction[]; logs: OptimizationLog[] } {
  const expressions = new Map<string, string>();
  const logs: OptimizationLog[] = [];
  const result: TACInstruction[] = [];

  function invalidate(variable: string) {
    for (const [key, target] of expressions) {
      const parts = key.split("|");
      if (target === variable || parts[0] === variable || parts[2] === variable) {
        expressions.delete(key);
      }
    }
  }

  for (const instruction of instructions) {
    if (instruction.kind === "return") {
      result.push(instruction);
      continue;
    }

    if (instruction.kind === "assign") {
      invalidate(instruction.target);
      result.push(instruction);
      continue;
    }

    invalidate(instruction.target);

    const { left, right, operator } = instruction;

    // Addition and multiplication can safely reuse reversed operands
    // for ordinary numeric arithmetic.
    let first = left;
    let second = right;

    if (
      (operator === "+" || operator === "*") &&
      first > second
    ) {
      [first, second] = [second, first];
    }

    const key = `${first}|${operator}|${second}`;
    const existing = expressions.get(key);

    if (existing !== undefined) {
      const updated: TACInstruction = {
        id: instruction.id,
        kind: "assign",
        target: instruction.target,
        value: existing
      };

      logs.push({
        pass: "Common Subexpression Elimination",
        instructionId: instruction.id,
        before: text(instruction),
        after: text(updated),
        reason: `Reused the previously computed expression stored in '${existing}'.`
      });

      result.push(updated);
    } else {
      expressions.set(key, instruction.target);
      result.push(instruction);
    }
  }

  return { instructions: result, logs };
}