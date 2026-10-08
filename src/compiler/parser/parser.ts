import { TokenType } from "../lexer/token";
import type { Token } from "../lexer/token";
import type {
  BinaryExpression,
  Expression,
  LiteralExpression,
  Program,
  ReturnStatement,
  Statement,
  VariableDeclaration,
  IdentifierExpression,
} from "../ast/nodes";

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Program {
    const statements: Statement[] = [];

    while (!this.isAtEnd()) {
      statements.push(this.statement());
    }

    return {
      type: "Program",
      statements,
    };
  }

  private statement(): Statement {
    if (this.match(TokenType.Int)) {
      return this.variableDeclaration("int");
    }

    if (this.match(TokenType.Float)) {
      return this.variableDeclaration("float");
    }

    if (this.match(TokenType.Return)) {
      return this.returnStatement();
    }

    throw this.error(`Unexpected token '${this.peek().lexeme}'`);
  }

  private variableDeclaration(
    dataType: "int" | "float",
  ): VariableDeclaration {
    const name = this.consume(
      TokenType.Identifier,
      "Expected variable name.",
    );

    this.consume(
      TokenType.Assign,
      "Expected '=' after variable name.",
    );

    const initializer = this.expression();

    this.consume(
      TokenType.Semicolon,
      "Expected ';' after variable declaration.",
    );

    return {
      type: "VariableDeclaration",
      dataType,
      name: name.lexeme,
      initializer,
    };
  }

  private returnStatement(): ReturnStatement {
    const expression = this.expression();

    this.consume(
      TokenType.Semicolon,
      "Expected ';' after return value.",
    );

    return {
      type: "ReturnStatement",
      expression,
    };
  }

  private expression(): Expression {
    return this.addition();
  }

  private addition(): Expression {
    let expression = this.multiplication();

    while (
      this.match(TokenType.Plus) ||
      this.match(TokenType.Minus)
    ) {
      const operator = this.previous().lexeme;
      const right = this.multiplication();

      const binary: BinaryExpression = {
        type: "BinaryExpression",
        operator,
        left: expression,
        right,
      };

      expression = binary;
    }

    return expression;
  }

  private multiplication(): Expression {
    let expression = this.primary();

    while (
      this.match(TokenType.Multiply) ||
      this.match(TokenType.Divide) ||
      this.match(TokenType.Modulo)
    ) {
      const operator = this.previous().lexeme;
      const right = this.primary();

      const binary: BinaryExpression = {
        type: "BinaryExpression",
        operator,
        left: expression,
        right,
      };

      expression = binary;
    }

    return expression;
  }

  private primary(): Expression {
    if (this.match(TokenType.IntegerLiteral)) {
      const token = this.previous();

      const literal: LiteralExpression = {
        type: "LiteralExpression",
        value: Number(token.lexeme),
        dataType: "int",
      };

      return literal;
    }

    if (this.match(TokenType.FloatLiteral)) {
      const token = this.previous();

      const literal: LiteralExpression = {
        type: "LiteralExpression",
        value: Number(token.lexeme),
        dataType: "float",
      };

      return literal;
    }

    if (this.match(TokenType.Identifier)) {
      const token = this.previous();

      const identifier: IdentifierExpression = {
        type: "IdentifierExpression",
        name: token.lexeme,
      };

      return identifier;
    }

    if (this.match(TokenType.LeftParen)) {
      const expression = this.expression();

      this.consume(
        TokenType.RightParen,
        "Expected ')' after expression.",
      );

      return expression;
    }

    throw this.error(
      `Expected expression, found '${this.peek().lexeme}'`,
    );
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }

    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }

    throw this.error(message);
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) {
      return type === TokenType.EOF;
    }

    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }

    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private error(message: string): Error {
    const token = this.peek();

    return new Error(
      `${message} at line ${token.line}, column ${token.column}`,
    );
  }
}