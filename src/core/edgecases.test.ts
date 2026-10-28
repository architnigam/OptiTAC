import { describe, it, expect } from 'vitest';
import { analyze, observationsMatch } from './analyze';
import { tokenize } from './lexer';
import type { Language } from './types';
const cases: [
    string,
    Language,
    number,
    string?
][] = [
    ['int main(){return 5/2;}', 'c', 2],
    ['int main(){int class=4;class+=1;return class;}', 'c', 5],
    ['int main(){int true=7;return true;}', 'c', 7],
    ['int main(){int bool=6;return (bool);}', 'c', 6],
    ['int main(){return true and not false;}', 'cpp', 1],
    ['int main(){return 0b1010 xor 0b0011;}', 'cpp', 9],
    ['#include <stdbool.h>\nint main(void){bool ready=true;return ready;}', 'c', 1],
    ['int main(void){_Bool ready=2;return ready;}', 'c', 1],
    ['int main(){int final=4;int restrict=3;return final+restrict;}', 'cpp', 7],
    ['int main(){return 1<<31;}', 'cpp', -2147483648],
    ['#include <stdio.h>\nint main(){printf("%04d %08.2f",7,-2.5);return 0;}', 'c', 0, '0007 -0002.50'],
    ['#include <stdio.h>\nint main(){printf("hello\\0world");return 0;}', 'c', 0, 'hello'],
    ['#include <stdio.h>\nint main(){printf("%s", "a\\0b");return 0;}', 'c', 0, 'a'],
    ['#include <iostream>\nusing namespace std;int main(){cout<<(true?\'A\':\'B\');return 0;}', 'cpp', 0, 'A'],
    ['int f(int n){if(n<1)return 0;return n+f(n-1);}int main(){return f(12);}', 'cpp', 78],
    ['int main(){int s=0;for(int i=0;i<5;i++){int j=0;while(j<3){j++;if(j==2)continue;s++;}if(i==3)break;}return s;}', 'cpp', 8],
    ['int main(){int a=1;{int a=2;{int a=3;a++;}}return a;}', 'cpp', 1],
    ['int main(){int a=1;int b=0;int c=a?++b:0;return c+b;}', 'cpp', 2],
    ['int main(){int a=0;int b=0;int c=(a && ++b) || ++a;return a+b+c;}', 'cpp', 2],
    ['int main(){double x=5.5;int y=(int)x;return y;}', 'cpp', 5],
    ['int main(){return ~0;}', 'cpp', -1],
    ['int main(){return 8>>2;}', 'c', 2],
];
describe('Language-mode and edge-case accuracy', () => {
    it.each(cases)('checks %s in %s', (source, language, value, stdout) => { const r = analyze(source, language); expect(r.diagnostic, JSON.stringify(r.diagnostic)).toBeUndefined(); expect(r.reference[0].status, JSON.stringify(r.reference[0].diagnostic)).toBe('returned'); expect(r.reference[0].returnValue?.value).toBe(value); if (stdout !== undefined)
        expect(r.reference[0].stdout).toBe(stdout); expect(observationsMatch(r.reference[0], r.optimizedRuns[0])).toBe(true); });
    it.each(['+', '-', '*', '/', '%', '+=', '++', '==', '&&', '<<', '::', '.'])('labels %s as an operator', op => { expect(tokenize(`a ${op} b`, 'cpp').find(t => t.text === op)?.category).toBe('Operator'); });
    it('does not classify C++-only words as C keywords', () => { for (const word of ['class', 'bool', 'true', 'namespace', 'using'])
        expect(tokenize(word, 'c')[0].category).toBe('Identifier'); expect(tokenize('class', 'cpp')[0].category).toBe('Keyword'); });
    it('distinguishes delimiters from operators', () => { expect(tokenize('(a+b);').filter(t => ['(', ')', ';'].includes(t.text)).every(t => t.category === 'Delimiter')).toBe(true); });
    it('treats a C signed overflow shift as undefined', () => { expect(analyze('int main(){return 1<<31;}', 'c').reference[0].diagnostic?.code).toBe('SIGNED_SHIFT'); });
    it('diagnoses implementation-defined char narrowing without pretending it is portable', () => { expect(analyze('int main(){char x=200;return x;}').reference[0].diagnostic?.code).toBe('IMPLEMENTATION_DEFINED'); });
    it('does not invent values for unsupported wide literals', () => { expect(analyze('int main(){return -2147483648;}').diagnostic?.code).toBe('LITERAL_RANGE'); });
    it('distinguishes scanf matching failure from EOF', () => { const source = '#include <stdio.h>\nint main(){float x=9.0f;int n=scanf("%f",&x);printf("%d",n);return 0;}'; expect(analyze(source, 'c', ['1e']).reference[0].stdout).toBe('0'); expect(analyze(source, 'c', ['']).reference[0].stdout).toBe('-1'); });
    it('supports scanf non-finite float spellings explicitly', () => { const source = '#include <stdio.h>\nint main(){double x;scanf("%lf",&x);printf("%f",x);return 0;}'; expect(analyze(source, 'c', ['nan']).reference[0].stdout).toBe('nan'); expect(analyze(source, 'c', ['inf']).reference[0].stdout).toBe('inf'); });
    it('rejects unsupported printf precision instead of silently ignoring it', () => { expect(analyze('#include <stdio.h>\nint main(){printf("%.2s","abcd");return 0;}', 'c').reference[0].diagnostic?.code).toBe('UNSUPPORTED_FORMAT'); });
    it('rejects unsequenced output side effects', () => { const r = analyze('#include <stdio.h>\nint main(){return printf("a")+printf("b");}', 'c'); expect(r.diagnostic?.code).toBe('UNSEQUENCED'); });
});

