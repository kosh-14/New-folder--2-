/**
 * CodeReviewBot Orchestrator
 * Delegates PR review to 4 specialized sub-agents, then aggregates results.
 */

const { RateLimiter } = require('./rateLimiter');
const { GeminiClient } = require('./geminiClient');
const { AGENTS } = require('./agents');
const { formatSummaryComment, formatInlineComments } = require('./formatter');

const rateLimiter = new RateLimiter();
const gemini = new GeminiClient(process.env.GEMINI_API_KEY);

/**
 * Run all sub-agents in parallel (respecting rate limits) and aggregate results.
 * @param {Object} prContext - { title, description, diff, files, codingStandards }
 * @returns {Object} { summary, inlineComments }
 */
async function orchestrateReview(prContext) {
  console.log('🤖 CodeReviewBot starting review...');
  console.log(`📋 PR: ${prContext.title}`);
  console.log(`📁 Files changed: ${prContext.files.length}`);

  // Build the shared system prompt prefix (sent identically every call → implicit cache hit)
  const sharedSystemPrompt = buildSharedSystemPrompt(prContext.codingStandards);

  // Run all agents — sequentially to stay within free-tier RPM limits
  const agentResults = [];
  for (const agent of AGENTS) {
    console.log(`🔍 Running ${agent.name} agent...`);
    await rateLimiter.throttle();

    try {
      const result = await gemini.generate({
        systemPrompt: sharedSystemPrompt,
        userPrompt: agent.buildPrompt(prContext),
        temperature: 0.2,
      });
      agentResults.push({ agent: agent.name, dimension: agent.dimension, result });
      console.log(`✅ ${agent.name} complete`);
    } catch (err) {
      console.error(`❌ ${agent.name} failed: ${err.message}`);
      agentResults.push({ agent: agent.name, dimension: agent.dimension, result: null, error: err.message });
    }
  }

  // Aggregate into final review
  const summary = formatSummaryComment(prContext, agentResults);
  const inlineComments = formatInlineComments(agentResults);

  console.log(`📝 Generated ${inlineComments.length} inline comments`);
  return { summary, inlineComments };
}

/**
 * Shared system prompt — sent identically on every sub-agent call.
 * Gemini implicitly caches this prefix → up to 75% token discount.
 */
function buildSharedSystemPrompt(codingStandards) {
  return `You are CodeReviewBot, an expert code reviewer embedded in a GitHub PR workflow.

CODING STANDARDS FOR THIS PROJECT:
${codingStandards || 'No project-specific standards provided. Apply general best practices.'}

RESPONSE FORMAT (always respond in valid JSON):
{
  "issues": [
    {
      "severity": "critical|high|medium|low|info",
      "file": "path/to/file.js",
      "line": 42,
      "title": "Short issue title",
      "description": "Detailed explanation of the problem",
      "suggestion": "Concrete fix or improvement",
      "codeSnippet": "optional: suggested replacement code"
    }
  ],
  "summary": "2-3 sentence overview of findings in this dimension",
  "score": 0-10
}

RULES:
- Only report real issues. Do not hallucinate problems.
- Be specific: reference file names and line numbers from the diff.
- Suggestions must be actionable and concrete.
- Severity guide: critical=security/data loss, high=bugs/crashes, medium=performance/logic, low=style, info=suggestions.`;
}

module.exports = { orchestrateReview };
