/** GCC original dumps use e.g. `;; Function int main()`; GIMPLE uses
 * `;; Function main (main, ...)`. Match both before applying display limits. */
export function artifactSection(text: string): string {
    const headers = [...text.matchAll(/^;; Function[^\r\n]*/gm)];
    const main = headers.find(h => /\bmain\s*\(/.test(h[0]));
    const start = main?.index ?? 0;
    const next = main ? headers.find(h => h.index! > start)?.index : undefined;
    const section = text.slice(start, next);
    return section.length > 40000 ? section.slice(0, 40000) + '\n[Display truncated at 40,000 characters]' : section;
}
