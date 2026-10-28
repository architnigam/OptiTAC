import type { CProgram, RunResult } from '../core/types';
import { numberText } from '../core/numbers';
import { routePasses } from '../core/optimizer';
export function runLabel(r: RunResult | undefined) { return !r ? 'Not available' : r.status === 'returned' ? `${numberText(r.returnValue!.value)} (${r.returnValue!.type})` : r.status === 'limited' ? 'Inconclusive' : r.status === 'undefined' ? 'Undefined behavior' : 'Execution unavailable'; }
export const routeName = (route: string[]) => route.length ? route.map(id => routePasses.find(p => p.id === id)?.name ?? 'Broken candidate').join(' → ') : 'Original IR (no changes selected)';
export function programSummary(program: CProgram) { return `${program.functions.length} function${program.functions.length === 1 ? '' : 's'} · ${program.snippet ? 'snippet wrapped as int main()' : program.language === 'cpp' ? 'C++ program' : 'C program'}`; }

