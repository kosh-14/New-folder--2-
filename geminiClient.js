/**
 * Gemini API Client
 * Wraps the Gemini 1.5 Flash REST API with retry, backoff, and response parsing.
 */

const https = require('https');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-1.5-flash';
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

class GeminiClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error('GEMINI_API_KEY is required');
    this.apiKey = apiKey;
  }

  /**
   * Generate a response from Gemini.
   * @param {Object} opts - { systemPrompt, userPrompt, temperature }
   * @returns {Object} Parsed JSON from the model
   */
  async generate({ systemPrompt, userPrompt, temperature = 0.2 }) {
    const body = JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        responseMimeType: 'application/json',
        maxOutputTokens: 2048,
      },
    });

    const url = `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${this.apiKey}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await this._post(url, body);
        const parsed = JSON.parse(raw);

        // Extract text content from Gemini response structure
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty response from Gemini');

        // Parse the JSON the model returned
        const result = JSON.parse(text);
        return result;
      } catch (err) {
        const isRateLimit = err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
        const isRetryable = isRateLimit || err.message?.includes('503');

        if (attempt < MAX_RETRIES && isRetryable) {
          const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.warn(`  ⏳ Rate limited, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }
        throw err;
      }
    }
  }

  _post(url, body) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { GeminiClient };
