import type { TACInstruction } from "../ir";

export interface OptimizationLog {
  pass: string;
  instructionId: number;
  before: string;
  after: string;
  reason: string;
}

function instructionToText(
  instruction: TACInstruction
): string {
  if (instruction.kind === "assign") {
    return `${instruction.target} = ${instruction.value}`;
  }

  if (instruction.kind === "binary") {
    return (
      `${instruction.target} = ` +
      `${instruction.left} ${instruction.operator} ${instruction.right}`
    );
  }

  return `return ${instruction.value}`;
}

export function constantPropagation(
  instructions: TACInstruction[]
): {
  instructions: TACInstruction[];
  logs: OptimizationLog[];
} {
  const constants = new Map<string, string>();
  const logs: OptimizationLog[] = [];

  const result = instructions.map((instruction) => {
    if (instruction.kind === "assign") {
      if (/^-?\d+(\.\d+)?$/.test(instruction.value)) {
        constants.set(instruction.target, instruction.value);
      }

      if (constants.has(instruction.value)) {
        const before = instructionToText(instruction);
        const replacement = constants.get(instruction.value)!;

        const updated = {
          ...instruction,
          value: replacement,
        };

        logs.push({
          pass: "Constant Propagation",
          instructionId: instruction.id,
          before,
          after: instructionToText(updated),
          reason:
            `${instruction.value} has a known constant value ` +
            `${replacement}.`,
        });

        constants.set(instruction.target, replacement);

        return updated;
      }

      return instruction;
    }

    if (instruction.kind === "binary") {
      const before = instructionToText(instruction);

      const left = constants.get(instruction.left)
        ?? instruction.left;

      const right = constants.get(instruction.right)
        ?? instruction.right;

      const updated = {
        ...instruction,
        left,
        right,
      };

      if (before !== instructionToText(updated)) {
        logs.push({
          pass: "Constant Propagation",
          instructionId: instruction.id,
          before,
          after: instructionToText(updated),
          reason:
            "A variable used in this expression has a known constant value.",
        });
      }

      return updated;
    }

    if (instruction.kind === "return") {
      const value =
        constants.get(instruction.value)
        ?? instruction.value;

      return {
        ...instruction,
        value,
      };
    }

    return instruction;
  });

  return {
    instructions: result,
    logs,
  };
}