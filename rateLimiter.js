/**
 * Rate Limiter for Gemini Free Tier
 *
 * Free tier limits (conservative estimates):
 *   - 5 requests per minute (RPM)
 *   - 50 requests per day
 *
 * Strategy:
 *   - Enforce minimum gap between requests (~12s for 5 RPM)
 *   - Track daily usage in a local JSON file
 *   - Warn loudly when approaching daily limit
 */

const fs = require('fs');
const path = require('path');

const REQUESTS_PER_MINUTE = 5;
const DAILY_LIMIT = 50;
const MIN_GAP_MS = Math.ceil((60 * 1000) / REQUESTS_PER_MINUTE); // 12000ms
const COUNTER_FILE = path.join(__dirname, '..', '.rate-counter.json');

class RateLimiter {
  constructor() {
    this.lastRequestTime = 0;
    this.counter = this._loadCounter();
  }

  /**
   * Call before every Gemini request. Waits if needed, throws if daily limit hit.
   */
  async throttle() {
    // Check daily limit
    this._resetIfNewDay();
    if (this.counter.today >= DAILY_LIMIT) {
      throw new Error(
        `🚫 Daily Gemini request limit reached (${DAILY_LIMIT} requests). ` +
        `Resets at midnight UTC. Used: ${this.counter.today}/${DAILY_LIMIT}`
      );
    }

    if (this.counter.today >= DAILY_LIMIT * 0.9) {
      console.warn(`⚠️  Approaching daily limit: ${this.counter.today}/${DAILY_LIMIT} requests used`);
    }

    // Enforce per-minute gap
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < MIN_GAP_MS) {
      const wait = MIN_GAP_MS - elapsed;
      console.log(`  ⏳ Rate limiting: waiting ${(wait / 1000).toFixed(1)}s...`);
      await sleep(wait);
    }

    this.lastRequestTime = Date.now();
    this.counter.today += 1;
    this.counter.total += 1;
    this._saveCounter();

    console.log(`  📊 API usage: ${this.counter.today}/${DAILY_LIMIT} today, ${this.counter.total} total`);
  }

  getUsage() {
    this._resetIfNewDay();
    return {
      today: this.counter.today,
      dailyLimit: DAILY_LIMIT,
      total: this.counter.total,
      remaining: DAILY_LIMIT - this.counter.today,
    };
  }

  _resetIfNewDay() {
    const today = new Date().toISOString().split('T')[0];
    if (this.counter.date !== today) {
      this.counter.date = today;
      this.counter.today = 0;
      this._saveCounter();
    }
  }

  _loadCounter() {
    try {
      const data = fs.readFileSync(COUNTER_FILE, 'utf8');
      return JSON.parse(data);
    } catch {
      return { date: '', today: 0, total: 0 };
    }
  }

  _saveCounter() {
    try {
      fs.writeFileSync(COUNTER_FILE, JSON.stringify(this.counter, null, 2));
    } catch (err) {
      console.warn('Could not save rate counter:', err.message);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { RateLimiter };
