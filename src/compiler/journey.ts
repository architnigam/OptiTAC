import { Lexer } from './lexer';
import { Parser } from './parser';
import { SemanticAnalyzer } from './semantic';
import { IRGenerator } from './ir';
import { allPasses, investigate, type LabResult } from './lab';
import type { Token } from './lexer/token';
import type { Program } from './ast';
import type { SymbolInfo } from './semantic/symbolTable';

export type Stage = 'tokens' | 'syntax' | 'types' | 'tac' | 'optimize' | 'verify';
export interface Journey {
  source: string;
  tokens: Token[];
  ast?: Program;
  symbols: SymbolInfo[];
  result?: LabResult;
  completed: Stage[];
  error?: { stage: Stage; message: string };
}
export function runJourney(source: string, enabled = allPasses, injectFault = false): Journey {
  const journey: Journey = { source, tokens: [], symbols: [], completed: [] };
  let stage: Stage = 'tokens';
  try {
    if (source.length > 20000) throw new Error('Please keep programs below 20,000 characters.');
    journey.tokens = new Lexer(source).tokenize();
    journey.completed.push(stage);
    stage = 'syntax';
    journey.ast = new Parser(journey.tokens).parse();
    journey.completed.push(stage);
    stage = 'types';
    const semantic = new SemanticAnalyzer().analyze(journey.ast);
    journey.symbols = semantic.symbols.getAll();
    if (!semantic.success) throw new Error(semantic.errors.map(e => e.message).join('\n'));
    journey.completed.push(stage);
    stage = 'tac';
    const original = new IRGenerator().generate(journey.ast).getInstructions();
    if (original.length > 250) throw new Error('Please keep learning programs below 250 TAC instructions so traces stay readable.');
    journey.completed.push(stage);
    stage = 'optimize';
    journey.result = { source, enabled, injectFault, tokens: journey.tokens, ast: journey.ast,
      symbols: journey.symbols, original, ...investigate(original, enabled, injectFault) };
    journey.completed.push(stage, 'verify');
  } catch (error) {
    journey.error = { stage, message: error instanceof Error ? error.message : String(error) };
  }
  return journey;
}
