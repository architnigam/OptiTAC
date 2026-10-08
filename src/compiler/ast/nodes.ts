export type Program = {
  type: "Program";
  statements: Statement[];
};

export type Statement =
  | VariableDeclaration
  | ReturnStatement;

export type VariableDeclaration = {
  type: "VariableDeclaration";
  dataType: "int" | "float";
  name: string;
  initializer: Expression;
};

export type ReturnStatement = {
  type: "ReturnStatement";
  expression: Expression;
};

export type Expression =
  | BinaryExpression
  | IdentifierExpression
  | LiteralExpression;

export type BinaryExpression = {
  type: "BinaryExpression";
  operator: string;
  left: Expression;
  right: Expression;
};

export type IdentifierExpression = {
  type: "IdentifierExpression";
  name: string;
};

export type LiteralExpression = {
  type: "LiteralExpression";
  value: number;
  dataType: "int" | "float";
};