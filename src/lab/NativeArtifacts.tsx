import { useState } from 'react';
import type { Language } from '../core/types';
import { Code, Fold } from './Views';
interface Artifacts {
    original: string;
    gimple: string;
    cfg: string;
    optimized: string;
}
export function NativeArtifacts({ source, language, snippet }: {
    source: string;
    language: Language;
    snippet: boolean;
}) {
    const [artifacts, setArtifacts] = useState<Artifacts>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function load() { setBusy(true); setError(''); try {
        const response = await fetch('/api/native-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, language, snippet, artifacts: true }), signal: AbortSignal.timeout(9000) });
        const data = await response.json() as {
            available: boolean;
            success?: boolean;
            diagnostics: string;
            artifacts?: Artifacts;
        };
        if (!data.success || !data.artifacts)
            throw Error(data.diagnostics || 'The native compiler did not produce artifacts.');
        setArtifacts(data.artifacts);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setBusy(false);
    } }
    return <section className="native-artifacts"><h3>Actual GCC artifacts</h3><p className="muted">For broader C/C++ constructs, inspect the compiler’s own tree, GIMPLE and CFG dumps. Compilation may produce a temporary assembly file; it never executes the submitted program. The main-function section is shown where available.</p><button disabled={busy} onClick={load}>{busy ? 'Compiling artifacts…' : artifacts ? 'Refresh GCC artifacts' : 'Generate GCC IR & CFG'}</button>{error && <p className="notice warning" role="alert">{error}</p>}{artifacts && <><Fold title="GCC original tree" open><p className="muted">GCC emits this original representation as a textual compiler dump. The connected diagram in Syntax is the portal’s own AST.</p><Code>{artifacts.original}</Code></Fold><Fold title="GIMPLE before optimization" open><Code>{artifacts.gimple}</Code></Fold><Fold title="Native control-flow graph"><Code>{artifacts.cfg}</Code></Fold><Fold title="GIMPLE after -O1"><Code>{artifacts.optimized}</Code></Fold><p className="muted">These are real compiler artifacts, not execution results or a claim of equivalence to the visual model.</p></>}</section>;
}

