import {preprocessing} from './admission.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Plugin } from 'vite';
const exec = promisify(execFile);
const headers = new Set(['iostream', 'iomanip', 'vector', 'string', 'algorithm', 'map', 'set', 'unordered_map', 'unordered_set', 'cmath', 'cstdio', 'cstdlib', 'cstdint', 'limits', 'utility', 'array', 'queue', 'stack', 'numeric', 'functional', 'tuple', 'memory', 'stdio.h', 'stdlib.h', 'math.h', 'stdbool.h', 'stdint.h', 'limits.h', 'string.h', 'ctype.h', 'float.h', 'stddef.h']);
export interface NativeCheck {
    available: boolean;
    success?: boolean;
    compiler: string;
    dialect: string;
    diagnostics: string;
    wrapper: boolean;
    artifacts?: {
        original: string;
        gimple: string;
        cfg: string;
        optimized: string;
    };
}
export async function nativeCheck(source: string, language: 'c' | 'cpp', snippet = false, artifacts = false): Promise<NativeCheck> {
    const preferred = language === 'c' ? 'C:/msys64/ucrt64/bin/gcc.exe' : 'C:/msys64/ucrt64/bin/g++.exe';
    const compiler = language === 'c' ? (process.env.OPTITAC_CC || (existsSync(preferred) ? preferred : 'gcc')) : (process.env.OPTITAC_CXX || (existsSync(preferred) ? preferred : 'g++'));
    const dialect = language === 'c' ? 'c11' : 'c++14';
    const base = { compiler, dialect, wrapper: snippet };
    if (source.length > 30000)
        return { ...base, available: false, diagnostics: 'Native check source limit: 30,000 characters.' };
    const admission = preprocessing(source);
    if (admission.error) return { ...base, available: false, diagnostics: admission.error };
    const directives = admission.directives;
    for (const line of directives) {
        const match = /^\s*#\s*include\s*<([a-zA-Z0-9_.]+)>\s*$/.exec(line);
        if (!match || !headers.has(match[1]))
            return { ...base, available: false, diagnostics: 'Native syntax checking accepts the documented standard headers only; custom includes, macros and other preprocessing directives are not submitted to the local compiler.' };
    }
    let directory: string | undefined;
    try {
        directory = await mkdtemp(path.join(tmpdir(), 'optitac-check-'));
        const file = path.join(directory, language === 'c' ? 'source.c' : 'source.cpp');
        let input = source;
        if (snippet) {
            const includes = directives.join('\n');
            const stripped = admission.withoutComments.split(/\r?\n/).map((line,index) => admission.indices.has(index) ? '' : line).join('\n');
            input = `${includes}\n#include <stdio.h>\n${language === 'cpp' ? '#include <iostream>\nusing namespace std;' : '#include <stdbool.h>'}\nint main(void) {\n#line 1 "<source>"\n${stripped}\n}`;
        }
        await writeFile(file, input, 'utf8');
        try {
            const args = ['-x', language === 'c' ? 'c' : 'c++', `-std=${dialect}`, '-pedantic-errors', '-Wall', '-Wextra', '-fdiagnostics-color=never', ...(artifacts ? ['-O1', '-S', '-fdump-tree-original', '-fdump-tree-gimple', '-fdump-tree-cfg', '-fdump-tree-optimized', '-o', path.join(directory, 'analysis.s')] : ['-fsyntax-only']), file];
            const run = await exec(compiler, args, { timeout: 5000, maxBuffer: 256000, windowsHide: true, env: { ...process.env, PATH: path.dirname(compiler) + path.delimiter + (process.env.PATH || '') } });
            let output: NativeCheck['artifacts'];
            if (artifacts) {
                const files = await readdir(directory);
                const contents = async (extension: string) => { const found = files.find(name => name.endsWith('.' + extension)); if (!found)
                    return '(No artifact emitted by this compiler.)'; const text = await readFile(path.join(directory!, found), 'utf8'); const cfgStart = text.indexOf(';; Function main '); const plain = text.search(/\bmain\s*\([^)]*\)\s*\n?\s*\{/); const start = cfgStart >= 0 ? cfgStart : plain >= 0 ? plain : 0; const next = text.indexOf('\n;; Function ', start + 1); const section = text.slice(start, next >= 0 ? next : undefined); return section.length > 40000 ? section.slice(0, 40000) + '\n[Display truncated at 40,000 characters]' : section; };
                output = { original: await contents('original'), gimple: await contents('gimple'), cfg: await contents('cfg'), optimized: await contents('optimized') };
            }
            return { ...base, available: true, success: true, diagnostics: (run.stderr || 'No native syntax diagnostics.').replaceAll(file, '<source>'), ...(output ? { artifacts: output } : {}) };
        }
        catch (error) {
            const e = error as NodeJS.ErrnoException & {
                stderr?: string;
                killed?: boolean;
            };
            if (e.code === 'ENOENT' || e.killed || (!e.stderr && typeof e.code !== 'number'))
                return { ...base, available: false, diagnostics: e.killed ? 'Native syntax check timed out.' : 'Native compiler unavailable. Install GCC/G++ or configure OPTITAC_CC / OPTITAC_CXX.' };
            return { ...base, available: true, success: false, diagnostics: (e.stderr || e.message).replaceAll(file, '<source>') };
        }
    }
    catch (error) {
        return { ...base, available: false, diagnostics: `Native checker could not start: ${error instanceof Error ? error.message : String(error)}` };
    }
    finally {
        if (directory && path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + 'optitac-check-'))
            try {
                await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            }
            catch { /* Scratch cleanup must not replace a compiler diagnostic. */ }
    }
}
export function nativeCompilerPlugin(): Plugin {
    const attach: (server: {
        middlewares: {
            use: (route: string, handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void) => void;
        };
    }) => void = server => {
        server.middlewares.use('/api/native-check', (req, res) => {
            if (req.method !== 'POST') {
                res.statusCode = 405;
                res.end('POST required');
                return;
            }
            const origin = req.headers.origin, host = req.headers.host;
            if (origin && (!host || !['http://' + host, 'https://' + host].includes(origin))) {
                res.statusCode = 403;
                res.end('Same-origin requests only');
                return;
            }
            if (!String(req.headers['content-type']).startsWith('application/json')) {
                res.statusCode = 415;
                res.end('JSON required');
                return;
            }
            let body = '';
            req.setEncoding('utf8');
            req.on('data', chunk => { body += chunk; if (body.length > 50000)
                req.destroy(); });
            req.on('end', () => { void (async () => { try {
                const payload = JSON.parse(body) as {
                    source?: unknown;
                    language?: unknown;
                    snippet?: unknown;
                    artifacts?: unknown;
                };
                if (typeof payload.source !== 'string' || !['c', 'cpp'].includes(String(payload.language)))
                    throw new Error('Expected source and language.');
                const result = await nativeCheck(payload.source, payload.language as 'c' | 'cpp', payload.snippet === true, payload.artifacts === true);
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.end(JSON.stringify(result));
            }
            catch (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            } })(); });
        });
    };
    return { name: 'optitac-native-syntax', configureServer: attach, configurePreviewServer: attach };
}

