import { CompileFault, here, type CProgram, type Expr, type FunctionDef, type Position, type ScalarType, type Stmt, type Value } from './types';
import { Machine, decimalGeneral, finish, numeric } from './runtime';
import { truth, numberText } from './numbers';
export type Instruction = Position & {
    id: number;
} & ({
    kind: 'compute';
    target: string;
    expression: Expr;
} | {
    kind: 'evaluate';
    expression: Expr;
} | {
    kind: 'declare';
    name: string;
    type: ScalarType;
    constant: boolean;
    value?: Expr;
} | {
    kind: 'initialize';
    name: string;
    value: Expr;
} | {
    kind: 'branch';
    condition: Expr;
    yes: string;
    no: string;
} | {
    kind: 'jump';
    label: string;
} | {
    kind: 'label';
    name: string;
} | {
    kind: 'scope';
    action: 'enter' | 'leave' | 'unwind';
    depth?: number;
} | {
    kind: 'return';
    value?: Expr;
} | {
    kind: 'output';
    value: Expr;
} | {
    kind: 'input';
    names: string[];
});
export interface IRFunction {
    name: string;
    instructions: Instruction[];
}
export interface IRProgram {
    functions: IRFunction[];
}
export function expressionText(e: Expr): string {
    switch (e.kind) {
        case 'literal': return `${numberText(e.data.value)}${e.data.type === 'float' ? 'f' : ''}`;
        case 'string': return JSON.stringify(e.value);
        case 'name': return e.name;
        case 'unary': return e.postfix ? `${expressionText(e.argument)}${e.op}` : `${e.op}${expressionText(e.argument)}`;
        case 'binary': return `${expressionText(e.left)} ${e.op} ${expressionText(e.right)}`;
        case 'assign': return `${e.name} ${e.op} ${expressionText(e.value)}`;
        case 'call': return `${e.name}(${e.args.map(expressionText).join(', ')})`;
        case 'cast': return `(${e.type}) ${expressionText(e.value)}`;
        case 'conditional': return `${expressionText(e.condition)} ? ${expressionText(e.yes)} : ${expressionText(e.no)}`;
    }
}
export function instructionText(i: Instruction): string {
    switch (i.kind) {
        case 'compute': return `${i.target} = ${['conditional'].includes(i.expression.kind) || (i.expression.kind === 'binary' && ['&&', '||'].includes(i.expression.op)) ? 'lazy(' : ''}${expressionText(i.expression)}${['conditional'].includes(i.expression.kind) || (i.expression.kind === 'binary' && ['&&', '||'].includes(i.expression.op)) ? ')' : ''}`;
        case 'declare': return `${i.constant ? 'const ' : ''}${i.type} ${i.name}${i.value ? ' = ' + expressionText(i.value) : ' (uninitialized)'}`;
        case 'evaluate': return `evaluate ${expressionText(i.expression)}`;
        case 'initialize': return `init ${i.name} = ${expressionText(i.value)}`;
        case 'branch': return `if ${expressionText(i.condition)} goto ${i.yes} else ${i.no}`;
        case 'jump': return `goto ${i.label}`;
        case 'label': return `${i.name}:`;
        case 'scope': return i.action === 'unwind' ? `unwind scopes to ${i.depth}` : `${i.action} scope`;
        case 'return': return `return${i.value ? ' ' + expressionText(i.value) : ''}`;
        case 'output': return `cout << ${expressionText(i.value)}`;
        case 'input': return `cin >> ${i.names.join(' >> ')}`;
    }
}
export function generateIR(program: CProgram): IRProgram {
    let id = 1;
    return { functions: program.functions.map(fn => {
            const instructions: Instruction[] = [];
            let temp = 0, label = 0, depth = 1, bindingId = 0;
            const bindings: Map<string, string>[] = [new Map(fn.params.map(p => [p.name, p.name]))];
            const bound = (name: string) => { for (let n = bindings.length - 1; n >= 0; n--)
                if (bindings[n].has(name))
                    return bindings[n].get(name)!; return name; };
            const rename = (e: Expr): Expr => {
                if (e.kind === 'name')
                    return { ...e, name: bound(e.name) };
                if (e.kind === 'binary')
                    return { ...e, left: rename(e.left), right: rename(e.right) };
                if (e.kind === 'unary')
                    return { ...e, argument: rename(e.argument) };
                if (e.kind === 'assign')
                    return { ...e, name: bound(e.name), value: rename(e.value) };
                if (e.kind === 'call')
                    return { ...e, args: e.args.map(rename) };
                if (e.kind === 'cast')
                    return { ...e, value: rename(e.value) };
                if (e.kind === 'conditional')
                    return { ...e, condition: rename(e.condition), yes: rename(e.yes), no: rename(e.no) };
                return e;
            };
            type Bare<T> = T extends unknown ? Omit<T, 'id' | 'line' | 'column'> : never;
            const emit = (i: Bare<Instruction>, pos: Position) => instructions.push({ ...i, id: id++, ...here(pos) } as Instruction);
            const fresh = () => `L${++label}`;
            const lower = (e: Expr): Expr => {
                e = rename(e);
                if (['literal', 'name', 'string'].includes(e.kind))
                    return e;
                let expression = e;
                if (e.kind === 'binary' && !['&&', '||'].includes(e.op))
                    expression = { ...e, left: lower(e.left), right: lower(e.right) };
                else if (e.kind === 'unary' && !['++', '--', '&'].includes(e.op))
                    expression = { ...e, argument: lower(e.argument) };
                else if (e.kind === 'unary' && e.op === '&')
                    return e;
                else if (e.kind === 'cast')
                    expression = { ...e, value: lower(e.value) };
                else if (e.kind === 'assign')
                    expression = { ...e, value: lower(e.value) };
                else if (e.kind === 'call')
                    expression = { ...e, args: e.args.map(lower) };
                const target = `$t${++temp}`;
                emit({ kind: 'compute', target, expression }, e);
                return { kind: 'name', name: target, ...here(e) };
            };
            const loops: {
                exit: string;
                next: string;
                depth: number;
            }[] = [];
            const scope = (s: Stmt, body: () => void) => { emit({ kind: 'scope', action: 'enter' }, s); depth++; bindings.push(new Map()); body(); bindings.pop(); depth--; emit({ kind: 'scope', action: 'leave' }, s); };
            const scoped = (s: Stmt) => scope(s, () => stmt(s));
            const stmt = (s: Stmt): void => {
                switch (s.kind) {
                    case 'block':
                        scope(s, () => s.statements.forEach(stmt));
                        break;
                    case 'group':
                        s.statements.forEach(stmt);
                        break;
                    case 'decl': {
                        const name = `${s.name}#${++bindingId}`;
                        bindings.at(-1)!.set(s.name, name);
                        emit({ kind: 'declare', name, type: s.type, constant: s.constant }, s);
                        if (s.init)
                            emit({ kind: 'initialize', name, value: lower(s.init) }, s);
                        break;
                    }
                    case 'expr': {
                        const e = s.expression;
                        if (e.kind === 'call' && (e.name === 'puts' || program.functions.find(f => f.name === e.name)?.type === 'void'))
                            emit({ kind: 'evaluate', expression: rename(e) }, s);
                        else
                            lower(e);
                        break;
                    }
                    case 'output':
                        s.values.forEach(value => emit({ kind: 'output', value: lower(value) }, value));
                        break;
                    case 'input':
                        emit({ kind: 'input', names: s.names.map(bound) }, s);
                        break;
                    case 'return':
                        emit({ kind: 'return', value: s.value ? lower(s.value) : undefined }, s);
                        break;
                    case 'if': {
                        const yes = fresh(), no = fresh(), end = fresh();
                        emit({ kind: 'branch', condition: lower(s.condition), yes, no }, s);
                        emit({ kind: 'label', name: yes }, s);
                        scoped(s.yes);
                        emit({ kind: 'jump', label: end }, s);
                        emit({ kind: 'label', name: no }, s);
                        if (s.no)
                            scoped(s.no);
                        emit({ kind: 'label', name: end }, s);
                        break;
                    }
                    case 'while': {
                        const head = fresh(), body = fresh(), exit = fresh();
                        emit({ kind: 'label', name: head }, s);
                        emit({ kind: 'branch', condition: lower(s.condition), yes: body, no: exit }, s);
                        emit({ kind: 'label', name: body }, s);
                        loops.push({ exit, next: head, depth });
                        scoped(s.body);
                        loops.pop();
                        emit({ kind: 'jump', label: head }, s);
                        emit({ kind: 'label', name: exit }, s);
                        break;
                    }
                    case 'for':
                        scope(s, () => { if (s.init)
                            stmt(s.init); const head = fresh(), body = fresh(), next = fresh(), exit = fresh(); emit({ kind: 'label', name: head }, s); emit({ kind: 'branch', condition: s.condition ? lower(s.condition) : { kind: 'literal', data: { type: 'int', value: 1 }, ...here(s) }, yes: body, no: exit }, s); emit({ kind: 'label', name: body }, s); loops.push({ exit, next, depth }); scoped(s.body); loops.pop(); emit({ kind: 'label', name: next }, s); if (s.update)
                            lower(s.update); emit({ kind: 'jump', label: head }, s); emit({ kind: 'label', name: exit }, s); });
                        break;
                    case 'break':
                    case 'continue': {
                        const loop = loops.at(-1);
                        if (!loop)
                            throw new CompileFault('semantics', 'LOOP_CONTROL', `${s.kind} requires a loop.`, s);
                        emit({ kind: 'scope', action: 'unwind', depth: loop.depth }, s);
                        emit({ kind: 'jump', label: s.kind === 'break' ? loop.exit : loop.next }, s);
                        break;
                    }
                    case 'empty': break;
                }
            };
            if (fn.body.kind === 'block')
                fn.body.statements.forEach(stmt);
            else
                stmt(fn.body);
            if (instructions.length > 2000)
                throw new CompileFault('limit', 'IR_LIMIT', 'Limit: 2,000 IR instructions per function.', fn);
            return { name: fn.name, instructions };
        }) };
}
export function successors(instructions: Instruction[]): number[][] {
    const labels = new Map(instructions.flatMap((i, index) => i.kind === 'label' ? [[i.name, index] as const] : []));
    const target = (name: string) => { const index = labels.get(name); if (index === undefined)
        throw new Error(`Missing CFG label ${name}`); return index; };
    return instructions.map((i, index) => i.kind === 'return' ? [] : i.kind === 'jump' ? [target(i.label)] : i.kind === 'branch' ? [target(i.yes), target(i.no)] : index + 1 < instructions.length ? [index + 1] : []);
}
export function executeIR(program: CProgram, ir: IRProgram, input = '', maxSteps = 20000, capture = true) {
    const body = (fn: FunctionDef): Value | undefined => {
        const instructions = ir.functions.find(f => f.name === fn.name)?.instructions;
        if (!instructions)
            throw new CompileFault('runtime', 'INTERNAL', 'Missing IR function.', fn);
        const labels = new Map(instructions.flatMap((i, index) => i.kind === 'label' ? [[i.name, index] as const] : []));
        for (let pc = 0; pc < instructions.length; pc++) {
            const i = instructions[pc];
            machine.tick(i);
            switch (i.kind) {
                case 'compute':
                    machine.write(i.target, numeric(machine.evaluate(i.expression), i), i);
                    break;
                case 'evaluate':
                    machine.evaluate(i.expression);
                    break;
                case 'declare':
                    machine.declare(i.name, i.type, i.constant, i.value ? numeric(machine.evaluate(i.value), i) : undefined, i);
                    break;
                case 'initialize': {
                    const slot = machine.lookup(i.name, i);
                    slot.value = machine.convertForSlot(numeric(machine.evaluate(i.value), i), slot.type, i);
                    break;
                }
                case 'scope':
                    if (i.action === 'enter')
                        machine.frame.scopes.push(new Map());
                    else if (i.action === 'leave') {
                        if (machine.frame.scopes.length <= 1)
                            throw new CompileFault('runtime', 'INTERNAL', 'Scope underflow.', i);
                        machine.frame.scopes.pop();
                    }
                    else {
                        if (!i.depth || i.depth > machine.frame.scopes.length)
                            throw new CompileFault('runtime', 'INTERNAL', 'Invalid scope unwind.', i);
                        machine.frame.scopes.length = i.depth;
                    }
                    break;
                case 'jump': {
                    const target = labels.get(i.label);
                    if (target === undefined)
                        throw new CompileFault('runtime', 'INTERNAL', 'Missing branch label.', i);
                    pc = target - 1;
                    break;
                }
                case 'branch': {
                    const name = truth(numeric(machine.evaluate(i.condition), i)) ? i.yes : i.no;
                    const target = labels.get(name);
                    if (target === undefined)
                        throw new CompileFault('runtime', 'INTERNAL', 'Missing branch label.', i);
                    pc = target - 1;
                    break;
                }
                case 'return': {
                    const value = i.value ? numeric(machine.evaluate(i.value), i) : undefined;
                    machine.record(instructionText(i), i);
                    return value;
                }
                case 'output': {
                    const value = machine.evaluate(i.value);
                    if (typeof value === 'string')
                        machine.emit(value, i);
                    else {
                        const v = numeric(value, i);
                        machine.emit(v.type === 'char' ? String.fromCharCode(v.value & 255) : decimalGeneral(v.value), i);
                    }
                    break;
                }
                case 'input':
                    for (const name of i.names) {
                        const slot = machine.lookup(name, i);
                        const value = machine.readInput(slot.type, i);
                        if (!value)
                            throw new CompileFault('runtime', 'INPUT', 'cin extraction failed; provide matching input values.', i);
                        machine.write(name, value, i);
                    }
                    break;
                case 'label': break;
            }
            if (i.kind !== 'label' && i.kind !== 'scope')
                machine.record(instructionText(i), i);
        }
    };
    const machine: Machine = new Machine(program, input, maxSteps, capture, body);
    return finish(machine, () => machine.call('main', [], { line: 1, column: 1 }));
}

