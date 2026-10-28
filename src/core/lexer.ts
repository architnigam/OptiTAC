import { CompileFault, type Category, type Language, type Lexeme } from './types';
const multi = ['<<=', '>>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '&=', '|=', '^=', '::', '->'];
const operators = new Set('+-*/%=!<>&|^~?:'.split(''));
const delimiters = new Set('(){}[];,'.split(''));
const cOnly = new Set(['_Bool', '_Complex', '_Imaginary', '_Alignas', '_Alignof', '_Atomic', '_Generic', '_Noreturn', '_Static_assert', '_Thread_local', 'restrict']);
const common = new Set(['int', 'float', 'double', 'char', 'void', 'return', 'if', 'else', 'while', 'for', 'break', 'continue', 'const', 'unsigned', 'long', 'short', 'switch', 'do', 'sizeof', 'static', 'extern', 'volatile', 'auto', 'struct', 'union', 'enum', 'typedef', 'register', 'goto', 'case', 'default', 'signed', 'inline']);
const cppOnly = new Set(['bool', 'true', 'false', 'using', 'namespace', 'class', 'template', 'typename', 'public', 'private', 'protected', 'new', 'delete', 'virtual', 'constexpr', 'decltype', 'nullptr', 'noexcept', 'throw', 'try', 'catch', 'this', 'friend', 'operator', 'static_cast', 'dynamic_cast', 'reinterpret_cast', 'const_cast', 'explicit', 'mutable', 'static_assert', 'thread_local', 'typeid', 'alignas', 'alignof', 'wchar_t', 'char16_t', 'char32_t']);
export const alternativeOperators: Record<string, string> = { and: '&&', or: '||', not: '!', bitand: '&', bitor: '|', xor: '^', compl: '~', and_eq: '&=', or_eq: '|=', xor_eq: '^=', not_eq: '!=' };
export function tokenize(source: string, language: Language = 'cpp'): Lexeme[] {
    if (source.length > 30000)
        throw new CompileFault('limit', 'SOURCE_LIMIT', 'Limit: 30,000 source characters.');
    const result: Lexeme[] = [];
    let i = 0, line = 1, column = 1;
    const next = () => { const c = source[i++]; if (c === '\n') {
        line++;
        column = 1;
    }
    else
        column++; return c; };
    const emit = (text: string, category: Category, start: {
        line: number;
        column: number;
    }, value?: string) => result.push({ ...start, text, category, ...(value === undefined ? {} : { value }) });
    while (i < source.length) {
        const c = source[i];
        if (/\s/.test(c)) {
            next();
            continue;
        }
        const start = { line, column };
        if (source.startsWith('//', i)) {
            while (i < source.length && source[i] !== '\n')
                next();
            continue;
        }
        if (source.startsWith('/*', i)) {
            next();
            next();
            while (i < source.length && !source.startsWith('*/', i))
                next();
            if (i === source.length)
                throw new CompileFault('lexing', 'COMMENT', 'Unterminated block comment.', start);
            next();
            next();
            continue;
        }
        if (c === '#') {
            let text = '';
            while (i < source.length && source[i] !== '\n')
                text += next();
            emit(text, 'Preprocessor', start);
            continue;
        }
        if (/[a-zA-Z_]/.test(c)) {
            let text = '';
            while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]))
                text += next();
            emit(text, language === 'cpp' && alternativeOperators[text] ? 'Operator' : common.has(text) || (language === 'c' ? cOnly : cppOnly).has(text) ? 'Keyword' : 'Identifier', start);
            continue;
        }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
            let text = '';
            if (source.startsWith('0b', i) || source.startsWith('0B', i)) {
                text += next() + next();
                while (i < source.length && /[01]/.test(source[i]))
                    text += next();
                if (text.length === 2 || /[2-9]/.test(source[i] ?? ''))
                    throw new CompileFault('lexing', 'NUMBER', 'Invalid binary integer literal.', start);
            }
            else if (source.startsWith('0x', i) || source.startsWith('0X', i)) {
                text += next() + next();
                while (i < source.length && /[a-fA-F0-9]/.test(source[i]))
                    text += next();
                if (text.length === 2)
                    throw new CompileFault('lexing', 'NUMBER', 'Hex literal requires digits.', start);
            }
            else {
                while (i < source.length && /[0-9]/.test(source[i]))
                    text += next();
                if (source[i] === '.') {
                    text += next();
                    while (i < source.length && /[0-9]/.test(source[i]))
                        text += next();
                }
                if (/[eE]/.test(source[i] ?? '')) {
                    text += next();
                    if (/[+-]/.test(source[i] ?? ''))
                        text += next();
                    if (!/[0-9]/.test(source[i] ?? ''))
                        throw new CompileFault('lexing', 'NUMBER', 'Exponent requires digits.', start);
                    while (i < source.length && /[0-9]/.test(source[i]))
                        text += next();
                }
            }
            if (/[fF]/.test(source[i] ?? ''))
                text += next();
            if (/[a-zA-Z_]/.test(source[i] ?? ''))
                throw new CompileFault('lexing', 'NUMBER', 'Unsupported literal suffix or invalid numeric spelling.', start);
            emit(text, 'Number literal', start);
            continue;
        }
        if (c === '"' || c === "'") {
            const quote = next();
            let raw = quote, value = '';
            let closed = false;
            while (i < source.length) {
                let ch = next();
                raw += ch;
                if (ch === quote) {
                    closed = true;
                    break;
                }
                if (ch === '\n')
                    throw new CompileFault('lexing', 'STRING', 'Newline inside quoted literal.', start);
                if (ch === '\\') {
                    if (i >= source.length)
                        break;
                    ch = next();
                    raw += ch;
                    const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'", a: '\x07', b: '\b', f: '\f', v: '\v' };
                    if (!(ch in escapes))
                        throw new CompileFault('lexing', 'ESCAPE', `Unsupported escape \\${ch}.`, start);
                    value += escapes[ch];
                }
                else
                    value += ch;
            }
            if (!closed)
                throw new CompileFault('lexing', 'STRING', 'Unterminated quoted literal.', start);
            if (quote === "'" && value.length !== 1)
                throw new CompileFault('lexing', 'CHAR', 'Character literals must contain one character.', start);
            emit(raw, quote === '"' ? 'String literal' : 'Character literal', start, value);
            continue;
        }
        const op = multi.find(op => (language === 'cpp' || op !== '::') && source.startsWith(op, i));
        if (op) {
            for (let n = 0; n < op.length; n++)
                next();
            emit(op, 'Operator', start);
            continue;
        }
        if (operators.has(c) || c === '.') {
            next();
            emit(c, 'Operator', start);
            continue;
        }
        if (delimiters.has(c)) {
            next();
            emit(c, 'Delimiter', start);
            continue;
        }
        throw new CompileFault('lexing', 'CHARACTER', `Unexpected character ${JSON.stringify(c)}.`, start);
    }
    if (result.length > 12000)
        throw new CompileFault('limit', 'TOKEN_LIMIT', 'Limit: 12,000 tokens.');
    result.push({ text: '<EOF>', category: 'End of input', line, column });
    return result;
}

