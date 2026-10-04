const express = require('express');

const app = express();
app.set('trust proxy', true);

// Read-only public-data proxy — safe to open up to any origin (desktop app,
// mobile WebView, browser testing).
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

const NG_API_BASE = process.env.NG_API_BASE || 'https://publicapi.nationsglory.fr/v1';
const API_KEY = process.env.NG_API_KEY;
const PORT = process.env.PORT || 3000;

if (!API_KEY) {
  console.error('NG_API_KEY manquant — définis cette variable d\'environnement avant de démarrer.');
}

// Bedrock servers this launcher shows. Also bounds how many upstream calls a
// client can trigger, since every call spends the shared key's 60 req/min.
const BEDROCK_SERVERS = ['alpha', 'sigma', 'omega', 'delta', 'epsilon'];
const PSEUDO_RE = /^[A-Za-z0-9_]{1,32}$/;

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

// NG caps a key at 60 req/min (the team can raise it). It's one shared key for
// every launcher instance, so it's tracked globally rather than per client IP,
// and only upstream calls count — never cache hits.
const NG_KEY_RATE_LIMIT = Number(process.env.NG_KEY_RATE_LIMIT) || 60;
const NG_KEY_WINDOW_MS = 60 * 1000;
let ngKeyTimestamps = [];
let ngBlockedUntil = 0;

function reserveNgKeyRequest() {
  const now = Date.now();
  ngKeyTimestamps = ngKeyTimestamps.filter((t) => now - t < NG_KEY_WINDOW_MS);
  if (ngKeyTimestamps.length >= NG_KEY_RATE_LIMIT) {
    return false;
  }
  ngKeyTimestamps.push(now);
  return true;
}

class NgApiError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

// Errors that mean "the whole answer is untrustworthy", as opposed to "this
// one resource doesn't exist".
const FATAL_CODES = new Set([
  'api_key_missing',
  'missing_api_key',
  'invalid_api_key',
  'expired_api_key',
  'ip_not_allowed',
  'rate_limited',
  'upstream_unreachable',
]);

const apiCache = new Map();
const API_CACHE_MAX = 2000;

function pruneApiCache() {
  if (apiCache.size <= API_CACHE_MAX) return;
  const now = Date.now();
  for (const [key, entry] of apiCache) {
    if (now - entry.ts >= entry.ttl) apiCache.delete(key);
  }
  if (apiCache.size > API_CACHE_MAX) apiCache.clear();
}

async function ngApi(path, ttlMs) {
  const now = Date.now();
  const hit = apiCache.get(path);
  if (hit && now - hit.ts < hit.ttl) {
    if (hit.error) throw hit.error;
    return hit.value;
  }
  if (!API_KEY) {
    throw new NgApiError(503, 'api_key_missing', 'Clé API NationsGlory non configurée sur le relais.');
  }
  if (now < ngBlockedUntil) {
    throw new NgApiError(429, 'rate_limited', 'Limite de la clé API NationsGlory atteinte, réessaie dans un instant.', Math.ceil((ngBlockedUntil - now) / 1000));
  }
  if (!reserveNgKeyRequest()) {
    throw new NgApiError(429, 'rate_limited', 'Limite de la clé API NationsGlory atteinte (60 req/min), réessaie dans un instant.', 30);
  }

  let res;
  try {
    res = await fetch(`${NG_API_BASE}${path}`, {
      headers: { 'X-API-Key': API_KEY, accept: 'application/json' },
    });
  } catch (err) {
    throw new NgApiError(502, 'upstream_unreachable', 'API NationsGlory injoignable.');
  }

  if (res.ok) {
    const body = await res.json();
    apiCache.set(path, { value: body, ts: now, ttl: ttlMs });
    pruneApiCache();
    return body;
  }

  let problem = null;
  try {
    problem = await res.json();
  } catch (err) {
    // not JSON — fall back to the status alone
  }
  const code = (problem && problem.code) || 'upstream_error';
  const error = new NgApiError(res.status, code, `API NationsGlory a répondu ${res.status} (${code})`);
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after')) || 30;
    ngBlockedUntil = Date.now() + retry * 1000;
    error.retryAfter = retry;
  }
  // Definitive answers are cached too, so asking again doesn't burn quota. A
  // domain with no published data (NEVER/DISABLED/BROKEN) stays that way for a while.
  if (res.status === 404 || res.status === 410 || code === 'domain_unavailable') {
    apiCache.set(path, { error, ts: now, ttl: ttlMs });
  }
  throw error;
}

function sendError(res, err) {
  if (err instanceof NgApiError) {
    if (err.status === 429) {
      res.set('Retry-After', String(err.retryAfter || 30));
      return res.status(429).json({ error: err.message });
    }
    if (err.code === 'api_key_missing') {
      return res.status(503).json({ error: err.message });
    }
    if (err.code === 'ip_not_allowed') {
      return res.status(502).json({ error: 'Le relais n\'est pas autorisé par NationsGlory (IP absente de la liste de la clé).' });
    }
    if (err.code === 'missing_api_key' || err.code === 'invalid_api_key' || err.code === 'expired_api_key') {
      return res.status(502).json({ error: 'La clé API NationsGlory du relais est invalide ou expirée.' });
    }
  }
  return res.status(502).json({ error: err.message });
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

// The public API no longer publishes a player's description (or Prime status
// or playtime), but the player's public profile page on the site still shows
// the description — no key involved, so it doesn't spend the quota.
const PROFILE_CACHE_MS = 10 * 60 * 1000;
const profileCache = new Map();

async function fetchWebsiteProfile(pseudo) {
  const key = pseudo.toLowerCase();
  const now = Date.now();
  const hit = profileCache.get(key);
  if (hit && now - hit.ts < PROFILE_CACHE_MS) {
    return hit.data;
  }
  let data = null;
  try {
    const res = await fetch(`https://nationsglory.fr/profile/${encodeURIComponent(pseudo)}`);
    if (res.ok) {
      const page = extractInertiaPage(await res.text());
      const profile = page.props && page.props.profile;
      if (profile) {
        data = {
          username: profile.username,
          description: profile.description || null,
          // Full UTC timestamp across all NG servers — the API only gives a day, per server.
          lastSeen: profile.last_seen || null,
        };
      }
    }
  } catch (err) {
    // site unreachable or changed — the profile just won't have a description
  }
  profileCache.set(key, { data, ts: now });
  if (profileCache.size > 1000) profileCache.clear();
  return data;
}

const PRESENCE_TTL_MS = 5 * 60 * 1000;
const PLAYER_TTL_MS = 5 * 60 * 1000;
const LAST_LOGIN_TTL_MS = 60 * 60 * 1000;
const COUNTRY_NAME_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchPlayerOnServer(slug, pseudo) {
  // The API matches pseudos case-insensitively and answers with the exact
  // casing, so normalize here: "OmegaCraft" and "omegacraft" share one cache entry.
  const encoded = encodeURIComponent(pseudo.toLowerCase());
  let player;
  try {
    player = await ngApi(`/servers/${slug}/players/${encoded}`, PLAYER_TTL_MS);
  } catch (err) {
    if (err.code === 'player_not_found') return { status: 'absent' };
    if (FATAL_CODES.has(err.code)) throw err;
    return { status: 'error', error: err };
  }

  const { country_id: countryId, role, username } = player.data;
  const [lastLogin, countryName] = await Promise.all([
    ngApi(`/servers/${slug}/players/${encoded}/last-login`, LAST_LOGIN_TTL_MS)
      .then((body) => body.data.last_login_on)
      .catch(() => null),
    countryId
      ? ngApi(`/servers/${slug}/countries/${encodeURIComponent(countryId)}`, COUNTRY_NAME_TTL_MS)
          .then((body) => body.data.name)
          .catch(() => null)
      : null,
  ]);

  return { status: 'found', username, countryId, countryName, role, lastLogin };
}

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'NGBE Launcher relay', api_key_configured: Boolean(API_KEY) });
});

app.get('/articles', async (_req, res) => {
  try {
    const data = await scrapeArticles();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Field names mirror the old /user shape where the new API still has the data
// (description, last_connection, per-server country), so existing clients keep
// working; what the API stopped publishing (is_prime, playtime) is null.
app.get('/user/:pseudo', rateLimit, async (req, res) => {
  const pseudo = req.params.pseudo;
  if (!PSEUDO_RE.test(pseudo)) {
    return res.status(400).json({ error: 'Pseudo invalide.' });
  }

  try {
    const [profile, outcomes] = await Promise.all([
      fetchWebsiteProfile(pseudo),
      Promise.all(BEDROCK_SERVERS.map((slug) => fetchPlayerOnServer(slug, pseudo))),
    ]);

    if (outcomes.every((o) => o.status === 'error')) {
      throw outcomes[0].error;
    }

    const servers = {};
    let username = null;
    let lastConnection = null;
    outcomes.forEach((outcome, i) => {
      if (outcome.status !== 'found') return;
      servers[BEDROCK_SERVERS[i]] = {
        country: outcome.countryName,
        country_id: outcome.countryId,
        country_rank: outcome.role,
        role: outcome.role,
        last_connection: outcome.lastLogin,
        playtime: null,
      };
      username = username || outcome.username;
      if (outcome.lastLogin && (!lastConnection || outcome.lastLogin > lastConnection)) {
        lastConnection = outcome.lastLogin;
      }
    });

    if (!username && !profile) {
      return res.status(404).json({ error: 'Joueur introuvable.' });
    }

    res.json({
      username: username || profile.username,
      description: profile ? profile.description : null,
      is_prime: null,
      last_connection: (profile && profile.lastSeen) || lastConnection,
      servers,
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/playercount', rateLimit, async (_req, res) => {
  const result = {};
  const errors = [];

  await Promise.all(
    BEDROCK_SERVERS.map(async (slug) => {
      try {
        const body = await ngApi(`/servers/${slug}/online?limit=1`, PRESENCE_TTL_MS);
        const state = body.meta && body.meta.freshness && body.meta.freshness.state;
        // SILENT: the game server is down, so the real count is unknown. Leave
        // it out rather than send null — installed clients render that as "null".
        if (state === 'SILENT') return;
        result[slug] = { players: body.meta.page.total, online: true };
      } catch (err) {
        if (FATAL_CODES.has(err.code)) errors.push(err);
        // otherwise this server just isn't published — leave it out
      }
    })
  );

  if (errors.length > 0 && Object.keys(result).length === 0) {
    return sendError(res, errors[0]);
  }
  res.json(result);
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
  // NG's API key only works from the IPs declared on the key, so log the one
  // this service really calls out from — and watch it: if it ever changes, the
  // key's list has to be updated or every call turns into 403 ip_not_allowed.
  fetch('https://api.ipify.org?format=json')
    .then((res) => res.json())
    .then((body) => console.log(`Egress IP: ${body.ip}`))
    .catch(() => console.log('Egress IP: lookup failed'));
});
