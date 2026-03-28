/**
 * Sub-Agent Definitions
 *
 * Each agent focuses on one review dimension.
 * All use the same shared system prompt (for implicit caching),
 * but each gets a focused user prompt.
 */

const AGENTS = [
  {
    name: 'SecurityAgent',
    dimension: 'security',
    emoji: '🔐',
    buildPrompt: (ctx) => `
TASK: Security vulnerability review of this pull request.

Focus exclusively on:
- Injection vulnerabilities (SQL, command, XSS, SSTI, etc.)
- Authentication and authorization flaws
- Insecure data exposure (secrets, PII, sensitive data in logs/responses)
- Cryptography issues (weak algorithms, hardcoded keys, insecure randomness)
- Dependency vulnerabilities (dangerous packages or versions)
- CSRF, SSRF, open redirects
- Path traversal and file system issues
- Insecure deserialization

PR TITLE: ${ctx.title}
PR DESCRIPTION: ${ctx.description || 'N/A'}

DIFF:
\`\`\`diff
${ctx.diff}
\`\`\`

Respond only with valid JSON matching the required format.
`,
  },

  {
    name: 'PerformanceAgent',
    dimension: 'performance',
    emoji: '⚡',
    buildPrompt: (ctx) => `
TASK: Performance analysis of this pull request.

Focus exclusively on:
- N+1 queries and unnecessary database round-trips
- Missing indexes or inefficient query patterns
- Unoptimized loops (O(n²) where O(n) is possible, etc.)
- Memory leaks (event listeners not removed, closures retaining refs, etc.)
- Unnecessary re-renders (React/Vue specific if applicable)
- Large bundle size additions
- Blocking synchronous operations in async contexts
- Caching opportunities
- Inefficient data structures

PR TITLE: ${ctx.title}
PR DESCRIPTION: ${ctx.description || 'N/A'}

DIFF:
\`\`\`diff
${ctx.diff}
\`\`\`

Respond only with valid JSON matching the required format.
`,
  },

  {
    name: 'LogicAgent',
    dimension: 'logic',
    emoji: '🧠',
    buildPrompt: (ctx) => `
TASK: Logic and correctness review of this pull request.

Focus exclusively on:
- Off-by-one errors
- Null/undefined dereference risks
- Race conditions and concurrency bugs
- Incorrect error handling (swallowed exceptions, wrong error types)
- Edge cases not handled (empty arrays, zero values, boundary conditions)
- Incorrect conditional logic or boolean expressions
- Async/await misuse (missing awaits, unhandled promise rejections)
- Type coercion bugs
- Algorithm correctness

PR TITLE: ${ctx.title}
PR DESCRIPTION: ${ctx.description || 'N/A'}

DIFF:
\`\`\`diff
${ctx.diff}
\`\`\`

Respond only with valid JSON matching the required format.
`,
  },

  {
    name: 'StyleAgent',
    dimension: 'style',
    emoji: '✨',
    buildPrompt: (ctx) => `
TASK: Code style and maintainability review of this pull request.

Focus exclusively on:
- Naming conventions (variables, functions, classes)
- Function/method length and single-responsibility principle
- Code duplication (DRY violations)
- Missing or inadequate comments/documentation
- Inconsistent formatting or patterns with the rest of the codebase
- Dead code (unreachable, unused variables/imports)
- Magic numbers and strings (should be named constants)
- Test coverage gaps for new code
- Overly complex code that could be simplified

PR TITLE: ${ctx.title}
PR DESCRIPTION: ${ctx.description || 'N/A'}

DIFF:
\`\`\`diff
${ctx.diff}
\`\`\`

Respond only with valid JSON matching the required format.
`,
  },
];

module.exports = { AGENTS };
