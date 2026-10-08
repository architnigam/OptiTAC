# OptiTAC — Interactive Compiler Optimization and Intermediate Code Analysis Tool

## Engineering Design Document (EDD) \& Project Implementation Specification

|Field|Value|
|-|-|
|Document|OptiTAC EDD|
|Version|1.0|
|Status|Approved for implementation|
|Audience|Student development team, technical reviewers, university evaluators, AI coding agents|
|Project type|University Compiler Design project (educational / portfolio)|
|Implementation language|TypeScript (strict) for compiler core and UI|
|UI stack|React + TypeScript + Vite + Tailwind CSS|

\---

## 0\. How to Read This Document

### 0.1 Normative Keywords

* **MUST / MUST NOT** — mandatory. Violating it means the implementation is non-conforming.
* **SHOULD / SHOULD NOT** — strongly recommended; deviations must be justified in a code comment and in `docs/architecture.md`.
* **MAY** — optional.

### 0.2 Authority

This document is the **single source of truth**. If the code and this document disagree, the code is wrong unless this document is updated first (with a version bump and a changelog entry in §0.4).

### 0.3 Conventions Used Throughout

* TAC is printed in the **canonical text format** defined in §11.6. All TAC examples in this document are in that format and are suitable for golden (snapshot) tests.
* Line and column numbers are **1-based**.
* "Name" means a TAC storage location: a user variable or a compiler temporary.
* "Block" in a *source* context means `{ ... }`; in an *IR* context it means a **basic block**. The text always disambiguates ("source block" vs "basic block").

### 0.4 Changelog

|Version|Change|
|-|-|
|1.0|Initial complete specification.|

\---

## 1\. Overview

### 1.1 What OptiTAC Is

OptiTAC is a browser-based mini compiler for a deliberately small C-like language (called **MiniC** in this document). It compiles source code through every classical front-end and middle-end stage and exposes each stage visually:

```text
Source Code
    ↓
Lexical Analysis            → Tokens
    ↓
Parsing (recursive descent) → AST
    ↓
Semantic Analysis           → Typed AST + Symbol Table + Diagnostics
    ↓
TAC Generation              → Structured Three-Address Code (IR)
    ↓
Basic Block Construction    → Basic Blocks
    ↓
CFG Construction            → Control Flow Graph
    ↓
Program Analysis            → USE/DEF, Liveness
    ↓
Multi-Pass Optimization     → Optimized TAC + Transformation Log + Statistics
    ↓
Pseudo Assembly             → Educational accumulator-machine assembly
```

### 1.2 Primary Differentiator

The **optimizer and its explainability** are the centrepiece: every transformation is logged with the pass, rule, reason, before/after text, iteration and basic-block ID, and the UI shows a side-by-side before/after diff aligned by instruction ID.

### 1.3 Goals

1. Demonstrate correct, explainable implementations of core Compiler Design concepts.
2. Demonstrate *safe* optimization: short-circuit semantics, trapping division, IEEE 754 floats, copy invalidation, convergence.
3. Be demonstrable in a 10-minute viva using built-in demo programs.
4. Be buildable by a 5-person student team in \~12 weeks.

### 1.4 Non-Goals

OptiTAC is not a production compiler, not C-compatible, does not emit machine code, does not execute user programs, and has no server.

### 1.5 Core Design Principles (binding)

1. Correctness before optimization. `Correctness > Optimization aggressiveness`.
2. Never change observable program semantics for the sake of optimization.
3. The compiler core is a pure TypeScript library with **zero** dependency on React/DOM.
4. Every optimization pass is independently runnable and testable.
5. Every transformation is explainable and logged.
6. The IR is structured objects, never string manipulation.
7. The source language is kept deliberately small.
8. `\&\&` and `||` preserve short-circuit evaluation in IR and CFG.
9. Type conversions are explicit in the AST (`CastNode`) and IR (`INT\_TO\_FLOAT`).
10. Reading an uninitialized variable is a deterministic compile-time error.
11. Nested shadowing is legal and correctly scoped; same-scope redeclaration is an error.
12. CFG construction tolerates empty source blocks and empty basic blocks.
13. `return` is terminal: no fall-through edge, no loop back-edge from a return.
14. Constant folding never evaluates an operation that would trap or produce a non-representable result.
15. Float simplifications are restricted to identities that are exact under IEEE 754.
16. Copy propagation invalidates facts on mutation and intersects facts at joins.
17. The optimizer always terminates (`MAX\_OPT\_ITERATIONS = 10`).
18. Optional features never block the MVP.
19. No unnecessary technologies or infrastructure.
20. Prefer simple, explainable algorithms.
21. Every important edge case has a regression test.
22. Everything must be easy to demonstrate and defend in a viva.

\---

## 2\. Scope

### 2.1 Mandatory MVP / Core Scope

The project is complete only when all of the following exist and pass their tests:

|#|Feature|
|-|-|
|M1|Lexer for MiniC with structured errors, numeric-literal safety (§6).|
|M2|Recursive-descent parser, precedence/associativity, dangling-else rule, panic-mode recovery (§7).|
|M3|AST with source spans for every node, including `CastNode` (§8).|
|M4|Scoped symbol table with shadowing and duplicate detection (§9).|
|M5|Semantic analysis: types, implicit `int→float` promotion, definite-assignment (uninitialized-read) analysis, all error categories in §10.7 (§10).|
|M6|Structured TAC IR with `INT\_TO\_FLOAT`, short-circuit lowering, implicit `return 0`, deterministic temp/label naming (§11, §12).|
|M7|Basic block construction and CFG with synthetic EXIT block, edge kinds, back-edge and unreachable marking (§13).|
|M8|USE/DEF and worklist liveness analysis (§14).|
|M9|Optimization framework: `OptimizationPass`, `PassManager`, records, statistics, validator (§15).|
|M10|Passes: Constant Folding, Constant Propagation, Algebraic Simplification, Copy Propagation, Dead Code Elimination, CFG Simplification (§16).|
|M11|Multi-pass driver with convergence detection and iteration cap (§17).|
|M12|Transformation logging and statistics (§18).|
|M13|Pseudo-assembly backend (display-only) (§19).|
|M14|React UI with all 12 views (§23).|
|M15|Unit, integration and the Critical Edge Case test suites (§25–§27).|
|M16|Documentation set (§36).|
|M17|`input` declarations (opaque program inputs), see §4.9.|

### 2.2 Recommended Scope

Implement only after the MVP pipeline is green end-to-end.

|#|Feature|Notes|
|-|-|-|
|R1|Common Subexpression Elimination (local, per basic block)|§16.8. The pass manager works identically with or without it.|
|R2|Per-pass toggles in the UI and an iteration "stepper" showing the IR after each pass|Data already produced by M11.|
|R3|Run the compiler in a Web Worker with a 3-second timeout|Main-thread fallback remains.|
|R4|CodeMirror 6 editor with inline diagnostic underlines|MVP uses a `<textarea>` with a line gutter.|
|R5|TAC reference interpreter **used only in tests** for differential testing of optimizations (§25.9)|Never exposed in UI in this scope.|
|R6|Export: download TAC / optimized TAC / assembly / JSON compilation result|Pure client-side.|
|R7|Shareable URL (source code base64-encoded in the URL hash)||

### 2.3 Optional Advanced Features

May be added only without modifying MVP contracts.

|#|Feature|
|-|-|
|O1|Reaching Definitions analysis and view.|
|O2|Explicit casts `(int) e` and `(float) e` (§10.8 defines semantics if implemented).|
|O3|Logical not `!`.|
|O4|Sandboxed UI simulation of TAC (step-through execution in a Web Worker with step limit).|
|O5|Dominator tree and natural-loop display.|
|O6|Dark/light theme toggle, keyboard shortcuts.|

### 2.4 Explicitly Out of Scope

Functions (other than the implicit program body), function calls, arrays, pointers, structs, strings, `char`/`bool` types, `for`/`do`/`switch`/`break`/`continue`, the preprocessor, SSA form, register allocation, real machine code, linking, a language server, a backend server, databases, user accounts, cloud deployment beyond static hosting, LLVM/WebAssembly export.

> Rule: No MVP module may import anything from a Recommended or Optional module. Recommended/Optional modules may import MVP modules.

\---

## 3\. Architecture Overview

### 3.1 Component Diagram

```text
┌──────────────────────────── frontend (React, Vite, Tailwind) ─────────────────────────────┐
│  SourceEditor │ Stage Tabs (Tokens, AST, Semantic, TAC, Blocks, CFG, Analysis,            │
│               │ Optimization, Before/After, Assembly, Errors)                             │
│                      ▲ CompilationResult (plain JSON-serializable object)                 │
└──────────────────────┼────────────────────────────────────────────────────────────────────┘
                       │ compile(source, options)
┌──────────────────────┼──────────────── compiler (@optitac/compiler, pure TS) ─────────────┐
│ lexer → parser → semantic → ir(generator) → cfg → analysis → optimizer → backend          │
│                              errors / common (spans, snippets) / limits                  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Single Entry Point

```ts
compile(source: string, options?: CompileOptions): CompilationResult
```

`compile` is **pure and deterministic**: same `source` + `options` ⇒ deep-equal result. It never throws; all failures become `CompilerError` diagnostics (an unexpected exception is caught at the top level and converted to an `IRGenerationError`/`OptimizationError` with code `E\_INTERNAL`).

### 3.3 Stage Gating (when the pipeline stops)

|Stage|Runs if|On errors|
|-|-|-|
|Lexer|always|Stop after lexing. Tokens (with error tokens skipped) are still returned.|
|Parser|no lexical errors|Stop after parsing. Partial AST returned for display.|
|Semantic|no syntax errors|Stop after semantic analysis. Typed AST and symbol table returned.|
|IR generation|no semantic **errors** (warnings allowed)|Stop.|
|CFG + Analysis (unoptimized)|IR generated|— (CFG builder cannot fail on a validated IR).|
|Optimizer|always after CFG|On `OptimizationError`, keep the last valid IR (§17.5) and continue.|
|CFG + Analysis (optimized)|optimizer finished|—|
|Backend|always after optimizer|Generated from the final (optimized or last-valid) IR.|

`CompilationResult.stoppedAt` records the last stage that ran when the pipeline halted early; it is `null` when all stages ran.

### 3.4 Canonical IR Form (key architectural decision)

The **canonical IR is a linear, ordered list of instructions** (`IRProgram.instructions`). The CFG is a **derived view** rebuilt from the linear list whenever it is needed.

Consequences (all binding):

* Every optimization pass receives an `IRProgram`, builds whatever CFG/analyses it needs **from scratch**, and returns a new `IRProgram`.
* There is **no analysis caching across passes** ⇒ no stale-analysis bugs. This is the invalidation policy (§17.3).
* Fall-through means "the next instruction in the list".
* Basic-block IDs are positional and recomputed on every build (B0, B1, ... in layout order).
* Programs are small (bounded by §32), so recomputation is cheap.

### 3.5 Instruction Identity Invariant

Every IR instruction has an integer `id` assigned once during TAC generation.

> \*\*Invariant OPT-ID:\*\* The optimizer never creates new instructions. It may only (a) rewrite an instruction \*\*in place, keeping its `id`\*\*, or (b) delete an instruction. Therefore the set of IDs after optimization is a subset of the IDs before.

This makes the before/after diff trivial and exact (§23.6), and makes transformation records point at stable IDs.

\---

## 4\. Language Specification (MiniC)

### 4.1 Program Model

* A program is a sequence of declarations and statements at top level. The top level acts as the body of an **implicit `main`** that returns `int`.
* The program's only observable behaviour is: (a) the values consumed by `input` declarations, (b) the returned `int` value, and (c) whether execution traps (runtime integer division/modulo by zero). Optimizations must preserve all three. Non-termination is also preserved (an infinite loop stays infinite).
* OptiTAC never executes programs; these semantics define what optimizations are allowed to do.

### 4.2 Types

|Type|Representation|Range|
|-|-|-|
|`int`|32-bit two's-complement signed integer|−2,147,483,648 … 2,147,483,647|
|`float`|IEEE 754 binary64 (JavaScript `number`)|±1.7976931348623157e308, subnormals, ±0, ±∞, NaN at runtime|

There is no boolean type. Relational, equality and logical operators produce `int` values `0` or `1`. Conditions of `if`/`while` and operands of `\&\&`/`||` must have type `int`; non-zero is true.

### 4.3 Runtime Semantics of Operators (needed to define safe optimization)

|Operation|`int` semantics|`float` semantics|
|-|-|-|
|`+ - \*`|Wrap modulo 2³² (two's complement). Overflow is **defined**, not an error.|IEEE 754 round-to-nearest-even.|
|`/`|Truncates toward zero. Divisor 0 ⇒ **runtime trap**. `INT\_MIN / -1` = `INT\_MIN` (wraps).|IEEE 754 (x/0 ⇒ ±∞ or NaN, never traps).|
|`%`|Result has sign of dividend (C99). Divisor 0 ⇒ **runtime trap**. `INT\_MIN % -1` = 0.|Not allowed (compile-time error).|
|unary `-`|Wrapping negation (`-INT\_MIN` = `INT\_MIN`).|IEEE negation (flips sign, incl. ±0).|
|`< <= > >= == !=`|Integer comparison, result 0/1.|IEEE comparison; any comparison with NaN is false except `!=` which is true. Result 0/1.|
|`\&\& \|\|`|Short-circuit (§4.6). Result 0/1.|Not allowed.|

A **trap** is an abnormal termination. A program that traps must still trap after optimization (unless the trapping instruction is provably unreachable).

### 4.4 Declarations and Scopes

```c
int x;            // declared, not initialized
int y = 10;       // declared and initialized
float z = y;      // implicit int → float promotion
input int n;      // opaque program input (top level only), counts as initialized
```

* One declarator per declaration (`int a, b;` is a syntax error).
* **Scope creation:** the program top level is scope 0 (global). Every source block `{ ... }` creates a new nested scope. Bodies of `if`/`while` that are not braces do **not** create scopes (they cannot contain declarations — see grammar).
* **Lifetime/visibility:** a declared name is visible from the end of its own declaration (i.e., **after** its initializer) to the end of the enclosing source block.
* **Self-reference rule:** in `float x = x + 1.0;` inside a nested scope, the `x` in the initializer refers to the **outer** `x` (because the new symbol is not yet visible). If no outer `x` exists, it is `E\_UNDECLARED\_IDENTIFIER`.
* **Lookup:** innermost scope first, then outward to scope 0. Lookup is position-dependent (single pass, top to bottom).
* **Shadowing:** declaring a name already declared in an *enclosing* scope is legal; the inner declaration hides the outer one until the inner scope ends; the outer becomes visible again afterwards.
* **Duplicate:** declaring a name already declared in the *same* scope is `E\_DUPLICATE\_DECLARATION`, regardless of type.
* **Reserved identifiers:** names matching `^\[tLR]\[0-9]+$` (e.g. `t1`, `L3`, `R1`) are reserved for compiler temporaries, labels and pseudo-registers. Declaring one is `E\_RESERVED\_IDENTIFIER`. This guarantees that printed TAC and assembly are unambiguous.

Shadowing example:

```c
int x = 10;
{
    float x = 2.5;   // legal: shadows outer x (scope 1)
    x = x + 1.0;     // refers to inner float x
}
return x;            // refers to outer int x again → returns 10
```

### 4.5 Initialization (Definite Assignment)

> \*\*Rule:\*\* Local variables have no implicit default value. Reading a variable that is not \*definitely assigned\* at that program point is a compile-time `SemanticError` (`E\_UNINITIALIZED\_VARIABLE`).

"Declared" and "initialized" are distinct: the symbol table stores `initializedAtDeclaration`, and the analyzer tracks a flow-sensitive **definitely-assigned set** (§10.4). The analysis is *conservative but sound*: it may reject some programs that never actually read garbage (e.g. reads after `while (1)` loops), but it never accepts a program that can read an unassigned variable. This boundary is deliberate and documented.

### 4.6 Short-Circuit Logic (normative)

```text
A \&\& B :  evaluate A; if A is false (== 0): result = 0, B is NOT evaluated;
          else evaluate B; result = (B != 0) ? 1 : 0
A || B :  evaluate A; if A is true (!= 0): result = 1, B is NOT evaluated;
          else evaluate B; result = (B != 0) ? 1 : 0
```

Because `B` may trap (`b / a` with `a == 0`), the IR must encode this as control flow (§12.4), never as a binary arithmetic instruction.

### 4.7 Statements

Declaration, declaration with initialization, `input` declaration, assignment (`x = e;` — a statement, **not** an expression), expression statement (`e;`), block, `if`, `if/else`, `while`, `return e;`.

### 4.8 Return Semantics

* The implicit `main` returns `int`. `return e;` requires `e : int`.
* `return;` (no value) is `E\_RETURN\_MISSING\_VALUE`.
* `return e;` with `e : float` is `E\_RETURN\_TYPE\_MISMATCH` (float → int is never implicit).
* **Implicit return:** if control can reach the end of the program, the program returns `0`. TAC generation appends `return 0` (marked `implicit: true`) whenever the last emitted instruction is not a `return` or `goto` (§12.7).
* Statements after a `return` in the same source block are **unreachable**; they are still compiled (so the user can see them being removed) and produce warning `W\_UNREACHABLE\_CODE`.

### 4.9 Inputs (`input` declarations)

```c
input int n;
input float f;
```

**Design decision and rationale:** MiniC has no functions or I/O. Without an opaque value source, every variable would be a compile-time constant and the optimizer would trivially fold every demo to `return <constant>`, hiding the interesting behaviour (short-circuit guards, liveness through loops, copy invalidation). `input` declares a variable whose value is supplied by the (hypothetical) runtime environment.

Rules:

* Allowed only in scope 0 (top level); elsewhere `E\_INPUT\_NOT\_TOP\_LEVEL`.
* Cannot have an initializer (grammar-enforced).
* Counts as initialized.
* Lowered to the TAC instruction `INPUT` (§11), which is side-effecting: never removed, folded, or moved.
* Input variables are ordinary mutable variables after declaration.

### 4.10 Implicit Conversion Summary

|Context|`int ← int`|`float ← float`|`float ← int`|`int ← float`|
|-|-|-|-|-|
|Initialization / assignment|OK|OK|OK, `CastNode` inserted|`E\_NARROWING\_CONVERSION`|
|Return|OK|—|—|`E\_RETURN\_TYPE\_MISMATCH`|
|Binary arithmetic / comparison|OK|OK|int operand wrapped in `CastNode`|(same as previous column)|

`float → int` is **never** implicit, and explicit casts are not in the MVP (Optional O2). Rationale: avoids silent precision loss and keeps the type system explainable.

\---

## 5\. Formal Grammar

### 5.1 EBNF (recursive-descent compatible; no left recursion)

```ebnf
program        = { blockItem } EOF ;

blockItem      = declaration | statement ;

declaration    = inputDecl | varDecl ;
inputDecl      = "input" type IDENT ";" ;
varDecl        = type IDENT \[ "=" expression ] ";" ;
type           = "int" | "float" ;

statement      = block
               | ifStmt
               | whileStmt
               | returnStmt
               | assignStmt
               | exprStmt ;

block          = "{" { blockItem } "}" ;
ifStmt         = "if" "(" expression ")" statement \[ "else" statement ] ;
whileStmt      = "while" "(" expression ")" statement ;
returnStmt     = "return" \[ expression ] ";" ;
assignStmt     = IDENT "=" expression ";" ;          (\* chosen when IDENT is followed by "=" \*)
exprStmt       = expression ";" ;

expression     = logicalOr ;
logicalOr      = logicalAnd { "||" logicalAnd } ;
logicalAnd     = equality   { "\&\&" equality } ;
equality       = relational { ( "==" | "!=" ) relational } ;
relational     = additive   { ( "<" | "<=" | ">" | ">=" ) additive } ;
additive       = multiplicative { ( "+" | "-" ) multiplicative } ;
multiplicative = unary { ( "\*" | "/" | "%" ) unary } ;
unary          = "-" unary | primary ;
primary        = INT\_LITERAL | FLOAT\_LITERAL | IDENT | "(" expression ")" ;
```

Notes:

* `statement` excludes declarations, so `if (c) int y = 1;` is a syntax error. Declarations may appear only directly inside `program` or a `block`.
* `assignStmt` vs `exprStmt` is decided with one token of extra lookahead: `IDENT` followed by `ASSIGN` (`=`). Because `==` is a single distinct token, there is no ambiguity.
* The `{ ... }` repetitions are implemented as loops that build **left-associative** trees.

### 5.2 Precedence and Associativity (highest first)

|Level|Operators|Associativity|Grammar rule|
|-|-|-|-|
|1|`( )` grouping, literals, identifiers|—|`primary`|
|2|unary `-`|right|`unary`|
|3|`\* / %`|left|`multiplicative`|
|4|`+ -`|left|`additive`|
|5|`< <= > >=`|left|`relational`|
|6|`== !=`|left|`equality`|
|7|`\&\&`|left|`logicalAnd`|
|8|`\|\|`|left|`logicalOr`|

`a < b < c` parses as `(a < b) < c` (legal; compares a 0/1 `int` with `c`). `a - b - c` parses as `(a - b) - c`. `- - x` parses as `-(-(x))`.

### 5.3 Dangling Else (normative)

> \*\*Rule:\*\* An `else` always associates with the nearest preceding unmatched `if`.

```c
if (a)
    if (b)
        x = 1;
    else
        x = 2;
```

The `else` belongs to `if (b)`. The outer `if (a)` has **no** else. AST:

```text
IfStatement(cond: a,
            then: IfStatement(cond: b, then: x = 1, else: x = 2),
            else: null)
```

Implementation: `parseIfStatement` parses the then-statement and then, **if the next token is `else`, consumes it immediately**. Since the innermost `parseIfStatement` call is the one active when `else` is encountered, the greedy check deterministically binds to the nearest `if`. Indentation is irrelevant.

\---

## 6\. Lexer

### 6.1 Token Categories

|Category|Token types|Lexemes|
|-|-|-|
|Keywords|`KW\_INT KW\_FLOAT KW\_IF KW\_ELSE KW\_WHILE KW\_RETURN KW\_INPUT`|`int float if else while return input`|
|Identifier|`IDENT`|`\[A-Za-z\_]\[A-Za-z0-9\_]\*`, max 64 chars|
|Literals|`INT\_LITERAL FLOAT\_LITERAL`|§6.3|
|Arithmetic|`PLUS MINUS STAR SLASH PERCENT`|`+ - \* / %`|
|Assignment|`ASSIGN`|`=`|
|Relational|`EQ NE LT LE GT GE`|`== != < <= > >=`|
|Logical|`AND\_AND OR\_OR`|`\&\& \|\|`|
|Delimiters|`LPAREN RPAREN LBRACE RBRACE SEMICOLON`|`( ) { } ;`|
|End|`EOF`|—|

Keywords are case-sensitive; `Int` is an identifier.

### 6.2 Whitespace, Comments, Positions

* Whitespace: space, `\\t`, `\\r`, `\\n`. `\\r\\n` counts as one newline.
* Line comment: `//` to end of line. Block comment: `/\* ... \*/`, **not nestable**. Unterminated block comment ⇒ `E\_UNTERMINATED\_COMMENT` at the comment start.
* Position: `line` (1-based), `column` (1-based, counted in UTF-16 code units, tab = 1 column), `offset` (0-based). Each token stores a `span` with exclusive end.
* Any character not starting a valid token (including `\&`, `|`, `!`, `.`, `#`, non-ASCII) ⇒ `E\_UNEXPECTED\_CHARACTER`. For single `\&` or `|` the hint is "Did you mean '\&\&' / '||'?"; for `!` the hint is "Logical not is not supported; use `x == 0`."

### 6.3 Numeric Literals

```text
INT\_LITERAL   = "0" | nonZeroDigit { digit }
FLOAT\_LITERAL = intPart "." digit { digit } \[ exponent ]
              | intPart exponent
intPart       = "0" | nonZeroDigit { digit }
exponent      = ( "e" | "E" ) \[ "+" | "-" ] digit { digit }
```

Literals are unsigned; `-5` is unary minus applied to `5`.

**Scanning algorithm (maximal munch with malformed-run capture):**

1. Scan digits, optional `.digits`, optional exponent, per the grammar above.
2. If the next character is in `\[A-Za-z0-9\_.]`, the literal is malformed: consume the entire contiguous run of characters in `\[A-Za-z0-9\_.]` and report **one** error covering the whole run:

   * run is a valid literal followed by letters/underscore (e.g. `10f`, `1.5f`, `10u`, `3abc`) ⇒ `E\_INVALID\_NUMERIC\_SUFFIX`;
   * otherwise (e.g. `1.2.3`, `1.`, `1e`, `1e+`) ⇒ `E\_MALFORMED\_NUMBER`.
3. A leading zero followed by more digits (`007`, `00.5`) ⇒ `E\_MALFORMED\_NUMBER` ("leading zeros are not permitted").
4. `.5` is not a literal: `.` ⇒ `E\_UNEXPECTED\_CHARACTER`.

**Range policy (deterministic, no silent wraparound):**

|Case|Rule|Error code|
|-|-|-|
|Integer literal > 2,147,483,647|Rejected. Check: digit count > 10 ⇒ out of range; else compare `Number(lexeme)`.|`E\_INT\_LITERAL\_OUT\_OF\_RANGE`|
|`INT\_MIN`|Not expressible as a literal (`2147483648` is out of range). Write `-2147483647 - 1`. Documented in `grammar.md`.|—|
|Float literal parses to ±∞|Rejected (`1e400`).|`E\_FLOAT\_LITERAL\_OVERFLOW`|
|Float literal parses to 0 but mantissa has a non-zero digit|Rejected (`1e-400`).|`E\_FLOAT\_LITERAL\_UNDERFLOW`|
|Subnormal float (`5e-324`)|Accepted.|—|
|Extremely long literal|Handled by the same rules; source length is bounded by `MAX\_SOURCE\_CHARS`.|—|

### 6.4 Lexer Output and Error Recovery

```ts
interface LexerResult { tokens: Token\[]; errors: CompilerError\[] }  // tokens always ends with EOF
```

On an error the lexer records a `LexicalError`, skips the offending character or malformed run, and continues, until `MAX\_DIAGNOSTICS` errors. Invalid lexemes do not produce tokens.

\---

## 7\. Parser

### 7.1 Structure (one function per grammar rule)

|Function|Responsibility|
|-|-|
|`parseProgram`|Loop `parseBlockItem` until `EOF`; returns `Program`.|
|`parseBlockItem`|If current token is `int`/`float`/`input` ⇒ `parseDeclaration`, else `parseStatement`.|
|`parseDeclaration`|`inputDecl` or `varDecl`; builds `VariableDeclaration`.|
|`parseStatement`|Dispatch on current token: `{`, `if`, `while`, `return`, `IDENT` + `=` ⇒ assignment, else expression statement. A leading `int`/`float`/`input` here ⇒ `E\_DECLARATION\_NOT\_ALLOWED` ("declarations must be inside a block"). A stray `else` ⇒ `E\_UNEXPECTED\_TOKEN`.|
|`parseBlock`|`{ blockItem\* }`. Missing `}` at EOF ⇒ `E\_UNCLOSED\_BLOCK` pointing at the `{`.|
|`parseIfStatement`|Implements §5.3 (greedy `else`).|
|`parseWhileStatement`|`while ( expr ) statement`.|
|`parseReturnStatement`|`return \[expr] ;`.|
|`parseExpression` … `parsePrimary`|One function per precedence level; loops for left-associativity; `parseUnary` recursion for right-associative unary minus.|
|`expect(type, context)`|Consumes a token or raises `E\_EXPECTED\_TOKEN` with message `Expected ';' after expression but found 'x'`.|

Every node's span runs from the first token to the last token it consumed.

### 7.2 Nesting Limit

The parser keeps a depth counter incremented on entering `parseBlock`, `parseIfStatement`, `parseWhileStatement`, `parseUnary` (recursive branch) and parenthesized `parsePrimary`. Each binary-operator loop iteration also increments the depth of the tree being built (a left-associative chain `a+b+…` produces a left spine as deep as the chain), so the same counter applies to operator chains. Exceeding `MAX\_NESTING\_DEPTH = 128` ⇒ `E\_NESTING\_TOO\_DEEP` and parsing stops (no recovery). This bounds recursion depth for every later recursive stage too (§32.3).

### 7.3 Error Recovery (panic mode, deliberately simple)

1. On a syntax error inside a statement or declaration, record the error and enter panic mode.
2. Skip tokens until one of: `;` (consume it, then resume), `}` (do not consume; the enclosing `parseBlock` handles it), a statement/declaration starter `int float input if while return {` (resume there), or `EOF`.
3. **Progress guarantee:** if recovery resumes at the same token index where the previous error occurred, consume one token first.
4. Statements that failed are omitted from the AST (no error nodes).
5. Stop after `MAX\_DIAGNOSTICS` errors.

If any syntax error occurred, `ParserResult.ok = false`, the partial AST is returned for display, and semantic analysis does not run.

\---

## 8\. Abstract Syntax Tree

### 8.1 Common Fields

Every node has `kind`, `id` (unique integer, assigned in creation order — deterministic) and `span: SourceSpan`. Expression nodes additionally have `resolvedType: 'int' | 'float' | null` (null until semantic analysis; `'error'` is never stored — see §10.6).

### 8.2 Node Catalogue

|Node|Required fields|Optional fields|Children|Semantic metadata|
|-|-|-|-|-|
|`Program`|`body: BlockItem\[]`|—|statements/declarations|`scopeId` (always 0)|
|`Block`|`body: BlockItem\[]`|—|statements/declarations|`scopeId`|
|`VariableDeclaration`|`varType`, `name`, `nameSpan`, `storage: 'local' \| 'input'`|`initializer: Expression`|initializer|`symbolId`|
|`Assignment`|`target: Identifier`, `value: Expression`|—|target, value|—|
|`ExpressionStatement`|`expression`|—|expression|—|
|`IfStatement`|`condition`, `thenBranch: Statement`|`elseBranch: Statement \| null`|all three|—|
|`WhileStatement`|`condition`, `body: Statement`|—|both|—|
|`ReturnStatement`|—|`value: Expression \| null`|value|—|
|`BinaryExpression`|`operator: '+'\|'-'\|'\*'\|'/'\|'%'\|'<'\|'<='\|'>'\|'>='\|'=='\|'!='\|'\&\&'\|'\|\|'`, `left`, `right`|—|left, right|`resolvedType`, `operandType`|
|`UnaryExpression`|`operator: '-'`, `operand`|—|operand|`resolvedType`|
|`Literal`|`literalType: 'int'\|'float'`, `value: number`, `raw: string`|—|—|`resolvedType`|
|`Identifier`|`name`|—|—|`symbolId`, `resolvedType`|
|`CastNode`|`targetType: 'float'`, `operand`, `implicit: true`|—|operand|`resolvedType = 'float'`|

`operandType` on `BinaryExpression` is the unified type of the operands after promotion (e.g. `x < 2.5` has `operandType: 'float'`, `resolvedType: 'int'`).

### 8.3 Untyped vs Typed AST

* The parser produces an **untyped AST** (all `resolvedType = null`, no `CastNode`s) which is treated as immutable.
* Semantic analysis **deep-clones** it and produces the **typed AST**: fills `resolvedType`, `operandType`, `symbolId`, `scopeId`, and wraps promoted operands in `CastNode` (new node IDs continue from the parser's counter; the cast's span equals the operand's span).
* The UI can display both; IR generation consumes only the typed AST.

Example: `float y = x + 2.5;` (x : int)

```text
VariableDeclaration(float y)
└── BinaryExpression(+) : float, operandType float
    ├── CastNode(int→float) : float
    │   └── Identifier(x) : int
    └── Literal(2.5) : float
```

\---

## 9\. Symbol Table

### 9.1 Structures

```ts
interface SymbolInfo {
  id: number;                       // unique, in declaration order starting at 1
  name: string;                     // source name, e.g. "x"
  irName: string;                   // unique IR name, e.g. "x" or "x$1"
  type: 'int' | 'float';
  storage: 'local' | 'input';
  declarationSpan: SourceSpan;
  scopeId: number;
  initializedAtDeclaration: boolean; // true for initializer or input
}
interface Scope {
  id: number;                       // 0 = global; nested scopes numbered in entry order
  parentId: number | null;
  depth: number;
  span: SourceSpan;
  symbols: Map<string, number>;     // name → symbol id (insertion-ordered)
}
```

### 9.2 Operations

|Operation|Behaviour|
|-|-|
|`enterScope(span)`|Creates scope with next ID, parent = current; becomes current.|
|`exitScope()`|Current ← parent. The scope object is **retained** (for UI display); its names simply become invisible.|
|`declare(name, type, storage, span, init)`|If `name` exists in the **current** scope ⇒ return `{duplicateOf: symbolId}` (caller emits `E\_DUPLICATE\_DECLARATION` with the previous location in the hint; the new declaration is discarded). Otherwise create `SymbolInfo`, register in current scope.|
|`lookup(name)`|Walk current scope → parent → … → 0; return first match or `null`.|

### 9.3 IR Name Assignment

Symbols are processed in declaration order. The first symbol with source name `x` gets `irName = "x"`, the second `x$1`, the third `x$2`, etc. `$` cannot appear in identifiers and `t/L/R + digits` names are reserved, so IR names are globally unique and never collide with temporaries, labels or registers. Because each symbol has a unique IR name, **all IR-level analyses are scope-agnostic**; shadowing has been fully resolved by this point.

### 9.4 Required Tests

`int x; float x;` ⇒ `E\_DUPLICATE\_DECLARATION` (line 1, col 13). `int x; { float x; }` ⇒ OK, two symbols, scopes 0 and 1, IR names `x` and `x$1`. After the inner block, `x` resolves to symbol 1. `{ int y = 1; } y = 2;` ⇒ `E\_UNDECLARED\_IDENTIFIER` (lifetime ended).

\---

## 10\. Semantic Analysis

### 10.1 Algorithm

A single recursive pass over the cloned AST, maintaining (a) the symbol table and (b) the definite-assignment state. Order of operations for `VariableDeclaration`: check reserved name → check `input` placement → analyze initializer (with the *old* scope contents) → convert initializer to the declared type (§10.3) → `declare` → mark assigned if initialized/input.

### 10.2 Expression Typing Rules

|Expression|Operand requirement|Result type|Promotion|
|-|-|-|-|
|`Literal`|—|`literalType`|—|
|`Identifier`|must resolve (`E\_UNDECLARED\_IDENTIFIER`), must be definitely assigned (`E\_UNINITIALIZED\_VARIABLE`)|symbol type|—|
|`-e`|int or float|type of `e`|—|
|`a + - \* / b`|int/float|`float` if either is float, else `int`|`CastNode` around the int side|
|`a % b`|both int (`E\_INVALID\_MODULO\_OPERANDS`)|int|—|
|`a < <= > >= == != b`|int/float|`int`|unify as above (`operandType`)|
|`a \&\& b`, `a \|\| b`|both int (`E\_INVALID\_LOGICAL\_OPERAND`)|int|none (no float→int)|
|`CastNode`|int|float|(inserted only by the analyzer)|

**Note on arithmetic/relational operand errors:** with exactly two numeric types, every combination of `int`/`float` is a valid arithmetic or relational operand pair. The type-rule table nevertheless contains the checks and error codes `E\_INVALID\_ARITHMETIC\_OPERANDS` and `E\_INVALID\_RELATIONAL\_OPERANDS`; they become reachable when the type system grows (e.g. Optional types). They are unit-tested by invoking the rule table directly with a synthetic type. This is stated honestly in `docs/grammar.md`.

**Compile-time constant division:** if a `/` or `%` has `resolvedType = int` and its right operand is syntactically the integer literal `0` (after stripping parentheses and unary minus), report `E\_DIVISION\_BY\_CONSTANT\_ZERO` at the divisor. Float division by `0.0` is legal (IEEE). Division by a *variable* that happens to be zero is not a semantic error; the optimizer handles it (§16.2).

### 10.3 Statement Rules

|Statement|Rule|
|-|-|
|Declaration with init|`int ← float` ⇒ `E\_NARROWING\_CONVERSION`; `float ← int` ⇒ wrap initializer in `CastNode`.|
|`input`|Only in scope 0, else `E\_INPUT\_NOT\_TOP\_LEVEL`.|
|Assignment|Target must resolve (`E\_UNDECLARED\_IDENTIFIER`). Same conversion rules as initialization. Marks target assigned.|
|Expression statement|Analyze; warn `W\_UNUSED\_EXPRESSION\_RESULT`.|
|`if` / `while`|Condition must be `int` (`E\_CONDITION\_NOT\_INT`).|
|`return e`|`e` must be `int` (`E\_RETURN\_TYPE\_MISMATCH` for float). `return;` ⇒ `E\_RETURN\_MISSING\_VALUE`.|
|Block|`enterScope` / `exitScope`.|

### 10.4 Definite-Assignment Analysis

State: `DA = { reachable: boolean, assigned: Set<symbolId> }`. When `reachable = false` the state means "every variable is vacuously assigned" (code there never runs).

|Construct|Transfer|
|-|-|
|Declaration without init|no change|
|Declaration with init / `input`|analyze init with DA; add symbol|
|Assignment `x = e`|analyze `e`; add `x`|
|Read of `x`|if `reachable` and `x ∉ assigned` ⇒ `E\_UNINITIALIZED\_VARIABLE`|
|`if (c) S1 else S2`|analyze `c`; `D1 = S1(DA)`, `D2 = S2(DA)` (or `DA` if no else); result = `merge(D1, D2)`|
|`while (c) S`|analyze `c`; analyze `S` starting from `DA` (result discarded); result = `DA` (body may run zero times)|
|`return e`|analyze `e`; result = `{reachable: false}`|
|Sequence|thread state through items|

`merge(D1, D2)`: if `!D1.reachable` ⇒ `D2`; if `!D2.reachable` ⇒ `D1`; else `{reachable: true, assigned: D1.assigned ∩ D2.assigned}`.

Expressions cannot assign (assignment is a statement), so `\&\&`/`||` need no special DA handling.

**Documented boundary:** loop conditions are never treated as constants; e.g. code after `while (1) { x = 1; }` is analyzed with the pre-loop state. This is conservative and sound.

**Unreachable-code warning:** when a block item is visited while `reachable = false`, emit `W\_UNREACHABLE\_CODE` once per source block (at the first such item). Reads in unreachable code are not reported.

### 10.5 Diagnostics Do Not Cascade

An undeclared identifier receives an internal *error type*; any expression with an error-typed operand also receives the error type and **no further diagnostics are produced for it**. The error type never escapes semantic analysis (IR generation does not run when errors exist).

### 10.6 Output

```ts
interface SemanticAnalysisResult {
  ok: boolean;                     // no errors (warnings allowed)
  typedAst: Program;
  symbols: SymbolInfo\[];
  scopes: ScopeSnapshot\[];         // serializable scope tree
  diagnostics: CompilerError\[];
}
```

### 10.7 Semantic Error Catalogue

|Code|Severity|Example|Message|
|-|-|-|-|
|`E\_UNDECLARED\_IDENTIFIER`|error|`y = 1;`|Variable 'y' is not declared in this scope.|
|`E\_UNINITIALIZED\_VARIABLE`|error|`int x; int y = x + 1;`|Variable 'x' is used before initialization.|
|`E\_DUPLICATE\_DECLARATION`|error|`int x; float x;`|Variable 'x' is already declared in this scope (first declared at 1:5).|
|`E\_RESERVED\_IDENTIFIER`|error|`int t1 = 0;`|'t1' is reserved for compiler temporaries.|
|`E\_NARROWING\_CONVERSION`|error|`int x = 2.5;`|Cannot implicitly convert 'float' to 'int'.|
|`E\_INVALID\_MODULO\_OPERANDS`|error|`float f = 1.0 % 2;`|Operator '%' requires 'int' operands, found 'float'.|
|`E\_INVALID\_LOGICAL\_OPERAND`|error|`int r = 1.5 \&\& 1;`|Operator '\&\&' requires 'int' operands, found 'float'.|
|`E\_INVALID\_ARITHMETIC\_OPERANDS`|error|(reserved; §10.2)|Operator '+' cannot be applied to 'T1' and 'T2'.|
|`E\_INVALID\_RELATIONAL\_OPERANDS`|error|(reserved; §10.2)|Operator '<' cannot be applied to 'T1' and 'T2'.|
|`E\_CONDITION\_NOT\_INT`|error|`if (2.5) {}`|Condition must have type 'int', found 'float'.|
|`E\_RETURN\_MISSING\_VALUE`|error|`return;`|'return' must return an 'int' value.|
|`E\_RETURN\_TYPE\_MISMATCH`|error|`return 2.5;`|Cannot return 'float'; the program returns 'int'.|
|`E\_INPUT\_NOT\_TOP\_LEVEL`|error|`{ input int n; }`|'input' declarations are only allowed at top level.|
|`E\_DIVISION\_BY\_CONSTANT\_ZERO`|error|`int x = 10 / 0;`|Integer division by constant zero.|
|`W\_UNREACHABLE\_CODE`|warning|`return 1; x = 2;`|Unreachable code after 'return'.|
|`W\_UNUSED\_EXPRESSION\_RESULT`|warning|`x + 1;`|Expression result is unused.|

### 10.8 Explicit Casts (Optional O2 — semantics fixed now for consistency)

If implemented: `(float) e` with `e : int` ⇒ `CastNode(implicit: false)`; `(int) e` with `e : float` ⇒ new IR opcode `FLOAT\_TO\_INT` that truncates toward zero and **traps** on NaN, ±∞ or out-of-range values (so DCE must treat it as trapping unless its operand is a finite in-range constant). Grammar: in `primary`, `"(" type ")" unary`. Not part of the MVP; no MVP test may depend on it.

\---

## 11\. Intermediate Representation (Structured TAC)

### 11.1 Principles

* Instructions are immutable objects (`readonly` fields; frozen in development builds).
* Every instruction carries a `span` (the AST node it came from) and an `id`.
* IR is **typed**: every value operand has a type; every arithmetic/comparison instruction carries the type it operates on. Mixed-type operations do not exist (promotions are explicit `INT\_TO\_FLOAT`).
* Temporaries are not SSA: a temporary is normally assigned once, but the value-context lowering of `\&\&`/`||` assigns its result temp on two paths (§12.5). All analyses treat temps and variables uniformly as **names**.

### 11.2 Operands

|Kind|Fields|Printed as|Notes|
|-|-|-|-|
|`temp`|`id: number`, `type`|`t3`|Numbered from 1 per program, in emission order.|
|`var`|`symbolId`, `name` (= `irName`), `type`|`x`, `x$1`||
|`int`|`value` (int32)|`42`, `-5`||
|`float`|`value` (binary64, always finite)|`2.5`, `1.0`, `-0.0`, `1.0e+21`|Formatting §11.6.|
|`label`|`name`|`L4`|Only in jump/branch/label instructions.|

A **name operand** is a `temp` or `var`. Its unique key for analyses is its printed name.

### 11.3 Opcodes

|Opcode|Shape|Typing rule|
|-|-|-|
|`ADD SUB MUL DIV`|`dest = a op b`|`type ∈ {int,float}`; `a`, `b`, `dest` all of `type`|
|`MOD`|`dest = a % b`|int only|
|`NEG`|`dest = neg a`|`a`, `dest` of `type`|
|`EQ NE LT LE GT GE`|`dest = a op b`|`a`, `b` of `type` (operand type); `dest : int`|
|`COPY`|`dest = a`|`a`, `dest` same type|
|`INT\_TO\_FLOAT`|`dest = int\_to\_float a`|`a : int`, `dest : float`|
|`INPUT`|`dest = input int\|float`|`dest` is a `var` of that type; side-effecting|
|`LABEL`|`L1:`|—|
|`GOTO`|`goto L1`|—|
|`IF\_TRUE`|`if a goto L1`|`a : int`; jumps if `a != 0`, else falls through|
|`IF\_FALSE`|`ifFalse a goto L1`|`a : int`; jumps if `a == 0`, else falls through|
|`RETURN`|`return a`|`a : int`; terminal|

**Terminators:** `GOTO`, `IF\_TRUE`, `IF\_FALSE`, `RETURN`. `GOTO` and `RETURN` never fall through.

**Side-effect / trap classification** (used by DCE, CSE, folding):

|Class|Opcodes|
|-|-|
|Pure, non-trapping|`ADD SUB MUL NEG EQ NE LT LE GT GE COPY INT\_TO\_FLOAT`; float `DIV`|
|Potentially trapping|int `DIV`, `MOD` — **unless** the divisor is an `int` constant ≠ 0|
|Side-effecting|`INPUT`|
|Control|`LABEL GOTO IF\_TRUE IF\_FALSE RETURN`|

### 11.4 IR Program

```ts
interface IRProgram {
  instructions: readonly IRInstruction\[];
  temps: readonly { id: number; type: ScalarType }\[];
  variables: readonly { symbolId: number; name: string; type: ScalarType; storage: 'local' | 'input' }\[];
  labelCount: number;
}
```

### 11.5 IR Invariants (checked by `validateIR`)

|ID|Invariant|
|-|-|
|V1|The instruction list is non-empty and its last instruction is `RETURN` or `GOTO` (no fall-off-the-end).|
|V2|Every label is defined by exactly one `LABEL`; every jump/branch target is defined.|
|V3|All operand/destination types satisfy §11.3.|
|V4|Instruction IDs are unique. In the optimizer, IDs ⊆ the initial program's IDs (OPT-ID).|
|V5|Float constants are finite. Int constants are within int32.|
|V6|Instruction count ≤ `MAX\_IR\_INSTRUCTIONS`.|

`validateIR` runs after TAC generation (failure ⇒ `IRGenerationError E\_IR\_INVALID`) and after every optimization pass (failure ⇒ `OptimizationError E\_PASS\_PRODUCED\_INVALID\_IR`, §17.5).

### 11.6 Canonical Text Format

One instruction per line, no indentation, no trailing spaces, `\\n` line endings. Labels print as `L1:`. All other forms are given in §11.3.

Float formatting `formatFloat(v)`:

1. If `Object.is(v, -0)` ⇒ `-0.0`.
2. `s = String(v)` (shortest round-trip).
3. If `s` contains neither `.` nor `e` ⇒ `s + ".0"` (`3` ⇒ `3.0`).
4. If `s` contains `e` but not `.` ⇒ insert `.0` before `e` (`1e+21` ⇒ `1.0e+21`).

The UI may add indentation and colour, but tests compare the canonical format.

\---

## 12\. TAC Generation (AST → IR)

### 12.1 Generator State

`instructions\[]`, `nextInstrId` (from 1), `nextTemp` (from 1), `nextLabel` (from 1). The generator consumes the typed AST only.

**Naming determinism rules:**

* A **label** is allocated when the construct that owns it *begins* lowering (outer constructs therefore get smaller numbers). Allocation order per construct is fixed in §12.3–§12.5.
* A **temp** is allocated immediately before its defining instruction is emitted (after its operands were generated), so temps appear in increasing order in the listing.

### 12.2 Expression Lowering

Two mutually recursive functions:

* `genValue(e): Operand` — returns an operand holding the value of `e`.

  * `Literal` ⇒ constant operand (no instruction).
  * `Identifier` ⇒ `var` operand (no instruction).
  * anything else ⇒ allocate result via `genInto(e, newTemp(e.resolvedType))`, return the temp.
* `genInto(e, dest)` — emits instructions that leave the value of `e` in `dest`.

  * `Literal` / `Identifier` ⇒ `dest = <operand>` (`COPY`).
  * `CastNode` ⇒ `a = genValue(operand)`; `dest = int\_to\_float a`.
  * `UnaryExpression` ⇒ `a = genValue(operand)`; `dest = neg a`.
  * Arithmetic/comparison `BinaryExpression` ⇒ `a = genValue(left)`; `b = genValue(right)`; `dest = a op b` (left evaluated first).
  * `\&\&`/`||` ⇒ value-context lowering (§12.5).

For `genValue` of a compound expression, operands are generated **first**, then the temp is allocated, then the instruction is emitted (this fixes temp numbering).

**Destination passing:** declarations and assignments call `genInto(init, var)` directly, so `x = a + b` produces one instruction, not `t1 = a + b; x = t1`. This is safe because the single instruction reads all its operands before writing `dest`.

Examples:

```c
int x = a + b \* c;
```

```text
t1 = b \* c
x = a + t1
```

```c
int x = (a + b) \* (c - d) / e;
```

```text
t1 = a + b
t2 = c - d
t3 = t1 \* t2
x = t3 / e
```

```c
float y = x + 2.5;          // x : int
```

```text
t1 = int\_to\_float x
y = t1 + 2.5
```

```c
float f = 3;                // literal cast is NOT folded at generation time
```

```text
f = int\_to\_float 3
```

```c
int n = -x;
```

```text
n = neg x
```

### 12.3 Statement Lowering

|Statement|Emitted code|
|-|-|
|`int x;`|nothing|
|`int x = e;` / `x = e;`|`genInto(e, x)`|
|`input int n;`|`n = input int`|
|`e;`|if `e` is a literal/identifier: nothing; else `genValue(e)` (result unused; kept if it may trap)|
|`{ S\* }`|lower each item in order; **an empty source block emits nothing**|
|`return e;`|`a = genValue(e)`; `return a`|
|`if (c) S`|allocate `Lend`; `jumpIfFalse(c, Lend)`; `S`; `Lend:`|
|`if (c) S1 else S2`|allocate `Lelse`, `Lend`; `jumpIfFalse(c, Lelse)`; `S1`; `goto Lend` **unless the last emitted instruction is `RETURN` or `GOTO`**; `Lelse:`; `S2`; `Lend:`|
|`while (c) S`|allocate `Lstart`, `Lend`; `Lstart:`; `jumpIfFalse(c, Lend)`; `S`; `goto Lstart` **unless the last emitted instruction is `RETURN` or `GOTO`**; `Lend:`|

### 12.4 Jumping Code for Conditions (short-circuit)

`jumpIfFalse(e, L)` emits code that jumps to `L` iff `e` is false and otherwise falls through. `jumpIfTrue(e, L)` is the dual.

|`e`|`jumpIfFalse(e, Lf)`|`jumpIfTrue(e, Lt)`|
|-|-|-|
|`A \&\& B`|`jumpIfFalse(A, Lf)`; `jumpIfFalse(B, Lf)`|allocate `Lskip`; `jumpIfFalse(A, Lskip)`; `jumpIfTrue(B, Lt)`; `Lskip:`|
|`A \|\| B`|allocate `Lskip`; `jumpIfTrue(A, Lskip)`; `jumpIfFalse(B, Lf)`; `Lskip:`|`jumpIfTrue(A, Lt)`; `jumpIfTrue(B, Lt)`|
|other|`a = genValue(e)`; `ifFalse a goto Lf`|`a = genValue(e)`; `if a goto Lt`|

`B`'s code is only reachable on the path where `A` did not decide the result — this is exactly short-circuit semantics, and it is visible in the CFG as `B` living in a separate basic block guarded by `A`'s branch. Integer-literal conditions (e.g. `while (1)`) are emitted as `ifFalse 1 goto L` and left for CFG Simplification to fold, so the user can see the unoptimized shape.

**`if (a \&\& b) { x = 1; }`** (Lend = L1)

```text
ifFalse a goto L1
ifFalse b goto L1
x = 1
L1:
```

**`if (a || b) { x = 1; }`** (Lend = L1, Lskip = L2)

```text
if a goto L2
ifFalse b goto L1
L2:
x = 1
L1:
```

**`if (a \&\& (b || c)) { x = 1; }`** (Lend = L1, Lskip = L2)

```text
ifFalse a goto L1
if b goto L2
ifFalse c goto L1
L2:
x = 1
L1:
```

**`if (a != 0 \&\& b / a > 2) { x = 1; }`** — the guarded division:

```text
t1 = a != 0
ifFalse t1 goto L1
t2 = b / a
t3 = t2 > 2
ifFalse t3 goto L1
x = 1
L1:
```

`t2 = b / a` is reached only through the fall-through of `ifFalse t1`, i.e. only when `a != 0`.

### 12.5 Logical Operators in Value Context

`genInto(A \&\& B, dest)` / `genInto(A || B, dest)`: allocate `Lfalse`, `Lend`; then

```text
jumpIfFalse(A \&\& B, Lfalse)      // uses §12.4, preserves short circuit
dest = 1
goto Lend
Lfalse:
dest = 0
Lend:
```

(For `A || B`, `jumpIfFalse` uses the `||` row of §12.4.) Example `int r = a \&\& b;` (Lfalse = L1, Lend = L2):

```text
ifFalse a goto L1
ifFalse b goto L1
r = 1
goto L2
L1:
r = 0
L2:
```

If the logical expression is a sub-expression (`int r = (a || b) + 1;`), `dest` is a fresh temp allocated right before `dest = 1` is emitted.

### 12.6 Control-Flow Examples

**if/else**

```c
int x = 10;
if (x > 5) { x = x + 1; } else { x = x - 1; }
return x;
```

```text
x = 10
t1 = x > 5
ifFalse t1 goto L1
x = x + 1
goto L2
L1:
x = x - 1
L2:
return x
```

**while with early return**

```c
input int x;
while (x > 0) {
    if (x == 5)
        return x;
    x = x - 1;
}
```

```text
x = input int
L1:
t1 = x > 0
ifFalse t1 goto L2
t2 = x == 5
ifFalse t2 goto L3
return x
L3:
x = x - 1
goto L1
L2:
return 0
```

The final `return 0` is the implicit return (§12.7).

**Empty loop body** `while (1) {}`

```text
L1:
ifFalse 1 goto L2
goto L1
L2:
return 0
```

**Empty if/else** (`input int x; if (x) {} else {}`)

```text
x = input int
ifFalse x goto L1
goto L2
L1:
L2:
return 0
```

### 12.7 Implicit Return

After lowering the whole program: if the instruction list is empty, or its last instruction is neither `RETURN` nor `GOTO`, append `return 0` with `meta.implicit = true` and the span of the program's end. This guarantees invariant V1: no path falls off the end. (If the program's last statement is a `return` but earlier labelled code falls through to the end, that label precedes the end, so the last instruction is a `LABEL` and `return 0` is appended — correct by construction.)

### 12.8 Unreachable Source Code

Code after `return` is still lowered (e.g. `return x; x = 20;` produces `return x`, `x = 20`, `return 0`). The CFG marks it unreachable and CFG Simplification removes it, with a logged record — a deliberate teaching moment.

### 12.9 Generation Limits

If the instruction count exceeds `MAX\_IR\_INSTRUCTIONS` the generator stops with `IRGenerationError E\_IR\_TOO\_LARGE`.

\---

## 13\. Basic Blocks and Control Flow Graph

### 13.1 Leaders

Given the linear instruction list `I\[0..n-1]`, instruction `I\[k]` is a **leader** iff:

1. `k = 0`; or
2. `I\[k]` is a `LABEL` that is the target of at least one `GOTO`/`IF\_TRUE`/`IF\_FALSE`; or
3. `I\[k-1]` is a terminator (`GOTO`, `IF\_TRUE`, `IF\_FALSE`, `RETURN`).

A `LABEL` that is not targeted and does not follow a terminator stays inside the current block (it is harmless and removed by CFG Simplification).

### 13.2 Blocks

A basic block is the maximal range `\[leader\_i, leader\_{i+1})`. Blocks are numbered `B0, B1, …` in layout order. `B0` is the **entry block**. A synthetic **EXIT block** with ID `B<n>` (one past the last real block) has zero instructions.

**Empty-block safety:** Because blocks are cut from the instruction list by leaders, real blocks built from generated or optimized IR always contain ≥ 1 instruction (possibly only a `LABEL`, e.g. the `L1:` block of an empty `else`). Nevertheless every CFG and analysis routine MUST handle `instructions.length === 0` (the EXIT block always, and any defensive case): an empty block has no terminator, no uses/defs, and falls through to the next block (or has no successors if it is last). No code may index `instructions\[length - 1]` without a length check. Source-level empty blocks produce no instructions at all; the surrounding `goto`/label structure carries the control flow (see §12.6).

### 13.3 Edges

For a block `B` whose last instruction is `T` (or which is empty):

|`T`|Successor edges (kind)|
|-|-|
|`GOTO L`|block of `L` (`jump`)|
|`IF\_TRUE a, L`|block of `L` (`branch-true`); next block (`fallthrough-false`)|
|`IF\_FALSE a, L`|block of `L` (`branch-false`); next block (`fallthrough-true`)|
|`RETURN`|EXIT (`return`)|
|other / empty|next block (`fallthrough`); none if `B` is last|

If both edges of a conditional branch lead to the same block, successors are de-duplicated (one edge, kind `jump`). Predecessors are derived from successors. Successor and predecessor lists are sorted by block ID.

**Return is terminal:** a block ending in `RETURN` has exactly one successor, EXIT. A `return` inside a loop therefore never has a back-edge to the loop header.

### 13.4 Derived Properties

* **Reachability:** BFS from B0; `block.reachable`. EXIT may be unreachable (e.g. `while (1) {}` after optimization) — this is legal and means the program does not terminate.
* **Back-edges:** an edge `B → H` is a back-edge if `H` is on the DFS stack when the edge is explored (DFS from B0, successors in ID order). Used for UI styling only.
* **Label map:** label name → block ID.

### 13.5 CFG Text Dump (for golden tests)

```text
B1 \[L1] preds: B0,B4 succs: B2,B5
  L1:
  t1 = x > 0
  ifFalse t1 goto L2
```

Header: `B<id>`, optional `\[entry]`, optional `\[unreachable]`, `\[Lk]` if the block starts with a label, then `preds:` and `succs:` (comma-separated, `-` if none). EXIT prints as `B<n> \[exit] preds: …`.

### 13.6 Worked Example — early return inside loop

For the TAC in §12.6 ("while with early return"):

|Block|Instructions|Succs|Notes|
|-|-|-|-|
|B0 \[entry]|`x = input int`|B1|fallthrough|
|B1 \[L1]|`L1:`, `t1 = x > 0`, `ifFalse t1 goto L2`|B2, B5|loop header|
|B2|`t2 = x == 5`, `ifFalse t2 goto L3`|B3, B4||
|B3|`return x`|EXIT (B6)|**no edge to B1**|
|B4 \[L3]|`L3:`, `x = x - 1`, `goto L1`|B1|back-edge|
|B5 \[L2]|`L2:`, `return 0`|EXIT (B6)||
|B6 \[exit]|—|—|preds B3, B5|

### 13.7 Limits

If the number of blocks exceeds `MAX\_CFG\_BLOCKS` the builder returns an `IRGenerationError E\_CFG\_TOO\_LARGE` (cannot happen within `MAX\_IR\_INSTRUCTIONS` unless the limits are misconfigured; it is a defensive check).

\---

## 14\. Program Analysis

### 14.1 Instruction-Level USE/DEF

|Instruction|`use`|`def`|
|-|-|-|
|`d = a op b`, `d = neg a`, `d = a`, `d = int\_to\_float a`|name operands among `a`, `b`|`d`|
|`d = input T`|—|`d`|
|`if a goto L`, `ifFalse a goto L`, `return a`|`a` if it is a name|—|
|`LABEL`, `GOTO`|—|—|

### 14.2 Block-Level USE/DEF

Scan instructions in order; for each instruction, first process uses, then defs:

```text
for each instruction i in B:
    for u in use(i): if u ∉ DEF\[B]: USE\[B] ∪= {u}
    DEF\[B] ∪= def(i)
```

`USE\[B]` = names read in `B` before any write in `B`. `DEF\[B]` = names written in `B`. `x = x - 1` puts `x` in both.

### 14.3 Liveness (backward, may, union)

```text
OUT\[EXIT] = ∅
OUT\[B]    = ∪ IN\[S]  for S ∈ succ(B)
IN\[B]     = USE\[B] ∪ (OUT\[B] − DEF\[B])
```

**Worklist algorithm (deterministic):**

```text
for all B: IN\[B] = OUT\[B] = ∅
queue = all blocks except EXIT in descending ID order; inQueue\[B] = true
while queue not empty:
    B = dequeue(); inQueue\[B] = false; visits++
    if visits > MAX\_DATAFLOW\_VISITS: raise OptimizationError E\_ANALYSIS\_DID\_NOT\_CONVERGE
    OUT\[B] = ∪ IN\[S] for S in succ(B)
    newIn  = USE\[B] ∪ (OUT\[B] − DEF\[B])
    if newIn ≠ IN\[B]:
        IN\[B] = newIn
        for P in pred(B) (ascending ID): if !inQueue\[P]: enqueue(P); inQueue\[P] = true
```

**Termination:** IN sets only grow, are bounded by the finite set of names, and a block is re-queued only when some successor's IN grew. Hence at most `|blocks| × |names|` growth events; the visit cap is a safety net (`MAX\_DATAFLOW\_VISITS = 200,000`).

**Per-instruction liveness** (needed by DCE and the UI): walk each block backwards from `OUT\[B]`: `liveAfter(i)` = current set; then `live = (live − def(i)) ∪ use(i)`.

Output sets are presented sorted: user variables alphabetically by IR name, then temps numerically.

### 14.4 Worked Liveness Example (Critical Test 15 program, see §26)

Blocks: B0 `{x,a,b = input}`; B1 `{L1:, t1 = x > 0, ifFalse t1 goto L2}`; B2 `{ifFalse a goto L3}`; B3 `{ifFalse b goto L3}`; B4 `{return x}`; B5 `{L3:, x = x - 1, L4:, goto L1}`; B6 `{L2:, return 0}`.

|Block|USE|DEF|IN (fixed point)|OUT|
|-|-|-|-|-|
|B0|∅|a, b, x|∅|a, b, x|
|B1|x|t1|a, b, x|a, b, x|
|B2|a|∅|a, b, x|a, b, x|
|B3|b|∅|a, b, x|a, b, x|
|B4|x|∅|x|∅|
|B5|x|x|a, b, x|a, b, x|
|B6|∅|∅|∅|∅|

### 14.5 Optimizer-Internal Forward Analyses

These are implemented in `compiler/src/analysis/` because they are reusable and unit-testable, but they are consumed by passes and displayed only optionally.

**(a) Constant lattice (for Constant Propagation)** — forward, meet over predecessors.

* Lattice per name: `TOP` (no information yet) ⊐ `CONST(c)` ⊐ `NAC` (not a constant).
* `meet(TOP, v) = v`; `meet(CONST c, CONST c) = CONST c` (constants compared with `Object.is` for floats, so `0.0` and `-0.0` differ); `meet(CONST c, CONST d≠c) = NAC`; `meet(NAC, ·) = NAC`.
* Initialization: every block's OUT = all `TOP`. Entry IN = all `TOP` (definite assignment guarantees no reachable read of an unassigned variable; temps are always defined before use by construction).
* IN of a non-entry block with no predecessors = all `TOP` (unreachable; nothing substituted since TOP is never substituted).
* Transfer (deliberately simple — **evaluation is Constant Folding's job, not Constant Propagation's**): `d = <constant>` ⇒ `CONST`; `d = a` (copy of a name) ⇒ current value of `a`; every other definition (arithmetic, comparison, `neg`, `int\_to\_float`, `input`) ⇒ `NAC`. The multi-pass driver combines CF and CP: CF turns `t1 = 10 + 20` into `t1 = 30`, after which CP propagates `30` in the next pass. This keeps each pass single-purpose and its log entries easy to explain.
* Worklist with the same determinism rules as liveness (forward: enqueue successors).
* Monotone with lattice height 3 ⇒ terminates.

**(b) Available copies (for Copy Propagation)** — forward, **must** analysis, meet = intersection.

* A fact is a pair `(d, s)` meaning "`d` currently holds the same value as name `s`", generated by `COPY d = s` where `s` is a name and `d ≠ s`.
* Universe `U` = all such pairs in the program.
* Entry IN = ∅. IN of a non-entry block with no predecessors = ∅. Other blocks initialize OUT = `U`.
* `IN\[B] = ∩ OUT\[P]` over predecessors (**conservative at joins**: a copy survives a join only if it holds on every incoming path).
* Transfer of an instruction defining name `n`: **kill** every pair `(n, \*)` and `(\*, n)`; then, if the instruction is `COPY n = s` with `s` a name, `s ≠ n`, **gen** `(n, s)`.
* Because defining `d` kills all `(d, \*)`, at any point there is at most one pair with a given first element.

### 14.6 Reaching Definitions (Optional O1)

Standard forward may-analysis over definition IDs; display only. No MVP pass depends on it.

### 14.7 Output

```ts
interface AnalysisResult {
  useDef: UseDefResult;
  liveness: LivenessResult;
  reachingDefinitions?: ReachingDefinitionsResult; // Optional O1
}
```

Computed for both the unoptimized and the optimized program and shown side by side in the Program Analysis view.

\---

## 15\. Optimization Framework

### 15.1 Interfaces (summary — full types in §21)

```ts
type PassName =
  | 'constant-folding' | 'constant-propagation' | 'algebraic-simplification'
  | 'copy-propagation' | 'common-subexpression-elimination'
  | 'dead-code-elimination' | 'cfg-simplification';

interface OptimizationPass {
  readonly name: PassName;
  readonly displayName: string;
  readonly scope: 'mandatory' | 'recommended';
  run(program: IRProgram, ctx: PassContext): PassResult;   // MUST NOT mutate `program`
}

interface PassContext {
  readonly iteration: number;
  record(r: NewTransformationRecord): void;   // pass name \& iteration filled in by the manager
  warn(d: CompilerError): void;               // de-duplicated by (code, instructionId)
}

interface PassResult { program: IRProgram; changed: boolean }
```

### 15.2 Pass Obligations

Every pass MUST:

1. Treat its input as immutable and return a new `IRProgram` (unchanged instructions may be shared by reference).
2. Build any CFG/analysis it needs from the input it received (no caching between passes).
3. Keep instruction IDs when rewriting; never create instructions (OPT-ID).
4. Call `ctx.record` exactly once per individual transformation.
5. Return `changed = true` iff it changed the program.
6. Never throw for any valid IR; an exception is a bug and is contained by the manager (§17.5).
7. Be runnable in isolation (unit tests construct IR, run one pass, assert output and records).

### 15.3 PassManager

Responsibilities: holds the ordered pass list filtered by `CompileOptions.enabledPasses`; runs iterations (§17); fingerprints the IR before/after each pass (canonical text) and uses the **fingerprint comparison as the authority** for `changed` (a mismatch with the pass's own flag is logged as an internal warning `W\_PASS\_CHANGE\_FLAG\_MISMATCH` in development builds); runs `validateIR` after every changing pass; snapshots the IR text after each pass for the UI stepper; aggregates records, warnings and statistics.

\---

## 16\. Optimization Passes

Mandatory: Constant Folding (§16.1, with the shared safe evaluator in §16.2), Constant Propagation (§16.3), Algebraic Simplification (§16.4), Copy Propagation (§16.5), Dead Code Elimination (§16.6), CFG Simplification (§16.7). Recommended: Common Subexpression Elimination (§16.8).

### 16.1 Constant Folding (CF) — mandatory

**Scope:** each instruction independently.
**Applies to:** `ADD SUB MUL DIV MOD NEG EQ NE LT LE GT GE INT\_TO\_FLOAT` whose value operands are all constants.
**Rewrite:** `d = <ops on constants>` ⇒ `d = <constant>` (`COPY`, same `id`).
**Does not touch branches** (CFG Simplification folds constant branches).

### 16.2 The Safe Evaluator (used by CF; also by the test-only interpreter R5)

`evaluate(opcode, type, operands) → { ok: true, value } | { ok: false, reason }`

|Case|Result|
|-|-|
|int `+ - \*`, `neg`|Exact result wrapped to int32 (`Math.imul` for `\*`, `\| 0` for `+ -`, `-a \| 0` for neg). If the mathematical result was out of range, CF additionally emits info warning `W\_INT\_OVERFLOW\_WRAPPED` (the fold is still performed — wrap is defined, §4.3).|
|int `/`|divisor 0 ⇒ `{ok:false, reason:'division-by-zero'}`; else `Math.trunc(a / b) \| 0` (handles `INT\_MIN / -1` = `INT\_MIN`).|
|int `%`|divisor 0 ⇒ `{ok:false, reason:'modulo-by-zero'}`; else `a % b` (JS `%` already has the dividend's sign; `INT\_MIN % -1` ⇒ `-0` normalized to `0`).|
|float `+ - \* /`, `neg`|Compute in binary64. If the result is NaN or ±∞ ⇒ `{ok:false, reason:'non-finite-result'}`. Finite results (including `-0.0` and subnormals) are folded.|
|comparisons|int or float compare (inputs are finite constants, so no NaN case arises) ⇒ `0`/`1`.|
|`int\_to\_float c`|`c` as float (always exact for int32).|

**Refused folds:** the instruction is left unchanged (it will still trap or produce NaN/∞ at runtime), no record is created, and CF emits a warning:

* `W\_DIVISION\_BY\_ZERO\_NOT\_FOLDED` — "Integer division by zero will trap at runtime; the operation was not folded."
* `W\_NONFINITE\_NOT\_FOLDED` — "Float result is NaN/Infinity; left unfolded to preserve IEEE semantics."

Warnings are de-duplicated by `(code, instructionId)`. The compiler never crashes and never produces an invalid constant (V5).

**Warnings on later-removed code:** a warning refers to the IR at the moment it was raised. If its instruction is later deleted (e.g. CFG Simplification proves the block unreachable), the PassManager sets `resolved: true` on that warning at the end of the run and the UI shows it greyed with the tag "instruction later removed as unreachable/dead". Demo 4 (§28) exercises this.

**Example record:**

```text
Pass: Constant Folding
Before: t1 = 10 + 20
After:  t1 = 30
Rule:   CF.INT\_ARITH (10 + 20 → 30)
Reason: Both operands are compile-time constants.
```

### 16.3 Constant Propagation (CP) — mandatory

**Analysis:** constant lattice (§14.5a), recomputed on entry.
**Rewrite:** walk each block forward from its IN state, applying the transfer function instruction by instruction; for every **use** of a name whose current value is `CONST c`, replace the operand with the constant `c`. Applies to all value operands, including branch conditions and `return`.
**Never substitutes** `TOP` or `NAC`, never substitutes into a destination, never changes `INPUT`.
**Type safety:** the constant has the name's type, so typing invariants hold.
**Rule ID:** `CP.SUBSTITUTE` (one record per rewritten instruction, listing all substituted operands).

### 16.4 Algebraic Simplification (AS) — mandatory

Applies to instructions with at least one non-constant operand (all-constant instructions are CF's job). Every rewrite produces `COPY` (same `id`).

**Integer rules (aggressive — exact for wrapping int32 and non-trapping):**

|Rule ID|Pattern|Result|
|-|-|-|
|`AS.INT.ADD\_ZERO`|`x + 0`, `0 + x`|`x`|
|`AS.INT.SUB\_ZERO`|`x - 0`|`x`|
|`AS.INT.SUB\_SELF`|`x - x`|`0`|
|`AS.INT.MUL\_ONE`|`x \* 1`, `1 \* x`|`x`|
|`AS.INT.MUL\_ZERO`|`x \* 0`, `0 \* x`|`0`|
|`AS.INT.DIV\_ONE`|`x / 1`|`x`|
|`AS.INT.MOD\_ONE`|`x % 1`|`0`|
|`AS.INT.CMP\_SELF`|`x == x`, `x <= x`, `x >= x` ⇒ `1`; `x != x`, `x < x`, `x > x` ⇒ `0`|constant|

Deliberately **not** applied for int: `0 / x`, `0 % x`, `x / x`, `x % x` (would remove a trap when `x == 0`).

**Float rules (conservative — only identities exact under IEEE 754 for every input including NaN, ±0, ±∞):**

|Rule ID|Pattern|Result|Why it is exact|
|-|-|-|-|
|`AS.FLOAT.MUL\_ONE`|`x \* 1.0`, `1.0 \* x`|`x`|Multiplication by 1 returns `x` for all `x` (NaN→NaN, −0→−0, ∞→∞).|
|`AS.FLOAT.DIV\_ONE`|`x / 1.0`|`x`|Same as above.|
|`AS.FLOAT.SUB\_POS\_ZERO`|`x - 0.0` (constant exactly `+0.0`)|`x`|`−0 − (+0) = −0`; all other `x` unchanged.|
|`AS.FLOAT.ADD\_NEG\_ZERO`|`x + (-0.0)`, `(-0.0) + x`|`x`|`+0 + −0 = +0`, `−0 + −0 = −0`.|

**Explicitly rejected float rules** (each has a counterexample, documented in `optimizations.md` and covered by Critical Test 11):

|Rejected|Counterexample|
|-|-|
|`x \* 0.0 → 0.0`|`NaN \* 0 = NaN`; `∞ \* 0 = NaN`; `−5 \* 0 = −0`|
|`x + 0.0 → x`|`−0 + (+0) = +0`, not `−0`|
|`x - x → 0.0`|`∞ − ∞ = NaN`; `NaN − NaN = NaN`|
|`x == x → 1`|`NaN == NaN` is `0`|
|`0.0 - x → neg x`|`0 − (+0) = +0` but `neg(+0) = −0`|
|`x / x → 1.0`|`0/0`, `∞/∞` are NaN|

Constants are compared with `Object.is`, so `+0.0` and `-0.0` are distinct patterns. There is no fast-math mode.

### 16.5 Copy Propagation (CopyP) — mandatory

**Analysis:** available copies (§14.5b), recomputed on entry.
**Rewrite:** walk each block forward from IN; for every use of name `u`, if a pair `(u, s)` is currently available, replace `u` with `s` (`COPY.SUBSTITUTE`); then apply the instruction's kill/gen.
**Self-copy removal:** `x = x` is deleted (`COPY.SELF`).
**Invalidation:** any definition of `n` (assignment, arithmetic result, `input`) kills every copy fact mentioning `n` on either side. This is what prevents stale aliases.

```c
input int y;
int z;
int x = y;
y = 5;
z = x;
return z;
```

```text
y = input int
x = y          ← gen (x, y)
y = 5          ← kills (x, y)
z = x          ← NOT rewritten to z = y (fact was killed); gen (z, x)
return z       ← rewritten to return x
```

Scope interaction: none — IR names are unique per symbol (§9.3), so shadowed variables are different names.
Joins: intersection; a copy established on only one branch is not used after the join.
Chains inside one block (`b = a; c = b; d = c`) collapse in a single run, because a rewritten copy (`c = a`) generates the fact for its *rewritten* source; chains across blocks may need further iterations.

### 16.6 Dead Code Elimination (DCE) — mandatory

**Analysis:** liveness (§14.3), per-instruction.
**Removable instruction:** has a destination `d`, `d` is not live immediately after the instruction, **and** it is pure and non-trapping (§11.3 classification). In particular:

* int `DIV`/`MOD` is removable **only** if its divisor is an `int` constant ≠ 0.
* `INPUT`, `RETURN`, `GOTO`, `IF\_TRUE`, `IF\_FALSE`, `LABEL` are **never** removed by DCE.

**Algorithm:** repeat { compute liveness; sweep every block backwards removing removable dead instructions } until a sweep removes nothing (at most `instructionCount` rounds). Rule ID `DCE.DEAD\_ASSIGNMENT`; reason names the dead destination ("'t3' is never used after this point").

**Trap preservation example:** `int z = 0; int x = 10 / z; return 1;` → after CP the division is `x = 10 / 0`; `x` is dead, but the instruction is kept because removing it would remove the runtime trap.

### 16.7 CFG Simplification (CFGS) — mandatory

Operates on the linear list; rules are applied in the order below, repeatedly, until a full round changes nothing (bounded by `instructionCount + 1` rounds). The CFG is rebuilt whenever a rule needs it.

|Rule ID|Transformation|Safety condition|
|-|-|-|
|`CFG.CONST\_BRANCH`|`if c goto L`: `c ≠ 0` ⇒ `goto L`; `c = 0` ⇒ delete. `ifFalse c goto L`: `c = 0` ⇒ `goto L`; `c ≠ 0` ⇒ delete.|`c` is an int constant.|
|`CFG.UNREACHABLE\_BLOCK`|Delete every instruction of every block not reachable from B0.|Reachability via BFS.|
|`CFG.JUMP\_THREADING`|A `goto`/`if`/`ifFalse` targeting `L`, where the first non-`LABEL` instruction after `L:` is `goto M`, is retargeted to the final label of that chain.|Follow chains with a visited set; if a cycle is found, or the final label equals the current target, do nothing.|
|`CFG.REDUNDANT\_JUMP`|Delete `goto L` / `if a goto L` / `ifFalse a goto L` when only `LABEL` instructions lie between it and `L:`.|Branch operands are side-effect-free names/constants, so deleting a conditional branch whose both outcomes reach the same instruction is safe. Never deletes the last instruction of the program (V1).|
|`CFG.UNUSED\_LABEL`|Delete a `LABEL` that no jump/branch targets.|—|

**Block merging and empty-block removal** are achieved structurally: once a redundant jump and an unused label are removed, the two former blocks are no longer separated by a leader, so the next CFG build sees one merged block. A block that consisted only of an unused label disappears entirely. This is documented in `optimizations.md` as "merging by leader elimination" and each contributing deletion is logged.

Preservation: labels are only removed when untargeted; targets are only changed by threading to an equivalent destination; the CFG is always rebuilt from the list, so predecessor/successor information is never stale.

### 16.8 Common Subexpression Elimination (CSE) — recommended

**Scope:** local to one basic block (no global expression cache).
**Table:** key → holder name, where key = `opcode:type:op1:op2` with operands ordered canonically for commutative opcodes (`ADD`, `MUL`, `EQ`, `NE`; for both int and float — IEEE addition and multiplication are commutative). Eligible opcodes: pure ones plus int `DIV`/`MOD` (reusing an earlier division's result is safe: if the first one trapped, the second is never reached). `INPUT` and `COPY` are never entered.
**Algorithm (per block, forward):**

1. For instruction `d = a op b`: if `key ∈ table` with holder `h ≠ d`, rewrite to `d = h` (`CSE.REUSE`).
2. Invalidate: remove every entry whose operands include `d` or whose holder is `d`.
3. If the instruction is eligible and was not rewritten, and `d ∉ {a, b}`, insert `key → d`.

```text
t1 = a + b
t2 = x \* y
t3 = a + b      →  t3 = t1        (a, b, t1 unchanged since t1 was computed)
a = 7           →  invalidates every entry using a
t4 = a + b      →  NOT replaced
```

\---

## 17\. Multi-Pass Optimization

### 17.1 Pipeline Order (fixed)

```text
1. Constant Folding
2. Constant Propagation
3. Algebraic Simplification
4. Copy Propagation
5. Common Subexpression Elimination   (recommended; skipped if not enabled/implemented)
6. Dead Code Elimination
7. CFG Simplification
```

### 17.2 Driver

```text
program = initialIR
for iteration = 1 .. MAX\_OPT\_ITERATIONS (10):
    changedThisIteration = false
    for pass in enabledPassesInOrder:
        before = fingerprint(program)
        result = runContained(pass, program, ctx(iteration))     // §17.5
        if fingerprint(result.program) != before:
            validateIR(result.program)                            // §17.5 on failure
            program = result.program
            changedThisIteration = true
        snapshot(iteration, pass, program)
    if !changedThisIteration: converged = true; break
if !converged: warn W\_OPTIMIZATION\_ITERATION\_LIMIT
```

`iterations` reported = number of iterations executed (the last one is the "confirming" iteration with no change when converged).

### 17.3 Analysis Invalidation and Recomputation

Analyses are never cached across passes (§3.4). Each pass recomputes exactly what it needs from its input. Cost is acceptable because input size is bounded (§32).

### 17.4 Why It Terminates

* Hard guarantee: the iteration cap (10) and per-pass internal caps (DCE ≤ instruction count rounds; CFGS ≤ instruction count + 1 rounds; dataflow visit cap).
* In practice: every rewrite is monotone toward "simpler" (instructions only deleted, operations only turned into copies or constants, names only replaced by constants or by *earlier* copy sources, branch targets only threaded forward along a chain), so the pipeline reaches a fixed point within a few iterations on all demo programs. 10 was chosen as ≥ 3× the iteration count of the most complex demo while keeping worst-case latency small.
* Reaching the cap is **not** an error: every intermediate program is semantically equivalent, so the last program is still correct.

### 17.5 Failure Containment

`runContained` wraps each pass:

* If the pass throws ⇒ `OptimizationError E\_PASS\_EXCEPTION` (message includes pass name and iteration).
* If `validateIR` fails on its output ⇒ `OptimizationError E\_PASS\_PRODUCED\_INVALID\_IR` (lists violated invariant).
* If an analysis exceeds its visit cap ⇒ `OptimizationError E\_ANALYSIS\_DID\_NOT\_CONVERGE`.

In all three cases the pass's output is discarded, optimization **stops**, `OptimizationResult.final` is the last valid program, `aborted = true`, and the pipeline continues to the backend. The UI shows a red banner on the Optimization tab.

### 17.6 Worked Trace — Demo 1

```c
int a = 10;
int b = 20;
int x = (a + b) \* 1;
return x;
```

Unoptimized:

```text
a = 10
b = 20
t1 = a + b
x = t1 \* 1
return x
```

|Iter|Pass|Transformation|
|-|-|-|
|1|CF|— (no all-constant instruction yet)|
|1|CP|`t1 = a + b` → `t1 = 10 + 20`|
|1|AS|`x = t1 \* 1` → `x = t1` (`AS.INT.MUL\_ONE`)|
|1|CopyP|`return x` → `return t1`|
|1|DCE|remove `x = t1`, `b = 20`, `a = 10`|
|2|CF|`t1 = 10 + 20` → `t1 = 30`|
|2|CP|`return t1` → `return 30`|
|2|DCE|remove `t1 = 30`|
|3|—|no change ⇒ converged|

Final: `return 30` (5 → 1 instructions, 80.0% static reduction, 3 iterations).

\---

## 18\. Transformation Logging and Statistics

### 18.1 Transformation Record

```ts
interface TransformationRecord {
  id: number;                 // sequential across the whole optimization run
  passName: PassName;
  iteration: number;
  blockId: number;            // block ID in the CFG the pass analyzed
  instructionId: number;      // stable (OPT-ID)
  rule: string;               // e.g. 'CF.INT\_ARITH', 'AS.FLOAT.MUL\_ONE', 'CFG.UNREACHABLE\_BLOCK'
  ruleText: string;           // e.g. '10 + 20 → 30', 'x \* 1.0 → x'
  reason: string;             // human-readable justification
  before: string;             // canonical text of the instruction(s) before
  after: string | null;       // canonical text after; null when deleted
  sourceLocation: SourceSpan | null;
}
```

For `CFG.UNREACHABLE\_BLOCK`, one record per deleted block (`before` = the block's instructions, multi-line; `instructionId` = first instruction's ID).

### 18.2 Statistics

```ts
interface OptimizationStatistics {
  instructionsBefore: number;       // excluding LABEL
  instructionsAfter: number;        // excluding LABEL
  rawInstructionsBefore: number;    // including LABEL
  rawInstructionsAfter: number;
  removedInstructions: number;      // rawBefore − rawAfter
  reductionPercent: number;         // (before − after) / before × 100, 1 decimal; 0 if before = 0
  blocksBefore: number;             // excluding EXIT
  blocksAfter: number;
  iterations: number;
  converged: boolean;
  transformationsByPass: Record<PassName, number>;
  transformationsByCategory: { folding: number; propagation: number; simplification: number;
                               elimination: number; controlFlow: number };
}
```

Category mapping: CF ⇒ folding; CP, CopyP ⇒ propagation; AS, CSE ⇒ simplification; DCE ⇒ elimination; CFGS ⇒ controlFlow.

### 18.3 Honest Reporting

The UI labels these numbers **"Static IR reduction"** and shows the note: *"Fewer IR instructions does not by itself imply faster execution. OptiTAC does not execute or benchmark programs."* No speed-up claims appear anywhere in the UI or docs.

\---

## 19\. Pseudo-Assembly Backend

### 19.1 Machine Model

An educational **accumulator machine**: one working register `R1`, named memory slots for every variable and temporary, immediates written `#value`. There is no register allocation (out of scope); each TAC instruction maps independently.

### 19.2 Instruction Set

`LOAD R1, src` · `STORE dst, R1` · `ADD SUB MUL DIV MOD R1, src` (int) · `FADD FSUB FMUL FDIV R1, src` (float) · `NEG R1` · `FNEG R1` · `ITOF R1` · `CMP R1, src` · `FCMP R1, src` · `SETEQ SETNE SETLT SETLE SETGT SETGE R1` · `IN R1, int|float` · `JMP L` · `JZ L` · `JNZ L` · `RET R1` · `L:`

### 19.3 Mapping

|TAC|Assembly|
|-|-|
|`d = a + b` (int)|`LOAD R1, a` / `ADD R1, b` / `STORE d, R1`|
|`d = a + b` (float)|`LOAD R1, a` / `FADD R1, b` / `STORE d, R1`|
|`d = neg a`|`LOAD R1, a` / `NEG R1` (or `FNEG`) / `STORE d, R1`|
|`d = a < b`|`LOAD R1, a` / `CMP R1, b` (or `FCMP`) / `SETLT R1` / `STORE d, R1`|
|`d = a`|`LOAD R1, a` / `STORE d, R1`|
|`d = int\_to\_float a`|`LOAD R1, a` / `ITOF R1` / `STORE d, R1`|
|`d = input int`|`IN R1, int` / `STORE d, R1`|
|`if a goto L`|`LOAD R1, a` / `CMP R1, #0` / `JNZ L`|
|`ifFalse a goto L`|`LOAD R1, a` / `CMP R1, #0` / `JZ L`|
|`goto L`|`JMP L`|
|`return a`|`LOAD R1, a` / `RET R1`|
|`L1:`|`L1:`|

Constants print as `#10`, `#2.5`. Example: `t1 = a + b` ⇒

```text
LOAD R1, a
ADD R1, b
STORE t1, R1
```

### 19.4 Output

```ts
interface PseudoAssemblyProgram {
  lines: { text: string; sourceInstructionId: number | null }\[];  // null for blank separators
  source: 'optimized' | 'unoptimized';
}
```

The backend is generated from the final IR (and on demand from the unoptimized IR for comparison). It is **display-only**: nothing is assembled or executed.

\---

## 20\. Error Handling and Diagnostics

### 20.1 Error Classes

|`type`|Produced by|Typical cause|
|-|-|-|
|`LexicalError`|lexer|bad character, malformed/out-of-range literal, unterminated comment, input too large|
|`SyntaxError`|parser|missing token, unexpected token, nesting limit|
|`SemanticError`|semantic analyzer|§10.7|
|`IRGenerationError`|TAC generator, CFG builder, validator|size limits, internal invariant violation|
|`OptimizationError`|pass manager|pass exception, invalid IR from a pass, analysis non-convergence|

Every diagnostic (error or warning) is a `CompilerError` object (§21) with `severity: 'error' | 'warning'`. In code, these are plain data objects created by a factory per class (`lexicalError(code, message, span, source)` etc.); no JavaScript exceptions cross module boundaries.

### 20.2 Required Fields and Rendering

`type`, `severity`, `code`, `message`, `line`, `column`, `span`, `sourceSnippet`, optional `hint`, `stage`.

`sourceSnippet` is the full source line followed by a caret line underlining the span (tabs preserved, so carets align):

```text
Semantic Error \[E\_UNINITIALIZED\_VARIABLE]
Line 2, Column 9

Variable 'x' is used before initialization.

  2 | int y = x + 1;
    |         ^
```

Errors without a source position (rare internal errors) use the program's start position and an empty snippet.

### 20.3 Complete Code Catalogue

**Lexical:** `E\_UNEXPECTED\_CHARACTER`, `E\_UNTERMINATED\_COMMENT`, `E\_MALFORMED\_NUMBER`, `E\_INVALID\_NUMERIC\_SUFFIX`, `E\_INT\_LITERAL\_OUT\_OF\_RANGE`, `E\_FLOAT\_LITERAL\_OVERFLOW`, `E\_FLOAT\_LITERAL\_UNDERFLOW`, `E\_IDENTIFIER\_TOO\_LONG`, `E\_SOURCE\_TOO\_LARGE`, `E\_TOO\_MANY\_TOKENS`.

**Syntax:** `E\_EXPECTED\_TOKEN`, `E\_EXPECTED\_EXPRESSION`, `E\_UNEXPECTED\_TOKEN`, `E\_DECLARATION\_NOT\_ALLOWED`, `E\_UNCLOSED\_BLOCK`, `E\_NESTING\_TOO\_DEEP`.

**Semantic:** see §10.7.

**IR generation:** `E\_IR\_TOO\_LARGE`, `E\_CFG\_TOO\_LARGE`, `E\_IR\_INVALID`, `E\_INTERNAL`.

**Optimization:** `E\_PASS\_EXCEPTION`, `E\_PASS\_PRODUCED\_INVALID\_IR`, `E\_ANALYSIS\_DID\_NOT\_CONVERGE`, `E\_INTERNAL`.

**Warnings:** `W\_UNREACHABLE\_CODE`, `W\_UNUSED\_EXPRESSION\_RESULT` (semantic); `W\_DIVISION\_BY\_ZERO\_NOT\_FOLDED`, `W\_NONFINITE\_NOT\_FOLDED`, `W\_INT\_OVERFLOW\_WRAPPED`, `W\_OPTIMIZATION\_ITERATION\_LIMIT`, `W\_PASS\_CHANGE\_FLAG\_MISMATCH` (optimization; the last only in development builds); `W\_TOO\_MANY\_DIAGNOSTICS` (any stage, once, when `MAX\_DIAGNOSTICS` is hit).

### 20.4 Ordering

Diagnostics are sorted by `(line, column, stage order, code)` for display; the stored array preserves emission order.

\---

## 21\. Data Models (TypeScript)

All types live in `compiler/src/\*\*/types.ts` files and are re-exported from `compiler/src/index.ts`. Everything in `CompilationResult` is JSON-serializable (no `Map`/`Set`/class instances — `Map`s used internally are converted to arrays or records at the boundary).

### 21.1 Common

```ts
export type ScalarType = 'int' | 'float';

export interface SourcePosition { offset: number; line: number; column: number }
export interface SourceSpan { start: SourcePosition; end: SourcePosition }   // end exclusive
export type SourceLocation = SourceSpan;

export type Stage =
  | 'lexer' | 'parser' | 'semantic' | 'ir' | 'cfg' | 'analysis' | 'optimizer' | 'backend';

export type ErrorType =
  | 'LexicalError' | 'SyntaxError' | 'SemanticError' | 'IRGenerationError' | 'OptimizationError';

export interface CompilerError {
  type: ErrorType;
  severity: 'error' | 'warning';
  code: string;               // e.g. 'E\_UNINITIALIZED\_VARIABLE'
  message: string;
  line: number;
  column: number;
  span: SourceSpan;
  sourceSnippet: string;
  hint?: string;
  stage: Stage;
  instructionId?: number;     // optimizer warnings
  resolved?: boolean;         // optimizer warnings whose instruction was later removed (§16.2)
}
```

### 21.2 Tokens

```ts
export type TokenType =
  | 'KW\_INT' | 'KW\_FLOAT' | 'KW\_IF' | 'KW\_ELSE' | 'KW\_WHILE' | 'KW\_RETURN' | 'KW\_INPUT'
  | 'IDENT' | 'INT\_LITERAL' | 'FLOAT\_LITERAL'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT' | 'ASSIGN'
  | 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE' | 'AND\_AND' | 'OR\_OR'
  | 'LPAREN' | 'RPAREN' | 'LBRACE' | 'RBRACE' | 'SEMICOLON' | 'EOF';

export interface Token {
  type: TokenType;
  lexeme: string;
  value?: number;             // numeric literals only
  line: number;
  column: number;
  span: SourceSpan;
}

export interface LexerResult { tokens: Token\[]; errors: CompilerError\[] }
```

### 21.3 AST

```ts
interface NodeBase { id: number; span: SourceSpan }
interface ExprBase extends NodeBase { resolvedType: ScalarType | null }

export type BinaryOperator =
  | '+' | '-' | '\*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '\&\&' | '||';

export interface Program extends NodeBase { kind: 'Program'; body: BlockItem\[]; scopeId?: number }
export interface Block extends NodeBase { kind: 'Block'; body: BlockItem\[]; scopeId?: number }
export interface VariableDeclaration extends NodeBase {
  kind: 'VariableDeclaration'; varType: ScalarType; name: string; nameSpan: SourceSpan;
  storage: 'local' | 'input'; initializer: Expression | null; symbolId?: number;
}
export interface Assignment extends NodeBase { kind: 'Assignment'; target: Identifier; value: Expression }
export interface ExpressionStatement extends NodeBase { kind: 'ExpressionStatement'; expression: Expression }
export interface IfStatement extends NodeBase {
  kind: 'IfStatement'; condition: Expression; thenBranch: Statement; elseBranch: Statement | null;
}
export interface WhileStatement extends NodeBase { kind: 'WhileStatement'; condition: Expression; body: Statement }
export interface ReturnStatement extends NodeBase { kind: 'ReturnStatement'; value: Expression | null }

export interface BinaryExpression extends ExprBase {
  kind: 'BinaryExpression'; operator: BinaryOperator; left: Expression; right: Expression;
  operandType: ScalarType | null;
}
export interface UnaryExpression extends ExprBase { kind: 'UnaryExpression'; operator: '-'; operand: Expression }
export interface Literal extends ExprBase { kind: 'Literal'; literalType: ScalarType; value: number; raw: string }
export interface Identifier extends ExprBase { kind: 'Identifier'; name: string; symbolId?: number }
export interface CastNode extends ExprBase {
  kind: 'CastNode'; targetType: 'float'; operand: Expression; implicit: true;
}

export type Expression = BinaryExpression | UnaryExpression | Literal | Identifier | CastNode;
export type Statement =
  | Block | Assignment | ExpressionStatement | IfStatement | WhileStatement | ReturnStatement;
export type BlockItem = Statement | VariableDeclaration;
export type ASTNode = Program | BlockItem | Expression;

export interface ParserResult { ok: boolean; ast: Program; errors: CompilerError\[] }
```

### 21.4 Symbols and Scopes

```ts
export interface SymbolInfo {
  id: number; name: string; irName: string; type: ScalarType; storage: 'local' | 'input';
  declarationSpan: SourceSpan; scopeId: number; initializedAtDeclaration: boolean;
}
export interface ScopeSnapshot {          // serializable form of Scope (§9.1)
  id: number; parentId: number | null; depth: number; span: SourceSpan; symbolIds: number\[];
}
export interface SemanticAnalysisResult {
  ok: boolean; typedAst: Program; symbols: SymbolInfo\[]; scopes: ScopeSnapshot\[];
  diagnostics: CompilerError\[];
}
```

### 21.5 IR

```ts
export type Operand =
  | { kind: 'temp'; id: number; type: ScalarType }
  | { kind: 'var'; symbolId: number; name: string; type: ScalarType }
  | { kind: 'int'; value: number }
  | { kind: 'float'; value: number }
  | { kind: 'label'; name: string };

export type ValueOperand = Exclude<Operand, { kind: 'label' }>;
export type NameOperand = Extract<Operand, { kind: 'temp' | 'var' }>;
export type LabelOperand = Extract<Operand, { kind: 'label' }>;

export type BinaryOpcode = 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'MOD';
export type CompareOpcode = 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE';

interface InstrBase {
  readonly id: number;
  readonly span: SourceSpan | null;
  readonly meta?: { readonly implicit?: boolean };
}

export type IRInstruction =
  | (InstrBase \& { opcode: BinaryOpcode; type: ScalarType; dest: NameOperand; args: \[ValueOperand, ValueOperand] })
  | (InstrBase \& { opcode: CompareOpcode; type: ScalarType; dest: NameOperand; args: \[ValueOperand, ValueOperand] })
  | (InstrBase \& { opcode: 'NEG'; type: ScalarType; dest: NameOperand; args: \[ValueOperand] })
  | (InstrBase \& { opcode: 'COPY'; type: ScalarType; dest: NameOperand; args: \[ValueOperand] })
  | (InstrBase \& { opcode: 'INT\_TO\_FLOAT'; dest: NameOperand; args: \[ValueOperand] })
  | (InstrBase \& { opcode: 'INPUT'; type: ScalarType; dest: NameOperand; args: \[] })
  | (InstrBase \& { opcode: 'LABEL'; label: LabelOperand })
  | (InstrBase \& { opcode: 'GOTO'; target: LabelOperand })
  | (InstrBase \& { opcode: 'IF\_TRUE' | 'IF\_FALSE'; cond: ValueOperand; target: LabelOperand })
  | (InstrBase \& { opcode: 'RETURN'; value: ValueOperand });

export interface IRProgram {
  instructions: readonly IRInstruction\[];
  temps: readonly { id: number; type: ScalarType }\[];
  variables: readonly { symbolId: number; name: string; type: ScalarType; storage: 'local' | 'input' }\[];
  labelCount: number;
}
```

### 21.6 CFG

```ts
export type EdgeKind =
  | 'fallthrough' | 'jump' | 'branch-true' | 'branch-false'
  | 'fallthrough-true' | 'fallthrough-false' | 'return';

export interface CFGEdge { from: number; to: number; kind: EdgeKind; isBackEdge: boolean }

export interface BasicBlock {
  id: number;
  label: string | null;                     // label of the first instruction, if any
  instructions: readonly IRInstruction\[];   // may be empty (EXIT, defensive cases)
  startIndex: number;                       // index into IRProgram.instructions (-1 for EXIT)
  endIndex: number;                         // exclusive
  successors: number\[];
  predecessors: number\[];
  reachable: boolean;
  isEntry: boolean;
  isExit: boolean;
}

export interface CFG {
  blocks: BasicBlock\[];                     // real blocks in layout order, EXIT last
  edges: CFGEdge\[];
  entryId: number;                          // always 0
  exitId: number;                           // blocks.length - 1
  labelToBlock: Record<string, number>;
}
```

### 21.7 Analysis

```ts
export interface UseDefResult {
  blocks: { blockId: number; use: string\[]; def: string\[] }\[];
  instructions: { instructionId: number; use: string\[]; def: string\[] }\[];
}
export interface LivenessResult {
  blocks: { blockId: number; liveIn: string\[]; liveOut: string\[] }\[];
  instructions: { instructionId: number; liveAfter: string\[] }\[];
  iterations: number;           // worklist visits
  converged: boolean;
}
export interface AnalysisResult {
  useDef: UseDefResult;
  liveness: LivenessResult;
  reachingDefinitions?: unknown; // Optional O1; shape defined when implemented
}
```

### 21.8 Optimization

```ts
export type PassName =
  | 'constant-folding' | 'constant-propagation' | 'algebraic-simplification'
  | 'copy-propagation' | 'common-subexpression-elimination'
  | 'dead-code-elimination' | 'cfg-simplification';

export interface OptimizationPass {
  readonly name: PassName;
  readonly displayName: string;
  readonly scope: 'mandatory' | 'recommended';
  run(program: IRProgram, ctx: PassContext): PassResult;
}
export type NewTransformationRecord = Omit<TransformationRecord, 'id' | 'passName' | 'iteration'>;
export interface PassContext {
  readonly iteration: number;
  record(r: NewTransformationRecord): void;
  warn(d: CompilerError): void;
}
export interface PassResult { program: IRProgram; changed: boolean }

export interface TransformationRecord { /\* exactly as §18.1 \*/
  id: number; passName: PassName; iteration: number; blockId: number; instructionId: number;
  rule: string; ruleText: string; reason: string; before: string; after: string | null;
  sourceLocation: SourceSpan | null;
}
export interface OptimizationStatistics { /\* exactly as §18.2 \*/
  instructionsBefore: number; instructionsAfter: number;
  rawInstructionsBefore: number; rawInstructionsAfter: number;
  removedInstructions: number; reductionPercent: number;
  blocksBefore: number; blocksAfter: number;
  iterations: number; converged: boolean;
  transformationsByPass: Record<PassName, number>;
  transformationsByCategory: { folding: number; propagation: number; simplification: number;
                               elimination: number; controlFlow: number };
}
export interface PassSnapshot { iteration: number; passName: PassName; changed: boolean; irText: string }
export interface OptimizationResult {
  initial: IRProgram;
  final: IRProgram;
  records: TransformationRecord\[];
  snapshots: PassSnapshot\[];
  statistics: OptimizationStatistics;
  diagnostics: CompilerError\[];   // optimizer warnings and errors
  converged: boolean;
  aborted: boolean;               // true if an OptimizationError stopped the run
}
```

### 21.9 Compilation

```ts
export interface CompileOptions {
  enabledPasses?: PassName\[];   // default: all implemented passes
  maxIterations?: number;       // clamped to 1..10; default 10
}

export interface CompilationResult {
  source: string;
  success: boolean;             // true iff no diagnostic with severity 'error'
  stoppedAt: Stage | null;
  diagnostics: CompilerError\[]; // all stages, emission order
  lexer?: LexerResult;
  parser?: ParserResult;
  semantic?: SemanticAnalysisResult;
  ir?: IRProgram;
  cfg?: CFG;
  analysis?: AnalysisResult;
  optimization?: OptimizationResult;
  optimizedCfg?: CFG;
  optimizedAnalysis?: AnalysisResult;
  assembly?: PseudoAssemblyProgram;
  unoptimizedAssembly?: PseudoAssemblyProgram;
}
```

\---

## 22\. Module Contracts

|Module|Function|Contract|
|-|-|-|
|`lexer`|`tokenize(source: string): LexerResult`|Never throws. Tokens end with `EOF`.|
|`parser`|`parse(tokens: Token\[], source: string): ParserResult`|Requires `EOF`-terminated tokens. `ast` always present (possibly partial).|
|`semantic`|`analyze(ast: Program, source: string): SemanticAnalysisResult`|Input AST not mutated. `ok` ⇒ every expression has non-null `resolvedType`, every identifier/declaration has `symbolId`, all promotions are `CastNode`s.|
|`ir`|`generateIR(typed: Program, symbols: SymbolInfo\[]): { program?: IRProgram; errors: CompilerError\[] }`|Requires `semantic.ok`. Output satisfies V1–V6.|
|`ir`|`printIR(program): string`, `printInstruction(i): string`, `validateIR(program, opts?): string\[]`|Pure.|
|`cfg`|`buildCFG(program: IRProgram): CFG`|Never throws for valid IR; handles empty blocks.|
|`cfg`|`printCFG(cfg): string`|Format §13.5.|
|`analysis`|`computeUseDef(cfg)`, `computeLiveness(cfg, useDef)`, `computeConstants(cfg)`, `computeAvailableCopies(cfg)`|Pure; deterministic; bounded.|
|`analysis`|`analyzeProgram(cfg): AnalysisResult`|Use/def + liveness.|
|`optimizer`|`optimize(program: IRProgram, options): OptimizationResult`|Never throws; result `final` satisfies V1–V6 and OPT-ID.|
|`optimizer/passes/\*`|each exports one `OptimizationPass`|§15.2.|
|`backend`|`generatePseudoAssembly(program: IRProgram, source): PseudoAssemblyProgram`|Pure.|
|root|`compile(source, options?): CompilationResult`|Pure, deterministic, never throws; enforces stage gating (§3.3).|

Data flow:

```text
string ──tokenize──▶ LexerResult ──parse──▶ ParserResult(AST) ──analyze──▶ SemanticAnalysisResult
   ──generateIR──▶ IRProgram ──buildCFG──▶ CFG ──analyzeProgram──▶ AnalysisResult
IRProgram ──optimize──▶ OptimizationResult(final IRProgram) ──buildCFG/analyze──▶ optimized CFG/Analysis
final IRProgram ──generatePseudoAssembly──▶ PseudoAssemblyProgram
```

\---

## 23\. Frontend / Web Application

### 23.1 Stack and Dependencies

React 18+, TypeScript (strict), Vite, Tailwind CSS, `@dagrejs/dagre` (layout computation only; rendering is hand-written SVG). No state-management library (React state + one custom hook suffices), no chart library (statistics bars are plain Tailwind `div`s), no router (single page with tabs). The compiler is imported as a workspace package `@optitac/compiler`.

### 23.2 Layout

```text
┌ Header: OptiTAC · Example ▼ · \[Compile] · Auto-compile ☑ · Pass toggles (R2) ───────────┐
├──────────── Source Editor (left, \~40%) ───────────┬──── Stage Tabs (right, \~60%) ───────────┤
│ line-numbered textarea; error lines highlighted   │ Tokens | AST | Semantic | TAC | Blocks |  │
│ status bar: ✔ compiled / ✖ 3 errors · 1 warning   │ CFG | Analysis | Optimization |          │
│                                                   │ Before/After | Assembly | Errors         │
└───────────────────────────────────────────────────┴──────────────────────────────────────────┘
```

Below 1024 px width, the editor becomes the first tab ("Source") — this is the 12th view. Tabs for stages that did not run are disabled with a tooltip ("Not available: compilation stopped at Semantic Analysis").

### 23.3 State Flow

`useCompiler(source, options)`:

* MVP: debounced (400 ms) synchronous call to `compile` on source change when auto-compile is on; explicit Compile button always available.
* R3: the same hook posts to a Web Worker; if no response within 3 s, the worker is terminated and an error banner is shown.
* Holds `result: CompilationResult | null`, `selectedInstructionId`, `selectedSpan`, `selectedBlockId` for cross-view highlighting.

### 23.4 Views

|#|View|Content|Interactions|
|-|-|-|-|
|1|Source Editor|Textarea + line gutter; erroneous lines tinted; example picker|Selecting an error/record/node highlights its span|
|2|Tokens|Table: #, type, lexeme, value, line:col|Click row ⇒ highlight in editor|
|3|AST|Collapsible tree: kind, operator/name/value, type badge, `span`; toggle untyped/typed AST; `CastNode`s shown in a distinct colour|Click node ⇒ highlight span|
|4|Semantic Analysis|Scope tree (scope ID, depth, symbols: name, IR name, type, storage, declared at, initialized at declaration); semantic diagnostics|Click symbol ⇒ highlight declaration|
|5|TAC|Canonical TAC with instruction IDs, type column, implicit-return marker|Click instruction ⇒ highlight source span|
|6|Basic Blocks|Cards per block: ID, label, index range, instructions, preds, succs, reachable flag|Click ⇒ select block|
|7|CFG|SVG graph (dagre layout): nodes show block ID + instructions; edge styles by kind; back-edges dashed; unreachable blocks greyed; EXIT node; toggle unoptimized/optimized; side panel with preds/succs/USE/DEF/IN/OUT of selected block. Fallback adjacency list if > 150 blocks.|Click node, zoom/pan buttons|
|8|Program Analysis|Tables: per-block USE/DEF/IN/OUT; per-instruction live-after; worklist visit count; unoptimized vs optimized toggle|Click row ⇒ select block|
|9|Optimization|Statistics dashboard (§18.2, "Static IR reduction" note); records timeline grouped Iteration → Pass → Record cards (pass, rule, ruleText, reason, before → after, location); filter by pass; optimizer warnings; (R2) iteration stepper showing `snapshots`|Click record ⇒ select instruction and source line|
|10|Before/After|Two TAC columns aligned by instruction ID: unchanged (plain), rewritten (amber, shows record count), removed (red, struck through, placeholder row on the right)|Hover ⇒ list of records for that instruction|
|11|Pseudo Assembly|Assembly grouped by source TAC instruction; toggle optimized/unoptimized; line counts|Hover group ⇒ highlight TAC instruction|
|12|Compilation Errors|All diagnostics, rendered per §20.2, filter by severity/stage|Click ⇒ jump to location|

### 23.5 Built-in Examples

The example picker loads every file in `examples/` (imported with Vite `?raw`). It must include all demo programs of §28 and all Critical Edge Case programs of §26.

### 23.6 Before/After Diff Algorithm

Because of OPT-ID: iterate the initial instruction list; for each ID, if absent from `final` ⇒ *removed*; if present with different canonical text ⇒ *rewritten*; else *unchanged*. No text-diff library is needed.

### 23.7 Accessibility and Usability

Keyboard-navigable tabs, colour plus icon/text for every status (never colour alone), monospace font for code, light theme required, dark theme Optional (O6).

\---

## 24\. Repository Structure

```text
optitac/
├── package.json                  # npm workspaces: compiler, frontend; root scripts
├── tsconfig.base.json            # strict settings shared by both packages
├── eslint.config.js
├── .prettierrc
├── vitest.workspace.ts           # runs compiler + frontend test projects
├── .github/workflows/ci.yml      # install → typecheck → lint → test → build
├── README.md
├── docs/
│   ├── architecture.md
│   ├── grammar.md
│   ├── optimizations.md
│   └── testing.md
├── examples/                     # \*.minic programs used by UI and tests
│   ├── demo-01-constant-optimization.minic
│   ├── …                         # every §26 and §28 program
├── compiler/                     # @optitac/compiler — pure TS, no DOM/React
│   ├── package.json
│   ├── tsconfig.json             # lib: ES2022 only (no DOM)
│   ├── src/
│   │   ├── index.ts              # public API: compile + all types + stage functions
│   │   ├── pipeline.ts           # compile(), stage gating
│   │   ├── limits.ts             # all resource limits (§32)
│   │   ├── common/               # spans.ts, snippet.ts, sortNames.ts
│   │   ├── errors/               # types.ts, factories.ts, codes.ts, format.ts
│   │   ├── lexer/                # types.ts, lexer.ts, numeric.ts
│   │   ├── parser/               # parser.ts, recovery.ts
│   │   ├── ast/                  # types.ts, clone.ts, toDisplayTree.ts
│   │   ├── semantic/             # types.ts, symbolTable.ts, typeRules.ts, definiteAssignment.ts, analyzer.ts
│   │   ├── ir/                   # types.ts, generator.ts, printer.ts, validator.ts, classify.ts
│   │   ├── cfg/                  # types.ts, builder.ts, printer.ts
│   │   ├── analysis/             # dataflow.ts (worklist), useDef.ts, liveness.ts, constants.ts, copies.ts
│   │   ├── optimizer/
│   │   │   ├── types.ts, passManager.ts, records.ts, statistics.ts, evaluator.ts
│   │   │   └── passes/           # constantFolding.ts, constantPropagation.ts, algebraicSimplification.ts,
│   │   │                         # copyPropagation.ts, deadCodeElimination.ts, cfgSimplification.ts,
│   │   │                         # commonSubexpressionElimination.ts (R1)
│   │   └── backend/              # pseudoAssembly.ts
│   └── tests/
│       ├── helpers/              # compileTo(), tac() builder, golden loader, (R5) interpreter.ts
│       ├── unit/                 # lexer/, parser/, semantic/, ir/, cfg/, analysis/, optimizer/, backend/
│       ├── critical/             # one file per §26 test: critical-01-empty-loop.test.ts …
│       ├── integration/          # end-to-end programs (§27)
│       └── golden/               # expected .tac / .cfg / .opt.tac / .asm text files
└── frontend/
    ├── package.json
    ├── vite.config.ts, tailwind config, index.html
    └── src/
        ├── main.tsx, App.tsx
        ├── components/           # CodeBlock, DiagnosticCard, TabBar, CfgSvg, TreeNode, StatBar, …
        ├── views/                # one file per §23.4 view
        ├── hooks/                # useCompiler.ts, useSelection.ts
        ├── workers/              # compiler.worker.ts (R3)
        ├── types/                # UI-only types (selection, view ids)
        └── \_\_tests\_\_/            # smoke tests (render App, compile an example)
```

**Rationale for deviations from the suggested layout:** tests live inside `compiler/` because they test only the compiler and must run without the frontend; `examples/` stays at the root because both packages consume it; npm workspaces give two independent packages with a hard boundary (the ESLint rule `no-restricted-imports` forbids `react`, `react-dom` and any `frontend/\*` import inside `compiler/`, and the compiler tsconfig has no DOM lib).

\---

## 25\. Testing Strategy

### 25.1 Tooling and Conventions

Vitest for all tests. Golden files store canonical text (TAC, CFG dump, optimized TAC, assembly); a test fails on any byte difference. Golden files are updated only via `npm run test:update-golden` and reviewed in PRs. Each test name begins with its stage (`lexer:`, `parser:` …). Critical tests are tagged `critical` and run in CI as a separate step so failures are visible.

**Test helper `tac()`** (enables the optimizer team to work before the generator exists): parses canonical TAC text into an `IRProgram` given variable types, e.g.

```ts
const p = tac({ vars: { x: 'int', y: 'int' } }, `
y = input int
x = y
y = 5
return x
`);
```

Temps get their type from first definition. This helper is test-only.

### 25.2 Lexer Unit Tests

Identifiers (incl. `\_a1`, 64-char limit), each keyword, case sensitivity (`Int` is IDENT), integers (`0`, `2147483647`), floats (`0.5`, `1.0e10`, `2E-3`, `5e-324`), every operator incl. maximal munch (`<=`, `==` vs `=`, `\&\&`), comments (line, block, multi-line positions, unterminated), invalid characters (`@`, `\&`, `|`, `!`, `.5`, non-ASCII), `007`, `1.2.3`, `1.`, `1e`, `10f`, `1.5f`, `2147483648`, `999999999999999999999999`, `1e400`, `1e-400`, line/column after `\\r\\n` and tabs, error recovery continues after a bad character.

### 25.3 Parser Unit Tests

Precedence (`a + b \* c`, `a || b \&\& c`, `a < b == c`), left associativity (`a - b - c`, `a / b / c`), unary (`- - x`, `-a \* b`), nested parentheses, blocks and empty blocks, if, if/else, **dangling else**, while, return with and without value, assignment vs expression statement (`x = 1;` vs `x == 1;`), declaration not allowed as if-body, invalid syntax messages (missing `;`, missing `)`, unexpected `else`, unclosed `{`), recovery produces multiple errors for multiple bad statements, nesting limit at 128.

### 25.4 Semantic Unit Tests

Every code in §10.7 (positive and negative case), valid shadowing incl. outer visibility after inner scope, self-reference initializer resolves to outer symbol, use after scope exit, definite assignment through if/else (both branches ⇒ assigned; one branch ⇒ error), through while (body assignment does not count after loop), after return (no errors in unreachable code, warning emitted), promotion inserts `CastNode` in init/assign/binary/comparison, reserved identifiers, IR names (`x`, `x$1`, `x$2`).

### 25.5 IR Unit Tests (golden TAC)

Arithmetic, nested arithmetic, destination passing, temp numbering order, declarations without init, input, casts (incl. literal cast), unary minus, comparisons in value and condition context, if, if/else (incl. omitted `goto` after returning then-branch), while, nested control flow, return, implicit return (present when needed, absent when last is `return`/`goto`), short-circuit `\&\&`/`||`/nested in condition context, logical in value context, label numbering order, `validateIR` rejects each invariant violation.

### 25.6 CFG Unit Tests

Sequential code (1 block + EXIT), if, if/else, while (back-edge flagged), empty loop, empty if/else, early return (no back-edge from return block), return before loop (loop blocks unreachable), unreachable code after return, conditional branch whose target is the fall-through (deduplicated edge), untargeted label stays mid-block, `buildCFG` on a synthetic empty-instruction block (defensive).

### 25.7 Analysis Unit Tests

USE/DEF per block incl. `x = x - 1`; liveness on straight-line, if/else, loop (values live around back-edge), early return; worklist converges and is deterministic (visit count golden); constant lattice meet rules incl. `0.0` vs `-0.0`; available copies intersection at joins and kill on redefinition of either side.

### 25.8 Optimizer Unit Tests

For **each** pass in isolation (using `tac()`): positive transformations, record contents (rule, before, after, instructionId preserved), negative cases (must not fire), and these safety cases:

* CF: `10 / 0`, `10 % 0` not folded + warning; `2147483647 + 1` folds to `-2147483648` + `W\_INT\_OVERFLOW\_WRAPPED`; `-2147483647 - 1` then `/ -1` folds to `-2147483648`; `0.0 / 0.0`, `1.0 / 0.0` not folded; `0.0 \* -1.0` folds to `-0.0`.
* CP: loop-carried variable becomes NAC; join of equal constants stays constant; join of different constants is NAC.
* AS: every int rule; `0 / x` not simplified; every float rule fires only on exact constant (`x - 0.0` yes, `x - -0.0` no; `x + -0.0` yes, `x + 0.0` no); every rejected float rule (§16.4) does not fire.
* CopyP: Critical Test 12; copy on one branch not used after join; self-copy removed.
* DCE: dead chain removed in one pass; `INPUT` kept; trapping division kept; `x = 10 / 2` dead ⇒ removed; return/branches kept.
* CFGS: each rule; jump threading cycle (`L1: goto L2; L2: goto L1`) does not loop; last `goto` never removed.
* CSE (R1): reuse; invalidation on operand redefinition; commutative key; no reuse across blocks.
* PassManager: convergence; iteration cap respected with a synthetic always-changing pass (test-only) ⇒ `W\_OPTIMIZATION\_ITERATION\_LIMIT`; throwing pass ⇒ `E\_PASS\_EXCEPTION` and last valid IR kept; invalid-IR pass ⇒ `E\_PASS\_PRODUCED\_INVALID\_IR`; OPT-ID holds.

### 25.9 Differential Testing (Recommended R5)

A test-only TAC interpreter executes `initial` and `final` IR for every valid example with a fixed set of input vectors (including 0, 1, −1, 5, `INT\_MAX`, `INT\_MIN` for ints and `0.0`, `-0.0`, `NaN`, `Infinity`, `2.5` for floats) and asserts identical outcome (return value compared with `Object.is` semantics, or both trap, or both exceed the 100,000-step limit). This is the strongest evidence that optimizations preserve semantics. It never runs in the UI.

### 25.10 Determinism Test

Compile every example twice and assert deep equality of the two `CompilationResult`s.

\---

## 26\. Critical Edge Cases to Test

Each test lives in `compiler/tests/critical/critical-NN-<name>.test.ts`, has its program in `examples/critical-NN-<name>.minic`, and asserts the expected TAC/CFG/optimized TAC against golden files. Snippets from the original requirement that reference undeclared variables are wrapped with the `input` declarations shown, so every program is semantically valid unless rejection is the point of the test.

### Test 1 — Empty Loop

**Stages:** parser, IR, CFG, CFGS. **Input:**

```c
while (1) {
}
```

**Expected TAC:**

```text
L1:
ifFalse 1 goto L2
goto L1
L2:
return 0
```

**Expected CFG:** B0 `\[entry] \[L1]` {`L1:`, `ifFalse 1 goto L2`} succs B1, B2 · B1 {`goto L1`} succs B0 (**back-edge**) · B2 `\[L2]` {`L2:`, `return 0`} succs B3 · B3 `\[exit]`.
**Verify:** no crash on the empty body; parser yields `WhileStatement(body: Block(body: \[]))`; V1–V6 hold; back-edge B1→B0 flagged.
**Expected optimized TAC** (CFG.CONST\_BRANCH deletes the never-taken branch, CFG.UNREACHABLE\_BLOCK deletes `L2: return 0`):

```text
L1:
goto L1
```

Optimized CFG: B0 self-loop; EXIT has no predecessors (non-terminating program — legal). Liveness converges with all sets empty.

### Test 2 — Empty If/Else Blocks

**Stages:** IR, CFG, CFGS. **Input:**

```c
input int x;
if (x) {
} else {
}
```

**Expected TAC:**

```text
x = input int
ifFalse x goto L1
goto L2
L1:
L2:
return 0
```

**Expected CFG:** B0 {`x = input int`, `ifFalse x goto L1`} succs B1, B2 · B1 {`goto L2`} succs B3 · B2 `\[L1]` {`L1:`} succs B3 (fallthrough; a label-only block) · B3 `\[L2]` {`L2:`, `return 0`} succs B4 · B4 `\[exit]`.
**Expected optimized TAC** (two CFG.REDUNDANT\_JUMP + two CFG.UNUSED\_LABEL records; `INPUT` survives DCE):

```text
x = input int
return 0
```

### Test 3 — Dangling Else

**Stages:** parser, IR. **Input:**

```c
input int a;
input int b;
int x = 0;
if (a)
    if (b)
        x = 1;
    else
        x = 2;
return x;
```

**Expected AST:** outer `IfStatement(a, then: IfStatement(b, x=1, else x=2), else: null)`.
**Expected TAC:**

```text
a = input int
b = input int
x = 0
ifFalse a goto L1
ifFalse b goto L2
x = 1
goto L3
L2:
x = 2
L3:
L1:
return x
```

**Verify:** when `a == 0`, control goes straight to `L1` (x stays 0) — the `else` is not attached to `if (a)`. Also test the braced form `if (a) { if (b) x = 1; } else x = 2;` attaches the `else` to the outer `if`.

### Test 4 — Nested Scope Shadowing

**Stages:** symbol table, semantic, IR, optimizer. **Input:**

```c
int x = 10;
{
    float x = 2.5;
    x = x + 1.0;
}
return x;
```

**Verify:** symbols `{id 1, x, int, scope 0, irName x}` and `{id 2, x, float, scope 1, irName x$1}`; `x = x + 1.0` resolves to symbol 2 with type float (no `CastNode`); `return x` resolves to symbol 1 (int) — no `E\_RETURN\_TYPE\_MISMATCH`.
**Expected TAC:**

```text
x = 10
x$1 = 2.5
x$1 = x$1 + 1.0
return x
```

**Expected optimized TAC:** `return 10`.

### Test 5 — Uninitialized Variable

**Stage:** semantic. **Input:**

```c
int x;
int y = x + 1;
```

**Expected:** exactly one error `E\_UNINITIALIZED\_VARIABLE` at line 2, column 9: "Variable 'x' is used before initialization." Pipeline stops at `semantic`; no IR. Variants: `int x; if (c) x = 1; return x;` ⇒ error; `int x; if (c) x = 1; else x = 2; return x;` ⇒ valid; `int x; while (c) x = 1; return x;` ⇒ error.

### Test 6 — Implicit int-to-float Promotion

**Stages:** semantic, IR. **Input:**

```c
int x = 10;
float y = x + 2.5;
```

**Expected typed AST:** `BinaryExpression(+, CastNode(Identifier x), Literal 2.5)`, `resolvedType: float`.
**Expected TAC:**

```text
x = 10
t1 = int\_to\_float x
y = t1 + 2.5
return 0
```

**Expected optimized TAC:** `return 0` (all assignments dead). Variant `float f = 3; return 0;` ⇒ unoptimized `f = int\_to\_float 3`; CF record `CF.CAST (int\_to\_float 3 → 3.0)` before DCE removes it.

### Test 7 — Short-Circuit AND

**Stages:** IR, CFG. **Input:**

```c
input int a;
input int b;
int x = 0;
if (a != 0 \&\& b / a > 2) {
    x = 1;
}
return x;
```

**Expected TAC:**

```text
a = input int
b = input int
x = 0
t1 = a != 0
ifFalse t1 goto L1
t2 = b / a
t3 = t2 > 2
ifFalse t3 goto L1
x = 1
L1:
return x
```

**Expected CFG:** B0 (…, `ifFalse t1 goto L1`) succs B1, B3 · B1 {`t2 = b / a`, `t3 = t2 > 2`, `ifFalse t3 goto L1`} succs B2, B3 · B2 {`x = 1`} succs B3 · B3 `\[L1]` {`L1:`, `return x`}.
**Verify:** the block containing `b / a` has exactly one predecessor (B0) via the `fallthrough-true` edge of `ifFalse t1`, i.e. it executes only when `a != 0`. No instruction combines `t1` and `t3` arithmetically. The optimizer must not move or remove `t2 = b / a`. With R5, interpreting with `a = 0` returns 0 and does not trap.

### Test 8 — Short-Circuit OR

**Stages:** IR, CFG. **Input:**

```c
input int a;
input int b;
int x = 0;
if (a == 1 || b / a > 2) {
    x = 1;
}
return x;
```

**Expected TAC:**

```text
a = input int
b = input int
x = 0
t1 = a == 1
if t1 goto L2
t2 = b / a
t3 = t2 > 2
ifFalse t3 goto L1
L2:
x = 1
L1:
return x
```

**Verify:** when `t1` is true, `if t1 goto L2` jumps over the block containing `b / a`; that block's only predecessor is via the `fallthrough-false` edge.

### Test 9 — Early Return Inside Loop

**Stages:** IR, CFG, liveness. **Input:**

```c
input int x;
while (x > 0) {
    if (x == 5)
        return x;
    x = x - 1;
}
```

**Expected TAC and CFG:** exactly as §12.6 and §13.6.
**Verify:** B3 (`return x`) has successors `\[EXIT]` only; the only back-edge is B4→B1; EXIT predecessors are B3 and B5; `x ∈ IN\[B1]`.

### Test 10 — Division by Zero

**10a — literal divisor (semantic policy).** **Input:** `int x = 10 / 0;`
**Expected:** `E\_DIVISION\_BY\_CONSTANT\_ZERO` at line 1, column 14; pipeline stops at `semantic`. Same for `10 % 0` and `10 / (-0)`.

**10b — divisor discovered by propagation (optimizer policy).** **Input:**

```c
int z = 0;
int x = 10 / z;
return x;
```

**Expected trace:** iteration 1 CP rewrites `x = 10 / z` → `x = 10 / 0` and DCE removes `z = 0`; iteration 2 CF refuses to fold and emits `W\_DIVISION\_BY\_ZERO\_NOT\_FOLDED` (once). **Expected optimized TAC:**

```text
x = 10 / 0
return x
```

**Verify:** no crash, no folded value, instruction retained, `success = true` (warnings only). Variant (dead trapping division) `int z = 0; int x = 10 / z; return 1;` ⇒ optimized TAC `x = 10 / 0` / `return 1` — DCE must keep the trapping instruction even though `x` is dead.

### Test 11 — Floating-Point Algebraic Simplification Safety

**11a — NaN is not folded or simplified.** **Input:**

```c
float z = 0.0;
float n = z / z;
return n == n;
```

**Expected optimized TAC:**

```text
n = 0.0 / 0.0
t1 = n == n
return t1
```

`W\_NONFINITE\_NOT\_FOLDED` emitted; `n == n` is **not** replaced by `1` (it is 0 at runtime because `n` is NaN).

**11b — rule-by-rule (Algebraic Simplification run in isolation on the unoptimized IR).** **Input:**

```c
input float f;
float a = f \* 0.0;
float b = f + 0.0;
float c = f - 0.0;
float d = f \* 1.0;
float e = f / 1.0;
float g = f - f;
int same = f == f;
return same;
```

**Expected:** AS records exactly for `c` (`AS.FLOAT.SUB\_POS\_ZERO`), `d` (`AS.FLOAT.MUL\_ONE`), `e` (`AS.FLOAT.DIV\_ONE`). **No** record for `a`, `b`, `g`, `same`.

**11c — signed zero.** **Input:**

```c
input float f;
float m = 0.0 \* -1.0;
float r = f + m;
int s = r == f;
return s;
```

**Expected:** CF folds `neg 1.0` → `-1.0`, then `0.0 \* -1.0` → `-0.0`; CP produces `r = f + -0.0`; AS applies `AS.FLOAT.ADD\_NEG\_ZERO` → `r = f`; CopyP rewrites `s = r == f` → `s = f == f`; `f == f` is **not** simplified. **Expected optimized TAC:**

```text
f = input float
s = f == f
return s
```

Control: replacing `m` with `+0.0` (`float m = 0.0;`) must leave `r = f + 0.0` unsimplified.

### Test 12 — Copy Propagation Invalidation

**Stage:** CopyP (isolation and pipeline). **Input:**

```c
input int y;
int z;
int x = y;
y = 5;
z = x;
return z;
```

**Unoptimized TAC:**

```text
y = input int
x = y
y = 5
z = x
return z
```

**Verify (single CopyP run):** `z = x` is **not** rewritten to `z = y` (the fact `(x, y)` was killed by `y = 5`); `return z` becomes `return x`.
**Expected optimized TAC (full pipeline):**

```text
y = input int
return y
```

Explanation (documented in the test): iteration 1 CopyP gives `return x`; DCE removes `z = x` and the now-dead `y = 5`; iteration 2 CopyP may now legally rewrite `return x` → `return y` because no redefinition of `y` remains between `x = y` and the return; DCE removes `x = y`. The returned value is the original input in both programs.

### Test 13 — Integer Literal Overflow

**Stage:** lexer. **Input:** `int x = 999999999999999999999999;`
**Expected:** `E\_INT\_LITERAL\_OUT\_OF\_RANGE` at line 1, column 9, message "Integer literal exceeds the maximum int value 2147483647."; no token for the literal; pipeline stops at `lexer`. Also: `2147483647` accepted; `2147483648` rejected; `-2147483648` rejected (literal part out of range) with hint "write -2147483647 - 1".

### Test 14 — Unreachable Code After Return

**Stages:** semantic, IR, CFG, DCE, CFGS. **Input:**

```c
int x = 10;
return x;
x = 20;
```

**Expected:** `W\_UNREACHABLE\_CODE` at line 3. **TAC:**

```text
x = 10
return x
x = 20
return 0
```

**CFG:** B0 {`x = 10`, `return x`} succs EXIT · B1 `\[unreachable]` {`x = 20`, `return 0`} preds none · B2 `\[exit]` preds B0, B1.
**Expected optimized TAC:** `return 10`. Records include DCE removing `x = 20` and CFG.UNREACHABLE\_BLOCK removing `return 0`.

### Test 15 — Nested Control Flow

**Stages:** IR, CFG, liveness, optimizer. **Input:**

```c
input int x;
input int a;
input int b;
while (x > 0) {
    if (a \&\& b) {
        return x;
    } else {
        x = x - 1;
    }
}
```

**Expected TAC:**

```text
x = input int
a = input int
b = input int
L1:
t1 = x > 0
ifFalse t1 goto L2
ifFalse a goto L3
ifFalse b goto L3
return x
L3:
x = x - 1
L4:
goto L1
L2:
return 0
```

(`goto L4` after the then-branch is omitted because it ends in `return`; `L4:` is untargeted and therefore not a leader.)
**Expected CFG and liveness:** exactly §14.4. B4 (`return x`) → EXIT only; back-edge only B5→B1.
**Expected optimized TAC:** identical except `L4:` removed (`CFG.UNUSED\_LABEL`).

### Test 16 — Return Before Loop

```c
input int x;
return x;
while (x > 0) {
    x = x - 1;
}
```

**Expected:** `W\_UNREACHABLE\_CODE` (line 3). Unoptimized CFG: B0 {`x = input int`, `return x`} → EXIT; loop blocks B1–B3 all `\[unreachable]` (their mutual edges exist; back-edge flags are only computed for reachable edges). Optimized TAC: `x = input int` / `return x` with three CFG.UNREACHABLE\_BLOCK records.

### Test 17 — Return Inside Nested If Inside Loop

```c
input int x;
input int y;
while (x > 0) {
    if (y > 0) {
        if (x == y) {
            return 1;
        }
    }
    x = x - 1;
}
return 0;
```

**Expected TAC:**

```text
x = input int
y = input int
L1:
t1 = x > 0
ifFalse t1 goto L2
t2 = y > 0
ifFalse t2 goto L3
t3 = x == y
ifFalse t3 goto L4
return 1
L4:
L3:
x = x - 1
goto L1
L2:
return 0
```

**Expected CFG:** B0 → B1; B1 {L1 … ifFalse t1} → B2, B7; B2 → B3, B6; B3 → B4, B5; B4 {`return 1`} → EXIT only; B5 {`L4:`} → B6 (fallthrough); B6 {`L3:`, `x = x - 1`, `goto L1`} → B1 (back-edge); B7 {`L2:`, `return 0`} → EXIT. No implicit return is appended (last instruction is `return 0`).

### Test 18 — Logical Operator in Value Context

```c
input int a;
input int b;
int r = a != 0 \&\& b / a > 1;
return r;
```

**Expected TAC:**

```text
a = input int
b = input int
t1 = a != 0
ifFalse t1 goto L1
t2 = b / a
t3 = t2 > 1
ifFalse t3 goto L1
r = 1
goto L2
L1:
r = 0
L2:
return r
```

### Test 19 — Self-Referencing Initializer Under Shadowing

```c
int x = 1;
{
    int x = x + 1;
    return x;
}
```

**Expected:** valid; inner initializer's `x` is symbol 1. TAC `x = 1` / `x$1 = x + 1` / `return x$1`. Optimized: `return 2` (CP → `x$1 = 1 + 1`, CF → `x$1 = 2`, CP → `return 2`, DCE).

### Test 20 — Integer Overflow During Folding

```c
int x = 2147483647 + 1;
return x;
```

**Expected:** CF folds to `x = -2147483648` with `W\_INT\_OVERFLOW\_WRAPPED`; optimized TAC `return -2147483648`. Never a crash, never a non-int32 constant.

### Test 21 — Excessive Nesting

Source with 200 nested `(` … `)` around a literal. **Expected:** `E\_NESTING\_TOO\_DEEP`, no stack overflow, compile returns within 100 ms.

\---

## 27\. Integration Tests

Each integration test runs `compile()` on a full program and asserts: `success`, `stoppedAt`, diagnostics (codes + positions), golden TAC, golden CFG dump, golden optimized TAC, golden assembly, statistics (`instructionsBefore/After`, `iterations`, `converged`), and (R5) differential equivalence.

### 27.1 Valid Programs

|ID|File|Exercises|Key expectations|
|-|-|-|-|
|I1|`int-arith.minic`|arithmetic, precedence|`int r = 2 + 3 \* 4 - 6 / 2; return r;` ⇒ optimized `return 11`|
|I2|`nested-expr.minic`|nested expressions, temps|`input int a,b,c,d,e` (one per line); `int x = (a + b) \* (c - d) / e; return x;` ⇒ TAC as §12.2; unchanged by optimizer|
|I3|`promotion.minic`|int→float in init and comparison|`input int n; float f = n; int k = f < 2.5; return k;` ⇒ exactly one `INT\_TO\_FLOAT`|
|I4|`if-else.minic`|§12.6 if/else|optimized `return 11` (x = 10 propagates, `10 > 5` folds, branch folds, unreachable else removed)|
|I5|`while-sum.minic`|Demo 3 program|CFG golden with one back-edge; optimizer makes no change|
|I6|`scopes.minic`|3-level shadowing, outer visibility after exit|IR names `x`, `x$1`, `x$2`|
|I7|`short-circuit.minic`|`\&\&`, `\|\|`, nested, value context|TAC goldens as §12.4/§12.5|
|I8|`loop-early-return.minic`|Test 9 and Test 17 combined|CFG golden; no back-edge from return blocks|
|I9|`dead-code.minic`|Demo 2|optimized 6 → 3 instructions (50.0%)|
|I10|`opt-boundaries.minic`|division-by-variable-zero, float NaN, signed zero|warnings present; trapping instruction kept; float rules per §16.4|
|I11|`copy-chain.minic`|`input int a; int b = a; int c = b; int d = c; return d;`|optimized `a = input int` / `return a`|
|I12|`empty-everything.minic`|empty program, empty blocks, `{}{}`|empty program ⇒ TAC `return 0`; no crash|

(For I3 the expected unoptimized TAC is `n = input int` / `f = int\_to\_float n` / `k = f < 2.5` / `return k`.)

### 27.2 Invalid Programs

|ID|Source|Expected|
|-|-|-|
|X1|`int x = 3 @ 4;`|`E\_UNEXPECTED\_CHARACTER` 1:11, stop at lexer|
|X2|`int x = 1.5f;`|`E\_INVALID\_NUMERIC\_SUFFIX` 1:9|
|X3|`int x = 1` (no `;`)|`E\_EXPECTED\_TOKEN` "Expected ';' after declaration but found end of input"|
|X4|`if (x > ) { }`|`E\_EXPECTED\_EXPRESSION`|
|X5|`int a = 1; int b = ; int c = 2 return c;`|two syntax errors reported (recovery), stop at parser|
|X6|`y = 1;`|`E\_UNDECLARED\_IDENTIFIER`|
|X7|`int x; float x;`|`E\_DUPLICATE\_DECLARATION`|
|X8|`int x = 2.5;`|`E\_NARROWING\_CONVERSION`|
|X9|`float f = 1.0; int r = f % 2;`|`E\_INVALID\_MODULO\_OPERANDS`|
|X10|`float f = 1.0; if (f) {}`|`E\_CONDITION\_NOT\_INT`|
|X11|`float f = 1.0; int r = f \&\& 1;`|`E\_INVALID\_LOGICAL\_OPERAND`|
|X12|`return 2.5;`|`E\_RETURN\_TYPE\_MISMATCH`|
|X13|`return;`|`E\_RETURN\_MISSING\_VALUE`|
|X14|`{ input int n; }`|`E\_INPUT\_NOT\_TOP\_LEVEL`|
|X15|`int t1 = 0;`|`E\_RESERVED\_IDENTIFIER`|
|X16|`int x; int y = x + z;`|exactly two errors (`E\_UNINITIALIZED\_VARIABLE` for x, `E\_UNDECLARED\_IDENTIFIER` for z), no cascade|

\---

## 28\. Demonstration Scenarios

All demos ship in `examples/` and in the UI example picker. Suggested viva flow: Demo 1 → 4 → 3 → 6 → 5 → 2 (≈ 10 minutes).

### Demo 1 — Constant Optimization

```c
int a = 10;
int b = 20;
int x = (a + b) \* 1;
return x;
```

Show: TAC (5 instructions) → Optimization timeline (CP, AS, CopyP, DCE in iteration 1; CF, CP, DCE in iteration 2; converged in iteration 3, §17.6) → Before/After (`return 30`, 80.0% static reduction).

### Demo 2 — Dead Code

```c
input int n;
int unused = n \* 2;
int temp = 5;
int result = n + 1;
temp = temp + result;
return result;
```

Unoptimized:

```text
n = input int
unused = n \* 2
temp = 5
result = n + 1
temp = temp + result
return result
```

Optimized (CP rewrites `temp = 5 + result`; DCE removes it, then `temp = 5`, then `unused = n \* 2`):

```text
n = input int
result = n + 1
return result
```

Show: Program Analysis liveness explaining *why* each instruction is dead; `n = input int` survives (side effect).

### Demo 3 — CFG (if/else inside a loop)

```c
input int n;
int sum = 0;
int i = 0;
while (i < n) {
    if (i % 2 == 0) {
        sum = sum + i;
    } else {
        sum = sum - 1;
    }
    i = i + 1;
}
return sum;
```

Expected TAC:

```text
n = input int
sum = 0
i = 0
L1:
t1 = i < n
ifFalse t1 goto L2
t2 = i % 2
t3 = t2 == 0
ifFalse t3 goto L3
sum = sum + i
goto L4
L3:
sum = sum - 1
L4:
i = i + 1
goto L1
L2:
return sum
```

CFG: B0 {n, sum, i} → B1 · B1 `\[L1]` → B2, B6 · B2 → B3, B4 · B3 {`sum = sum + i`, `goto L4`} → B5 · B4 `\[L3]` {`sum = sum - 1`} → B5 · B5 `\[L4]` {`i = i + 1`, `goto L1`} → B1 (back-edge) · B6 `\[L2]` {`return sum`} → EXIT. Show: diamond inside loop, back-edge styling, liveness `IN\[B1] = {i, n, sum}`. The optimizer makes no change (loop-carried values are NAC) — a good talking point about what simple data-flow can and cannot prove.

### Demo 4 — Short-Circuit Logic

```c
int x = 0;
input int y;
int big = 0;
if (x != 0 \&\& y / x > 10) {
    big = 1;
}
return big;
```

Show: (1) unoptimized TAC/CFG — `y / x` sits in a block reachable only when `x != 0`. (2) Optimization trace: iteration 1 CP substitutes `x` → `t1 = 0 != 0` and `t2 = y / 0`, DCE removes `x = 0`; iteration 2 CF folds `t1 = 0` and **refuses** to fold `y / 0` (warning), CP makes the branch `ifFalse 0 goto L1`, DCE removes `t1 = 0`, CFGS turns it into `goto L1`, removes the two unreachable blocks (the guarded division is never executed, so removing it is safe), removes the redundant jump and the label; iteration 3 CP → `return 0`, DCE removes `big = 0`; iteration 4 confirms. (3) The division warning is shown greyed as "instruction later removed as unreachable". Final:

```text
y = input int
return 0
```

### Demo 5 — Shadowing

```c
int x = 1;
{
    float x = 2.5;
    {
        int x = 3;
        x = x + 1;
    }
    x = x \* 2.0;
}
return x;
```

Show: Semantic view scope tree (scopes 0, 1, 2), IR names `x`, `x$1`, `x$2`, typed AST without casts (each `x` has its own type), optimized TAC `return 1`.

### Demo 6 — Optimization Safety

```c
input float f;
int zero = 0;
int trap = 10 / zero;
float nan = 0.0 / 0.0;
float keep1 = f \* 0.0;
float keep2 = f + 0.0;
float gone = f \* 1.0;
int nanSelf = nan == nan;
return nanSelf + trap;
```

Show: `trap = 10 / 0` kept with `W\_DIVISION\_BY\_ZERO\_NOT\_FOLDED`; `0.0 / 0.0` kept with `W\_NONFINITE\_NOT\_FOLDED`; `keep1`, `keep2` never simplified (and later removed only because they are dead); `gone = f \* 1.0` simplified by `AS.FLOAT.MUL\_ONE` before DCE; `nan == nan` not folded to 1. Use the `optimizations.md` counterexample table during the viva.

\---

## 29\. Team Distribution (5 members)

### 29.1 Ownership

|Member|Owns|Primary files|Also responsible for|
|-|-|-|-|
|M1 — Front end|Language spec, lexer, grammar, parser|`lexer/`, `parser/`, `docs/grammar.md`|Lexer/parser unit tests, Critical 3, 13, 21|
|M2 — Semantics|AST types, AST clone/display tree, symbol table, type rules, definite assignment, semantic diagnostics|`ast/`, `semantic/`, `errors/` (shared, owner)|Semantic tests, Critical 4, 5, 6 (semantic part), 10a, 19|
|M3 — IR \& CFG|IR types, generator, printer, validator, CFG builder/printer, pseudo-assembly backend|`ir/`, `cfg/`, `backend/`|IR/CFG goldens, Critical 1, 2, 7, 8, 9, 14–18 (IR/CFG parts)|
|M4 — Optimizer|Data-flow framework, use/def, liveness, constants, copies, PassManager, all passes, statistics|`analysis/`, `optimizer/`|Optimizer tests, Critical 10b, 11, 12, 20, `tac()` helper, (R5) interpreter, `docs/optimizations.md`|
|M5 — UI \& integration|React app, all views, `useCompiler`, examples, `pipeline.ts`, CI|`frontend/`, `compiler/src/pipeline.ts`, `examples/`, `.github/`|Integration tests, determinism test, `README.md`, `docs/testing.md`, demo script|

`docs/architecture.md` is co-owned by M3 (pipeline/IR) and M5 (UI).

### 29.2 Interfaces Between Members (frozen at end of Phase 1)

|Producer → Consumer|Contract|Unblocking artifact|
|-|-|-|
|M1 → M2|`Token`, AST node types (§21.2–21.3), `ParserResult`|M2 writes AST JSON fixtures by hand until the parser lands|
|M2 → M3|Typed AST guarantees (§22), `SymbolInfo`|M3 writes typed-AST fixtures by hand|
|M3 → M4|`IRProgram`, `IRInstruction`, `CFG` types, `printIR`, `buildCFG`|M4 uses `tac()` helper; M3 delivers `buildCFG` early (Phase 6)|
|M3/M4 → M5|`CompilationResult` (§21.9)|M5 builds views against a hand-written JSON `CompilationResult` fixture checked into `frontend/src/fixtures/`|
|All → M5|public functions in §22|`pipeline.ts` stubs return `undefined` stage results until implemented|

### 29.3 Integration Order

1. Phase 0–1: everyone, types and grammar frozen.
2. Lexer → Parser (M1) and AST/symbol table (M2) in parallel.
3. Semantic analyzer (M2) once the parser exists; IR generator (M3) developed against typed-AST fixtures.
4. CFG builder (M3) and analyses/passes (M4) in parallel using `tac()`.
5. Wire `compile()` (M5) stage by stage as each lands; UI views go live one by one.
6. Edge-case suite and polish together.

### 29.4 Shared Coding Standards

TypeScript strict, ESLint + Prettier enforced in CI; no `any` (use `unknown` + narrowing); exhaustive `switch` on discriminated unions with a `never` check; pure functions, no module-level mutable state (counters live in per-call context objects); every public function has a TSDoc comment; one PR per feature, reviewed by one other member; commit messages `area: summary` (e.g. `optimizer: add copy propagation`); goldens updated only with explicit reviewer approval.

\---

## 30\. Development Phases

Assumed calendar: 12 weeks. A phase can start when its dependencies' acceptance criteria are met.

### Phase 0 — Foundation (Week 1)

* **Objective:** working monorepo with CI.
* **Tasks:** npm workspaces; `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); ESLint (typescript-eslint, `no-restricted-imports` boundary rule); Prettier; Vitest workspace; Vite + React + Tailwind skeleton; CI workflow; `limits.ts`; `errors/` factory skeleton.
* **Files:** root config, `compiler/package.json`, `frontend/\*`, `.github/workflows/ci.yml`.
* **Dependencies:** none.
* **Acceptance:** `npm ci \&\& npm run typecheck \&\& npm run lint \&\& npm test \&\& npm run build` passes locally and in CI; importing `react` in `compiler/` fails lint.
* **Tests:** one placeholder test per package.
* **Expected output:** blank OptiTAC page with header and editor.
* **Pitfalls:** forgetting `lib: \["ES2022"]` (no DOM) for the compiler; Tailwind content globs missing `frontend/src/\*\*/\*.tsx`.

### Phase 1 — Language Definition (Week 1)

* **Objective:** freeze language, grammar, token set, all shared types.
* **Tasks:** write `docs/grammar.md` from §4–§6; commit all type files from §21 (bodies may be empty functions); define error code constants; write the 30 example programs (§26–§28) as files.
* **Files:** `docs/grammar.md`, `compiler/src/\*\*/types.ts`, `errors/codes.ts`, `examples/`.
* **Dependencies:** Phase 0.
* **Acceptance:** team review sign-off; types compile.
* **Tests:** none (types only).
* **Expected output:** typed contracts everyone codes against.
* **Pitfalls:** later "small" type changes that break other members — any change after this phase requires a PR approved by all affected owners.

### Phase 2 — Lexer (Week 2)

* **Objective:** `tokenize` complete.
* **Tasks:** scanner loop; keywords; identifiers; operators with maximal munch; comments; numeric scanning and range policy (§6.3); positions; error recovery; limits.
* **Files:** `lexer/lexer.ts`, `lexer/numeric.ts`.
* **Dependencies:** Phase 1.
* **Acceptance:** §25.2 tests pass; Critical 13 passes.
* **Tests:** §25.2.
* **Expected output:** Tokens view shows the table for any example.
* **Pitfalls:** `\\r\\n` double-counting lines; `=` vs `==`; accepting `1.`; using `parseInt` (silently accepts `10f`); float underflow check comparing the wrong string.

### Phase 3 — Parser + AST (Weeks 2–3)

* **Objective:** `parse` complete.
* **Tasks:** one function per rule (§7.1); spans; dangling-else; assignment lookahead; panic-mode recovery; depth limit; AST display tree helper.
* **Files:** `parser/parser.ts`, `parser/recovery.ts`, `ast/toDisplayTree.ts`.
* **Dependencies:** Phase 2 (or token fixtures).
* **Acceptance:** §25.3 tests; Critical 3 and 21.
* **Tests:** §25.3, AST snapshot tests.
* **Expected output:** AST view renders trees.
* **Pitfalls:** right-associative trees from naive recursion; infinite loop in recovery without the progress guarantee; spans ending at the wrong token.

### Phase 4 — Semantic Analysis (Weeks 3–4)

* **Objective:** `analyze` complete.
* **Tasks:** AST clone; symbol table; IR name assignment; type rules table; `CastNode` insertion; definite assignment; constant-zero-divisor check; warnings; non-cascading error type.
* **Files:** `semantic/\*`.
* **Dependencies:** Phase 3 (or AST fixtures).
* **Acceptance:** §25.4; Critical 4, 5, 6 (AST part), 10a, 19; X6–X16.
* **Tests:** §25.4.
* **Expected output:** Semantic view with scope tree and diagnostics.
* **Pitfalls:** declaring the symbol before analyzing its initializer; treating while-body assignments as definite; mutating the parser's AST; cascading errors.

### Phase 5 — TAC / IR (Weeks 4–5)

* **Objective:** `generateIR`, `printIR`, `validateIR`.
* **Tasks:** `genValue`/`genInto`; statement lowering; jumping code; value-context logical; label/temp allocation order; implicit return; validator; IR size limit.
* **Files:** `ir/\*`.
* **Dependencies:** Phase 4 (or typed-AST fixtures).
* **Acceptance:** §25.5 goldens; all TAC shown in §12 and §26 match byte-for-byte.
* **Tests:** §25.5.
* **Expected output:** TAC view.
* **Pitfalls:** lowering `\&\&` as a binary op; allocating temps before operands (wrong numbering); emitting `goto Lend` after a returning then-branch (harmless but breaks goldens); forgetting `return 0`.

### Phase 6 — Basic Blocks + CFG (Week 5)

* **Objective:** `buildCFG`, `printCFG`.
* **Tasks:** leaders; blocks; edges with kinds; EXIT; preds; reachability; back-edges; defensive empty-block handling.
* **Files:** `cfg/\*`.
* **Dependencies:** IR types (Phase 1) + `tac()` helper; goldens need Phase 5.
* **Acceptance:** §25.6; Critical 1, 2, 9, 14, 16, 17 CFG parts.
* **Tests:** §25.6.
* **Expected output:** Blocks view; CFG view (SVG) with dagre layout.
* **Pitfalls:** `instructions\[length-1]` on an empty block; adding a fall-through edge after `return`/`goto`; duplicate edges when branch target == next block.

### Phase 7 — Program Analysis (Week 6)

* **Objective:** generic worklist + use/def + liveness + constant lattice + available copies.
* **Files:** `analysis/\*`.
* **Dependencies:** Phase 6.
* **Acceptance:** §25.7; liveness table of §14.4 reproduced exactly.
* **Tests:** §25.7.
* **Expected output:** Program Analysis view.
* **Pitfalls:** processing defs before uses within an instruction; non-deterministic `Set` iteration in output (always sort); wrong initialization of must-analyses (must start from the universe, entry from ∅).

### Phase 8 — Optimization Framework (Week 6)

* **Objective:** PassManager, records, statistics, snapshots, containment, fingerprinting.
* **Files:** `optimizer/passManager.ts`, `records.ts`, `statistics.ts`, `types.ts`.
* **Dependencies:** Phase 5 (printer, validator), Phase 6.
* **Acceptance:** PassManager tests in §25.8 using dummy passes.
* **Expected output:** Optimization view renders an empty timeline and statistics.
* **Pitfalls:** passes mutating shared instruction objects; trusting a pass's `changed` flag.

### Phase 9 — Optimization Passes (Weeks 7–8)

* **Objective:** CF (+evaluator), CP, AS, CopyP, DCE, CFGS; then CSE (R1) if time permits.
* **Files:** `optimizer/evaluator.ts`, `optimizer/passes/\*`.
* **Dependencies:** Phases 7–8.
* **Acceptance:** every pass's §25.8 tests; Critical 10b, 11, 12, 20.
* **Expected output:** records appear in the timeline.
* **Pitfalls:** folding `x / 0`; using `==` instead of `Object.is` for `-0.0`; DCE removing trapping division; CFGS removing the program's final `goto`; jump-threading cycles; CopyP not killing `(x, y)` on redefinition of `y`.

### Phase 10 — Multi-Pass Optimization (Week 8)

* **Objective:** full pipeline with convergence and cap.
* **Dependencies:** Phase 9.
* **Acceptance:** traces of §17.6 and Demo 4 reproduced exactly (iteration numbers, record order); cap test.
* **Expected output:** Before/After view works for all demos.
* **Pitfalls:** re-using a CFG built before a pass changed the IR.

### Phase 11 — Pseudo Assembly (Week 9)

* **Objective:** `generatePseudoAssembly`.
* **Files:** `backend/pseudoAssembly.ts`.
* **Dependencies:** Phase 5 (can start in parallel with Phase 7).
* **Acceptance:** golden assembly for all integration programs; every line maps to an instruction ID.
* **Expected output:** Assembly view.
* **Pitfalls:** using `ADD` for float operations; forgetting `#` on immediates.

### Phase 12 — Frontend Integration (Weeks 9–10)

* **Objective:** all 12 views live against real `compile()`; cross-highlighting; examples picker.
* **Dependencies:** all compiler phases (views were prototyped against fixtures since Phase 3).
* **Acceptance:** every acceptance-criteria UI item in §37; smoke tests pass; manual demo walkthrough of §28 succeeds.
* **Pitfalls:** recompiling on every keystroke without debounce; rendering huge CFGs without the fallback list.

### Phase 13 — Edge-Case Testing + Polish (Weeks 11–12)

* **Objective:** all critical and integration tests green; docs complete; demo rehearsed.
* **Tasks:** fill test gaps; (R5) differential testing; determinism test; performance check against §33; docs (§36); README screenshots; viva script.
* **Acceptance:** §37 fully checked.
* **Pitfalls:** updating goldens to match bugs instead of fixing them — every golden change needs a reason in the PR.

\---

## 31\. Engineering Practices

|Practice|Requirement|
|-|-|
|TypeScript|`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`; no `any`; no non-null assertions in compiler code except after an explicit invariant check with a comment|
|Lint/format|ESLint (typescript-eslint recommended-type-checked) + Prettier; CI fails on warnings|
|Architecture|Compiler core independent of React (enforced by lint rule and tsconfig); no global mutable state; all counters in per-compilation context objects|
|IR|Structured objects only; text is produced by the printer and parsed only by the test-only `tac()` helper|
|Spans|Every token, AST node and IR instruction carries a span (IR instructions created from AST nodes inherit them; the implicit return uses the end-of-program span)|
|Determinism|No `Math.random`, no `Date`, no reliance on object key order for semantics; all exported sets sorted|
|Testability|Every pass independently runnable; every stage function pure|
|Reviews|Every PR reviewed; golden updates justified|

### 31.1 CI (GitHub Actions, single workflow)

```text
npm ci → npm run typecheck → npm run lint → npm test → npm run build
```

`npm test` runs unit, critical and integration suites (critical suite reported as a separate step). No deployment pipeline is required; optionally the built `frontend/dist` can be published to GitHub Pages manually.

### 31.2 Root Scripts

|Script|Command|
|-|-|
|`dev`|`npm -w frontend run dev`|
|`typecheck`|`tsc -b compiler frontend`|
|`lint`|`eslint . --max-warnings 0`|
|`test`|`vitest run`|
|`test:critical`|`vitest run compiler/tests/critical`|
|`test:update-golden`|`UPDATE\_GOLDEN=1 vitest run`|
|`build`|`npm -w compiler run build \&\& npm -w frontend run build`|

\---

## 32\. Security and Resource Limits

### 32.1 Threat Model

User source code is **untrusted data**. It is lexed, parsed and analyzed, never executed. The pseudo-assembly backend is display-only. There is no server, so no server-side attack surface; the main risks are a frozen browser tab or crash from adversarial input.

### 32.2 Rules

* No `eval`, `new Function`, or dynamic `import` of user-derived strings anywhere.
* User text is rendered only as React text nodes (no `dangerouslySetInnerHTML`); SVG labels are text nodes.
* Shareable URLs (R7) are decoded with length checks and treated as source text only.
* Any future execution/simulation (O4) must run in a Web Worker with a step limit and timeout, never on the main thread, and must have no access to DOM, network or storage.

### 32.3 Limits (`compiler/src/limits.ts`)

|Constant|Value|Enforced by|Failure|
|-|-|-|-|
|`MAX\_SOURCE\_CHARS`|50,000|lexer (before scanning)|`E\_SOURCE\_TOO\_LARGE`|
|`MAX\_TOKENS`|20,000|lexer|`E\_TOO\_MANY\_TOKENS`|
|`MAX\_IDENTIFIER\_LENGTH`|64|lexer|`E\_IDENTIFIER\_TOO\_LONG`|
|`MAX\_NESTING\_DEPTH`|128|parser|`E\_NESTING\_TOO\_DEEP`|
|`MAX\_DIAGNOSTICS`|100|all stages|`W\_TOO\_MANY\_DIAGNOSTICS`, stage stops|
|`MAX\_IR\_INSTRUCTIONS`|20,000|generator, validator|`E\_IR\_TOO\_LARGE`|
|`MAX\_CFG\_BLOCKS`|5,000|CFG builder|`E\_CFG\_TOO\_LARGE`|
|`MAX\_OPT\_ITERATIONS`|10|PassManager|`W\_OPTIMIZATION\_ITERATION\_LIMIT`|
|`MAX\_DATAFLOW\_VISITS`|200,000|worklist|`E\_ANALYSIS\_DID\_NOT\_CONVERGE`|
|`CFG\_RENDER\_BLOCK\_LIMIT`|150|UI|adjacency-list fallback|
|Worker timeout (R3)|3 s|UI|error banner, worker terminated|

Every recursive algorithm (parser, semantic analyzer, IR generator, AST display) has recursion depth bounded by `MAX\_NESTING\_DEPTH`, because nesting is rejected at parse time. Long flat expressions (`1+1+…+1`) are built iteratively by the parser loops; their *trees* are deep on the left spine, so later recursive stages count the same depth — the parser therefore also counts binary-operator chaining depth and applies the same limit (a chain of more than 128 binary operators in one expression ⇒ `E\_NESTING\_TOO\_DEEP`). CFG explosion is impossible beyond `MAX\_IR\_INSTRUCTIONS`, since every block contains at least one instruction.

\---

## 33\. Non-Functional Requirements

|Quality|Requirement|Verification|
|-|-|-|
|Correctness (top priority)|No optimization changes observable behaviour (§4.1). `Correctness > Optimization aggressiveness`: when in doubt, a pass does not fire.|Critical suite, differential testing (R5)|
|Determinism|Identical input ⇒ deep-equal `CompilationResult`; identical temp/label/block numbering and record order.|§25.10|
|Performance|Any program in `examples/` compiles end-to-end in < 200 ms on a typical laptop; a 2,000-line generated program in < 2 s. UI remains responsive (debounced compile).|Timed test (non-gating, logged)|
|Maintainability|Module boundaries as §24; no file > 600 lines; each pass < 300 lines.|Review|
|Usability|A first-time user can compile an example and find the optimized TAC in < 1 minute; every disabled tab explains why.|Manual walkthrough|
|Explainability|Every transformation has rule ID, rule text and reason; every diagnostic has code, message, position and snippet.|Tests assert records|
|Testability|≥ 85% line coverage for `compiler/src` (excluding type-only files).|Vitest coverage report|
|Extensibility|Adding a pass = one file implementing `OptimizationPass` + registration line; adding an opcode requires updating classify, printer, validator, CFG terminator table, backend (checklist in `architecture.md`).|Documentation|

\---

## 34\. Limitations (Deliberate Scope Boundaries)

These are design choices that keep the project explainable and achievable, not defects:

* MiniC is a small C-like language, not C: no pointers, arrays, structs, strings, chars, booleans, `for`/`do`/`switch`/`break`/`continue`.
* One implicit `main`; no user-defined functions or calls; I/O limited to `input` declarations.
* Two types (`int`, `float`); only implicit widening `int → float`; no explicit casts in the MVP.
* Definite-assignment analysis is conservative (§10.4) and may reject a few programs that are safe at runtime.
* No SSA, no dominator-based or loop optimizations, no global value numbering; CSE is local only.
* Constant propagation does not use branch conditions (it is not Sparse Conditional Constant Propagation).
* No register allocation, no instruction selection, no real machine code; pseudo-assembly is a one-register educational model.
* Programs are never executed; statistics measure static IR size only.
* Educational and portfolio purpose; not hardened for production use.

\---

## 35\. Optional Future Scope

Remains future work unless explicitly promoted (with a version bump of this document):

SSA construction and SSA-based optimizations; dominator tree and natural-loop detection (O5 covers display only); loop-invariant code motion; strength reduction (`x \* 2 → x + x`, induction variables); Sparse Conditional Constant Propagation; global CSE / partial redundancy elimination; explicit casts (O2) and `!` (O3); `bool`/`char` types; functions and calls with an activation-record model; arrays; a register-allocating backend; LLVM IR text export; WebAssembly backend with in-browser sandboxed execution; optimization benchmarking with a real execution model.

\---

## 36\. Documentation Requirements

|File|Owner|Must contain|
|-|-|-|
|`README.md`|M5|One-paragraph description, screenshot/GIF of the Optimization and CFG views, feature list (MVP vs recommended implemented), quick start (`npm ci`, `npm run dev`), how to run tests, project structure summary, team credits, limitations link|
|`docs/architecture.md`|M3, M5|Pipeline diagram (§1.1), stage gating (§3.3), canonical-IR decision (§3.4), OPT-ID invariant (§3.5), module contracts (§22), data-flow of `CompilationResult` to the UI, extension checklists|
|`docs/grammar.md`|M1|Full EBNF (§5), precedence table, dangling-else rule with example, lexical rules and numeric policy (§6), type rules (§10.2–10.3), scope and definite-assignment rules, all diagnostic codes with examples|
|`docs/optimizations.md`|M4|IR format, CFG construction, USE/DEF and liveness equations with the §14.4 worked example, every pass with rules, safety conditions and examples, the IEEE 754 counterexample table, trap-preservation policy, pipeline order, convergence argument, record and statistics formats|
|`docs/testing.md`|M5|Test layout, golden-file workflow, the Critical Edge Case list with file names, differential testing (if R5), how to add a test|

All example programs referenced in docs must exist in `examples/` and be covered by tests.

\---

## 37\. Acceptance Criteria

The project is complete only when every item is checked:

* \[ ] source code tokenizes correctly (§25.2 green)
* \[ ] lexical errors are reported with code, position and snippet
* \[ ] valid programs parse
* \[ ] invalid syntax produces useful errors and recovery reports multiple errors
* \[ ] dangling else is handled correctly (Critical 3)
* \[ ] AST is generated with spans on every node; untyped and typed AST viewable
* \[ ] symbol table supports nested scopes
* \[ ] valid shadowing works (Critical 4, 19)
* \[ ] duplicate same-scope declarations are rejected
* \[ ] uninitialized variables are detected (Critical 5 and variants)
* \[ ] int-to-float promotion works with explicit `CastNode`
* \[ ] invalid type combinations are rejected (X8–X13)
* \[ ] short-circuit `\&\&` works (Critical 7, 18)
* \[ ] short-circuit `||` works (Critical 8)
* \[ ] TAC is generated in canonical format matching goldens
* \[ ] `INT\_TO\_FLOAT` exists where required (Critical 6)
* \[ ] implicit return behavior is defined and implemented (`return 0`)
* \[ ] basic blocks are constructed per §13.1
* \[ ] empty blocks do not crash the CFG builder (Critical 1, 2)
* \[ ] early returns do not create invalid loop edges (Critical 9, 15, 17)
* \[ ] CFG is generated correctly with EXIT, edge kinds, back-edges, unreachable flags
* \[ ] USE/DEF analysis works
* \[ ] liveness analysis converges and matches §14.4
* \[ ] constant folding works safely
* \[ ] division-by-zero folding is handled safely (Critical 10a/10b)
* \[ ] constant propagation works
* \[ ] algebraic simplification is type-aware
* \[ ] IEEE 754-sensitive transformations are conservative (Critical 11a–c)
* \[ ] copy propagation invalidates stale relationships (Critical 12)
* \[ ] DCE works and preserves trapping instructions and `input`
* \[ ] CFG simplification works (constant branches, unreachable blocks, threading, redundant jumps, unused labels)
* \[ ] multi-pass optimization converges (§17.6 trace reproduced)
* \[ ] optimization iteration limit exists and is tested
* \[ ] every transformation is logged with pass, rule, reason, before, after, iteration, block, location
* \[ ] statistics are generated and labelled as static IR reduction
* \[ ] optimized TAC is displayed
* \[ ] pseudo assembly is generated
* \[ ] React UI displays all compiler stages (12 views)
* \[ ] CFG is visually rendered
* \[ ] optimization differences are visually understandable (Before/After view)
* \[ ] unit tests exist for every module
* \[ ] integration tests exist (I1–I12, X1–X16)
* \[ ] critical edge-case tests pass (Tests 1–21)
* \[ ] determinism test passes
* \[ ] documentation exists (§36)
* \[ ] project builds successfully and CI is green

\---

## 38\. Final Implementation Checklist

### Language

* \[ ] `docs/grammar.md` matches §4–§6 exactly
* \[ ] All 30+ example programs exist in `examples/`
* \[ ] Reserved identifier rule documented and tested

### Lexer

* \[ ] All token types of §6.1 produced with line, column, span
* \[ ] Line and block comments; unterminated block comment error
* \[ ] Numeric grammar, suffix and malformed detection, leading-zero rule
* \[ ] Int range 2,147,483,647 enforced; float overflow/underflow detected
* \[ ] Lexer continues after errors; `MAX\_SOURCE\_CHARS`/`MAX\_TOKENS` enforced

### Parser

* \[ ] One function per grammar rule; left-associative loops
* \[ ] Greedy `else` binding; dangling-else tests pass
* \[ ] Assignment vs expression statement via lookahead
* \[ ] Panic-mode recovery with progress guarantee
* \[ ] Nesting limit 128 including binary-operator chains

### AST

* \[ ] All 13 node kinds with `id` and `span`
* \[ ] Typed AST is a clone; parser AST unchanged after analysis
* \[ ] `CastNode` inserted for every promotion

### Semantic Analysis

* \[ ] Every code of §10.7 has a positive and negative test
* \[ ] Definite assignment through if/else, while, return
* \[ ] `W\_UNREACHABLE\_CODE` and `W\_UNUSED\_EXPRESSION\_RESULT`
* \[ ] Constant-zero integer divisor rejected; float `/ 0.0` accepted
* \[ ] No cascading errors

### Symbol Table

* \[ ] Scope IDs in entry order; scopes retained for display
* \[ ] Symbol inserted after its initializer is analyzed
* \[ ] IR names `x`, `x$1`, `x$2` assigned in declaration order

### IR/TAC

* \[ ] Typed operands and opcodes per §11.3
* \[ ] Destination passing; temps allocated after operands; labels allocated at construct start
* \[ ] Jumping code for `\&\&`/`||`; value-context materialization
* \[ ] Implicit `return 0`; no `goto` after a returning branch
* \[ ] Canonical printer incl. float formatting and `-0.0`
* \[ ] Validator V1–V6

### Basic Blocks

* \[ ] Leader rules of §13.1
* \[ ] Label-only blocks handled; untargeted labels stay mid-block

### CFG

* \[ ] Synthetic EXIT; return edges only to EXIT
* \[ ] Edge kinds, de-duplicated successors, sorted lists
* \[ ] Reachability and back-edge flags
* \[ ] Defensive handling of zero-instruction blocks
* \[ ] Text dump format for goldens

### Program Analysis

* \[ ] Generic deterministic worklist with visit cap
* \[ ] USE/DEF (uses before defs per instruction)
* \[ ] Liveness (block and per-instruction)
* \[ ] Constant lattice with `Object.is` comparison
* \[ ] Available copies with intersection at joins

### Optimizer

* \[ ] `OptimizationPass`, `PassManager`, records, statistics, snapshots
* \[ ] Fingerprint-based change detection
* \[ ] Post-pass validation and failure containment
* \[ ] OPT-ID invariant asserted
* \[ ] Iteration cap 10; convergence flag; warnings with `resolved` marking

### Optimization Passes

* \[ ] Constant Folding with safe evaluator (wrap, trap refusal, non-finite refusal)
* \[ ] Constant Propagation (copy-of-constant lattice)
* \[ ] Algebraic Simplification (aggressive int, exact-only float)
* \[ ] Copy Propagation with kill-on-redefinition and self-copy removal
* \[ ] Dead Code Elimination preserving traps, `input`, control flow
* \[ ] CFG Simplification (5 rules, cycle-safe threading)
* \[ ] (R1) Local CSE with invalidation

### Backend

* \[ ] Mapping table §19.3 implemented for every opcode
* \[ ] Int vs float instruction variants
* \[ ] Line → instruction ID mapping

### Frontend

* \[ ] Editor with example picker and error-line highlighting
* \[ ] Tokens, AST, Semantic, TAC, Blocks, CFG, Analysis, Optimization, Before/After, Assembly, Errors views
* \[ ] Cross-highlighting between source, TAC, records, blocks
* \[ ] Disabled tabs explain the stopping stage
* \[ ] Static-reduction disclaimer visible
* \[ ] Debounced compile; (R3) worker with timeout

### Testing

* \[ ] Unit suites §25.2–§25.8
* \[ ] Critical Tests 1–21
* \[ ] Integration I1–I12 and X1–X16
* \[ ] Determinism test
* \[ ] Coverage ≥ 85% for `compiler/src`
* \[ ] (R5) Differential testing

### Documentation

* \[ ] README, architecture, grammar, optimizations, testing per §36
* \[ ] Every documented example exists and is tested

### Final Demo

* \[ ] Demos 1–6 load from the picker and produce the documented results
* \[ ] Viva script rehearsed: pipeline overview → Demo 1 → Demo 4 → Demo 3 → Demo 6 → Demo 5 → Demo 2
* \[ ] Team can explain: short-circuit lowering, leaders, liveness equations, why `x \* 0.0` is not simplified, why `10 / z` is not folded or removed, why copy facts are killed, why the optimizer terminates

\---

## Appendix A — High-Risk Interaction Traceability

|Interaction|Specified in|Verified by|
|-|-|-|
|Short-circuit logic ↔ TAC ↔ CFG|§4.6, §12.4, §12.5, §13.3|Critical 7, 8, 15, 18; I7; Demo 4|
|Nested scopes ↔ Symbol table ↔ Shadowing|§4.4, §9, §10.1|Critical 4, 19; I6; Demo 5|
|int/float promotion ↔ Semantic ↔ CastNode ↔ IR|§4.10, §8.3, §10.2, §12.2|Critical 6; I3|
|Empty blocks ↔ TAC ↔ Basic blocks ↔ CFG|§12.3, §12.6, §13.2|Critical 1, 2; I12|
|Return ↔ CFG ↔ Loop back-edges|§12.3, §13.3, §13.6|Critical 9, 14–17|
|Constant folding ↔ Division by zero|§10.2, §16.2, §16.6|Critical 10a/10b; Demo 4, 6|
|Algebraic simplification ↔ IEEE 754|§4.3, §16.4|Critical 11a–c; Demo 6|
|Copy propagation ↔ Mutation ↔ Data flow|§14.5b, §16.5|Critical 12; I11|
|Liveness ↔ Dead code elimination|§14.3, §16.6|Demo 2; §25.8 DCE tests|
|Passes ↔ Analysis invalidation ↔ Convergence|§3.4, §17|§17.6 trace; PassManager cap tests|

## Appendix B — Consistency Matrix (feature coverage across stages)

|Language feature|Grammar|AST|Semantic|IR lowering|CFG|Tests|
|-|-|-|-|-|-|-|
|`int`/`float` declarations|`varDecl`|`VariableDeclaration`|§10.3|`genInto` / none|—|§25.4–25.5|
|`input`|`inputDecl`|`VariableDeclaration(storage: input)`|§4.9|`INPUT`|normal instruction|Critical 2, 7|
|Assignment|`assignStmt`|`Assignment`|§10.3|`genInto`|—|I1–I11|
|Expression statement|`exprStmt`|`ExpressionStatement`|warning|`genValue`|—|§25.5|
|Block|`block`|`Block`|scope|items in order / nothing if empty|—|Critical 1, 2|
|`if`, `if/else`|`ifStmt`|`IfStatement`|int condition, DA merge|§12.3|branches, joins|Critical 2, 3|
|`while`|`whileStmt`|`WhileStatement`|int condition, DA|§12.3|back-edge|Critical 1, 9|
|`return`|`returnStmt`|`ReturnStatement`|int value|`RETURN`, implicit `return 0`|edge to EXIT|Critical 9, 14, 16, 17|
|`+ - \* /`|`additive`/`multiplicative`|`BinaryExpression`|§10.2|`ADD SUB MUL DIV`|—|I1, Critical 10, 20|
|`%`|`multiplicative`|`BinaryExpression`|int only|`MOD`|—|X9|
|unary `-`|`unary`|`UnaryExpression`|§10.2|`NEG`|—|Critical 11c|
|relational / equality|`relational`/`equality`|`BinaryExpression`|int result|`LT … NE`|—|I3|
|`\&\&`, `\|\|`|`logicalAnd`/`logicalOr`|`BinaryExpression`|int operands|jumping code|multiple blocks|Critical 7, 8, 18|
|implicit promotion|—|`CastNode`|inserted|`INT\_TO\_FLOAT`|—|Critical 6|

*End of document.*

