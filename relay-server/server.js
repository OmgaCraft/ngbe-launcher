const express = require('express');

const app = express();
app.set('trust proxy', true);

// Read-only public-data proxy — safe to open up to any origin (desktop app,
// mobile WebView, browser testing).
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

const NG_API_BASE = 'https://publicapi.nationsglory.fr';
const TOKEN = process.env.NG_API_TOKEN;
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('NG_API_TOKEN manquant — définis cette variable d\'environnement avant de démarrer.');
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimits = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const timestamps = (rateLimits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Trop de requêtes, réessaie dans une minute.' });
  }
  timestamps.push(now);
  rateLimits.set(ip, timestamps);
  next();
}

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

async function cachedFetch(key, url) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL_MS) {
    return hit.data;
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`API NationsGlory a répondu ${res.status}`);
  }
  const data = await res.json();
  cache.set(key, { data, ts: now });
  return data;
}

const ARTICLES_URL = 'https://nationsglory.fr/articles';
const ARTICLES_CACHE_MS = 5 * 60 * 1000;
let articlesCache = { data: null, ts: 0 };

function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function scrapeArticles() {
  const now = Date.now();
  if (articlesCache.data && now - articlesCache.ts < ARTICLES_CACHE_MS) {
    return articlesCache.data;
  }
  const res = await fetch(ARTICLES_URL);
  if (!res.ok) {
    throw new Error(`nationsglory.fr a répondu ${res.status}`);
  }
  const html = await res.text();
  const re = /<a class="tile[^"]*" href="(\/article\/[^"]+)">\s*<img class="tile-background" src="([^"]+)"[^>]*>[\s\S]*?<span class="tile-eyebrow">([^<]+)<\/span>[\s\S]*?<h3 class="tile-title">([^<]+)<\/h3>/g;
  const articles = [];
  let match;
  while ((match = re.exec(html)) !== null) {
    articles.push({
      url: `https://nationsglory.fr${match[1]}`,
      image: match[2],
      date: decodeEntities(match[3].trim()),
      title: decodeEntities(match[4].trim()),
    });
  }
  articlesCache = { data: articles, ts: now };
  return articles;
}

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'NGBE Launcher relay' });
});

app.get('/articles', async (_req, res) => {
  try {
    const data = await scrapeArticles();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/user/:pseudo', rateLimit, async (req, res) => {
  try {
    const data = await cachedFetch(
      `user:${req.params.pseudo.toLowerCase()}`,
      `${NG_API_BASE}/user/${encodeURIComponent(req.params.pseudo)}`
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/playercount', rateLimit, async (_req, res) => {
  try {
    const data = await cachedFetch('playercount', `${NG_API_BASE}/playercount`);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`NGBE Launcher relay listening on port ${PORT}`);
});
