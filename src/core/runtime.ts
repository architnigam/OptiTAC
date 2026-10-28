import { CompileFault, here, type CProgram, type Expr, type FunctionDef, type Position, type RunResult, type ScalarType, type Stmt, type Value } from './types';
import { arithmeticType, binary, convert, numberText, truth, unary } from './numbers';
export interface Slot {
    type: ScalarType;
    value?: Value;
    constant: boolean;
}
export interface Frame {
    name: string;
    scopes: Map<string, Slot>[];
    temps: Map<string, Value>;
}
export type Evaluation = Value | string | {
    address: string;
};
export const numeric = (v: Evaluation, pos: Position): Value => { if (typeof v === 'string' || 'address' in v)
    throw new CompileFault('runtime', 'VALUE_TYPE', 'Expected a scalar numeric value.', pos); return v; };
export function decimalFixed(value: number, places: number): string {
    if (!Number.isFinite(value))
        return Number.isNaN(value) ? 'nan' : value < 0 ? '-inf' : 'inf';
    const neg = value < 0 || Object.is(value, -0);
    const n = Math.abs(value);
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, n);
    const raw = bits.getBigUint64(0);
    const exponent = Number((raw >> 52n) & 2047n);
    let numerator = raw & ((1n << 52n) - 1n);
    const power = exponent ? exponent - 1023 - 52 : -1022 - 52;
    if (exponent)
        numerator += 1n << 52n;
    let denominator = 1n;
    if (power >= 0)
        numerator <<= BigInt(power);
    else
        denominator <<= BigInt(-power);
    if (places >= 0)
        numerator *= 10n ** BigInt(places);
    else
        denominator *= 10n ** BigInt(-places);
    let rounded = numerator / denominator;
    const remainder = numerator % denominator;
    if (remainder * 2n > denominator || (remainder * 2n === denominator && rounded % 2n === 1n))
        rounded++;
    let text = rounded.toString();
    if (places > 0) {
        text = text.padStart(places + 1, '0');
        text = text.slice(0, -places) + '.' + text.slice(-places);
    }
    else if (places < 0)
        text += '0'.repeat(-places);
    return (neg ? '-' : '') + text;
}
export function decimalGeneral(value: number, precision = 6): string {
    if (!Number.isFinite(value))
        return decimalFixed(value, 0);
    if (value === 0)
        return Object.is(value, -0) ? '-0' : '0';
    const neg = value < 0;
    const x = Math.abs(value);
    let exponent = Math.floor(Math.log10(x));
    let places = precision - 1 - exponent;
    let fixed = decimalFixed(x, places);
    const rounded = Number(fixed);
    if (rounded >= 10 ** (exponent + 1)) {
        exponent++;
        places = precision - 1 - exponent;
        fixed = decimalFixed(x, places);
    }
    if (exponent < -4 || exponent >= precision) {
        const digits = fixed.replace('.', '').replace(/^0+/, '');
        const first = digits[0] ?? '0';
        const tail = digits.slice(1, precision).replace(/0+$/, '');
        return (neg ? '-' : '') + first + (tail ? '.' + tail : '') + 'e' + (exponent < 0 ? '-' : '+') + String(Math.abs(exponent)).padStart(2, '0');
    }
    return (neg ? '-' : '') + (fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed);
}
export class Machine {
    program: CProgram;
    input: string;
    inputIndex = 0;
    stdout = '';
    steps = 0;
    trace: RunResult['trace'] = [];
    frames: Frame[] = [];
    maxSteps: number;
    capture: boolean;
    executeBody: (fn: FunctionDef) => Value | undefined;
    inputFailure: 'eof' | 'match' = 'match';
    constructor(program: CProgram, input: string, maxSteps: number, capture: boolean, executeBody: (fn: FunctionDef) => Value | undefined) { this.program = program; this.input = input; this.maxSteps = maxSteps; this.capture = capture; this.executeBody = executeBody; }
    get frame(): Frame { return this.frames.at(-1)!; }
    tick(pos: Position) { if (++this.steps > this.maxSteps)
        throw new CompileFault('limit', 'STEP_LIMIT', `Execution exceeded ${this.maxSteps} steps; result is inconclusive.`, pos); }
    record(instruction: string, pos: Position) { if (!this.capture || this.trace.length >= 160)
        return; const variables: Record<string, string> = {}; for (const scope of this.frame.scopes)
        for (const [name, slot] of scope)
            variables[name] = slot.value ? `${slot.type} ${numberText(slot.value.value)}` : `${slot.type} <uninitialized>`; for (const [name, v] of this.frame.temps)
        variables[name] = `${v.type} ${numberText(v.value)}`; this.trace.push({ step: this.steps, function: this.frame.name, instruction, line: pos.line, variables, stdout: this.stdout }); }
    lookup(name: string, pos: Position): Slot { for (let i = this.frame.scopes.length - 1; i >= 0; i--)
        if (this.frame.scopes[i].has(name))
            return this.frame.scopes[i].get(name)!; throw new CompileFault('runtime', 'UNDECLARED', `Variable '${name}' is not declared.`, pos); }
    read(name: string, pos: Position): Value { if (name.startsWith('$')) {
        const v = this.frame.temps.get(name);
        if (!v)
            throw new CompileFault('runtime', 'TEMP', `Internal temporary '${name}' has no value.`, pos);
        return v;
    } const slot = this.lookup(name, pos); if (!slot.value)
        throw new CompileFault('runtime', 'UNINITIALIZED', `Reading uninitialized variable '${name}' is undefined.`, pos); return slot.value; }
    write(name: string, value: Value, pos: Position) { if (name.startsWith('$')) {
        this.frame.temps.set(name, value);
        return;
    } const slot = this.lookup(name, pos); if (slot.constant)
        throw new CompileFault('runtime', 'CONST', 'Cannot modify a const variable.', pos); slot.value = convert(value, slot.type, pos); }
    declare(name: string, type: ScalarType, constant: boolean, init: Value | undefined, pos: Position) { const scope = this.frame.scopes.at(-1)!; if (scope.has(name))
        throw new CompileFault('runtime', 'REDECLARATION', `Variable '${name}' is already declared.`, pos); scope.set(name, { type, constant, value: init ? convert(init, type, pos) : undefined }); }
    convertForSlot(value: Value, type: ScalarType, pos: Position) { return convert(value, type, pos); }
    emit(text: string, pos: Position) { if ([...text].some(c => c.charCodeAt(0) > 127))
        throw new CompileFault('runtime', 'UNSUPPORTED_ENCODING', 'Visual stdout currently supports ASCII bytes; broader output encodings are not guessed.', pos); if (this.stdout.length + text.length > 16000)
        throw new CompileFault('limit', 'OUTPUT_LIMIT', 'Output exceeds 16,000 characters.', pos); this.stdout += text; }
    evaluate(e: Expr): Evaluation {
        this.tick(e);
        switch (e.kind) {
            case 'literal': return e.data;
            case 'string': return e.value.split('\0')[0];
            case 'name': return this.read(e.name, e);
            case 'cast': return convert(numeric(this.evaluate(e.value), e), e.type, e);
            case 'unary': {
                if (e.op === '&') {
                    if (e.argument.kind !== 'name')
                        throw new CompileFault('runtime', 'ADDRESS', 'Expected scalar destination.', e);
                    return { address: e.argument.name };
                }
                if (['++', '--'].includes(e.op)) {
                    if (e.argument.kind !== 'name')
                        throw new CompileFault('runtime', 'LVALUE', 'Expected a variable.', e);
                    const previous = this.read(e.argument.name, e);
                    const value = binary(e.op === '++' ? '+' : '-', previous, { type: 'int', value: 1 }, e, this.program.language);
                    this.write(e.argument.name, value, e);
                    return e.postfix ? previous : this.read(e.argument.name, e);
                }
                return unary(e.op, numeric(this.evaluate(e.argument), e), e, this.program.language);
            }
            case 'binary': {
                const left = numeric(this.evaluate(e.left), e);
                if (e.op === '&&' && !truth(left))
                    return { type: this.program.language === 'cpp' ? 'bool' : 'int', value: 0 };
                if (e.op === '||' && truth(left))
                    return { type: this.program.language === 'cpp' ? 'bool' : 'int', value: 1 };
                return binary(e.op, left, numeric(this.evaluate(e.right), e), e, this.program.language);
            }
            case 'assign': {
                const previous = e.op === '=' ? undefined : this.read(e.name, e);
                const value = numeric(this.evaluate(e.value), e);
                this.write(e.name, previous ? binary(e.op.slice(0, -1), previous, value, e, this.program.language) : value, e);
                return this.read(e.name, e);
            }
            case 'conditional': {
                const cond = numeric(this.evaluate(e.condition), e);
                const chosen = numeric(this.evaluate(truth(cond) ? e.yes : e.no), e);
                const a = this.expressionType(e.yes), b = this.expressionType(e.no);
                return convert(chosen, this.program.language === 'cpp' && a === b ? a : arithmeticType({ type: a, value: 0 }, { type: b, value: 0 }), e);
            }
            case 'call': return this.call(e.name, e.args.map(a => this.evaluate(a)), e);
        }
    }
    expressionType(e: Expr): ScalarType {
        if (e.kind === 'literal')
            return e.data.type;
        if (e.kind === 'name')
            return this.lookup(e.name, e).type;
        if (e.kind === 'cast')
            return e.type;
        if (e.kind === 'assign')
            return this.lookup(e.name, e).type;
        if (e.kind === 'call') {
            const fn = this.program.functions.find(f => f.name === e.name);
            return fn && fn.type !== 'void' ? fn.type : ['sqrt', 'pow', 'fabs'].includes(e.name) ? 'double' : 'int';
        }
        if (e.kind === 'unary')
            return ['++', '--'].includes(e.op) ? this.expressionType(e.argument) : e.op === '!' ? (this.program.language === 'cpp' ? 'bool' : 'int') : ['char', 'bool'].includes(this.expressionType(e.argument)) ? 'int' : this.expressionType(e.argument);
        if (e.kind === 'binary') {
            if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(e.op))
                return this.program.language === 'cpp' ? 'bool' : 'int';
            return arithmeticType({ type: this.expressionType(e.left), value: 0 }, { type: this.expressionType(e.right), value: 0 });
        }
        if (e.kind === 'conditional') {
            const a = this.expressionType(e.yes), b = this.expressionType(e.no);
            return this.program.language === 'cpp' && a === b ? a : arithmeticType({ type: a, value: 0 }, { type: b, value: 0 });
        }
        throw new CompileFault('runtime', 'VALUE_TYPE', 'String used as a scalar.', e);
    }
    call(name: string, args: Evaluation[], pos: Position): Value {
        if (['printf', 'scanf', 'puts', 'putchar', 'abs', 'sqrt', 'pow', 'fabs'].includes(name))
            return this.builtin(name, args, pos);
        const fn = this.program.functions.find(f => f.name === name);
        if (!fn)
            throw new CompileFault('runtime', 'FUNCTION', `Unknown function '${name}'.`, pos);
        if (this.frames.length >= 48)
            throw new CompileFault('limit', 'CALL_LIMIT', 'Recursion exceeded 48 call frames; result is inconclusive.', pos);
        if (args.length !== fn.params.length)
            throw new CompileFault('runtime', 'ARITY', 'Wrong argument count.', pos);
        const frame: Frame = { name, scopes: [new Map()], temps: new Map() };
        this.frames.push(frame);
        try {
            fn.params.forEach((p, i) => this.declare(p.name, p.type, false, numeric(args[i], pos), pos));
            const value = this.executeBody(fn);
            if (fn.type === 'void')
                return { type: 'int', value: 0 };
            if (value)
                return convert(value, fn.type, pos);
            if (name === 'main')
                return { type: 'int', value: 0 };
            throw new CompileFault('runtime', 'MISSING_RETURN', `Function '${name}' reached its end without returning a value.`, fn);
        }
        finally {
            this.frames.pop();
        }
    }
    skipInputSpace() { while (/\s/.test(this.input[this.inputIndex] ?? '') && this.inputIndex < this.input.length)
        this.inputIndex++; }
    readInput(type: ScalarType, pos: Position, skip = true, context: 'scanf' | 'cin' = 'cin'): Value | undefined {
        if (skip)
            this.skipInputSpace();
        const tail = this.input.slice(this.inputIndex);
        this.inputFailure = tail ? 'match' : 'eof';
        if (type === 'char') {
            if (!tail)
                return;
            this.inputIndex++;
            return convert({ type: 'int', value: tail.charCodeAt(0) }, type, pos);
        }
        const special = ['float', 'double'].includes(type) ? /^[+-]?(?:inf(?:inity)?|nan(?:\([^)]*\))?)/i.exec(tail) : null;
        if (special) {
            if (context === 'cin')
                throw new CompileFault('runtime', 'UNSUPPORTED_INPUT', 'Non-finite C++ stream extraction is implementation-dependent and is not modeled.', pos);
            this.inputIndex += special[0].length;
            return { type, value: /nan/i.test(special[0]) ? NaN : special[0].startsWith('-') ? -Infinity : Infinity };
        }
        const match = type === 'int' || type === 'bool' ? /^[+-]?\d+/.exec(tail) : /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(tail);
        if (!match) {
            if (/^[+-]/.test(tail))
                this.inputIndex++;
            return;
        }
        this.inputIndex += match[0].length;
        if (['float', 'double'].includes(type) && /[eE]/.test(this.input[this.inputIndex] ?? '')) {
            this.inputIndex++;
            if (/[+-]/.test(this.input[this.inputIndex] ?? ''))
                this.inputIndex++;
            this.inputFailure = 'match';
            return;
        }
        const value = Number(match[0]);
        if (context === 'cin' && (!Number.isFinite(value) || (type === 'float' && !Number.isFinite(Math.fround(value))) || (type === 'int' && (value < -2147483648 || value > 2147483647)) || (type === 'bool' && value !== 0 && value !== 1)))
            throw new CompileFault('runtime', 'UNSUPPORTED_INPUT', 'C++ stream range/failure state is outside the modeled successful-extraction subset.', pos);
        return convert({ type: 'double', value }, type, pos);
    }
    builtin(name: string, args: Evaluation[], pos: Position): Value {
        const integer = (n: number): Value => ({ type: 'int', value: n });
        if (name === 'puts') {
            if (args.length !== 1 || typeof args[0] !== 'string')
                throw new CompileFault('runtime', 'FORMAT', 'puts requires one string.', pos);
            this.emit(args[0] + '\n', pos);
            return integer(1);
        }
        if (name === 'putchar') {
            if (args.length !== 1)
                throw new CompileFault('runtime', 'ARITY', 'putchar requires one argument.', pos);
            const v = numeric(args[0], pos);
            this.emit(String.fromCharCode(v.value & 255), pos);
            return integer(v.value & 255);
        }
        if (['abs', 'sqrt', 'pow', 'fabs'].includes(name)) {
            if (args.length !== (name === 'pow' ? 2 : 1))
                throw new CompileFault('runtime', 'ARITY', `Wrong argument count for ${name}.`, pos);
            const x = numeric(args[0], pos);
            if (name === 'abs') {
                const n = convert(x, 'int', pos).value;
                if (n === -2147483648)
                    throw new CompileFault('runtime', 'SIGNED_OVERFLOW', 'abs(INT_MIN) is undefined.', pos);
                return integer(Math.abs(n));
            }
            return { type: 'double', value: name === 'sqrt' ? Math.sqrt(x.value) : name === 'fabs' ? Math.abs(x.value) : Math.pow(x.value, numeric(args[1], pos).value) };
        }
        if (typeof args[0] !== 'string')
            throw new CompileFault('runtime', 'FORMAT', `${name} requires a literal format string.`, pos);
        const format = args[0];
        let arg = 1, count = 0, text = '';
        for (let i = 0; i < format.length;) {
            if (format[i] !== '%') {
                if (name === 'printf') {
                    text += format[i++];
                    continue;
                }
                if (/\s/.test(format[i])) {
                    this.skipInputSpace();
                    i++;
                    continue;
                }
                if (this.input[this.inputIndex] !== format[i])
                    return integer(count || (this.inputIndex >= this.input.length ? -1 : 0));
                this.inputIndex++;
                i++;
                continue;
            }
            if (format[i + 1] === '%') {
                if (name === 'printf')
                    text += '%';
                else if (this.input[this.inputIndex++] !== '%')
                    return integer(count);
                i += 2;
                continue;
            }
            const match = /^%(?:(\d+))?(?:\.(\d+))?(l?)([dfgcs])/.exec(format.slice(i));
            if (!match)
                throw new CompileFault('runtime', 'UNSUPPORTED_FORMAT', 'Supported formats: %d, %f, %lf, %g, %c, %s and decimal precision (printf only).', pos);
            const [, widthText, precisionText, length, spec] = match;
            const width = Number(widthText ?? 0), precision = Number(precisionText ?? 6);
            if (width > 200 || precision > 12)
                throw new CompileFault('limit', 'FORMAT_LIMIT', 'Format width is limited to 200 and precision to 12.', pos);
            if (precisionText && !['f', 'g'].includes(spec))
                throw new CompileFault('runtime', 'UNSUPPORTED_FORMAT', 'Precision for non-floating formats is outside the visual subset.', pos);
            if (arg >= args.length)
                throw new CompileFault('runtime', 'FORMAT', 'Not enough format arguments.', pos);
            if (name === 'scanf') {
                if (widthText || precisionText || !['d', 'f', 'c'].includes(spec) || length && spec !== 'f')
                    throw new CompileFault('runtime', 'UNSUPPORTED_FORMAT', 'scanf supports %d, %f, %lf and %c, without widths.', pos);
                const target = args[arg++];
                if (typeof target === 'string' || !('address' in target))
                    throw new CompileFault('runtime', 'SCANF', 'scanf destination must be &variable.', pos);
                const expected: ScalarType = spec === 'd' ? 'int' : spec === 'c' ? 'char' : length ? 'double' : 'float';
                const slot = this.lookup(target.address, pos);
                if (slot.type !== expected)
                    throw new CompileFault('runtime', 'FORMAT', `scanf ${match[0]} requires ${expected}*, not ${slot.type}*.`, pos);
                const value = this.readInput(expected, pos, spec !== 'c', 'scanf');
                if (!value)
                    return integer(count || (this.inputFailure === 'eof' ? -1 : 0));
                this.write(target.address, value, pos);
                count++;
            }
            else {
                const v = args[arg++];
                let formatted: string;
                if (spec === 's') {
                    if (typeof v !== 'string' || length)
                        throw new CompileFault('runtime', 'FORMAT', '%s requires a string.', pos);
                    formatted = v;
                }
                else {
                    const value = numeric(v, pos);
                    if (spec === 'd' || spec === 'c') {
                        if (value.type === 'float' || value.type === 'double' || length)
                            throw new CompileFault('runtime', 'FORMAT', `${match[0]} requires an integer argument.`, pos);
                        formatted = spec === 'c' ? String.fromCharCode(value.value & 255) : String(value.value);
                    }
                    else {
                        if (value.type !== 'float' && value.type !== 'double')
                            throw new CompileFault('runtime', 'FORMAT', `${match[0]} requires a floating-point argument.`, pos);
                        formatted = spec === 'g' ? decimalGeneral(value.value, Math.max(1, precision)) : decimalFixed(value.value, precision);
                    }
                }
                if (width) {
                    const zero = widthText.startsWith('0') && ['d', 'f', 'g'].includes(spec);
                    formatted = zero && formatted.startsWith('-') ? '-' + formatted.slice(1).padStart(width - 1, '0') : formatted.padStart(width, zero ? '0' : ' ');
                }
                text += formatted;
            }
            i += match[0].length;
        }
        if (name === 'printf') {
            this.emit(text, pos);
            return integer(text.length);
        }
        return integer(count);
    }
}
class Flow {
    kind: 'return' | 'break' | 'continue';
    value?: Value;
    constructor(kind: Flow['kind'], value?: Value) { this.kind = kind; this.value = value; }
}
export function executeAST(program: CProgram, input = '', maxSteps = 20000, capture = true): RunResult {
    const walk = (s: Stmt): void => {
        machine.tick(s);
        switch (s.kind) {
            case 'block':
                machine.frame.scopes.push(new Map());
                try {
                    s.statements.forEach(walk);
                }
                finally {
                    machine.frame.scopes.pop();
                }
                break;
            case 'group':
                s.statements.forEach(walk);
                break;
            case 'decl':
                machine.declare(s.name, s.type, s.constant, undefined, s);
                if (s.init)
                    machine.lookup(s.name, s).value = convert(numeric(machine.evaluate(s.init), s), s.type, s);
                machine.record(`declare ${s.type} ${s.name}`, s);
                break;
            case 'expr':
                machine.evaluate(s.expression);
                machine.record('expression', s);
                break;
            case 'output':
                for (const e of s.values) {
                    const value = machine.evaluate(e);
                    if (typeof value === 'string')
                        machine.emit(value, e);
                    else {
                        const v = numeric(value, e);
                        machine.emit(v.type === 'char' ? String.fromCharCode(v.value & 255) : decimalGeneral(v.value), e);
                    }
                }
                machine.record('cout', s);
                break;
            case 'input':
                for (const name of s.names) {
                    const slot = machine.lookup(name, s);
                    const value = machine.readInput(slot.type, s);
                    if (!value)
                        throw new CompileFault('runtime', 'INPUT', 'cin extraction failed; provide matching input values.', s);
                    machine.write(name, value, s);
                }
                machine.record('cin', s);
                break;
            case 'if':
                if (truth(numeric(machine.evaluate(s.condition), s)))
                    scoped(s.yes);
                else if (s.no)
                    scoped(s.no);
                break;
            case 'while':
                while (truth(numeric(machine.evaluate(s.condition), s))) {
                    try {
                        scoped(s.body);
                    }
                    catch (f) {
                        if (f instanceof Flow) {
                            if (f.kind === 'break')
                                break;
                            if (f.kind === 'continue')
                                continue;
                        }
                        throw f;
                    }
                }
                break;
            case 'for':
                machine.frame.scopes.push(new Map());
                try {
                    if (s.init)
                        walk(s.init);
                    while (!s.condition || truth(numeric(machine.evaluate(s.condition), s))) {
                        try {
                            scoped(s.body);
                        }
                        catch (f) {
                            if (f instanceof Flow) {
                                if (f.kind === 'break')
                                    break;
                                if (f.kind !== 'continue')
                                    throw f;
                            }
                            else
                                throw f;
                        }
                        if (s.update)
                            machine.evaluate(s.update);
                    }
                }
                finally {
                    machine.frame.scopes.pop();
                }
                break;
            case 'return': {
                const value = s.value ? numeric(machine.evaluate(s.value), s) : undefined;
                machine.record('return', s);
                throw new Flow('return', value);
            }
            case 'break':
            case 'continue': throw new Flow(s.kind);
            case 'empty': break;
        }
    };
    const scoped = (s: Stmt) => { machine.frame.scopes.push(new Map()); try {
        walk(s);
    }
    finally {
        machine.frame.scopes.pop();
    } };
    const machine: Machine = new Machine(program, input, maxSteps, capture, fn => { try {
        if (fn.body.kind === 'block')
            fn.body.statements.forEach(walk);
        else
            walk(fn.body);
    }
    catch (f) {
        if (f instanceof Flow && f.kind === 'return')
            return f.value;
        throw f;
    } return undefined; });
    return finish(machine, () => machine.call('main', [], { line: 1, column: 1 }));
}
export function finish(machine: Machine, run: () => Value): RunResult {
    try {
        const returnValue = run();
        return { status: 'returned', returnValue, stdout: machine.stdout, steps: machine.steps, trace: machine.trace };
    }
    catch (error) {
        const diagnostic = error instanceof CompileFault ? error.diagnostic : { stage: 'runtime' as const, code: 'INTERNAL', message: error instanceof Error ? error.message : String(error), ...here({ line: 1, column: 1 }) };
        const undefinedCodes = ['SIGNED_OVERFLOW', 'SIGNED_SHIFT', 'DIVISION_BY_ZERO', 'CONVERSION_RANGE', 'UNINITIALIZED', 'FORMAT', 'MISSING_RETURN'];
        return { status: diagnostic.stage === 'limit' ? 'limited' : undefinedCodes.includes(diagnostic.code) ? 'undefined' : 'error', diagnostic, stdout: machine.stdout, steps: machine.steps, trace: machine.trace };
    }
}

