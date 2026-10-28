/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { analyze, observationsMatch } from './analyze';
import { conditionalConstants, reachableCode, deadTemporaries, tidyJumps, stable } from './optimizer';
import { executeIR } from './ir';
import { compileTest } from './testHelpers';
import type { Language } from './types';
const toolchain = existsSync('C:/msys64/ucrt64/bin/g++.exe') ? 'C:/msys64/ucrt64/bin/' : null;
const environment = { ...process.env, PATH: (toolchain ?? '') + path.delimiter + (process.env.PATH || '') };
const version = spawnSync(toolchain ? toolchain + 'g++.exe' : 'g++', ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000, env: environment });
const nativeAvailable = version.status === 0;
function native(source: string, language: Language, input = '') {
    const base = path.resolve('tmp');
    const dir = mkdtempSync(path.join(base, 'native-oracle-'));
    const file = path.join(dir, language === 'c' ? 'source.c' : 'source.cpp');
    const exe = path.join(dir, 'test.exe');
    try {
        const inputFile = path.join(dir, 'stdin.txt');
        writeFileSync(inputFile, input);
        const prepared = '#include <stdio.h>\n' + source.replace(/\bint\s+main\s*\([^)]*\)\s*\{/, match => match + 'freopen(' + JSON.stringify(inputFile) + ', "r", stdin);');
        writeFileSync(file, prepared);
        const compiler = toolchain ? toolchain + (language === 'c' ? 'gcc.exe' : 'g++.exe') : language === 'c' ? 'gcc' : 'g++';
        const cc = spawnSync(compiler, [file, '-o', exe, language === 'c' ? '-std=c11' : '-std=c++14', '-pedantic-errors', '-O0', '-static-libgcc', '-static-libstdc++'], { encoding: 'utf8', timeout: 20000, windowsHide: true, env: environment });
        if (cc.status !== 0)
            throw Error(cc.stderr || cc.error?.message || 'Native compile failed');
        const fd = openSync(inputFile, 'r');
        try {
            const run = spawnSync(exe, [], { encoding: 'utf8', stdio: [fd, 'pipe', 'pipe'], timeout: 10000, windowsHide: true, env: environment });
            if (run.error)
                throw run.error;
            return { stdout: run.stdout.replaceAll('\r\n', '\n'), status: run.status };
        }
        finally {
            closeSync(fd);
        }
    }
    finally {
        if (path.resolve(dir).startsWith(base + path.sep + 'native-oracle-'))
            try {
                rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
            }
            catch { /* Antivirus file locks affect scratch cleanup, not the comparison result. */ }
    }
}
let state = 1729;
const random = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
const term = (depth: number): string => { if (depth === 0)
    return String(random(19) - 9); const op = ['+', '-', '*', '/', '%'][random(5)]; return `(${term(depth - 1)} ${op} ${op === '/' || op === '%' ? String(1 + random(9)) : term(depth - 1)})`; };
const expressions = Array.from({ length: 240 }, (_, i) => term(1 + i % 3));
const fixtures = [
    { name: 'C loop and scanf', language: 'c' as const, input: '7', source: '#include <stdio.h>\nint main(void){int n;scanf("%d",&n);int s=0;for(int i=1;i<=n;i++)s+=i;printf("%d\\n",s);return 0;}' },
    { name: 'C nested loops and continue', language: 'c' as const, input: '', source: '#include <stdio.h>\nint main(void){int s=0;for(int i=0;i<5;i++){for(int j=0;j<5;j++){if(i==j)continue;if(j==4)break;s+=i+j;}}printf("%d\\n",s);return 0;}' },
    { name: 'C lexical shadowing', language: 'c' as const, input: '', source: '#include <stdio.h>\nint main(void){int x=2;{int x=7;printf("%d ",x);}printf("%d\\n",x);return 0;}' },
    { name: 'C signed division and remainder', language: 'c' as const, input: '', source: '#include <stdio.h>\nint main(void){printf("%d %d %d\\n",-7/3,-7%3,7%-3);return 0;}' },
    { name: 'C typed narrowing and float rounding', language: 'c' as const, input: '', source: '#include <stdio.h>\nint main(void){double a=2.9;int b=a;float x=16777216.0f;x+=1.0f;printf("%d %.1f\\n",b,x);return 0;}' },
    { name: 'C printf decimal ties', language: 'c' as const, input: '', source: '#include <stdio.h>\nint main(void){printf("%.0f %.0f %.0f %.2f\\n",2.5,3.5,-2.5,2.675);return 0;}' },
    { name: 'C scanf failure returns count', language: 'c' as const, input: 'abc', source: '#include <stdio.h>\nint main(void){int n=99;int count=scanf("%d",&n);printf("%d %d\\n",count,n);return 0;}' },
    { name: 'C short circuit side effects', language: 'c' as const, input: '', source: '#include <stdio.h>\nint main(void){int a=0;int b=0;int r=(a && ++b) || 1;printf("%d %d\\n",r,b);return 0;}' },
    { name: 'C++ Euclid function', language: 'cpp' as const, input: '48 18', source: '#include <iostream>\nusing namespace std;int gcd(int a,int b){while(b!=0){int r=a%b;a=b;b=r;}return a;}int main(){int a,b;cin>>a>>b;cout<<gcd(a,b)<<endl;return 0;}' },
    { name: 'C++ recursive Fibonacci', language: 'cpp' as const, input: '', source: '#include <iostream>\nusing namespace std;int f(int n){if(n<2)return n;return f(n-1)+f(n-2);}int main(){cout<<f(9)<<endl;return 0;}' },
    { name: 'C++ chars and conditional types', language: 'cpp' as const, input: '', source: '#include <iostream>\nusing namespace std;int main(){char c=\'A\';cout<<c<<" "<<(true?\'B\':\'C\')<<" "<<(true?2:3.5)<<endl;return 0;}' },
    { name: 'C++ general float formatting', language: 'cpp' as const, input: '', source: '#include <iostream>\nusing namespace std;int main(){cout<<1.23456789<<" "<<0.00001<<" "<<0.0001<<" "<<1000000.0<<" "<<999999.9<<" "<<-0.0<<endl;return 0;}' },
    { name: 'C++ void output function', language: 'cpp' as const, input: '', source: '#include <iostream>\nusing namespace std;void hello(){cout<<"hello";}int main(){hello();cout<<endl;return 0;}' },
    { name: 'C++ declaration with assignment sequencing', language: 'cpp' as const, input: '', source: '#include <iostream>\nusing namespace std;int main(){int x=1;int a=(x=2);cout<<a<<" "<<x<<endl;return 0;}' },
];
describe.skipIf(!nativeAvailable)('Independent GCC/G++ oracle', () => {
    it('matches 240 generated integer expression results', () => {
        const source = '#include <stdio.h>\nint main(void){' + expressions.map(e => `printf("%d\\n",(int)(${e}));`).join('') + 'return 0;}';
        const nativeValues = native(source, 'c').stdout.trim().split('\n').map(Number);
        expect(nativeValues).toHaveLength(expressions.length);
        expressions.forEach((e, i) => { const r = analyze(`int main(){return ${e};}`, 'c'); expect(r.diagnostic, `${e}: ${JSON.stringify(r.diagnostic)}`).toBeUndefined(); expect(r.reference[0].returnValue?.value, e).toBe(nativeValues[i]); expect(r.optimizedRuns[0].returnValue?.value, e).toBe(nativeValues[i]); });
    }, 30000);
    it('matches 100 generated loop/function programs against native C', () => {
        const generated = Array.from({ length: 100 }, (_, i) => { const n = i % 21, mod = 1 + i % 5, skip = i % mod, factor = i % 7 - 3, delta = i % 9 - 4, limit = 10 + i % 30, tail = i % 5; const body = 'int solve(int n){int total=0;for(int i=0;i<n;i++){if(i%' + mod + '==' + skip + ')continue;total+=i*' + factor + '+' + delta + ';if(total>' + limit + ')break;}int j=0;while(j<' + tail + '){total-=j;j++;}return total;}'; return { n, body }; });
        const nativeSource = '#include <stdio.h>\n' + generated.map((g, i) => g.body.replace('solve', 'f' + i)).join('\n') + '\nint main(void){' + generated.map((g, i) => 'printf("%d\\n",f' + i + '(' + g.n + '));').join('') + 'return 0;}';
        const expected = native(nativeSource, 'c').stdout.trim().split('\n').map(Number);
        expect(expected).toHaveLength(100);
        generated.forEach((g, i) => { const r = analyze(g.body + 'int main(void){return solve(' + g.n + ');}', 'c'); expect(r.diagnostic, JSON.stringify(r.diagnostic)).toBeUndefined(); expect(r.reference[0].returnValue?.value).toBe(expected[i]); expect(r.optimizedRuns[0].returnValue?.value).toBe(expected[i]); });
    }, 30000);
    it.each(fixtures)('matches native stdout for $name', ({ source, language, input }) => {
        const external = native(source, language, input);
        const r = analyze(source, language, [input], 100000);
        expect(r.diagnostic, JSON.stringify(r.diagnostic)).toBeUndefined();
        expect(r.reference[0].status, JSON.stringify(r.reference[0].diagnostic)).toBe('returned');
        expect(r.reference[0].stdout).toBe(external.stdout);
        expect(r.optimizedRuns[0].stdout).toBe(external.stdout);
        expect(r.optimizedRuns[0].returnValue?.value).toBe(0);
    }, 30000);
});
describe('Every four-pass combination and repeated-loop regressions', () => {
    it.each(Array.from({ length: 16 }, (_, mask) => mask))('preserves pass subset %i across loop inputs', mask => {
        for (let n = 0; n < 16; n++) {
            const { program, ir } = compileTest('int main(){int n;cin>>n;int s=0;for(int i=0;i<n;i++){if(i%3==0)continue;s+=i;}return s;}');
            const reference = executeIR(program, ir, String(n));
            let candidate = ir;
            const passes = [conditionalConstants, reachableCode, deadTemporaries, tidyJumps].filter((_, i) => mask & (1 << i));
            for (let round = 0; round < 3; round++)
                for (const pass of passes)
                    candidate = pass(candidate, program).ir;
            expect(observationsMatch(reference, executeIR(program, candidate, String(n))), `${mask}/${n}`).toBe(true);
        }
    }, 30000);
    it('retains a genuine uninitialized self-read in a shadowing initializer', () => { const r = analyze('int main(){int x=2;{int x=x;return x;}}'); expect(r.reference[0].diagnostic?.code).toBe('UNINITIALIZED'); expect(r.originalRuns[0].diagnostic?.code).toBe('UNINITIALIZED'); expect(r.searchStatus).toBe('unsafe'); });
    it('rejects the deliberately broken candidate and retains the selected result', () => { const r = analyze('int main(){int n;cin>>n;return n+1;}', 'cpp', ['3', '8'], 20000, true); const mutation = r.candidates.find(c => c.route[0] === 'mutation')!; expect(mutation.accepted).toBe(false); expect(mutation.checks.some(c => !c.matched)).toBe(true); expect(r.optimizedRuns.map(r => r.returnValue?.value)).toEqual([4, 9]); });
    it('does not mutate the original input IR while exploring routes', () => { const { program, ir } = compileTest('int main(){int x=2;if(x)return x+3;return 9;}'); const original = stable(ir); for (const pass of [conditionalConstants, reachableCode, deadTemporaries, tidyJumps])
        pass(ir, program); expect(stable(ir)).toBe(original); });
});

