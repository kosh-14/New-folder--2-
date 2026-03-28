# 🤖 CodeReviewBot

> Intelligent GitHub PR reviews powered by Gemini 1.5 Flash sub-agents — free tier optimized.

CodeReviewBot automatically analyzes every pull request across **4 specialized dimensions** using a sub-agent delegation pattern, then posts structured feedback as inline comments and a summary.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔐 Security Review | SQL injection, XSS, hardcoded secrets, SSRF, auth flaws |
| ⚡ Performance Review | N+1 queries, memory leaks, O(n²) loops, blocking ops |
| 🧠 Logic Review | Null derefs, race conditions, edge cases, async bugs |
| ✨ Style Review | Naming, DRY violations, dead code, missing docs |
| 💬 Inline Comments | Comments posted directly on specific lines in the diff |
| 📊 Summary Report | Scores per dimension, verdict, issue breakdown |
| 🔄 Implicit Caching | Shared system prompt sent identically → Gemini caches it → up to 75% token discount |
| 🛡️ Rate Limit Guard | Daily counter + per-minute throttle, safe for free tier |

---

## 🚀 Setup

### 1. Get a free Gemini API key

Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and generate a free API key.

### 2. Add secrets to your GitHub repo

In your repo → **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `GEMINI_API_KEY` | Your Gemini API key |
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions ✓ |

### 3. Add the workflow

Copy `.github/workflows/codereviewbot.yml` into your repo's `.github/workflows/` directory.

Update this line in the workflow to point to this repo:
```yaml
repository: your-org/codereviewbot   # ← update
```

### 4. (Optional) Add your coding standards

In the workflow file, edit the `CODING_STANDARDS` env var:

```yaml
CODING_STANDARDS: |
  - All async functions must handle errors with try/catch
  - No console.log in production (use structured logger)
  - SQL queries must use parameterized statements
  - Follow OWASP Top 10 security guidelines
  - TypeScript strict mode required
```

This content is sent as part of the **shared system prompt** on every sub-agent call. Because it's identical each time, Gemini's implicit caching activates — saving you tokens.

---

## 🏗️ Architecture

```
PR opened/updated
       │
       ▼
  index.js (entry)
       │
       ├── Fetch PR diff & files from GitHub API
       │
       ▼
  orchestrator.js
       │
       ├── Build shared system prompt (cached by Gemini)
       │
       ├── [SecurityAgent]   ──► Gemini API
       ├── [PerformanceAgent] ─► Gemini API   (sequential, rate-limited)
       ├── [LogicAgent]      ──► Gemini API
       └── [StyleAgent]      ──► Gemini API
                                      │
                                      ▼
                              formatter.js
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                   Summary Comment          Inline Comments
                   (1 PR comment)        (per-line in diff)
```

### Why sub-agents?

A single "review everything" prompt produces generic, shallow feedback. Focused agents — each given one dimension and strict instructions — produce deeper, more accurate findings. The shared system prompt prefix means Gemini caches the context, making 4 calls nearly as cheap as 1.

---

## 📊 Free Tier Usage

| Metric | Value |
|---|---|
| Requests per PR review | 4 (one per agent) |
| Daily limit tracked | 50 requests |
| Per-minute throttle | 5 RPM (12s between requests) |
| PRs per day (safe) | ~12 PRs |
| Token savings via caching | Up to 75% on the shared system prompt |

The `rateLimiter.js` writes a `.rate-counter.json` file to track daily usage. It resets automatically at midnight UTC.

---

## 🖥️ Local CLI Usage

```bash
# Clone the bot
git clone https://github.com/your-org/codereviewbot
cd codereviewbot

# Set credentials
export GITHUB_TOKEN=ghp_...
export GEMINI_API_KEY=AIza...

# Run on a specific PR
node index.js --owner=your-org --repo=your-repo --pr=42
```

---

## 🧪 Running Tests

```bash
node test/test.js
```

Tests cover formatter logic and agent structure — no API key needed.

---

## 📁 File Structure

```
codereviewbot/
├── index.js              # Entry point (CLI + GitHub Action runner)
├── package.json
├── src/
│   ├── orchestrator.js   # Coordinates all sub-agents
│   ├── agents.js         # 4 specialized sub-agent definitions
│   ├── geminiClient.js   # Gemini REST API client w/ retry
│   ├── rateLimiter.js    # Free-tier rate limit guard
│   ├── githubClient.js   # GitHub API client
│   └── formatter.js      # PR comment & inline comment formatter
├── test/
│   └── test.js           # Unit tests
└── .github/
    └── workflows/
        └── codereviewbot.yml   # GitHub Actions workflow
```

---

## ⚙️ Configuration Reference

| Env Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | ✅ | — | GitHub token (auto-provided in Actions) |
| `GEMINI_API_KEY` | ✅ | — | Your Gemini API key |
| `GITHUB_REPOSITORY` | ✅ | — | Set automatically by GitHub Actions |
| `PR_NUMBER` | ✅ | — | PR number to review |
| `CODING_STANDARDS` | ✗ | `''` | Project-specific guidelines for the bot |

---

## 🛠️ Customization

**Add a new agent dimension:**
1. Add a new entry to `src/agents.js` with `name`, `dimension`, and `buildPrompt`
2. Be mindful of the +1 Gemini request per PR

**Change the model:**
Edit `MODEL` in `src/geminiClient.js`. `gemini-1.5-flash` is recommended for free tier. `gemini-1.5-pro` gives better results but hits limits faster.

**Adjust rate limits:**
Edit `REQUESTS_PER_MINUTE` and `DAILY_LIMIT` in `src/rateLimiter.js`.

---

## 📄 License

MIT
