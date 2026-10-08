import { TokenType } from "./token";
import type { Token } from "./token";

export class Lexer {
  private source: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      const token = this.scanToken();

      if (token !== null) {
        tokens.push(token);
      }
    }

    tokens.push({
      type: TokenType.EOF,
      lexeme: "",
      line: this.line,
      column: this.column,
    });

    return tokens;
  }

  private scanToken(): Token | null {
    this.skipWhitespace();

    if (this.isAtEnd()) {
      return null;
    }

    const startLine = this.line;
    const startColumn = this.column;
    const char = this.advance();

    // Identifiers and keywords
    if (this.isLetter(char) || char === "_") {
      return this.identifier(startLine, startColumn, char);
    }

    // Numbers
    if (this.isDigit(char)) {
      return this.number(startLine, startColumn, char);
    }

    switch (char) {
      case "+":
        return this.createToken(TokenType.Plus, char, startLine, startColumn);

      case "-":
        return this.createToken(TokenType.Minus, char, startLine, startColumn);

      case "*":
        return this.createToken(
          TokenType.Multiply,
          char,
          startLine,
          startColumn,
        );

      case "/":
        return this.createToken(
          TokenType.Divide,
          char,
          startLine,
          startColumn,
        );

      case "%":
        return this.createToken(
          TokenType.Modulo,
          char,
          startLine,
          startColumn,
        );

      case "=":
        if (this.match("=")) {
          return this.createToken(
            TokenType.Equal,
            "==",
            startLine,
            startColumn,
          );
        }

        return this.createToken(
          TokenType.Assign,
          "=",
          startLine,
          startColumn,
        );

      case "!":
        if (this.match("=")) {
          return this.createToken(
            TokenType.NotEqual,
            "!=",
            startLine,
            startColumn,
          );
        }

        throw this.error("Unexpected character '!'");

      case "<":
        if (this.match("=")) {
          return this.createToken(
            TokenType.LessEqual,
            "<=",
            startLine,
            startColumn,
          );
        }

        return this.createToken(
          TokenType.LessThan,
          "<",
          startLine,
          startColumn,
        );

      case ">":
        if (this.match("=")) {
          return this.createToken(
            TokenType.GreaterEqual,
            ">=",
            startLine,
            startColumn,
          );
        }

        return this.createToken(
          TokenType.GreaterThan,
          ">",
          startLine,
          startColumn,
        );

      case "(":
        return this.createToken(
          TokenType.LeftParen,
          char,
          startLine,
          startColumn,
        );

      case ")":
        return this.createToken(
          TokenType.RightParen,
          char,
          startLine,
          startColumn,
        );

      case "{":
        return this.createToken(
          TokenType.LeftBrace,
          char,
          startLine,
          startColumn,
        );

      case "}":
        return this.createToken(
          TokenType.RightBrace,
          char,
          startLine,
          startColumn,
        );

      case ";":
        return this.createToken(
          TokenType.Semicolon,
          char,
          startLine,
          startColumn,
        );

      case ",":
        return this.createToken(
          TokenType.Comma,
          char,
          startLine,
          startColumn,
        );

      default:
        throw this.error(`Unexpected character '${char}'`);
    }
  }

  private identifier(
    line: number,
    column: number,
    firstCharacter: string,
  ): Token {
    let lexeme = firstCharacter;

    while (
      !this.isAtEnd() &&
      (this.isLetter(this.peek()) ||
        this.isDigit(this.peek()) ||
        this.peek() === "_")
    ) {
      lexeme += this.advance();
    }

    const keywords: Record<string, TokenType> = {
      int: TokenType.Int,
      float: TokenType.Float,
      return: TokenType.Return,
    };

    const type = keywords[lexeme] ?? TokenType.Identifier;

    return this.createToken(type, lexeme, line, column);
  }

  private number(
    line: number,
    column: number,
    firstCharacter: string,
  ): Token {
    let lexeme = firstCharacter;

    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      lexeme += this.advance();
    }

    let isFloat = false;

    if (
      !this.isAtEnd() &&
      this.peek() === "." &&
      this.isDigit(this.peekNext())
    ) {
      isFloat = true;
      lexeme += this.advance();

      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        lexeme += this.advance();
      }
    }

    return this.createToken(
      isFloat ? TokenType.FloatLiteral : TokenType.IntegerLiteral,
      lexeme,
      line,
      column,
    );
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();

      if (char === " " || char === "\r" || char === "\t") {
        this.advance();
      } else if (char === "\n") {
        this.advance();
      } else {
        break;
      }
    }
  }

  private advance(): string {
    const char = this.source[this.position];

    this.position++;

    if (char === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }

    return char;
  }

  private peek(): string {
    if (this.isAtEnd()) {
      return "\0";
    }

    return this.source[this.position];
  }

  private peekNext(): string {
    if (this.position + 1 >= this.source.length) {
      return "\0";
    }

    return this.source[this.position + 1];
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) {
      return false;
    }

    if (this.source[this.position] !== expected) {
      return false;
    }

    this.advance();

    return true;
  }

  private isAtEnd(): boolean {
    return this.position >= this.source.length;
  }

  private isLetter(char: string): boolean {
    return (
      (char >= "a" && char <= "z") ||
      (char >= "A" && char <= "Z")
    );
  }

  private isDigit(char: string): boolean {
    return char >= "0" && char <= "9";
  }

  private createToken(
    type: TokenType,
    lexeme: string,
    line: number,
    column: number,
  ): Token {
    return {
      type,
      lexeme,
      line,
      column,
    };
  }

  private error(message: string): Error {
    return new Error(`${message} at line ${this.line}, column ${this.column}`);
  }
}