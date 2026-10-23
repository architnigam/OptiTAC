
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

function usedVariables(instruction: TACInstruction): string[] {
  if (instruction.kind === "assign") {
    return [instruction.value];
  }
  if (instruction.kind === "binary") {
    return [instruction.left, instruction.right];
  }
  return [instruction.value];
}

export function deadCodeElimination(
  instructions: TACInstruction[]
): { instructions: TACInstruction[]; logs: OptimizationLog[] } {
  const live = new Set<string>();
  const keep = new Array<boolean>(instructions.length).fill(false);
  const logs: OptimizationLog[] = [];

  for (let i = instructions.length - 1; i >= 0; i--) {
    const instruction = instructions[i];

    if (instruction.kind === "return") {
      keep[i] = true;
      for (const variable of usedVariables(instruction)) {
        live.add(variable);
      }
      continue;
    }

    const target = instruction.target;
    // Division/modulo may trap even when their result is unused.
    const needed = live.has(target) || (instruction.kind === "binary" &&
      (instruction.operator === "/" || instruction.operator === "%"));

    if (!needed) {
      logs.push({
        pass: "Dead Code Elimination",
        instructionId: instruction.id,
        before: text(instruction),
        after: "(removed)",
        reason: `The result stored in '${target}' is never used.`
      });
      continue;
    }

    keep[i] = true;
    live.delete(target);

    for (const variable of usedVariables(instruction)) {
      live.add(variable);
    }
  }

  return {
    instructions: instructions.filter((_, i) => keep[i]),
    logs
  };
}
