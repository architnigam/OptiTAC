import { useState } from "react";

import {
  Lexer,
  Parser,
  SemanticAnalyzer,
  IRGenerator,
  optimize,
  verifyOptimization,
} from "./compiler";

function App() {
  const [source, setSource] = useState(`
int a = 10;
int b = a + 5;
return b;
`);

  const [result, setResult] = useState<any>(null);

  function compile() {
    try {
      // 1. Lexical analysis
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();

      // 2. Parsing
      const parser = new Parser(tokens);
      const ast = parser.parse();

      // 3. Semantic analysis
      const semantic = new SemanticAnalyzer();
      const semanticResult = semantic.analyze(ast);

      if (!semanticResult.success) {
        setResult({
          error: semanticResult.errors
            .map((error) => error.message)
            .join("\n"),
        });

        return;
      }

      // 4. TAC generation
      const generator = new IRGenerator();
      const originalIR = generator.generate(ast);

      const originalInstructions =
        originalIR.getInstructions();

      // 5. Optimization
      const optimizationResult = optimize(
        originalInstructions,
        {
          constantPropagation: true,
          constantFolding: true,
        }
      );

      // 6. Verification
      const verification = verifyOptimization(
        originalInstructions,
        optimizationResult.instructions
      );

      setResult({
        tokens,
        ast,
        originalTAC: originalIR.toText(),
        optimizedTAC:
          optimizationResult.instructions
            .map((instruction) => {
              if (instruction.kind === "assign") {
                return `${instruction.target} = ${instruction.value}`;
              }

              if (instruction.kind === "binary") {
                return (
                  `${instruction.target} = ` +
                  `${instruction.left} ` +
                  `${instruction.operator} ` +
                  `${instruction.right}`
                );
              }

              return `return ${instruction.value}`;
            })
            .join("\n"),
        logs: optimizationResult.logs,
        verification,
      });
    } catch (error) {
      setResult({
        error:
          error instanceof Error
            ? error.message
            : "Unknown compiler error.",
      });
    }
  }

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "30px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>OptiVerify</h1>

      <p>
        Interactive Compiler Optimization Verification
      </p>

      <h2>MiniC Source Code</h2>

      <textarea
        value={source}
        onChange={(event) =>
          setSource(event.target.value)
        }
        rows={10}
        style={{
          width: "100%",
          fontFamily: "monospace",
          fontSize: "16px",
          padding: "12px",
        }}
      />

      <br />
      <br />

      <button
        onClick={compile}
        style={{
          padding: "10px 20px",
          fontSize: "16px",
          cursor: "pointer",
        }}
      >
        Compile & Verify
      </button>

      {result?.error && (
        <pre
          style={{
            marginTop: "20px",
            padding: "15px",
            background: "#ffe5e5",
          }}
        >
          {result.error}
        </pre>
      )}

      {result && !result.error && (
        <>
          <h2>Original TAC</h2>

          <pre
            style={{
              background: "#f4f4f4",
              padding: "15px",
            }}
          >
            {result.originalTAC}
          </pre>

          <h2>Optimized TAC</h2>

          <pre
            style={{
              background: "#f4f4f4",
              padding: "15px",
            }}
          >
            {result.optimizedTAC}
          </pre>

          <h2>Optimization Log</h2>

          {result.logs.length === 0 ? (
            <p>No optimizations were applied.</p>
          ) : (
            result.logs.map(
              (
                log: {
                  pass: string;
                  before: string;
                  after: string;
                  reason: string;
                },
                index: number
              ) => (
                <div
                  key={index}
                  style={{
                    border: "1px solid #ddd",
                    padding: "12px",
                    marginBottom: "10px",
                  }}
                >
                  <strong>{log.pass}</strong>

                  <p>
                    <b>Before:</b> {log.before}
                  </p>

                  <p>
                    <b>After:</b> {log.after}
                  </p>

                  <p>
                    <b>Why:</b> {log.reason}
                  </p>
                </div>
              )
            )
          )}

          <h2>Verification</h2>

          <div
            style={{
              padding: "20px",
              border: "2px solid",
            }}
          >
            <h3>
              {result.verification.passed
                ? "✓ Verification Passed"
                : "✗ Verification Failed"}
            </h3>

            <p>
              Original result:{" "}
              {result.verification.original.returnValue}
            </p>

            <p>
              Optimized result:{" "}
              {result.verification.optimized.returnValue}
            </p>

            <p>
              {result.verification.message}
            </p>
          </div>

          <h2>Optimization Dependency</h2>

          <pre
            style={{
              background: "#f4f4f4",
              padding: "15px",
            }}
          >
{`Constant Propagation
        ↓
exposes constant expression
        ↓
Constant Folding`}
          </pre>
        </>
      )}
    </div>
  );
}

export default App;