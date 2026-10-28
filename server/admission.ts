/** Admission check only: comments and quoted contents cannot hide preprocessing directives. */
export function preprocessing(source: string) {
    if (/\\\r?\n|\?\?\//.test(source)) return { error: 'Line-spliced preprocessing is outside the native checker admission contract.', directives: [] as string[], withoutComments: source, indices: new Set<number>() };
    const clean = source.split(''), visible = source.split('');
    const blank = (start: number, end: number, comments: boolean) => {
        for (let n = start; n < end; n++) if (source[n] !== '\n' && source[n] !== '\r') {
            visible[n] = ' ';
            if (comments) clean[n] = ' ';
        }
    };
    for (let i = 0; i < source.length;) {
        if (source.startsWith('//', i)) {
            let end = source.indexOf('\n', i);
            if (end < 0) end = source.length;
            blank(i, end, true); i = end; continue;
        }
        if (source.startsWith('/*', i)) {
            const end = source.indexOf('*/', i + 2);
            if (end < 0) return { error: 'Unterminated block comment.', directives: [] as string[], withoutComments: source, indices: new Set<number>() };
            blank(i, end + 2, true); i = end + 2; continue;
        }
        if (source.startsWith('R"', i)) {
            const start = source.indexOf('(', i + 2), delimiter = source.slice(i + 2, start);
            if (start >= 0 && delimiter.length <= 16 && !/[\s()\\]/.test(delimiter)) {
                const end = source.indexOf(')' + delimiter + '"', start + 1);
                if (end >= 0) { blank(i, end + delimiter.length + 2, false); i = end + delimiter.length + 2; continue; }
            }
        }
        if (source[i] === '"' || source[i] === "'") {
            const quote = source[i]; let end = i + 1;
            while (end < source.length) {
                if (source[end] === '\\') { end += 2; continue; }
                if (source[end++] === quote) break;
            }
            blank(i, Math.min(end, source.length), false); i = end; continue;
        }
        i++;
    }
    const lines = visible.join('').replaceAll('%:', '#').replaceAll('??=', '#').split(/\r?\n/);
    const indices = new Set<number>(); const directives: string[] = [];
    lines.forEach((line, i) => { if (/^\s*#/.test(line)) { indices.add(i); directives.push(line.trim()); } });
    return { directives, indices, withoutComments: clean.join(''), error: undefined };
}
