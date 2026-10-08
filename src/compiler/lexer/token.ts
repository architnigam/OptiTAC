export const TokenType = {
  // Keywords
  Int: "INT",
  Float: "FLOAT",
  Return: "RETURN",

  // Identifiers and literals
  Identifier: "IDENTIFIER",
  IntegerLiteral: "INTEGER_LITERAL",
  FloatLiteral: "FLOAT_LITERAL",

  // Operators
  Plus: "PLUS",
  Minus: "MINUS",
  Multiply: "MULTIPLY",
  Divide: "DIVIDE",
  Modulo: "MODULO",
  Assign: "ASSIGN",

  // Comparison operators
  Equal: "EQUAL",
  NotEqual: "NOT_EQUAL",
  LessThan: "LESS_THAN",
  LessEqual: "LESS_EQUAL",
  GreaterThan: "GREATER_THAN",
  GreaterEqual: "GREATER_EQUAL",

  // Punctuation
  LeftParen: "LEFT_PAREN",
  RightParen: "RIGHT_PAREN",
  LeftBrace: "LEFT_BRACE",
  RightBrace: "RIGHT_BRACE",
  Semicolon: "SEMICOLON",
  Comma: "COMMA",

  // Special
  EOF: "EOF",
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export interface Token {
  type: TokenType;
  lexeme: string;
  line: number;
  column: number;
}