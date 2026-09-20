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

// NG caps approved API keys at 60 req/min — this is a single shared key used
// by every launcher instance, so it's tracked globally (not per client IP)
// and only counts actual upstream calls, never cache hits.
const NG_KEY_RATE_LIMIT = 60;
const NG_KEY_WINDOW_MS = 60 * 1000;
let ngKeyTimestamps = [];

function reserveNgKeyRequest() {
  const now = Date.now();
  ngKeyTimestamps = ngKeyTimestamps.filter((t) => now - t < NG_KEY_WINDOW_MS);
  if (ngKeyTimestamps.length >= NG_KEY_RATE_LIMIT) {
    return false;
  }
  ngKeyTimestamps.push(now);
  return true;
}

async function cachedFetch(key, url) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL_MS) {
    return hit.data;
  }
  if (!reserveNgKeyRequest()) {
    throw new Error('Limite de la clé API NationsGlory atteinte (60 req/min), réessaie dans un instant.');
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

// nationsglory.fr runs on Laravel + Inertia — every page embeds its full
// props as JSON in <div id="app" data-page="...">, HTML-entity-encoded.
function extractInertiaPage(html) {
  const match = html.match(/data-page="([^"]+)"/);
  if (!match) {
    throw new Error('page Inertia introuvable (le site a peut-être encore changé)');
  }
  return JSON.parse(decodeEntities(match[1]));
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
  const page = extractInertiaPage(html);
  const posts = (page.props.posts && page.props.posts.data) || [];
  const articles = posts.map((post) => ({
    url: `https://nationsglory.fr/articles/${post.slug}`,
    image: post.image,
    date: post.date,
    title: post.title,
  }));
  articlesCache = { data: articles, ts: now };
  return articles;
}

const NOTATIONS_CACHE_MS = 5 * 60 * 1000;
const notationsCache = new Map();

function extractWeekNum(url) {
  if (!url) return null;
  const match = url.match(/[?&]week=(\d+)/);
  return match ? Number(match[1]) : null;
}

async function fetchNotations(server, week) {
  const cacheKey = `${server}:${week || 'current'}`;
  const now = Date.now();
  const hit = notationsCache.get(cacheKey);
  if (hit && now - hit.ts < NOTATIONS_CACHE_MS) {
    return hit.data;
  }
  const params = new URLSearchParams({ server });
  if (week) params.set('week', week);
  const res = await fetch(`https://nationsglory.fr/notations?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`nationsglory.fr a répondu ${res.status}`);
  }
  const html = await res.text();
  const page = extractInertiaPage(html);
  const nations = (page.props.nations && page.props.nations.data) || [];
  const result = {
    server: page.props.currentServer,
    week: page.props.currentWeek,
    weekNum: page.props.weekNum,
    prevWeek: extractWeekNum(page.props.prevWeekUrl),
    // nationsglory.fr never links forward past "today" even though the
    // endpoint happily serves the in-progress week's live (partial) data —
    // offer +1 optimistically; the client stops once it hits an empty week.
    nextWeek: nations.length > 0 && typeof page.props.weekNum === 'number' ? page.props.weekNum + 1 : null,
    nations,
  };
  notationsCache.set(cacheKey, { data: result, ts: now });
  return result;
}

// The Android repo is private, so its GitHub releases API isn't reachable
// without a token. Rather than embed a GitHub token in the app, this is
// updated by hand each time a new Android build is published.
const ANDROID_LATEST_VERSION = {
  version: '0.4.0',
  url: 'https://github.com/OmgaCraft/ngbe-launcher-android/releases/tag/v0.4.0',
};

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'NGBE Launcher relay' });
});

app.get('/android-version', (_req, res) => {
  res.json(ANDROID_LATEST_VERSION);
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

app.get('/notations/:server', rateLimit, async (req, res) => {
  try {
    const week = req.query.week ? Number(req.query.week) : undefined;
    const data = await fetchNotations(req.params.server, week);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`NGBE Launcher relay listening on port ${PORT}`);
});
