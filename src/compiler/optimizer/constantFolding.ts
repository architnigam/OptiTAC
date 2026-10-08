import type { TACInstruction } from "../ir";

export interface FoldingLog {
  pass: string;
  instructionId: number;
  before: string;
  after: string;
  reason: string;
}

function isNumber(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}

function calculate(
  left: number,
  operator: string,
  right: number
): number {
  switch (operator) {
    case "+":
      return left + right;

    case "-":
      return left - right;

    case "*":
      return left * right;

    case "/":
      return left / right;

    case "%":
      return left % right;

    default:
      throw new Error(
        `Unsupported operator '${operator}'.`
      );
  }
}

export function constantFolding(
  instructions: TACInstruction[]
): {
  instructions: TACInstruction[];
  logs: FoldingLog[];
} {
  const logs: FoldingLog[] = [];

  const result = instructions.map((instruction) => {
    if (
      instruction.kind !== "binary" ||
      !isNumber(instruction.left) ||
      !isNumber(instruction.right)
    ) {
      return instruction;
    }

    const left = Number(instruction.left);
    const right = Number(instruction.right);

    if (instruction.operator === "/" && right === 0) {
      return instruction;
    }

    const value = calculate(
      left,
      instruction.operator,
      right
    );

    const updated: TACInstruction = {
      id: instruction.id,
      kind: "assign",
      target: instruction.target,
      value: String(value),
    };

    logs.push({
      pass: "Constant Folding",
      instructionId: instruction.id,
      before:
        `${instruction.target} = ` +
        `${instruction.left} ${instruction.operator} ${instruction.right}`,
      after:
        `${instruction.target} = ${value}`,
      reason:
        "Both operands are compile-time constants.",
    });

    return updated;
  });

  return {
    instructions: result,
    logs,
  };
}