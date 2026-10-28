import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try { const { train } = await server.ssrLoadModule('/scripts/ml/train.ts'); await train(); }
finally { await server.close(); }
