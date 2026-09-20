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

async function fetchNotations(server) {
  const now = Date.now();
  const hit = notationsCache.get(server);
  if (hit && now - hit.ts < NOTATIONS_CACHE_MS) {
    return hit.data;
  }
  const res = await fetch(`https://nationsglory.fr/notations?server=${encodeURIComponent(server)}`);
  if (!res.ok) {
    throw new Error(`nationsglory.fr a répondu ${res.status}`);
  }
  const html = await res.text();
  const page = extractInertiaPage(html);
  const result = {
    server: page.props.currentServer,
    week: page.props.currentWeek,
    nations: (page.props.nations && page.props.nations.data) || [],
  };
  notationsCache.set(server, { data: result, ts: now });
  return result;
}

// The Android repo is private, so its GitHub releases API isn't reachable
// without a token. Rather than embed a GitHub token in the app, this is
// updated by hand each time a new Android build is published.
const ANDROID_LATEST_VERSION = {
  version: '0.3.0',
  url: 'https://github.com/OmgaCraft/ngbe-launcher-android/releases/tag/v0.3.0',
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
    const data = await fetchNotations(req.params.server);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`NGBE Launcher relay listening on port ${PORT}`);
});
