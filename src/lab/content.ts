import type { Language } from '../core/types';
export interface Example {
    id: string;
    name: string;
    language: Language;
    source: string;
    inputs: string;
    mission: string;
    experiment?: 'branch';
}
export const examples: Example[] = [
    { id: 'sum', name: 'A sum with a loop', language: 'cpp', inputs: '5\n7\n10', mission: 'Predict the printed sum for the first input.', source: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n    const int start = 2 * 3;\n    int total = start - 6;\n    for (int i = 1; i <= n; i++) {\n        total += i;\n    }\n    cout << "sum=" << total << endl;\n    return total;\n}' },
    { id: 'even', name: 'C: decisions and input', language: 'c', inputs: '6\n10\n3', mission: 'Predict the printed total for the first input.', source: '#include <stdio.h>\n\nint main(void) {\n    int n;\n    scanf("%d", &n);\n    int total = 0;\n    for (int i = 1; i <= n; i++) {\n        if (i % 2 == 0) {\n            total += i;\n        }\n    }\n    printf("%d\\n", total);\n    return 0;\n}' },
    { id: 'gcd', name: 'C++: Euclid\'s algorithm', language: 'cpp', inputs: '48 18\n100 35\n7 3', mission: 'Predict the printed GCD for the first pair.', source: '#include <iostream>\nusing namespace std;\n\nint gcd(int a, int b) {\n    while (b != 0) {\n        int remainder = a % b;\n        a = b;\n        b = remainder;\n    }\n    return a;\n}\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << gcd(a, b) << endl;\n    return 0;\n}' },
    { id: 'factorial', name: 'Functions and recursion', language: 'cpp', inputs: '5\n7\n10', mission: 'Predict the printed factorial for the first input.', source: '#include <iostream>\nusing namespace std;\n\nint factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}\n\nint main() {\n    int n;\n    cin >> n;\n    cout << factorial(n) << endl;\n    return 0;\n}' },
    { id: 'division', name: 'Integer vs floating division', language: 'c', inputs: '', mission: 'Predict both values printed by this C program.', source: '#include <stdio.h>\n\nint main(void) {\n    int a = 5, b = 2;\n    printf("%d %.2f\\n", a / b, (double)a / b);\n    return 0;\n}' },
    { id: 'branches', name: 'A branch that disappears', language: 'cpp', inputs: '', mission: 'Predict the printed value, then inspect the pruned CFG.', source: '#include <iostream>\nusing namespace std;\n\nint main() {\n    const int crates = 4;\n    int price;\n    if (crates > 2) {\n        price = crates * 5;\n    } else {\n        price = 99;\n    }\n    cout << price << endl;\n    return price;\n}' },
    { id: 'undefined', name: 'Catch signed overflow', language: 'c', inputs: '', mission: 'Enter undefined if the program has undefined behavior.', source: 'int main(void) {\n    int maximum = 2147483647;\n    return maximum + 1;\n}' },
    { id: 'shortcircuit', name: 'A lazy operator saves the day', language: 'cpp', inputs: '', mission: 'Predict the return value. Does the division execute?', source: 'int main() {\n    int zero = 0;\n    return zero && (10 / zero);\n}' },
    { id: 'native', name: 'Broader C++ syntax check', language: 'cpp', inputs: '', mission: 'This example demonstrates native C++ checking, beyond the visual subset.', source: '#include <vector>\n#include <algorithm>\n\nclass Scores {\npublic:\n    std::vector<int> values;\n};\n\nint main() {\n    Scores scores;\n    scores.values = {7, 3, 9};\n    std::sort(scores.values.begin(), scores.values.end());\n    return scores.values.front();\n}' },
    { id: 'boundary-demo', name: 'Research demo: find the hidden fault', language: 'cpp', inputs: '300 999', experiment: 'branch', mission: 'Predict the return value for the supplied input, then inspect the localized mutation in Optimize.', source: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n, unused;\n    cin >> n >> unused;\n    if (n == 137) return 7;\n    return 2;\n}' },
];
export const steps = [
    { id: 'tokens', name: 'Tokens', hint: 'Words and operators', why: 'Lexical analysis recognizes keywords, names, literals, operators and delimiters. Arithmetic, comparison, assignment, bitwise and logical operators are explicitly classified as operators.' },
    { id: 'syntax', name: 'Syntax', hint: 'Shape and meaning', why: 'The parser applies C/C++ precedence and associativity to build an AST. Parentheses, unary operators, assignments, calls, conditionals and loop structure remain visible.' },
    { id: 'types', name: 'Types', hint: 'Scope and numeric rules', why: 'Semantic analysis checks declarations, lexical scope, function signatures, const writes, scalar operand types and evaluation-order hazards. Runtime values carry int, float, double, bool or char types.' },
    { id: 'flow', name: 'Flow & IR', hint: 'Actual branches and loops', why: 'Expressions lower to typed intermediate instructions. Basic blocks and successor edges make control flow inspectable. Backward liveness computes which names are needed on each edge.' },
    { id: 'optimize', name: 'Optimize', hint: 'Search with a guard', why: 'A width-three, depth-four beam search explores conditional constant propagation, reachability pruning, effect-aware liveness and jump cleanup. Candidates are accepted only after their stdout and typed return values match the AST reference on every supplied case.' },
    { id: 'results', name: 'Results', hint: 'Observed evidence', why: 'The AST interpreter, original IR and selected IR are compared on the supplied input cases. Undefined behavior and execution limits are shown explicitly; neither is reported as a verified result.' },
] as const;

