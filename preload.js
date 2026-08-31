const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, 'config');

function readJson(fileName, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, fileName), 'utf-8'));
  } catch (err) {
    console.error(`Impossible de lire ${fileName}:`, err.message);
    return fallback;
  }
}

function skinFaceUrl(username, size = 128) {
  return `https://skins.nationsglory.fr/face/${encodeURIComponent(username)}/${size}`;
}

function skinFace3dUrl(username, size = 128) {
  return `https://skins.nationsglory.fr/face/${encodeURIComponent(username)}/3d/${size}`;
}

contextBridge.exposeInMainWorld('ngbe', {
  launchUri: (uri) => ipcRenderer.invoke('launch-uri', uri),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getServerConfig: () => readJson('servers.json', { hub: {}, ngIsland: {}, links: {}, servers: [] }),
  getPlayerInfo: (pseudo) => ipcRenderer.invoke('ng-get-player', pseudo),
  getPlayerCount: () => ipcRenderer.invoke('ng-get-playercount'),
  getArticles: () => ipcRenderer.invoke('get-articles'),
  skinFaceUrl,
  skinFace3dUrl,
});
