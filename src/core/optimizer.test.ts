import { describe, it, expect } from 'vitest';
import { analyze, observationsMatch } from './analyze';
import { basicBlocks, conditionalConstants, deadTemporaries, reachableCode, tidyJumps } from './optimizer';
import { executeIR } from './ir';
import { compileTest as compile } from './testHelpers';
const cases = [
    'int main(){int x=2;return x+3;}',
    'int main(){int n=0;for(int i=0;i<10;i++){n+=i;}return n;}',
    'int main(){int n;cin>>n;int s=0;while(n>0){s+=n;n--;}cout<<s;return s;}',
    'int main(){int x=1;if(x){int x=5;cout<<x;}cout<<x;return x;}',
    'int f(int n){if(n<2)return n;return f(n-1)+f(n-2);}int main(){return f(8);}',
    'int main(){int x=1;if(1){return 9;}return 1/0;}',
    'int main(){int n;cin>>n;int x=1;if(n>3)x=4;else x=7;return x;}',
];
describe('Guarded worklist/CFG route search', () => {
    it.each(cases)('validates every accepted route for %s', source => { const r = analyze(source, 'cpp', ['2', '5']); expect(r.diagnostic, JSON.stringify(r.diagnostic)).toBeUndefined(); expect(r.searchStatus).toBe('validated'); expect(r.costAfter).toBeLessThanOrEqual(r.costBefore); expect(r.candidates.every(c => !c.accepted || c.checks.every(k => k.matched))).toBe(true); r.optimizedRuns.forEach((run, i) => expect(observationsMatch(r.reference[i], run)).toBe(true)); });
    it('skips unsafe or undefined executions without claiming a proof', () => { const r = analyze('int main(){return 1/0;}'); expect(r.searchStatus).toBe('unsafe'); expect(r.candidates).toHaveLength(0); expect(r.reference[0].status).toBe('undefined'); });
    it('does not compare timeouts as equal outcomes', () => { const r = analyze('int main(){while(1){}return 0;}', 'cpp', [''], 100); expect(r.searchStatus).toBe('inconclusive'); expect(observationsMatch(r.reference[0], r.originalRuns[0])).toBe(false); });
    it('builds successors and liveness facts for branches', () => { const { ir } = compile('int main(){int x;cin>>x;if(x>2)return 5;return 8;}'); const blocks = basicBlocks(ir); expect(blocks.length).toBeGreaterThan(2); expect(blocks.some(b => b.successors.length === 2)).toBe(true); expect(blocks.every(b => b.successors.every(id => blocks.some(t => t.id === id)))).toBe(true); });
    it('preserves input effects in lazy conditions', () => { const r = analyze('int main(){int n=1;int x=0;if(n || (x=3)){}cout<<x;return x;}'); expect(r.diagnostic).toBeUndefined(); expect(r.optimizedRuns[0].stdout).toBe('0'); });
    it('checks each pass independently before search', () => { const { ir, program } = compile('int main(){int x=3;if(x>2)x+=4;return x;}'); const reference = executeIR(program, ir); for (const pass of [conditionalConstants, reachableCode, deadTemporaries, tidyJumps])
        expect(observationsMatch(reference, executeIR(program, pass(ir, program).ir))).toBe(true); });
});

