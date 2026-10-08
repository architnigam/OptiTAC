import type {
  Program,
  Statement,
  Expression,
} from "../ast";

import {
  SymbolTable,
  type DataType,
} from "./symbolTable";

export interface SemanticError {
  message: string;
}

export interface SemanticResult {
  success: boolean;
  errors: SemanticError[];
  symbols: SymbolTable;
}

export class SemanticAnalyzer {
  private symbols = new SymbolTable();
  private errors: SemanticError[] = [];

  analyze(program: Program): SemanticResult {
    this.symbols = new SymbolTable();
    this.errors = [];

    for (const statement of program.statements) {
      this.analyzeStatement(statement);
    }

    return {
      success: this.errors.length === 0,
      errors: this.errors,
      symbols: this.symbols,
    };
  }

  private analyzeStatement(statement: Statement): void {
    if (statement.type === "VariableDeclaration") {
      this.analyzeVariableDeclaration(statement);
      return;
    }

    if (statement.type === "ReturnStatement") {
      this.analyzeExpression(statement.expression);
    }
  }

  private analyzeVariableDeclaration(
    statement: Extract<Statement, { type: "VariableDeclaration" }>
  ): void {
    if (this.symbols.has(statement.name)) {
      this.errors.push({
        message: `Variable '${statement.name}' is already declared.`,
      });

      return;
    }

    const expressionType = this.analyzeExpression(
      statement.initializer
    );

    if (!this.isTypeCompatible(statement.dataType, expressionType)) {
      this.errors.push({
        message:
          `Cannot assign ${expressionType} expression to ` +
          `${statement.dataType} variable '${statement.name}'.`,
      });

      return;
    }

    this.symbols.declare(
      statement.name,
      statement.dataType,
      true
    );
  }

  private analyzeExpression(
    expression: Expression
  ): DataType {
    if (expression.type === "LiteralExpression") {
      return expression.dataType;
    }

    if (expression.type === "IdentifierExpression") {
      const symbol = this.symbols.lookup(expression.name);

      if (!symbol) {
        this.errors.push({
          message: `Variable '${expression.name}' is not declared.`,
        });

        return "int";
      }

      if (!symbol.initialized) {
        this.errors.push({
          message: `Variable '${expression.name}' is not initialized.`,
        });
      }

      return symbol.dataType;
    }

    if (expression.type === "BinaryExpression") {
      const leftType = this.analyzeExpression(expression.left);
      const rightType = this.analyzeExpression(expression.right);

      if (leftType === "float" || rightType === "float") {
        return "float";
      }

      return "int";
    }

    return "int";
  }

  private isTypeCompatible(
    target: DataType,
    source: DataType
  ): boolean {
    if (target === source) {
      return true;
    }

    // Allow int → float widening.
    if (target === "float" && source === "int") {
      return true;
    }

    return false;
  }
}