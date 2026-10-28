import { analyze } from './analyze';
import type { Language } from './types';
import type { ProbeStrategy } from './research/probes';
self.onmessage = (event: MessageEvent<{
    id: number;
    source: string;
    language: Language;
    inputs: string[];
    budget: number;
    mutation: boolean;
    ml?: boolean;
    probeStrategy?: ProbeStrategy;
    mutationKind?: 'return' | 'branch';
    evidenceAudit?: boolean;
}>) => {
    const { id, source, language, inputs, budget, mutation, ml, probeStrategy, mutationKind, evidenceAudit } = event.data;
    try {
        self.postMessage({ id, result: analyze(source, language, inputs, budget, mutation, { useML: ml !== false, probeStrategy, mutationKind, evidenceAudit }) });
    }
    catch (error) {
        self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};

