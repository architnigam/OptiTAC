import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nativeCompilerPlugin } from './server/native.ts';
export default defineConfig({ plugins: [react(), nativeCompilerPlugin()], server: { host: '127.0.0.1' } });
