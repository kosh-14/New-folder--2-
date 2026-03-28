#!/usr/bin/env node
/**
 * CodeReviewBot Entry Point
 *
 * Works in two modes:
 *   1. GitHub Actions: reads env vars injected by the workflow
 *   2. CLI: node index.js --owner=... --repo=... --pr=...
 */

const { orchestrateReview } = require('./src/orchestrator');
const { GitHubClient } = require('./src/githubClient');

async function main() {
  // ── Config ────────────────────────────────────────────────────────────────
  const config = getConfig();
  validateConfig(config);

  console.log('🚀 CodeReviewBot starting');
  console.log(`   Repo:  ${config.owner}/${config.repo}`);
  console.log(`   PR:    #${config.prNumber}`);

  const github = new GitHubClient(config.githubToken);

  // ── Fetch PR context from GitHub ──────────────────────────────────────────
  console.log('\n📥 Fetching PR data from GitHub...');
  const [pr, diff, files] = await Promise.all([
    github.getPR(config.owner, config.repo, config.prNumber),
    github.getPRDiff(config.owner, config.repo, config.prNumber),
    github.getPRFiles(config.owner, config.repo, config.prNumber),
  ]);

  const commitSha = pr.head.sha;
  console.log(`   Head commit: ${commitSha}`);
  console.log(`   Files changed: ${files.length}`);
  console.log(`   Diff size: ${diff.length} chars`);

  // Truncate diff if needed (Gemini context window safety)
  const truncatedDiff = truncateDiff(diff, 30000);
  if (truncatedDiff.length < diff.length) {
    console.warn(`⚠️  Diff truncated from ${diff.length} to ${truncatedDiff.length} chars`);
  }

  // ── Build review context ───────────────────────────────────────────────────
  const prContext = {
    title: pr.title,
    description: pr.body,
    diff: truncatedDiff,
    files: files.map((f) => f.filename),
    codingStandards: config.codingStandards,
    commitSha,
  };

  // ── Run sub-agent review ───────────────────────────────────────────────────
  console.log('\n🤖 Running code review...');
  const { summary, inlineComments } = await orchestrateReview(prContext);

  // ── Post to GitHub ─────────────────────────────────────────────────────────
  console.log('\n📤 Posting results to GitHub...');

  // Remove old bot comments first (clean re-run)
  await github.deletePreviousBotComments(config.owner, config.repo, config.prNumber);

  // Post summary comment
  await github.postComment(config.owner, config.repo, config.prNumber, summary);
  console.log('✅ Summary comment posted');

  // Post inline comments (if any)
  if (inlineComments.length > 0) {
    try {
      await github.postReview(
        config.owner,
        config.repo,
        config.prNumber,
        commitSha,
        inlineComments
      );
      console.log(`✅ ${inlineComments.length} inline comment(s) posted`);
    } catch (err) {
      // Inline comments can fail if lines don't match diff — fall back gracefully
      console.warn(`⚠️  Could not post inline comments: ${err.message}`);
      console.warn('   Inline issues are included in the summary comment.');
    }
  }

  console.log('\n🎉 CodeReviewBot finished successfully!');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getConfig() {
  // GitHub Actions sets GITHUB_REPOSITORY as "owner/repo"
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '/').split('/');

  // CLI args override env vars
  const args = parseArgs(process.argv.slice(2));

  return {
    owner: args.owner || owner,
    repo: args.repo || repo,
    prNumber: parseInt(args.pr || process.env.PR_NUMBER, 10),
    githubToken: process.env.GITHUB_TOKEN,
    geminiApiKey: process.env.GEMINI_API_KEY,
    codingStandards: process.env.CODING_STANDARDS || '',
  };
}

function validateConfig(config) {
  const missing = [];
  if (!config.owner) missing.push('owner (GITHUB_REPOSITORY or --owner)');
  if (!config.repo) missing.push('repo (GITHUB_REPOSITORY or --repo)');
  if (!config.prNumber) missing.push('PR number (PR_NUMBER or --pr)');
  if (!config.githubToken) missing.push('GITHUB_TOKEN');
  if (!config.geminiApiKey) missing.push('GEMINI_API_KEY');

  if (missing.length > 0) {
    console.error('❌ Missing required configuration:');
    missing.forEach((m) => console.error(`   - ${m}`));
    process.exit(1);
  }
}

function truncateDiff(diff, maxChars) {
  if (diff.length <= maxChars) return diff;
  return diff.slice(0, maxChars) + '\n\n[... diff truncated for token limit ...]';
}

function parseArgs(args) {
  const result = {};
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

// ── Run ───────────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error('\n💥 CodeReviewBot crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
