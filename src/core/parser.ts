import { CompileFault, here, type CType, type CProgram, type Expr, type FunctionDef, type Language, type Lexeme, type ScalarType, type Stmt } from './types';
import { alternativeOperators } from './lexer';
const scalar = new Set(['int', 'float', 'double', 'bool', 'char']);
const assignment = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
const precedence: Record<string, number> = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '<=': 7, '>': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
export class CParser {
    private tokens: Lexeme[];
    private i = 0;
    private depth = 0;
    private language: Language;
    private booleans: boolean;
    private scalar(text: string) { return text === '_Bool' && this.language === 'c' || scalar.has(text) && (text !== 'bool' || this.booleans); }
    private type(text: string): ScalarType { return text === '_Bool' ? 'bool' : text as ScalarType; }
    constructor(tokens: Lexeme[], language: Language) {
        this.tokens = tokens.filter(t => t.category !== 'Preprocessor').map(t => language === 'cpp' && t.category === 'Operator' && alternativeOperators[t.text] ? { ...t, text: alternativeOperators[t.text] } : t);
        this.language = language;
        this.booleans = language === 'cpp' || tokens.some(t => t.category === 'Preprocessor' && /<stdbool\.h>/.test(t.text));
        for (const token of tokens.filter(t => t.category === 'Preprocessor'))
            if (!/^#\s*include\s*<[^>]+>\s*$/.test(token.text))
                throw new CompileFault('parsing', 'UNSUPPORTED_PREPROCESSOR', 'The visual engine accepts standard-header #include lines, not macros or conditional preprocessing. Native checking remains available.', token);
    }
    parse(): CProgram {
        const functions: FunctionDef[] = [];
        const statements: Stmt[] = [];
        while (this.peek().text !== '<EOF>') {
            if (this.language === 'cpp' && this.match('using')) {
                this.expect('namespace');
                this.expect('std');
                this.expect(';');
                continue;
            }
            if ((this.scalar(this.peek().text) || this.peek().text === 'void') && this.peek(1).category === 'Identifier' && this.peek(2).text === '(') {
                functions.push(this.functionDef());
            }
            else
                statements.push(this.statement());
        }
        if (functions.length && statements.length)
            throw new CompileFault('parsing', 'UNSUPPORTED_GLOBALS', 'Global declarations and executable top-level statements cannot be mixed with function definitions in the visual engine.');
        if (!functions.length)
            functions.push({ name: 'main', type: 'int', params: [], body: { kind: 'block', statements, line: 1, column: 1 }, line: 1, column: 1 });
        if (functions.length > 24)
            throw new CompileFault('limit', 'FUNCTION_LIMIT', 'Limit: 24 functions.');
        return { functions, snippet: statements.length > 0, language: this.language };
    }
    private functionDef(): FunctionDef {
        const start = this.advance();
        const name = this.advance().text;
        this.expect('(');
        const params: {
            name: string;
            type: ScalarType;
        }[] = [];
        if (this.peek().text === 'void' && this.peek(1).text === ')')
            this.advance();
        else if (this.peek().text !== ')')
            do {
                const type = this.advance();
                if (!this.scalar(type.text))
                    this.fail('Only scalar parameters are supported.');
                const name = this.expectIdentifier();
                params.push({ name: name.text, type: this.type(type.text) });
            } while (this.match(','));
        this.expect(')');
        if (this.peek().text !== '{')
            this.fail('Function definitions require a body; prototypes are outside the visual subset.');
        return { name, type: start.text === 'void' ? 'void' as CType : this.type(start.text), params, body: this.statement(), ...here(start) };
    }
    private statement(): Stmt {
        if (++this.depth > 128)
            throw new CompileFault('limit', 'NESTING_LIMIT', 'Limit: 128 nested statements or expressions.', this.peek());
        try {
            return this.readStatement();
        }
        finally {
            this.depth--;
        }
    }
    private readStatement(): Stmt {
        const start = this.peek();
        if (this.match('{')) {
            const statements: Stmt[] = [];
            while (!this.match('}')) {
                if (this.peek().text === '<EOF>')
                    this.fail("Expected '}' before end of input.");
                statements.push(this.statement());
            }
            return { kind: 'block', statements, ...here(start) };
        }
        if (this.match(';'))
            return { kind: 'empty', ...here(start) };
        if (this.peek().text === 'const' || this.scalar(this.peek().text))
            return this.declaration();
        if (this.match('if')) {
            this.expect('(');
            const condition = this.expression();
            this.expect(')');
            const yes = this.statement();
            const no = this.match('else') ? this.statement() : undefined;
            return { kind: 'if', condition, yes, no, ...here(start) };
        }
        if (this.match('while')) {
            this.expect('(');
            const condition = this.expression();
            this.expect(')');
            return { kind: 'while', condition, body: this.statement(), ...here(start) };
        }
        if (this.match('for')) {
            this.expect('(');
            let init: Stmt | undefined;
            if (!this.match(';')) {
                if (this.peek().text === 'const' || this.scalar(this.peek().text))
                    init = this.declaration();
                else {
                    const expression = this.expression();
                    this.expect(';');
                    init = { kind: 'expr', expression, ...here(start) };
                }
            }
            const condition = this.peek().text === ';' ? undefined : this.expression();
            this.expect(';');
            const update = this.peek().text === ')' ? undefined : this.expression();
            this.expect(')');
            return { kind: 'for', init, condition, update, body: this.statement(), ...here(start) };
        }
        if (this.match('return')) {
            const value = this.peek().text === ';' ? undefined : this.expression();
            this.expect(';');
            return { kind: 'return', value, ...here(start) };
        }
        if (this.match('break', 'continue')) {
            const kind = this.tokens[this.i - 1].text as 'break' | 'continue';
            this.expect(';');
            return { kind, ...here(start) };
        }
        const stream = this.peek().text === 'std' && this.peek(1).text === '::' ? this.peek(2).text : this.peek().text;
        if (this.language === 'cpp' && (stream === 'cout' || stream === 'cin')) {
            if (this.language !== 'cpp')
                this.fail('C++ streams require C++ mode.');
            this.qualified();
            if (stream === 'cout') {
                const values: Expr[] = [];
                while (this.match('<<'))
                    values.push(this.expression(0, true));
                this.expect(';');
                if (!values.length)
                    this.fail('cout requires << and a value.');
                return { kind: 'output', values, ...here(start) };
            }
            const names: string[] = [];
            while (this.match('>>'))
                names.push(this.expectIdentifier().text);
            this.expect(';');
            if (!names.length)
                this.fail('cin requires >> and a scalar variable.');
            return { kind: 'input', names, ...here(start) };
        }
        if (start.category === 'Keyword' && ['class', 'struct', 'unsigned', 'long', 'short', 'auto', 'switch', 'do', 'static', 'extern', 'volatile'].includes(start.text))
            throw new CompileFault('parsing', 'UNSUPPORTED', `${start.text} is outside the visual execution subset. Use native syntax checking for broader C/C++ constructs.`, start);
        const expression = this.expression();
        this.expect(';');
        return { kind: 'expr', expression, ...here(start) };
    }
    private declaration(): Stmt {
        const start = this.peek();
        const constant = this.match('const');
        const type = this.advance();
        if (!this.scalar(type.text))
            this.fail('Expected a supported scalar type.');
        const declarations: Stmt[] = [];
        do {
            const name = this.expectIdentifier();
            if (this.peek().text === '[')
                throw new CompileFault('parsing', 'UNSUPPORTED', 'Arrays are supported by native syntax checking, not visual execution.', this.peek());
            const init = this.match('=') ? this.expression() : undefined;
            if (constant && !init)
                this.fail('const declarations require an initializer.');
            declarations.push({ kind: 'decl', type: this.type(type.text), name: name.text, init, constant, ...here(name) });
        } while (this.match(','));
        this.expect(';');
        return declarations.length === 1 ? declarations[0] : { kind: 'group', statements: declarations, ...here(start) };
    }
    private expression(min = 0, stopStream = false): Expr {
        if (++this.depth > 128)
            throw new CompileFault('limit', 'NESTING_LIMIT', 'Limit: 128 nested statements or expressions.', this.peek());
        try {
            let left = this.prefix();
            while (true) {
                const op = this.peek();
                const rank = precedence[op.text];
                if (rank === undefined || rank < min || (stopStream && ['<<', '>>'].includes(op.text)))
                    break;
                this.advance();
                const right = this.expression(rank + 1, stopStream);
                left = { kind: 'binary', op: op.text, left, right, ...here(op) };
            }
            if (min === 0 && this.match('?')) {
                const yes = this.expression();
                this.expect(':');
                const no = this.expression(0, stopStream);
                left = { kind: 'conditional', condition: left, yes, no, ...here(left) };
            }
            if (min === 0 && assignment.has(this.peek().text)) {
                const op = this.advance();
                if (left.kind !== 'name')
                    this.fail('Assignment target must be a scalar variable.');
                left = { kind: 'assign', name: left.name, op: op.text, value: this.expression(0, stopStream), ...here(op) };
            }
            return left;
        }
        finally {
            this.depth--;
        }
    }
    private prefix(): Expr {
        const start = this.peek();
        if (this.match('+', '-', '!', '~', '++', '--', '&')) {
            return { kind: 'unary', op: start.text, argument: this.prefix(), ...here(start) };
        }
        let expression: Expr;
        if (this.match('(')) {
            if (this.scalar(this.peek().text) && this.peek(1).text === ')') {
                const type = this.type(this.advance().text);
                this.expect(')');
                return { kind: 'cast', type, value: this.prefix(), ...here(start) };
            }
            expression = this.expression();
            this.expect(')');
        }
        else if (start.category === 'Number literal') {
            this.advance();
            const float = /[fF]$/.test(start.text) && !/^0[xX]/.test(start.text);
            const raw = float ? start.text.slice(0, -1) : start.text;
            const decimal = /[.eE]/.test(raw) && !/^0[xX]/.test(raw);
            if (/^0[bB]/.test(raw) && this.language === 'c')
                throw new CompileFault('parsing', 'UNSUPPORTED_LITERAL', 'Binary literals require a newer C dialect than C11; C++14 supports them.', start);
            let value: number;
            if (/^0[0-9]+$/.test(raw)) {
                if (/[89]/.test(raw))
                    this.fail('Invalid octal integer literal.');
                value = parseInt(raw, 8);
            }
            else
                value = Number(raw);
            const type = float ? 'float' : decimal ? 'double' : 'int';
            if (!Number.isFinite(value) || (type === 'int' && (!Number.isInteger(value) || value > 2147483647)))
                throw new CompileFault('parsing', 'LITERAL_RANGE', 'This literal needs a wider numeric type than the visual engine supports.', start);
            if (type === 'float' && !Number.isFinite(Math.fround(value)))
                throw new CompileFault('parsing', 'LITERAL_RANGE', 'Float literal exceeds the supported finite float range.', start);
            expression = { kind: 'literal', data: { type, value: type === 'float' ? Math.fround(value) : value }, ...here(start) };
        }
        else if (start.category === 'String literal') {
            this.advance();
            expression = { kind: 'string', value: start.value ?? '', ...here(start) };
        }
        else if (start.category === 'Character literal') {
            this.advance();
            if (start.value!.charCodeAt(0) > 127)
                throw new CompileFault('parsing', 'UNSUPPORTED_ENCODING', 'The visual engine supports ASCII character literals.', start);
            expression = { kind: 'literal', data: { type: this.language === 'cpp' ? 'char' : 'int', value: start.value!.charCodeAt(0) }, ...here(start) };
        }
        else if (this.booleans && this.match('true', 'false'))
            expression = { kind: 'literal', data: { type: this.language === 'cpp' ? 'bool' : 'int', value: start.text === 'true' ? 1 : 0 }, ...here(start) };
        else if (start.category === 'Identifier') {
            const name = this.qualified();
            if (name === 'endl' && this.language === 'cpp')
                expression = { kind: 'string', value: '\n', ...here(start) };
            else if (this.match('(')) {
                const args: Expr[] = [];
                if (this.peek().text !== ')')
                    do {
                        args.push(this.expression());
                    } while (this.match(','));
                this.expect(')');
                expression = { kind: 'call', name, args, ...here(start) };
            }
            else
                expression = { kind: 'name', name, ...here(start) };
        }
        else
            this.fail(`Expected an expression, found '${start.text}'.`);
        if (this.match('++', '--'))
            expression = { kind: 'unary', op: this.tokens[this.i - 1].text, argument: expression, postfix: true, ...here(start) };
        return expression;
    }
    private qualified(): string { const first = this.expectIdentifier(); if (first.text === 'std' && this.match('::')) {
        if (this.language !== 'cpp')
            this.fail('std:: requires C++ mode.');
        return this.expectIdentifier().text;
    } return first.text; }
    private peek(offset = 0): Lexeme { return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)]; }
    private advance(): Lexeme { return this.tokens[this.i++]; }
    private match(...text: string[]): boolean { if (text.includes(this.peek().text)) {
        this.advance();
        return true;
    } return false; }
    private expect(text: string): Lexeme { if (this.peek().text !== text)
        this.fail(`Expected '${text}', found '${this.peek().text}'.`); return this.advance(); }
    private expectIdentifier(): Lexeme { if (this.peek().category !== 'Identifier')
        this.fail(`Expected an identifier, found '${this.peek().text}'.`); return this.advance(); }
    private fail(message: string): never { throw new CompileFault('parsing', 'SYNTAX', message, this.peek()); }
}

