import { tokenize } from './lexer';
import { CParser } from './parser';
import { check } from './semantics';
import { generateIR } from './ir';
import type { Language } from './types';
export function compileTest(source: string, language: Language = 'cpp') { const tokens = tokenize(source, language); const program = new CParser(tokens, language).parse(); check(program); return { tokens, program, ir: generateIR(program) }; }

