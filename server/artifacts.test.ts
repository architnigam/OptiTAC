import { expect, it } from 'vitest';
import { artifactSection } from './artifacts';
it('extracts original main after large standard-library dumps before truncation', () => {
    const dump = ';; Function std::helper()\n' + 'library details\n'.repeat(4000) + '\n;; Function int main() (null)\nreturn 42;\n;; Function helper2()\nother';
    expect(artifactSection(dump).trim()).toBe(';; Function int main() (null)\nreturn 42;');
});
it('handles GIMPLE headers, does not confuse main_helper, and retains headerless text', () => {
    expect(artifactSection(';; Function main_helper ()\nx\n;; Function main (main, funcdef_no=0)\ny')).toBe(';; Function main (main, funcdef_no=0)\ny');
    expect(artifactSection('int main ()\n{ return 0; }')).toContain('return 0');
});
