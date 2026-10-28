import { CompileFault, type CProgram, type CType, type Expr, type ScalarType, type Stmt, type SymbolRow } from './types';
import { arithmeticType } from './numbers';
interface Binding {
    type: ScalarType;
    constant: boolean;
}
const builtins = new Set(['printf', 'scanf', 'puts', 'putchar', 'abs', 'sqrt', 'pow', 'fabs']);
export function check(program: CProgram): SymbolRow[] {
    const rows: SymbolRow[] = [];
    const functions = new Map(program.functions.map(f => [f.name, f]));
    if (functions.size !== program.functions.length)
        throw new CompileFault('semantics', 'DUPLICATE_FUNCTION', 'Duplicate functions and overloads are not supported.');
    const main = functions.get('main');
    if (!main)
        throw new CompileFault('semantics', 'MAIN', 'Define int main() to execute a full C/C++ program.');
    if (program.functions.some(f => builtins.has(f.name)))
        throw new CompileFault('semantics', 'UNSUPPORTED_LIBRARY_SHADOW', 'Replacing a provided library-adapter function is outside the visual subset. Native checking and native compiler artifacts remain available.');
    if (main.type !== 'int' || main.params.length)
        throw new CompileFault('semantics', 'MAIN', 'The visual entry point must be int main() or int main(void), without parameters.', main);
    const ioFunctions = new Set<string>(), calls = new Map<string, Set<string>>();
    for (const fn of program.functions) {
        const used = new Set<string>();
        const visit = (value: unknown): void => { if (!value || typeof value !== 'object')
            return; if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        } const v = value as Record<string, unknown>; if (v.kind === 'output' || v.kind === 'input')
            ioFunctions.add(fn.name); if (v.kind === 'call' && typeof v.name === 'string') {
            used.add(v.name);
            if (['printf', 'scanf', 'puts', 'putchar'].includes(v.name))
                ioFunctions.add(fn.name);
        } Object.values(v).forEach(visit); };
        visit(fn.body);
        calls.set(fn.name, used);
    }
    for (let changed = true; changed;) {
        changed = false;
        for (const [name, used] of calls)
            if (!ioFunctions.has(name) && [...used].some(n => ioFunctions.has(n))) {
                ioFunctions.add(name);
                changed = true;
            }
    }
    for (const fn of program.functions) {
        const scopes: Map<string, Binding>[] = [new Map()];
        let loops = 0;
        const lookup = (name: string, e: Expr | Stmt) => { for (let i = scopes.length - 1; i >= 0; i--)
            if (scopes[i].has(name))
                return scopes[i].get(name)!; throw new CompileFault('semantics', 'UNDECLARED', `Variable '${name}' is not declared in this scope.`, e); };
        const declare = (name: string, type: ScalarType, constant: boolean, p: Expr | Stmt | typeof fn) => { const scope = scopes.at(-1)!; if (program.language === 'cpp' && ['cout', 'cin', 'endl'].includes(name))
            throw new CompileFault('semantics', 'UNSUPPORTED_STREAM_SHADOW', 'The visual stream adapters reserve cout, cin and endl. Shadowing them is available to native checking, not visual execution.', p); if (scope.has(name))
            throw new CompileFault('semantics', 'REDECLARATION', `Variable '${name}' is already declared in this scope.`, p); scope.set(name, { type, constant }); rows.push({ name, type, constant, scope: `${fn.name} / depth ${scopes.length}`, line: p.line, column: p.column }); };
        type Inferred = CType | 'string' | 'address';
        const requireScalar = (type: Inferred, e: Expr): ScalarType => { if (['void', 'string', 'address'].includes(type))
            throw new CompileFault('semantics', 'VALUE_TYPE', 'This context requires a scalar numeric value. Strings, addresses and void-return calls are not scalar values.', e); return type as ScalarType; };
        const infer = (e: Expr): Inferred => {
            if (e.kind === 'literal')
                return e.data.type;
            if (e.kind === 'string') {
                if ([...e.value].some(c => c.charCodeAt(0) > 127))
                    throw new CompileFault('semantics', 'UNSUPPORTED_ENCODING', 'Visual execution currently supports ASCII string and character output. Native syntax checking accepts broader source encodings.', e);
                return 'string';
            }
            if (e.kind === 'name')
                return lookup(e.name, e).type;
            if (e.kind === 'cast') {
                requireScalar(infer(e.value), e);
                return e.type;
            }
            if (e.kind === 'unary') {
                if (e.op === '&')
                    return 'address';
                const type = requireScalar(infer(e.argument), e);
                if (e.op === '~' && ['float', 'double'].includes(type))
                    throw new CompileFault('semantics', 'INTEGER_OPERANDS', 'Bitwise complement requires an integer.', e);
                return ['++', '--'].includes(e.op) ? type : e.op === '!' ? (program.language === 'cpp' ? 'bool' : 'int') : type === 'char' || type === 'bool' ? 'int' : type;
            }
            if (e.kind === 'binary') {
                const a = requireScalar(infer(e.left), e), b = requireScalar(infer(e.right), e);
                if (['%', '&', '|', '^', '<<', '>>'].includes(e.op) && [a, b].some(t => ['float', 'double'].includes(t)))
                    throw new CompileFault('semantics', 'INTEGER_OPERANDS', `Operator ${e.op} requires integer operands.`, e);
                return ['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(e.op) ? program.language === 'cpp' ? 'bool' : 'int' : arithmeticType({ type: a, value: 0 }, { type: b, value: 0 });
            }
            if (e.kind === 'assign') {
                const a = lookup(e.name, e).type, b = requireScalar(infer(e.value), e);
                if (['%=', '&=', '|=', '^=', '<<=', '>>='].includes(e.op) && [a, b].some(t => ['float', 'double'].includes(t)))
                    throw new CompileFault('semantics', 'INTEGER_OPERANDS', `Operator ${e.op} requires integer operands.`, e);
                return a;
            }
            if (e.kind === 'conditional') {
                requireScalar(infer(e.condition), e);
                const a = requireScalar(infer(e.yes), e), b = requireScalar(infer(e.no), e);
                return program.language === 'cpp' && a === b ? a : arithmeticType({ type: a, value: 0 }, { type: b, value: 0 });
            }
            if (e.kind === 'call') {
                if (scopes.some(scope => scope.has(e.name)))
                    throw new CompileFault('semantics', 'NOT_CALLABLE', `'${e.name}' is a scalar variable in this scope, not a callable function.`, e);
                const callee = functions.get(e.name);
                if (callee) {
                    e.args.forEach(a => requireScalar(infer(a), a));
                    return callee.type;
                }
                if (['printf', 'scanf', 'puts'].includes(e.name)) {
                    if (!e.args.length || infer(e.args[0]) !== 'string' || e.args[0].kind !== 'string')
                        throw new CompileFault('semantics', 'FORMAT', `${e.name} requires a literal format/string argument.`, e);
                    e.args.slice(1).forEach(infer);
                    return e.name === 'puts' ? 'void' : 'int';
                }
                const expected = e.name === 'pow' ? 2 : 1;
                if (e.args.length !== expected)
                    throw new CompileFault('semantics', 'ARITY', `${e.name} expects ${expected} argument(s).`, e);
                const types = e.args.map(a => requireScalar(infer(a), a));
                if (e.name === 'abs' && types.some(t => ['float', 'double'].includes(t)))
                    throw new CompileFault('semantics', 'UNSUPPORTED_OVERLOAD', 'Use fabs for floating-point absolute values; abs is the integer form in the shared visual subset.', e);
                return ['sqrt', 'pow', 'fabs'].includes(e.name) ? 'double' : 'int';
            }
            throw new CompileFault('semantics', 'INTERNAL', 'Missing expression type.', e);
        };
        // Reject evaluation-order dependencies rather than imposing JavaScript's order on C/C++.
        const effects = (e: Expr): {
            read: Set<string>;
            write: Set<string>;
        } => {
            const read = new Set<string>(), write = new Set<string>();
            const merge = (x: ReturnType<typeof effects>) => { x.read.forEach(n => read.add(n)); x.write.forEach(n => write.add(n)); };
            if (e.kind === 'name')
                read.add(e.name);
            if (e.kind === 'assign') {
                const effect = effects(e.value);
                if (effect.write.has(e.name))
                    throw new CompileFault('semantics', 'UNSEQUENCED', 'Separate a write to an assignment target from writes to the same variable in its right-hand expression.', e);
                merge(effect);
                write.add(e.name);
                if (e.op !== '=')
                    read.add(e.name);
            }
            if (e.kind === 'unary') {
                merge(effects(e.argument));
                if (['++', '--'].includes(e.op) && e.argument.kind === 'name')
                    write.add(e.argument.name);
            }
            if (e.kind === 'binary') {
                const l = effects(e.left), r = effects(e.right);
                if (!['&&', '||'].includes(e.op) && ([...l.write].some(n => r.read.has(n) || r.write.has(n)) || [...r.write].some(n => l.read.has(n))))
                    throw new CompileFault('semantics', 'UNSEQUENCED', 'Unsequenced reads/writes in one expression are rejected. Split the operations into separate statements.', e);
                merge(l);
                merge(r);
            }
            if (e.kind === 'call') {
                const args = e.args.map(effects);
                for (let i = 0; i < args.length; i++)
                    for (let j = i + 1; j < args.length; j++)
                        if ([...args[i].write].some(n => args[j].read.has(n) || args[j].write.has(n)) || [...args[j].write].some(n => args[i].read.has(n)))
                            throw new CompileFault('semantics', 'UNSEQUENCED', 'Function argument evaluation-order dependencies are unsupported.', e);
                args.forEach(merge);
                if (['printf', 'scanf', 'puts', 'putchar'].includes(e.name) || ioFunctions.has(e.name))
                    write.add('$io');
                if (e.name === 'scanf')
                    for (const a of e.args)
                        if (a.kind === 'unary' && a.op === '&' && a.argument.kind === 'name')
                            write.add(a.argument.name);
            }
            if (e.kind === 'conditional') {
                merge(effects(e.condition));
                merge(effects(e.yes));
                merge(effects(e.no));
            }
            if (e.kind === 'cast')
                merge(effects(e.value));
            return { read, write };
        };
        const expr = (e: Expr, allowAddress = false): void => {
            effects(e);
            if (e.kind === 'name') {
                lookup(e.name, e);
                return;
            }
            if (e.kind === 'unary') {
                if (e.op === '&') {
                    if (!allowAddress || e.argument.kind !== 'name')
                        throw new CompileFault('semantics', 'POINTERS', 'Address-of is supported only for scalar scanf destinations.', e);
                    lookup(e.argument.name, e);
                    return;
                }
                if (['++', '--'].includes(e.op)) {
                    if (e.argument.kind !== 'name')
                        throw new CompileFault('semantics', 'LVALUE', 'Increment/decrement requires a variable.', e);
                    const b = lookup(e.argument.name, e);
                    if (b.constant)
                        throw new CompileFault('semantics', 'CONST', 'Cannot modify a const variable.', e);
                    if (b.type === 'bool')
                        throw new CompileFault('semantics', 'BOOL_INCREMENT', 'Incrementing/decrementing bool is excluded from the shared visual subset.', e);
                }
                expr(e.argument);
                return;
            }
            if (e.kind === 'assign') {
                const b = lookup(e.name, e);
                if (b.constant)
                    throw new CompileFault('semantics', 'CONST', `Cannot assign to const variable '${e.name}'.`, e);
                expr(e.value);
                return;
            }
            if (e.kind === 'binary') {
                expr(e.left);
                expr(e.right);
                return;
            }
            if (e.kind === 'conditional') {
                expr(e.condition);
                expr(e.yes);
                expr(e.no);
                return;
            }
            if (e.kind === 'cast') {
                expr(e.value);
                return;
            }
            if (e.kind === 'call') {
                if (!builtins.has(e.name) && !functions.has(e.name))
                    throw new CompileFault('semantics', 'FUNCTION', `Function '${e.name}' is not defined in the supported program.`, e);
                if (functions.has(e.name) && functions.get(e.name)!.params.length !== e.args.length)
                    throw new CompileFault('semantics', 'ARITY', `Function '${e.name}' expects ${functions.get(e.name)!.params.length} arguments.`, e);
                if (e.name === 'scanf' && e.args.slice(1).some(a => a.kind !== 'unary' || a.op !== '&'))
                    throw new CompileFault('semantics', 'SCANF', 'scanf requires address-of scalar destinations.', e);
                e.args.forEach(a => { expr(a, e.name === 'scanf'); if (e.name === 'scanf' && a.kind === 'unary' && a.argument.kind === 'name' && lookup(a.argument.name, a).constant)
                    throw new CompileFault('semantics', 'CONST', 'scanf cannot modify a const variable.', a); });
            }
        };
        const stmt = (s: Stmt): void => {
            switch (s.kind) {
                case 'block':
                    scopes.push(new Map());
                    s.statements.forEach(stmt);
                    scopes.pop();
                    break;
                case 'group':
                    s.statements.forEach(stmt);
                    break;
                case 'decl':
                    declare(s.name, s.type, s.constant, s);
                    if (s.init) {
                        expr(s.init);
                        requireScalar(infer(s.init), s.init);
                    }
                    break;
                case 'expr':
                    expr(s.expression);
                    infer(s.expression);
                    break;
                case 'output':
                    s.values.forEach(e => { expr(e); const type = infer(e); if (type !== 'string')
                        requireScalar(type, e); });
                    break;
                case 'input':
                    s.names.forEach(name => { if (lookup(name, s).constant)
                        throw new CompileFault('semantics', 'CONST', 'Input cannot modify a const variable.', s); });
                    break;
                case 'if':
                    expr(s.condition);
                    requireScalar(infer(s.condition), s.condition);
                    scopes.push(new Map());
                    stmt(s.yes);
                    scopes.pop();
                    if (s.no) {
                        scopes.push(new Map());
                        stmt(s.no);
                        scopes.pop();
                    }
                    break;
                case 'while':
                    expr(s.condition);
                    requireScalar(infer(s.condition), s.condition);
                    loops++;
                    scopes.push(new Map());
                    stmt(s.body);
                    scopes.pop();
                    loops--;
                    break;
                case 'for':
                    scopes.push(new Map());
                    if (s.init)
                        stmt(s.init);
                    if (s.condition) {
                        expr(s.condition);
                        requireScalar(infer(s.condition), s.condition);
                    }
                    if (s.update) {
                        expr(s.update);
                        infer(s.update);
                    }
                    loops++;
                    scopes.push(new Map());
                    stmt(s.body);
                    scopes.pop();
                    loops--;
                    scopes.pop();
                    break;
                case 'return':
                    if (fn.type === 'void' && s.value)
                        throw new CompileFault('semantics', 'RETURN', 'A void function cannot return a value.', s);
                    if (fn.type !== 'void' && !s.value)
                        throw new CompileFault('semantics', 'RETURN', 'A non-void function requires a return value.', s);
                    if (s.value) {
                        expr(s.value);
                        requireScalar(infer(s.value), s.value);
                    }
                    break;
                case 'break':
                case 'continue':
                    if (!loops)
                        throw new CompileFault('semantics', 'LOOP_CONTROL', `${s.kind} requires a loop.`, s);
                    break;
                case 'empty': break;
            }
        };
        fn.params.forEach(p => declare(p.name, p.type, false, fn));
        if (fn.body.kind === 'block')
            fn.body.statements.forEach(stmt);
        else
            stmt(fn.body);
    }
    return rows;
}

