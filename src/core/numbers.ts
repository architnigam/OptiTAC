import { CompileFault, type Language, type Position, type ScalarType, type Value } from './types';
export const numberText = (v: number) => Object.is(v, -0) ? '-0' : String(v);
export const truth = (v: Value) => v.value !== 0;
export function convert(v: Value, type: ScalarType, pos: Position): Value {
    if (type === 'bool')
        return { type, value: truth(v) ? 1 : 0 };
    if (type === 'double')
        return { type, value: v.value };
    if (type === 'float') {
        const value = Math.fround(v.value);
        if (Number.isFinite(v.value) && !Number.isFinite(value))
            throw new CompileFault('runtime', 'CONVERSION_RANGE', 'Narrowing to float exceeds its finite representable range.', pos);
        return { type, value };
    }
    const value = Math.trunc(v.value);
    const min = type === 'char' ? -128 : -2147483648, max = type === 'char' ? 127 : 2147483647;
    if (!Number.isFinite(value) || value < min || value > max)
        throw new CompileFault('runtime', type === 'char' && !['float', 'double'].includes(v.type) ? 'IMPLEMENTATION_DEFINED' : 'CONVERSION_RANGE', `Conversion to ${type} is outside the supported representable range.`, pos);
    return { type, value: Object.is(value, -0) ? 0 : value };
}
export function arithmeticType(a: Value, b: Value): ScalarType { return a.type === 'double' || b.type === 'double' ? 'double' : a.type === 'float' || b.type === 'float' ? 'float' : 'int'; }
export function binary(op: string, a: Value, b: Value, pos: Position, language: Language): Value {
    const type = arithmeticType(a, b), left = type === 'float' ? Math.fround(a.value) : a.value, right = type === 'float' ? Math.fround(b.value) : b.value;
    const bool = (value: boolean): Value => ({ type: language === 'cpp' ? 'bool' : 'int', value: value ? 1 : 0 });
    if (op === '&&')
        return bool(truth(a) && truth(b));
    if (op === '||')
        return bool(truth(a) || truth(b));
    if (op === '==')
        return bool(left === right);
    if (op === '!=')
        return bool(left !== right);
    if (op === '<')
        return bool(left < right);
    if (op === '<=')
        return bool(left <= right);
    if (op === '>')
        return bool(left > right);
    if (op === '>=')
        return bool(left >= right);
    if (['%', '&', '|', '^', '<<', '>>'].includes(op) && type !== 'int')
        throw new CompileFault('runtime', 'INTEGER_OPERANDS', `Operator ${op} requires integer operands.`, pos);
    if (type === 'int' && (op === '/' || op === '%') && right === 0)
        throw new CompileFault('runtime', 'DIVISION_BY_ZERO', `Integer ${op === '/' ? 'division' : 'remainder'} by zero is undefined.`, pos);
    if (type === 'int' && ['/', '%'].includes(op) && left === -2147483648 && right === -1)
        throw new CompileFault('runtime', 'SIGNED_OVERFLOW', 'INT_MIN / -1 and INT_MIN % -1 are undefined.', pos);
    let value: number;
    switch (op) {
        case '+':
        case '-':
        case '*':
            if (type === 'int') {
                const x = BigInt(left), y = BigInt(right);
                const z = op === '+' ? x + y : op === '-' ? x - y : x * y;
                if (z < BigInt(-2147483648) || z > BigInt(2147483647))
                    throw new CompileFault('runtime', 'SIGNED_OVERFLOW', 'Signed 32-bit integer overflow is undefined.', pos);
                value = Number(z);
            }
            else
                value = op === '+' ? left + right : op === '-' ? left - right : left * right;
            break;
        case '/':
            value = type === 'int' ? Math.trunc(left / right) : left / right;
            break;
        case '%':
            value = left % right;
            break;
        case '&':
            value = left & right;
            break;
        case '|':
            value = left | right;
            break;
        case '^':
            value = left ^ right;
            break;
        case '<<':
        case '>>':
            if (right < 0 || right >= 32)
                throw new CompileFault('runtime', 'SHIFT_RANGE', 'Shift count must be in [0,31].', pos);
            if (op === '<<') {
                const shifted = BigInt(left) * (2n ** BigInt(right));
                if (left < 0 || shifted > (language === 'cpp' ? 4294967295n : 2147483647n))
                    throw new CompileFault('runtime', 'SIGNED_SHIFT', 'Negative or overflowing signed left shift is undefined in the selected language mode.', pos);
                value = Number(shifted);
                if (language === 'cpp' && value > 2147483647)
                    value -= 4294967296;
            }
            else {
                if (left < 0)
                    throw new CompileFault('runtime', 'IMPLEMENTATION_DEFINED', 'Right shift of a negative signed integer is implementation-defined and is not evaluated here.', pos);
                value = left >> right;
            }
            break;
        default: throw new CompileFault('runtime', 'OPERATOR', `Unsupported operator ${op}.`, pos);
    }
    return { type, value: type === 'float' ? Math.fround(value) : type === 'int' && Object.is(value, -0) ? 0 : value };
}
export function unary(op: string, a: Value, pos: Position, language: Language): Value {
    if (op === '!')
        return { type: language === 'cpp' ? 'bool' : 'int', value: truth(a) ? 0 : 1 };
    if (op === '~') {
        if (a.type === 'float' || a.type === 'double')
            throw new CompileFault('runtime', 'INTEGER_OPERANDS', 'Bitwise complement requires an integer.', pos);
        return { type: 'int', value: ~a.value };
    }
    const type = a.type === 'bool' || a.type === 'char' ? 'int' : a.type;
    if (op === '+')
        return { type, value: a.value };
    if (op === '-') {
        if (type === 'int' && a.value === -2147483648)
            throw new CompileFault('runtime', 'SIGNED_OVERFLOW', 'Negating INT_MIN is undefined.', pos);
        return { type, value: type === 'int' && a.value === 0 ? 0 : -a.value };
    }
    throw new CompileFault('runtime', 'OPERATOR', `Unsupported unary operator ${op}.`, pos);
}

