export type Language = 'c' | 'cpp';
export type ScalarType = 'int' | 'float' | 'double' | 'bool' | 'char';
export type CType = ScalarType | 'void';
export interface Position {
    line: number;
    column: number;
}
export type Category = 'Keyword' | 'Identifier' | 'Operator' | 'Delimiter' | 'Number literal' | 'String literal' | 'Character literal' | 'Preprocessor' | 'End of input';
export interface Lexeme extends Position {
    text: string;
    category: Category;
    value?: string;
}
export interface Diagnostic extends Position {
    stage: 'lexing' | 'parsing' | 'semantics' | 'runtime' | 'limit';
    code: string;
    message: string;
}
export class CompileFault extends Error {
    diagnostic: Diagnostic;
    constructor(stage: Diagnostic['stage'], code: string, message: string, pos: Position = { line: 1, column: 1 }) {
        super(message);
        this.diagnostic = { stage, code, message, ...pos };
    }
}
export interface Value {
    type: ScalarType;
    value: number;
}
export type Expr = ({
    kind: 'literal';
    data: Value;
} & Position) | ({
    kind: 'string';
    value: string;
} & Position) | ({
    kind: 'name';
    name: string;
} & Position) | ({
    kind: 'unary';
    op: string;
    argument: Expr;
    postfix?: boolean;
} & Position) | ({
    kind: 'binary';
    op: string;
    left: Expr;
    right: Expr;
} & Position) | ({
    kind: 'assign';
    op: string;
    name: string;
    value: Expr;
} & Position) | ({
    kind: 'call';
    name: string;
    args: Expr[];
} & Position) | ({
    kind: 'cast';
    type: ScalarType;
    value: Expr;
} & Position) | ({
    kind: 'conditional';
    condition: Expr;
    yes: Expr;
    no: Expr;
} & Position);
export type Stmt = ({
    kind: 'block';
    statements: Stmt[];
} & Position) | ({
    kind: 'decl';
    type: ScalarType;
    name: string;
    init?: Expr;
    constant: boolean;
} & Position) | ({
    kind: 'group';
    statements: Stmt[];
} & Position) | ({
    kind: 'expr';
    expression: Expr;
} & Position) | ({
    kind: 'if';
    condition: Expr;
    yes: Stmt;
    no?: Stmt;
} & Position) | ({
    kind: 'while';
    condition: Expr;
    body: Stmt;
} & Position) | ({
    kind: 'for';
    init?: Stmt;
    condition?: Expr;
    update?: Expr;
    body: Stmt;
} & Position) | ({
    kind: 'return';
    value?: Expr;
} & Position) | ({
    kind: 'break' | 'continue' | 'empty';
} & Position) | ({
    kind: 'output';
    values: Expr[];
} & Position) | ({
    kind: 'input';
    names: string[];
} & Position);
export interface FunctionDef extends Position {
    name: string;
    type: CType;
    params: {
        name: string;
        type: ScalarType;
    }[];
    body: Stmt;
}
export interface CProgram {
    functions: FunctionDef[];
    snippet: boolean;
    language: Language;
}
export interface SymbolRow extends Position {
    name: string;
    type: ScalarType;
    scope: string;
    constant: boolean;
}
export interface TraceEvent {
    step: number;
    function: string;
    instruction: string;
    line: number;
    variables: Record<string, string>;
    stdout: string;
}
export interface RunResult {
    status: 'returned' | 'undefined' | 'error' | 'limited';
    returnValue?: Value;
    stdout: string;
    steps: number;
    trace: TraceEvent[];
    diagnostic?: Diagnostic;
}
export const here = (p: Position): Position => ({ line: p.line, column: p.column });

