import { analyze } from './analyze';
import type { Language } from './types';
self.onmessage = (event: MessageEvent<{
    id: number;
    source: string;
    language: Language;
    inputs: string[];
    budget: number;
    mutation: boolean;
    ml?: boolean;
}>) => {
    const { id, source, language, inputs, budget, mutation, ml } = event.data;
    try {
        self.postMessage({ id, result: analyze(source, language, inputs, budget, mutation, { useML: ml !== false }) });
    }
    catch (error) {
        self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};

