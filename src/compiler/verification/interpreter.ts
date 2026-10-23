import type { TACInstruction } from "../ir";

export interface ExecutionResult {
  success: boolean;
  returnValue?: number;
  error?: string;
  trace?: ExecutionTraceEntry[];
}

export interface ExecutionTraceEntry {
  instructionId: number;
  kind: TACInstruction['kind'];
  variables: Record<string, number>;
  returnValue?: number;
  error?: string;
}

export function executeTAC(
  instructions: TACInstruction[],
  captureTrace = false
): ExecutionResult {
  const variables = new Map<string, number>();
  const trace: ExecutionTraceEntry[] = [];
  let active: TACInstruction | undefined;
  const record = (instruction: TACInstruction, extra: Partial<ExecutionTraceEntry> = {}) => {
    if (captureTrace) trace.push({ instructionId: instruction.id, kind: instruction.kind,
      variables: Object.fromEntries(variables), ...extra });
  };

  try {
    for (const instruction of instructions) {
      active = instruction;
      if (instruction.kind === "assign") {
        const value = getValue(
          instruction.value,
          variables
        );

        variables.set(
          instruction.target,
          value
        );

        record(instruction);
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

        record(instruction);
        continue;
      }

      if (instruction.kind === "return") {
        const returnValue = getValue(instruction.value, variables);
        record(instruction, { returnValue });
        return {
          success: true,
          returnValue,
          ...(captureTrace ? { trace } : {}),
        };
      }
    }

    return {
      success: false,
      error: "Program did not return a value.",
      ...(captureTrace ? { trace } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error.";
    if (active) record(active, { error: message });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown execution error.",
      ...(captureTrace ? { trace } : {}),
    };
  }
}

function getValue(
  value: string,
  variables: Map<string, number>
): number {
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
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
