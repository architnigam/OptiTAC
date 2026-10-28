import { binary, convert, arithmeticType, truth, unary } from './numbers';
import { successors, instructionText, type Instruction, type IRProgram } from './ir';
import type { CProgram, Expr, ScalarType, Value } from './types';
export interface Rewrite {
    function: string;
    id: number;
    before: string;
    after: string;
    reason: string;
}
export interface PassResult {
    ir: IRProgram;
    logs: Rewrite[];
    iterations: number;
}
export const stable = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'number' && !Number.isFinite(v) ? `#${v}` : Object.is(v, -0) ? '#-0' : v);
const sameValue = (a: Value | undefined, b: Value | undefined) => !!a && !!b && a.type === b.type && Object.is(a.value, b.value);
const sameMap = (a: Map<string, Value> | undefined, b: Map<string, Value>) => a?.size === b.size && [...b].every(([k, v]) => sameValue(a.get(k), v));
export function children(e: Expr): Expr[] { switch (e.kind) {
    case 'binary': return [e.left, e.right];
    case 'unary': return [e.argument];
    case 'assign': return [e.value];
    case 'cast': return [e.value];
    case 'call': return e.args;
    case 'conditional': return [e.condition, e.yes, e.no];
    default: return [];
} }
export function reads(e: Expr): Set<string> {
    const out = new Set<string>();
    if (e.kind === 'name')
        out.add(e.name);
    if (e.kind === 'unary' && e.op === '&')
        return out;
    if (e.kind === 'assign' && e.op !== '=')
        out.add(e.name);
    children(e).forEach(c => reads(c).forEach(n => out.add(n)));
    return out;
}
export function writes(e: Expr): Set<string> { const out = new Set<string>(); if (e.kind === 'assign')
    out.add(e.name); if (e.kind === 'unary' && ['++', '--'].includes(e.op) && e.argument.kind === 'name')
    out.add(e.argument.name); if (e.kind === 'call' && e.name === 'scanf')
    for (const arg of e.args)
        if (arg.kind === 'unary' && arg.op === '&' && arg.argument.kind === 'name')
            out.add(arg.argument.name); children(e).forEach(c => writes(c).forEach(n => out.add(n))); return out; }
export function instructionExpr(i: Instruction): Expr | undefined { return i.kind === 'compute' || i.kind === 'evaluate' ? i.expression : i.kind === 'declare' || i.kind === 'initialize' || i.kind === 'return' ? i.value : i.kind === 'branch' ? i.condition : i.kind === 'output' ? i.value : undefined; }
export function facts(i: Instruction) { const e = instructionExpr(i); const use = e ? reads(e) : new Set<string>(); const def = e ? writes(e) : new Set<string>(); if (i.kind === 'compute')
    def.add(i.target); if (i.kind === 'declare' || i.kind === 'initialize')
    def.add(i.name); if (i.kind === 'input')
    i.names.forEach(n => def.add(n)); return { use, def }; }
function typeOf(e: Expr, types: Map<string, ScalarType>, program: CProgram): ScalarType | undefined {
    if (e.kind === 'literal')
        return e.data.type;
    if (e.kind === 'name')
        return types.get(e.name);
    if (e.kind === 'cast')
        return e.type;
    if (e.kind === 'assign')
        return types.get(e.name);
    if (e.kind === 'call') {
        const fn = program.functions.find(f => f.name === e.name);
        return fn && fn.type !== 'void' ? fn.type : ['sqrt', 'pow', 'fabs'].includes(e.name) ? 'double' : 'int';
    }
    if (e.kind === 'unary') {
        const type = typeOf(e.argument, types, program);
        return e.op === '!' ? (program.language === 'cpp' ? 'bool' : 'int') : ['++', '--'].includes(e.op) ? type : type === 'char' || type === 'bool' ? 'int' : type;
    }
    if (e.kind === 'binary') {
        if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(e.op))
            return program.language === 'cpp' ? 'bool' : 'int';
        const a = typeOf(e.left, types, program), b = typeOf(e.right, types, program);
        return a && b ? arithmeticType({ type: a, value: 0 }, { type: b, value: 0 }) : undefined;
    }
    if (e.kind === 'conditional') {
        const a = typeOf(e.yes, types, program), b = typeOf(e.no, types, program);
        return a && b ? program.language === 'cpp' && a === b ? a : arithmeticType({ type: a, value: 0 }, { type: b, value: 0 }) : undefined;
    }
}
function constant(e: Expr, state: Map<string, Value>, types: Map<string, ScalarType>, program: CProgram): Value | undefined {
    try {
        switch (e.kind) {
            case 'literal': return e.data;
            case 'name': return state.get(e.name);
            case 'cast': {
                const v = constant(e.value, state, types, program);
                return v ? convert(v, e.type, e) : undefined;
            }
            case 'unary': {
                if (['++', '--', '&'].includes(e.op))
                    return;
                const v = constant(e.argument, state, types, program);
                return v ? unary(e.op, v, e, program.language) : undefined;
            }
            case 'binary': {
                const a = constant(e.left, state, types, program);
                if (!a)
                    return;
                if (e.op === '&&' && !truth(a))
                    return { type: program.language === 'cpp' ? 'bool' : 'int', value: 0 };
                if (e.op === '||' && truth(a))
                    return { type: program.language === 'cpp' ? 'bool' : 'int', value: 1 };
                const b = constant(e.right, state, types, program);
                return b ? binary(e.op, a, b, e, program.language) : undefined;
            }
            case 'conditional': {
                const c = constant(e.condition, state, types, program);
                const type = typeOf(e, types, program);
                if (!c || !type)
                    return;
                const v = constant(truth(c) ? e.yes : e.no, state, types, program);
                return v ? convert(v, type, e) : undefined;
            }
            default: return;
        }
    }
    catch {
        return;
    }
}
function rewrite(e: Expr, state: Map<string, Value>, types: Map<string, ScalarType>, program: CProgram): Expr {
    const value = constant(e, state, types, program);
    if (value)
        return { kind: 'literal', data: value, line: e.line, column: e.column };
    if (e.kind === 'binary')
        return { ...e, left: rewrite(e.left, state, types, program), right: rewrite(e.right, state, types, program) };
    if (e.kind === 'unary')
        return ['++', '--', '&'].includes(e.op) ? e : { ...e, argument: rewrite(e.argument, state, types, program) };
    if (e.kind === 'assign')
        return { ...e, value: rewrite(e.value, state, types, program) };
    if (e.kind === 'cast')
        return { ...e, value: rewrite(e.value, state, types, program) };
    if (e.kind === 'call')
        return { ...e, args: e.args.map(a => rewrite(a, state, types, program)) };
    if (e.kind === 'conditional')
        return { ...e, condition: rewrite(e.condition, state, types, program), yes: rewrite(e.yes, state, types, program), no: rewrite(e.no, state, types, program) };
    return e;
}
function transfer(i: Instruction, incoming: Map<string, Value>, types: Map<string, ScalarType>, program: CProgram): Map<string, Value> {
    const state = new Map(incoming);
    const e = instructionExpr(i);
    if (e)
        writes(e).forEach(n => state.delete(n));
    if (i.kind === 'input')
        i.names.forEach(n => state.delete(n));
    if (i.kind === 'declare') {
        state.delete(i.name);
        const v = i.value ? constant(i.value, incoming, types, program) : undefined;
        if (v)
            try {
                state.set(i.name, convert(v, i.type, i));
            }
            catch { /* Preserve the runtime conversion diagnostic. */ }
    }
    if (i.kind === 'initialize') {
        state.delete(i.name);
        const v = constant(i.value, incoming, types, program), type = types.get(i.name);
        if (v && type)
            try {
                state.set(i.name, convert(v, type, i));
            }
            catch { /* Preserve conversion diagnostic. */ }
    }
    if (i.kind === 'compute') {
        state.delete(i.target);
        let v = constant(i.expression, incoming, types, program);
        try {
            const e = i.expression;
            if (e.kind === 'assign') {
                const rhs = constant(e.value, incoming, types, program), lhs = incoming.get(e.name), type = types.get(e.name);
                const value = rhs ? (e.op === '=' ? rhs : lhs ? binary(e.op.slice(0, -1), lhs, rhs, e, program.language) : undefined) : undefined;
                if (value && type) {
                    v = convert(value, type, e);
                    state.set(e.name, v);
                }
            }
            else if (e.kind === 'unary' && ['++', '--'].includes(e.op) && e.argument.kind === 'name') {
                const before = incoming.get(e.argument.name), type = types.get(e.argument.name);
                if (before && type) {
                    const after = convert(binary(e.op === '++' ? '+' : '-', before, { type: 'int', value: 1 }, e, program.language), type, e);
                    state.set(e.argument.name, after);
                    v = e.postfix ? before : after;
                }
            }
        }
        catch {
            v = undefined;
        }
        if (v)
            state.set(i.target, v);
    }
    return state;
}
export function conditionalConstants(ir: IRProgram, program: CProgram): PassResult {
    const logs: Rewrite[] = [];
    let iterations = 0;
    const functions = ir.functions.map(fn => {
        const code = fn.instructions;
        if (!code.length)
            return fn;
        const types = new Map<string, ScalarType>(program.functions.find(f => f.name === fn.name)!.params.map(p => [p.name, p.type]));
        for (const i of code) {
            if (i.kind === 'declare')
                types.set(i.name, i.type);
            if (i.kind === 'compute') {
                const type = typeOf(i.expression, types, program);
                if (type)
                    types.set(i.target, type);
            }
        }
        const next = successors(code);
        const incoming: (Map<string, Value> | undefined)[] = new Array(code.length);
        const outgoing: (Map<string, Value> | undefined)[] = new Array(code.length);
        const edges = new Map<number, Set<number>>();
        const queue = [0];
        const queued = new Set([0]);
        incoming[0] = new Map();
        const merge = (a: Map<string, Value> | undefined, b: Map<string, Value>) => a ? new Map([...a].filter(([name, v]) => sameValue(v, b.get(name)))) : new Map(b);
        while (queue.length) {
            const index = queue.shift()!;
            queued.delete(index);
            iterations++;
            if (iterations > 200000)
                throw new Error('Data-flow worklist budget exceeded.');
            const state = incoming[index];
            if (!state)
                continue;
            const out = transfer(code[index], state, types, program);
            const changed = !sameMap(outgoing[index], out);
            outgoing[index] = out;
            let targets = next[index];
            const i = code[index];
            if (i.kind === 'branch') {
                const v = constant(i.condition, state, types, program);
                if (v)
                    targets = [next[index][truth(v) ? 0 : 1]];
            }
            const seen = edges.get(index) ?? new Set<number>();
            for (const target of targets) {
                const fresh = !seen.has(target);
                seen.add(target);
                if (changed || fresh) {
                    const combined = merge(incoming[target], out);
                    if (!sameMap(incoming[target], combined)) {
                        incoming[target] = combined;
                        if (!queued.has(target)) {
                            queue.push(target);
                            queued.add(target);
                        }
                    }
                }
            }
            edges.set(index, seen);
        }
        const instructions = code.map((i, index): Instruction => {
            const state = incoming[index];
            if (!state)
                return i;
            let updated: Instruction = i;
            if (i.kind === 'compute')
                updated = { ...i, expression: rewrite(i.expression, state, types, program) };
            if (i.kind === 'evaluate')
                updated = { ...i, expression: rewrite(i.expression, state, types, program) };
            if (i.kind === 'declare' && i.value)
                updated = { ...i, value: rewrite(i.value, state, types, program) };
            if (i.kind === 'initialize')
                updated = { ...i, value: rewrite(i.value, state, types, program) };
            if (i.kind === 'return' && i.value)
                updated = { ...i, value: rewrite(i.value, state, types, program) };
            if (i.kind === 'output')
                updated = { ...i, value: rewrite(i.value, state, types, program) };
            if (i.kind === 'branch') {
                const condition = rewrite(i.condition, state, types, program);
                updated = condition.kind === 'literal' ? { kind: 'jump', label: truth(condition.data) ? i.yes : i.no, id: i.id, line: i.line, column: i.column } : { ...i, condition };
            }
            if (stable(i) !== stable(updated))
                logs.push({ function: fn.name, id: i.id, before: instructionText(i), after: instructionText(updated), reason: 'Worklist constant facts agree across every discovered incoming edge. Typed folding preserves integer, float and double semantics; branch conditions are simplified only when known.' });
            return updated;
        });
        return { ...fn, instructions };
    });
    return { ir: { functions }, logs, iterations };
}
export function reachableCode(ir: IRProgram): PassResult {
    const logs: Rewrite[] = [];
    const functions = ir.functions.map(fn => { const next = successors(fn.instructions); const live = new Set<number>(); const stack = fn.instructions.length ? [0] : []; while (stack.length) {
        const i = stack.pop()!;
        if (live.has(i))
            continue;
        live.add(i);
        stack.push(...next[i]);
    } return { ...fn, instructions: fn.instructions.filter((i, index) => { if (live.has(index))
            return true; logs.push({ function: fn.name, id: i.id, before: instructionText(i), after: '(removed)', reason: 'No path from this function entry reaches this instruction in the current control-flow graph.' }); return false; }) }; });
    return { ir: { functions }, logs, iterations: 0 };
}
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(n => b.has(n));
export function liveness(code: Instruction[]) {
    const next = successors(code);
    const before = code.map(() => new Set<string>()), after = code.map(() => new Set<string>());
    let changed = true, iterations = 0;
    while (changed) {
        changed = false;
        iterations++;
        if (iterations > 10000)
            throw new Error('Liveness budget exceeded.');
        for (let n = code.length - 1; n >= 0; n--) {
            const out = new Set(next[n].flatMap(i => [...before[i]]));
            const { use, def } = facts(code[n]);
            const input = new Set([...use, ...[...out].filter(v => !def.has(v))]);
            if (!sameSet(before[n], input) || !sameSet(after[n], out)) {
                before[n] = input;
                after[n] = out;
                changed = true;
            }
        }
    }
    return { before, after, iterations };
}
function canDrop(e: Expr): boolean {
    // User-variable reads may diagnose uninitialized storage; arithmetic may trap.
    // Only proven literals and existing temporary copies can be discarded here.
    return e.kind === 'literal' || (e.kind === 'name' && e.name.startsWith('$'));
}
export function deadTemporaries(ir: IRProgram): PassResult {
    const logs: Rewrite[] = [];
    let iterations = 0;
    const functions = ir.functions.map(fn => { const live = liveness(fn.instructions); iterations += live.iterations; return { ...fn, instructions: fn.instructions.filter((i, index) => { if (i.kind !== 'compute' || live.after[index].has(i.target) || !canDrop(i.expression))
            return true; logs.push({ function: fn.name, id: i.id, before: instructionText(i), after: '(removed)', reason: 'Backward CFG liveness shows the temporary is unused on all successor paths, and its value is a literal or a non-trapping temporary copy. Side effects, variable reads and potentially undefined arithmetic are retained.' }); return false; }) }; });
    return { ir: { functions }, logs, iterations };
}
export function tidyJumps(ir: IRProgram): PassResult {
    const logs: Rewrite[] = [];
    return { ir: { functions: ir.functions.map(fn => ({ ...fn, instructions: fn.instructions.filter((i, index) => { const next = fn.instructions[index + 1]; if (i.kind === 'jump' && next?.kind === 'label' && i.label === next.name) {
                    logs.push({ function: fn.name, id: i.id, before: instructionText(i), after: '(removed)', reason: 'The target label is the immediate next instruction, so ordinary fall-through takes the same edge.' });
                    return false;
                } return true; }) })) }, logs, iterations: 0 };
}
export const routePasses = [{ id: 'constants', name: 'Conditional constants', run: conditionalConstants }, { id: 'reachability', name: 'Reachability pruning', run: reachableCode }, { id: 'liveness', name: 'Effect-aware liveness', run: deadTemporaries }, { id: 'jumps', name: 'Jump cleanup', run: tidyJumps }];
export const instructionCount = (ir: IRProgram) => ir.functions.reduce((sum, f) => sum + f.instructions.length, 0);
export function cost(ir: IRProgram) { return ir.functions.reduce((sum, f) => sum + f.instructions.reduce((s, i) => s + (i.kind === 'compute' ? 3 : i.kind === 'branch' ? 2 : i.kind === 'label' || i.kind === 'scope' ? 0 : 1), 0), 0); }
export interface BasicBlock {
    id: string;
    function: string;
    start: number;
    end: number;
    instructions: Instruction[];
    successors: string[];
    liveIn: string[];
    liveOut: string[];
}
export function basicBlocks(ir: IRProgram): BasicBlock[] {
    return ir.functions.flatMap(fn => {
        const code = fn.instructions;
        if (!code.length)
            return [];
        const next = successors(code), live = liveness(code);
        const leaders = new Set([0]);
        code.forEach((i, index) => { if (['branch', 'jump', 'return'].includes(i.kind)) {
            next[index].forEach(n => leaders.add(n));
            if (index + 1 < code.length)
                leaders.add(index + 1);
        } if (i.kind === 'label')
            leaders.add(index); });
        const starts = [...leaders].sort((a, b) => a - b);
        const blocks = starts.map((start, i) => ({ id: `${fn.name}:B${i}`, function: fn.name, start, end: (starts[i + 1] ?? code.length) - 1, instructions: [] as Instruction[], successors: [] as string[], liveIn: [...live.before[start]], liveOut: [] as string[] }));
        blocks.forEach(block => { block.instructions = code.slice(block.start, block.end + 1); block.successors = next[block.end].map(index => blocks.find(b => b.start === index)!.id); block.liveOut = [...live.after[block.end]]; });
        return blocks;
    });
}

