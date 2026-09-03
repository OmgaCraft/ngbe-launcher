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

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'NGBE Launcher relay' });
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
