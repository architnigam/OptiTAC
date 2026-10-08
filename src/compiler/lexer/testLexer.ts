import { Lexer } from "./lexer";

const source = `
int a = 10;
int b = 20;
int c = a + b;
return c;
`;

const lexer = new Lexer(source);
const tokens = lexer.tokenize();

console.log("TOKENS:");
console.log(tokens);