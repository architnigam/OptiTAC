import type {
  Program,
  Expression,
  Statement,
} from "../ast";

import { IR } from "./ir";

export class IRGenerator {
  private nextId = 1;
  private nextTemp = 1;

  generate(program: Program): IR {
    const ir = new IR();

    this.nextId = 1;
    this.nextTemp = 1;

    for (const statement of program.statements) {
      this.generateStatement(statement, ir);
    }

    return ir;
  }

  private generateStatement(
    statement: Statement,
    ir: IR
  ): void {
    if (statement.type === "VariableDeclaration") {
      const value = this.generateExpression(
        statement.initializer,
        ir
      );

      ir.add({
        id: this.nextId++,
        kind: "assign",
        target: statement.name,
        value,
      });

      return;
    }

    if (statement.type === "ReturnStatement") {
      const value = this.generateExpression(
        statement.expression,
        ir
      );

      ir.add({
        id: this.nextId++,
        kind: "return",
        value,
      });
    }
  }

  private generateExpression(
    expression: Expression,
    ir: IR
  ): string {
    if (expression.type === "LiteralExpression") {
      return String(expression.value);
    }

    if (expression.type === "IdentifierExpression") {
      return expression.name;
    }

    const left = this.generateExpression(
      expression.left,
      ir
    );

    const right = this.generateExpression(
      expression.right,
      ir
    );

    const temp = `t${this.nextTemp++}`;

    ir.add({
      id: this.nextId++,
      kind: "binary",
      target: temp,
      left,
      operator: expression.operator,
      right,
    });

    return temp;
  }
}