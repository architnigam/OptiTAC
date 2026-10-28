import { describe, expect, it } from 'vitest';
import { tokenize } from './lexer';
import { CParser } from './parser';
import { check } from './semantics';
import { executeAST, decimalFixed } from './runtime';
import { executeIR, generateIR } from './ir';
import type { Language } from './types';
export function compile(source: string, language: Language = 'cpp') { const tokens = tokenize(source); const program = new CParser(tokens, language).parse(); check(program); return { tokens, program, ir: generateIR(program) }; }
const examples = [
    { source: 'int main(){return 5/2;}', value: 2 },
    { source: 'int main(){return -5/2;}', value: -2 },
    { source: 'int main(){return -5%2;}', value: -1 },
    { source: 'int main(){return 2+3*4;}', value: 14 },
    { source: 'int main(){int a=2; a+=3; return a++;}', value: 5 },
    { source: 'int main(){int a=2; return ++a;}', value: 3 },
    { source: 'int main(){int n=1; if(n) n=7; else n=9; return n;}', value: 7 },
    { source: 'int main(){int i=0,s=0;while(i<5){s+=i;i++;}return s;}', value: 10 },
    { source: 'int main(){int s=0;for(int i=0;i<6;i++){if(i==2)continue;if(i==5)break;s+=i;}return s;}', value: 8 },
    { source: 'int square(int x){return x*x;}int main(){return square(7);}', value: 49 },
    { source: 'int fact(int n){if(n<=1)return 1;return n*fact(n-1);}int main(){return fact(6);}', value: 720 },
    { source: 'int main(){int x=2;{int x=7;x++;}return x;}', value: 2 },
    { source: 'int main(){int x=2; return 0 && (x=9);}', value: 0 },
    { source: 'int main(){return 1 || (1/0);}', value: 1 },
    { source: 'int main(){return 1?9:1/0;}', value: 9 },
    { source: 'int main(){return (int)2.9;}', value: 2 },
    { source: 'int main(){return 010+0x10;}', value: 24 },
    { source: 'int main(){return (3<<2)^1;}', value: 13 },
    { source: 'int main(){float x=16777216.0f; x+=1.0f; return x==16777216.0f;}', value: 1 },
];
describe('C/C++ scalar control-flow engine', () => {
    it.each(examples)('executes $source', ({ source, value }) => { const { program, ir } = compile(source); const a = executeAST(program), b = executeIR(program, ir); expect(a.status, JSON.stringify(a.diagnostic)).toBe('returned'); expect(b.status, JSON.stringify(b.diagnostic)).toBe('returned'); expect(a.returnValue?.value).toBe(value); expect(b.returnValue).toEqual(a.returnValue); expect(b.stdout).toBe(a.stdout); });
    it('classifies every arithmetic lexeme as an operator', () => { const operators = tokenize('a+b-c*d/e%2;').filter(t => ['+', '-', '*', '/', '%'].includes(t.text)); expect(operators).toHaveLength(5); expect(operators.every(t => t.category === 'Operator')).toBe(true); });
    it('supports comments and source positions', () => { const t = tokenize('// + ignored\nint a=1;/* skip */return a;'); expect(t.find(t => t.text === 'int')?.line).toBe(2); expect(t.filter(t => t.text === '+')).toHaveLength(0); });
    it('streams mixed C++ values and reads input', () => { const { program, ir } = compile('#include <iostream>\nusing namespace std;int main(){int n;cin>>n;cout<<"N="<<n<<endl;return 0;}'); for (const r of [executeAST(program, '7'), executeIR(program, ir, '7')])
        expect(r.stdout).toBe('N=7\n'); });
    it('supports formatted C input/output', () => { const { program, ir } = compile('#include <stdio.h>\nint main(void){int n;double x;scanf("%d %lf",&n,&x);printf("%d %.2f\\n",n*2,x);return 0;}', 'c'); for (const r of [executeAST(program, '4 2.5'), executeIR(program, ir, '4 2.5')]) {
        expect(r.status, JSON.stringify(r.diagnostic)).toBe('returned');
        expect(r.stdout).toBe('8 2.50\n');
    } });
    it.each(['int main(){return 2147483647+1;}', 'int main(){int x;return x;}', 'int main(){int min=-2147483647-1;return min/-1;}', 'int main(){return 1/0;}'])('diagnoses undefined behavior: %s', source => { const { program, ir } = compile(source); expect(executeAST(program).status).toBe('undefined'); expect(executeIR(program, ir).status).toBe('undefined'); });
    it('treats an execution limit as inconclusive', () => { const { program, ir } = compile('int main(){while(1){}return 0;}'); expect(executeAST(program, '', 200).status).toBe('limited'); expect(executeIR(program, ir, '', 200).status).toBe('limited'); });
    it.each(['int main(){return i;}', 'int main(){int x=0;return x++ + x++;}', 'int f(int x){int x=1;return x;}int main(){return f(2);}', 'int main(){const int x=1;x=2;return x;}'])('rejects invalid or unsequenced programs: %s', source => expect(() => compile(source)).toThrow());
    it('rounds printf decimal ties to even', () => { expect(decimalFixed(2.5, 0)).toBe('2'); expect(decimalFixed(3.5, 0)).toBe('4'); expect(decimalFixed(-2.5, 0)).toBe('-2'); });
});

