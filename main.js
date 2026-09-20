const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

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

const EXTERNAL_LAUNCHERS = [
  { id: 'onyx', name: 'Onyx Client', matches: ['onyx'] },
  { id: 'oderso', name: 'OderSo', matches: ['oderso', 'oders0'] },
  { id: 'flarial', name: 'Flarial', matches: ['flarial'] },
];

const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

function cleanDisplayIconPath(value) {
  if (!value) return '';
  // DisplayIcon is often "C:\...\app.exe,0" — strip a trailing ",<index>"
  const withoutIndex = value.replace(/,\s*-?\d+$/, '').trim().replace(/^"|"$/g, '');
  return withoutIndex.toLowerCase().endsWith('.exe') ? withoutIndex : '';
}

async function queryRegistryEntries() {
  const entries = [];
  for (const key of UNINSTALL_KEYS) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', key, '/s']);
      const blocks = stdout.split(/\r?\n\r?\n/);
      blocks.forEach((block) => {
        const displayNameMatch = block.match(/DisplayName\s+REG_SZ\s+(.+)/);
        if (!displayNameMatch) return;
        const displayIconMatch = block.match(/DisplayIcon\s+REG_SZ\s+(.+)/);
        entries.push({
          displayName: displayNameMatch[1].trim(),
          displayIcon: displayIconMatch ? displayIconMatch[1].trim() : '',
        });
      });
    } catch (err) {
      // key missing or inaccessible — ignore and continue
    }
  }
  return entries;
}

function externalLaunchersConfigPath() {
  return path.join(app.getPath('userData'), 'external-launchers.json');
}

function loadExternalPaths() {
  try {
    return JSON.parse(fs.readFileSync(externalLaunchersConfigPath(), 'utf-8'));
  } catch (err) {
    return {};
  }
}

function saveExternalPaths(paths) {
  fs.writeFileSync(externalLaunchersConfigPath(), JSON.stringify(paths, null, 2));
}

async function detectExternalLaunchers() {
  const manualPaths = loadExternalPaths();
  const registryEntries = await queryRegistryEntries();

  return EXTERNAL_LAUNCHERS.map((launcher) => {
    const manualPath = manualPaths[launcher.id] || '';
    const manualExists = manualPath ? fs.existsSync(manualPath) : false;

    const matchingEntry = registryEntries.find((entry) => {
      const name = entry.displayName.toLowerCase();
      return launcher.matches.some((m) => name.includes(m));
    });

    let suggestedPath = '';
    if (matchingEntry) {
      const iconPath = cleanDisplayIconPath(matchingEntry.displayIcon);
      if (iconPath && fs.existsSync(iconPath)) {
        suggestedPath = iconPath;
      }
    }

    return {
      id: launcher.id,
      name: launcher.name,
      installed: manualExists || Boolean(matchingEntry),
      manualPath,
      suggestedPath,
      launchablePath: manualExists ? manualPath : suggestedPath,
    };
  });
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
  return relayGet('/articles');
});

ipcMain.handle('get-notations', async (_event, server, week) => {
  const query = week ? `?week=${encodeURIComponent(week)}` : '';
  return relayGet(`/notations/${encodeURIComponent(server)}${query}`);
});

ipcMain.handle('check-update', async () => {
  return checkForUpdates();
});

ipcMain.handle('detect-external-launchers', async () => {
  return detectExternalLaunchers();
});

ipcMain.handle('set-external-launcher-path', async (_event, id, filePath) => {
  const paths = loadExternalPaths();
  if (filePath) {
    paths[id] = filePath;
  } else {
    delete paths[id];
  }
  saveExternalPaths(paths);
  return detectExternalLaunchers();
});

ipcMain.handle('launch-external-launcher', async (_event, id) => {
  const launchers = await detectExternalLaunchers();
  const launcher = launchers.find((l) => l.id === id);
  if (!launcher || !launcher.launchablePath) {
    return { ok: false, reason: 'no-path' };
  }
  const error = await shell.openPath(launcher.launchablePath);
  if (error) {
    return { ok: false, reason: 'open-failed', message: error };
  }
  return { ok: true };
});

ipcMain.handle('pick-executable-path', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Sélectionner l\'exécutable',
    filters: [{ name: 'Exécutable', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
