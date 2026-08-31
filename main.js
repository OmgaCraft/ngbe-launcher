const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTICLES_URL = 'https://nationsglory.fr/articles';
const ARTICLES_CACHE_MS = 5 * 60 * 1000;
const GITHUB_REPO = 'OmgaCraft/ngbe-launcher';

function parseVersion(tag) {
  return (tag || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
}

function isNewerVersion(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

async function checkForUpdates() {
  const currentVersion = app.getVersion();
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub a répondu ${res.status}`);
  }
  const release = await res.json();
  const latestVersion = release.tag_name || '';
  const asset = (release.assets || []).find((a) => a.name.endsWith('.exe'));
  return {
    currentVersion,
    latestVersion,
    hasUpdate: isNewerVersion(latestVersion, currentVersion),
    releaseUrl: release.html_url,
    downloadUrl: asset ? asset.browser_download_url : release.html_url,
  };
}

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

function loadServerConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'servers.json'), 'utf-8'));
  } catch (err) {
    return {};
  }
}

async function relayGet(pathSegment) {
  const config = loadServerConfig();
  const baseUrl = config.relay && config.relay.baseUrl;
  if (!baseUrl) {
    throw new Error('URL du serveur relais non configurée (config/servers.json → relay.baseUrl)');
  }
  const res = await fetch(`${baseUrl}${pathSegment}`);
  if (!res.ok) {
    throw new Error(`Le relais a répondu ${res.status}`);
  }
  return res.json();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 860,
    minHeight: 580,
    backgroundColor: '#14171a',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer crashed]', details);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[did-fail-load]', code, description);
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('launch-uri', async (_event, uri) => {
  await shell.openExternal(uri);
});

ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('ng-get-player', async (_event, pseudo) => {
  return relayGet(`/user/${encodeURIComponent(pseudo)}`);
});

ipcMain.handle('ng-get-playercount', async () => {
  return relayGet('/playercount');
});

ipcMain.handle('get-articles', async () => {
  return scrapeArticles();
});

ipcMain.handle('check-update', async () => {
  return checkForUpdates();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
