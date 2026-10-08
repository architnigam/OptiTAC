import type { TACInstruction } from "../ir";

export interface ExecutionResult {
  success: boolean;
  returnValue?: number;
  error?: string;
}

export function executeTAC(
  instructions: TACInstruction[]
): ExecutionResult {
  const variables = new Map<string, number>();

  try {
    for (const instruction of instructions) {
      if (instruction.kind === "assign") {
        const value = getValue(
          instruction.value,
          variables
        );

        variables.set(
          instruction.target,
          value
        );

        continue;
      }

      if (instruction.kind === "binary") {
        const left = getValue(
          instruction.left,
          variables
        );

        const right = getValue(
          instruction.right,
          variables
        );

        let result: number;

        switch (instruction.operator) {
          case "+":
            result = left + right;
            break;

          case "-":
            result = left - right;
            break;

          case "*":
            result = left * right;
            break;

          case "/":
            if (right === 0) {
              throw new Error("Division by zero.");
            }

            result = left / right;
            break;

          case "%":
            if (right === 0) {
              throw new Error("Modulo by zero.");
            }

            result = left % right;
            break;

          default:
            throw new Error(
              `Unknown operator '${instruction.operator}'.`
            );
        }

        variables.set(
          instruction.target,
          result
        );

        continue;
      }

      if (instruction.kind === "return") {
        return {
          success: true,
          returnValue: getValue(
            instruction.value,
            variables
          ),
        };
      }
    }

    return {
      success: false,
      error: "Program did not return a value.",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown execution error.",
    };
  }
}

function getValue(
  value: string,
  variables: Map<string, number>
): number {
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  const variable = variables.get(value);

  if (variable === undefined) {
    throw new Error(
      `Variable '${value}' is not defined.`
    );
  }

  return variable;
}