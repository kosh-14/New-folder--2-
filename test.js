/**
 * CodeReviewBot Test
 * Tests the orchestrator with a mock diff (no real API calls needed for formatter/agent tests).
 *
 * To run a real end-to-end test with Gemini:
 *   GEMINI_API_KEY=your_key node test/test.js --real
 */

const { formatSummaryComment, formatInlineComments } = require('../src/formatter');
const { AGENTS } = require('../src/agents');
const { RateLimiter } = require('../src/rateLimiter');

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_PR_CONTEXT = {
  title: 'feat: add user authentication',
  description: 'Implements login/logout with JWT tokens',
  diff: `
diff --git a/auth.js b/auth.js
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/auth.js
@@ -0,0 +1,25 @@
+const jwt = require('jsonwebtoken');
+const SECRET = 'hardcoded-secret-123';  // bad!
+
+function login(username, password) {
+  const query = "SELECT * FROM users WHERE username='" + username + "'";  // SQL injection
+  const user = db.query(query);
+  if (user && user.password === password) {  // plaintext comparison
+    return jwt.sign({ id: user.id }, SECRET);
+  }
+}
+
+function getAllUsers(req, res) {
+  for (let i = 0; i < users.length; i++) {
+    for (let j = 0; j < users.length; j++) {  // O(n^2)
+      processUser(users[i], users[j]);
+    }
+  }
+}
  `,
  files: ['auth.js'],
  codingStandards: 'Use parameterized queries. No hardcoded secrets. Use bcrypt for passwords.',
};

const MOCK_AGENT_RESULTS = [
  {
    agent: 'SecurityAgent',
    dimension: 'security',
    result: {
      issues: [
        {
          severity: 'critical',
          file: 'auth.js',
          line: 2,
          title: 'Hardcoded JWT secret',
          description: 'The JWT secret is hardcoded in source code. Anyone with repo access can forge tokens.',
          suggestion: 'Use process.env.JWT_SECRET and add it to your secrets manager.',
          codeSnippet: "const SECRET = process.env.JWT_SECRET;",
        },
        {
          severity: 'critical',
          file: 'auth.js',
          line: 5,
          title: 'SQL Injection vulnerability',
          description: 'String concatenation in SQL query allows injection attacks.',
          suggestion: 'Use parameterized queries: db.query("SELECT * FROM users WHERE username=?", [username])',
        },
      ],
      summary: 'Two critical security issues found: hardcoded secret and SQL injection.',
      score: 2,
    },
  },
  {
    agent: 'PerformanceAgent',
    dimension: 'performance',
    result: {
      issues: [
        {
          severity: 'medium',
          file: 'auth.js',
          line: 14,
          title: 'O(n²) nested loop',
          description: 'Nested loop over users array results in quadratic time complexity.',
          suggestion: 'Refactor to a single pass or use a Map for O(n) lookup.',
        },
      ],
      summary: 'One performance issue: unnecessary O(n²) nested loop.',
      score: 6,
    },
  },
  {
    agent: 'LogicAgent',
    dimension: 'logic',
    result: {
      issues: [
        {
          severity: 'high',
          file: 'auth.js',
          line: 7,
          title: 'Plaintext password comparison',
          description: 'Passwords should never be stored or compared in plaintext.',
          suggestion: 'Use bcrypt.compare(password, user.passwordHash)',
        },
      ],
      summary: 'Plaintext password comparison is a logic and security flaw.',
      score: 4,
    },
  },
  {
    agent: 'StyleAgent',
    dimension: 'style',
    result: {
      issues: [
        {
          severity: 'low',
          file: 'auth.js',
          line: 4,
          title: 'Missing JSDoc comment',
          description: 'The login function has no documentation.',
          suggestion: 'Add JSDoc: /** @param {string} username @param {string} password @returns {string} JWT token */',
        },
      ],
      summary: 'Minor style issues: missing documentation.',
      score: 7,
    },
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
  }

  console.log('\n🧪 Running CodeReviewBot tests...\n');

  // Formatter tests
  test('formatSummaryComment generates non-empty markdown', () => {
    const summary = formatSummaryComment(MOCK_PR_CONTEXT, MOCK_AGENT_RESULTS);
    assert(typeof summary === 'string', 'should return string');
    assert(summary.length > 100, 'should be non-trivial');
    assert(summary.includes('CodeReviewBot'), 'should include bot name');
    assert(summary.includes('feat: add user authentication'), 'should include PR title');
  });

  test('formatSummaryComment includes all dimensions', () => {
    const summary = formatSummaryComment(MOCK_PR_CONTEXT, MOCK_AGENT_RESULTS);
    assert(summary.includes('Security'), 'should include Security');
    assert(summary.includes('Performance'), 'should include Performance');
    assert(summary.includes('Logic'), 'should include Logic');
    assert(summary.includes('Style'), 'should include Style');
  });

  test('formatSummaryComment shows critical verdict for critical issues', () => {
    const summary = formatSummaryComment(MOCK_PR_CONTEXT, MOCK_AGENT_RESULTS);
    assert(summary.includes('Critical Issues Found') || summary.includes('Changes Required'), 'should show critical verdict');
  });

  test('formatInlineComments returns array of comments', () => {
    const comments = formatInlineComments(MOCK_AGENT_RESULTS);
    assert(Array.isArray(comments), 'should return array');
    assert(comments.length > 0, 'should have comments');
  });

  test('formatInlineComments has correct structure', () => {
    const comments = formatInlineComments(MOCK_AGENT_RESULTS);
    for (const c of comments) {
      assert(c.path, 'comment should have path');
      assert(c.line, 'comment should have line');
      assert(c.body, 'comment should have body');
    }
  });

  test('formatInlineComments sorts critical first', () => {
    const comments = formatInlineComments(MOCK_AGENT_RESULTS);
    assert(comments[0].severity === 'critical', 'first comment should be critical');
  });

  // Agent tests
  test('all 4 agents are defined', () => {
    assert(AGENTS.length === 4, `expected 4 agents, got ${AGENTS.length}`);
  });

  test('each agent has required fields', () => {
    for (const agent of AGENTS) {
      assert(agent.name, 'agent needs name');
      assert(agent.dimension, 'agent needs dimension');
      assert(typeof agent.buildPrompt === 'function', 'agent needs buildPrompt function');
    }
  });

  test('agent prompts include diff content', () => {
    for (const agent of AGENTS) {
      const prompt = agent.buildPrompt(MOCK_PR_CONTEXT);
      assert(prompt.includes(MOCK_PR_CONTEXT.diff.slice(0, 20)), `${agent.name} prompt should include diff`);
    }
  });

  // Rate limiter tests
  test('RateLimiter initializes correctly', () => {
    const limiter = new RateLimiter();
    const usage = limiter.getUsage();
    assert(typeof usage.today === 'number', 'should have today count');
    assert(usage.dailyLimit === 50, 'daily limit should be 50');
  });

  // Summary
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests();
