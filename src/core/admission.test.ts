import { describe, expect, it } from 'vitest';
import { preprocessing } from '../../server/admission';

describe('compile-only preprocessing admission', () => {
    it('recognizes includes after comments', () => {
        expect(preprocessing('/* banner */ #include <stdio.h>').directives).toEqual(['#include <stdio.h>']);
    });
    it('does not let string contents hide a following include', () => {
        expect(preprocessing('const char *s="/*";\n#include "private.h"').directives).toEqual(['#include']);
    });
    it('ignores apparent directives inside comments and raw strings', () => {
        expect(preprocessing('/*\n#include <secret.h>\n*/\nconst char*s=R"tag(\n#include <secret.h>\n)tag";').directives).toEqual([]);
    });
    it('normalizes alternative directive spellings for validation', () => {
        expect(preprocessing('%:include <stdio.h>\n??=include <stdlib.h>').directives).toEqual(['#include <stdio.h>', '#include <stdlib.h>']);
    });
    it('declines line splicing and unfinished comments', () => {
        expect(preprocessing('#inc\\\nlude <stdio.h>').error).toBeTruthy();
        expect(preprocessing('/*').error).toBeTruthy();
    });
});
