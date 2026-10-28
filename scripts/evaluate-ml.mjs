import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try { const { evaluate } = await server.ssrLoadModule('/scripts/ml/evaluate.ts'); await evaluate(); }
finally { await server.close(); }
