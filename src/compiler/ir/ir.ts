import type {
  TACInstruction,
} from "./instruction";

export class IR {
  private instructions: TACInstruction[] = [];

  add(instruction: TACInstruction): void {
    this.instructions.push(instruction);
  }

  getInstructions(): TACInstruction[] {
    return [...this.instructions];
  }

  toText(): string {
    return this.instructions
      .map((instruction) => {
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
      })
      .join("\n");
  }
}