function safe(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[${label}]`, err);
  }
}

const config = window.ngbe.getServerConfig();

function connectUri(address, port) {
  return `minecraft://connect?serverUrl=${encodeURIComponent(address)}&serverPort=${port}`;
}

function rememberServer(name) {
  localStorage.setItem('ngbe.lastServer', name);
  const el = document.getElementById('last-server');
  if (el) el.textContent = name;

  const summary = document.getElementById('info-summary');
  if (summary && !summary.hidden) refreshProfile();
}

function launchServer(address, port) {
  if (!address) return;
  window.ngbe.launchUri(connectUri(address, port));
}

function joinServer(name, address, port) {
  if (!address) return;
  launchServer(address, port);
  rememberServer(name);
}

const NG_SHIELD_PATH =
  'M2 28.8288V5C2 3.34 2.56887 2 4.22887 2H35C36.66 2 38 3.34 38 5V28.8288C38 30.387 37.136 31.8101 35.7711 32.5L21.7711 39.5768C20.6547 40.1411 19.3453 40.1411 18.2289 39.5768L4.22888 32.5C2.86401 31.8101 2 30.387 2 28.8288Z';
const NG_ICON_PATH =
  'M20.5035 17.9345C20.9321 19.1409 22.6463 20.2925 22.83 19.078C22.8923 18.6663 22.7547 18.1522 22.6029 17.5848C22.3069 16.4788 21.9567 15.1705 22.928 14.0243C23.6521 13.1697 24.4087 12.719 25.2105 12.2414C26.0355 11.7499 26.9085 11.2299 27.8434 10.2118C27.8434 10.2118 29 9.31251 29 7.50001C29 6.50002 28.2812 6.70001 26 6.70001H8.3428C6.34954 6.70001 6.43977 8.00002 6.43995 12.18C6.44 13.34 7.26761 15.018 7.65956 15.8821C7.89526 16.4017 8.13366 16.9363 8.34276 17.45C8.75028 18.4511 10.8303 19.296 12.9692 20.1649L13.0369 20.1925C15.2145 21.0772 17.1978 21.5198 18 23.0708C18.5472 24.1289 18.5041 24.7467 18.4561 25.4358C18.3802 26.5252 18.4561 27.3363 19 28.1888C19.166 28.449 19.4418 28.7426 19.7126 29.0404C20.3158 29.7041 20.8135 30.7208 20.603 31.6012C20.192 33.3193 19.1191 35.8477 21.9701 34.4978L23.1209 33.916C25.2636 32.8329 27.5936 27.805 29.3686 26.1672C29.8 25.7691 30.2116 25.3488 30.5346 24.905C30.8838 24.4253 30.8752 23.7615 30.4895 23.3121C28.5252 21.0236 25.9682 21.8336 23.4974 22.1013L23.4974 22.1013C22.0058 22.2629 20.6982 22.4046 20 22.0472C19.6367 21.8613 19.2621 21.6887 18.8957 21.5198C17.2442 20.7587 15.7574 20.0735 16.2178 18.5926C16.7002 17.0407 19.6914 15.6487 20.5035 17.9345Z';

function ngLogoSvg(color) {
  return `
    <svg viewBox="0 0 40 40" width="20" height="20">
      <path fill="${color}" d="${NG_SHIELD_PATH}" />
      <path fill="#ffffff" d="${NG_ICON_PATH}" />
    </svg>
  `;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function runUpdateCheck(button) {
  if (button) button.classList.add('spinning');
  try {
    const result = await window.ngbe.checkForUpdates();
    const banner = document.getElementById('update-banner');
    const text = document.getElementById('update-banner-text');
    const downloadBtn = document.getElementById('update-download-btn');
    if (result.hasUpdate) {
      text.textContent = `Nouvelle version disponible : ${result.latestVersion} (actuelle : ${result.currentVersion})`;
      downloadBtn.onclick = () => window.ngbe.openExternal(result.downloadUrl);
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  } catch (err) {
    console.error('[update-check]', err);
  } finally {
    if (button) button.classList.remove('spinning');
  }
}

safe('update-btn', () => {
  const btn = document.getElementById('update-btn');
  btn.addEventListener('click', () => runUpdateCheck(btn));
  runUpdateCheck(null);
});

const EXTERNAL_LAUNCHER_LOGOS = {
  onyx: 'assets/onyx.jpg',
  oderso: 'assets/oderso.jpg',
  flarial: 'assets/flarial.svg',
};

async function refreshExternalLauncherIcons() {
  const box = document.getElementById('external-launcher-icons');
  try {
    const launchers = await window.ngbe.detectExternalLaunchers();
    box.innerHTML = '';
    launchers.forEach((launcher) => {
      const icon = document.createElement('div');
      icon.className = 'external-launcher-icon' + (launcher.installed ? ' installed' : '');
      icon.title = `${launcher.name}${launcher.installed ? ' (détecté)' : ' (non détecté)'}`;
      if (EXTERNAL_LAUNCHER_LOGOS[launcher.id]) {
        icon.innerHTML = `<img src="${EXTERNAL_LAUNCHER_LOGOS[launcher.id]}" alt="" />`;
      } else {
        icon.textContent = launcher.name.slice(0, 2).toUpperCase();
      }
      box.appendChild(icon);
    });
    return launchers;
  } catch (err) {
    console.error('[external-launchers]', err);
    return [];
  }
}

safe('external-launchers', () => {
  refreshExternalLauncherIcons();

  const modal = document.getElementById('external-settings-modal');
  const rowsBox = document.getElementById('external-settings-rows');

  async function openSettings() {
    const launchers = await refreshExternalLauncherIcons();
    rowsBox.innerHTML = '';
    launchers.forEach((launcher) => {
      const row = document.createElement('div');
      row.className = 'external-settings-row';
      row.innerHTML = `
        <span class="launcher-label">${launcher.name}</span>
        <input type="text" placeholder="Chemin non défini" value="${launcher.manualPath || ''}" data-id="${launcher.id}" />
        <button class="btn-small secondary" data-id="${launcher.id}" data-action="browse">Parcourir</button>
      `;
      const input = row.querySelector('input');
      const browseBtn = row.querySelector('button');

      input.addEventListener('change', async () => {
        await window.ngbe.setExternalLauncherPath(launcher.id, input.value.trim());
        refreshExternalLauncherIcons();
      });

      browseBtn.addEventListener('click', async () => {
        const picked = await window.ngbe.pickExecutablePath();
        if (!picked) return;
        input.value = picked;
        await window.ngbe.setExternalLauncherPath(launcher.id, picked);
        refreshExternalLauncherIcons();
      });

      rowsBox.appendChild(row);
    });
    modal.hidden = false;
  }

  document.getElementById('external-settings-btn').addEventListener('click', openSettings);
  document.getElementById('close-settings-btn').addEventListener('click', () => {
    modal.hidden = true;
  });
  document.getElementById('settings-update-btn').addEventListener('click', () => {
    runUpdateCheck(document.getElementById('update-btn'));
  });
});

safe('solo-btn', () => {
  document.getElementById('solo-btn').addEventListener('click', () => {
    window.ngbe.launchUri('minecraft://');
  });
});

safe('hub-v2-btn', () => {
  if (config.hub && config.hub.v2) {
    document.getElementById('hub-v2-btn').addEventListener('click', () => {
      const s = config.hub.v2;
      launchServer(s.address, s.port);
    });
  }
});

safe('hub-v1-btn', () => {
  if (config.hub && config.hub.v1) {
    document.getElementById('hub-v1-btn').addEventListener('click', () => {
      const s = config.hub.v1;
      launchServer(s.address, s.port);
    });
  }
});

safe('ngisland-btn', () => {
  if (config.ngIsland) {
    document.getElementById('ngisland-btn').addEventListener('click', () => {
      const s = config.ngIsland;
      launchServer(s.address, s.port);
    });
  }
});

safe('wiki-btn', () => {
  document.getElementById('wiki-btn').addEventListener('click', () => {
    if (config.links && config.links.wiki) window.ngbe.openExternal(config.links.wiki.url);
  });
});

safe('codex-btn', () => {
  document.getElementById('codex-btn').addEventListener('click', () => {
    if (config.links && config.links.codex) window.ngbe.openExternal(config.links.codex.url);
  });
});

safe('articles', async () => {
  const list = document.getElementById('news-list');
  list.textContent = 'Chargement...';
  try {
    const articles = await window.ngbe.getArticles();
    list.innerHTML = '';
    if (!articles.length) {
      list.textContent = 'Aucune actualité trouvée.';
      return;
    }
    articles.forEach((article) => {
      const el = document.createElement('div');
      el.className = 'news-item';
      el.innerHTML = `
        <img class="news-thumb" src="${article.image}" alt="" />
        <div>
          <span class="news-date">${article.date}</span>
          <div class="news-title">${article.title}</div>
        </div>
      `;
      el.addEventListener('click', () => window.ngbe.openExternal(article.url));
      list.appendChild(el);
    });
  } catch (err) {
    list.innerHTML = `<span class="profile-error">Impossible de charger les actualités (${err.message})</span>`;
  }
});

safe('servers-list', () => {
  const serversList = document.getElementById('servers-list');
  (config.servers || []).forEach((server) => {
    const row = document.createElement('div');
    const hasAddress = Boolean(server.address);
    row.className = 'server-row' + (hasAddress ? '' : ' disabled');
    row.title = hasAddress ? '' : 'Adresse non configurée — édite config/servers.json';
    row.dataset.serverName = server.name;
    if (server.apiKey) row.dataset.apiKey = server.apiKey;

    const icon = document.createElement('div');
    icon.className = 'server-icon';
    icon.innerHTML = ngLogoSvg(server.color || '#3f8f3f');

    const label = document.createElement('div');
    label.innerHTML = `
      <div class="server-name">${server.name}</div>
      <span class="server-address">${hasAddress ? server.address + ':' + server.port : 'non configuré'}</span>
    `;

    row.appendChild(icon);
    row.appendChild(label);

    if (hasAddress) {
      row.addEventListener('click', () => joinServer(server.name, server.address, server.port));
    }

    serversList.appendChild(row);
  });
});

safe('player-count', async () => {
  const data = await window.ngbe.getPlayerCount();
  if (!data) return;
  const rows = document.querySelectorAll('.server-row[data-server-name]');
  rows.forEach((row) => {
    const apiKey = row.dataset.apiKey || row.dataset.serverName.toLowerCase();
    const entry = data[apiKey];
    if (!entry) return;
    const count = typeof entry === 'object' ? entry.players : entry;
    if (count === undefined) return;
    const badge = document.createElement('span');
    badge.className = 'server-count';
    badge.textContent = `${count} connecté${count === 1 ? '' : 's'}`;
    row.appendChild(badge);
  });
});

function setLocked(locked) {
  document.getElementById('info-edit').hidden = locked;
  document.getElementById('info-summary').hidden = !locked;
  document.getElementById('info-gear').hidden = !locked;
}

function formatPlaytime(seconds) {
  if (!seconds) return '0 h';
  return `${Math.round(seconds / 3600)} h`;
}

function renderServerStats(playerServers) {
  const box = document.getElementById('profile-servers');
  box.innerHTML = '';
  if (!playerServers) return;

  const lastServerName = localStorage.getItem('ngbe.lastServer');
  const server = (config.servers || []).find((s) => s.name === lastServerName && s.apiKey);
  if (!server) return;

  const stats = playerServers[server.apiKey];
  if (!stats) return;

  const row = document.createElement('div');
  row.className = 'profile-server-row';

  const icon = document.createElement('div');
  icon.className = 'server-icon';
  icon.innerHTML = ngLogoSvg(server.color || '#3f8f3f');

  const name = document.createElement('span');
  name.className = 'profile-server-name';
  name.textContent = server.name;

  const details = document.createElement('span');
  details.className = 'profile-server-stats';
  const country = stats.country || '—';
  const rank = stats.country_rank || '—';
  details.textContent = `Pays : ${country} · Rang : ${rank} · Temps : ${formatPlaytime(stats.playtime)}`;

  row.appendChild(icon);
  row.appendChild(name);
  row.appendChild(details);
  box.appendChild(row);
}

async function refreshProfile() {
  const pseudo = document.getElementById('pseudo-input').value.trim();
  if (!pseudo) return;

  safe('skin-face', () => {
    document.getElementById('skin-face').src = window.ngbe.skinFaceUrl(pseudo, 128);
  });

  const usernameEl = document.getElementById('profile-username');
  const crownEl = document.getElementById('profile-crown');
  const descEl = document.getElementById('profile-description');
  const lastConnEl = document.getElementById('profile-last-connection');

  usernameEl.textContent = pseudo;
  descEl.textContent = 'Chargement...';

  try {
    const data = await window.ngbe.getPlayerInfo(pseudo);
    usernameEl.textContent = data.username || pseudo;
    crownEl.hidden = !data.is_prime;
    descEl.textContent = data.description || 'Aucune description.';
    descEl.classList.remove('profile-error');
    lastConnEl.textContent = formatDate(data.last_connection);
    renderServerStats(data.servers);
  } catch (err) {
    descEl.textContent = `Erreur : ${err.message}`;
    descEl.classList.add('profile-error');
  }
}

safe('info-card', () => {
  const pseudoInput = document.getElementById('pseudo-input');
  const confirmBtn = document.getElementById('pseudo-confirm');
  const gearBtn = document.getElementById('info-gear');

  pseudoInput.value = localStorage.getItem('ngbe.pseudo') || '';

  pseudoInput.addEventListener('input', () => {
    localStorage.setItem('ngbe.pseudo', pseudoInput.value);
  });

  function tryLock() {
    if (pseudoInput.value.trim()) {
      setLocked(true);
      refreshProfile();
    }
  }

  confirmBtn.addEventListener('click', tryLock);
  pseudoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryLock();
  });

  gearBtn.addEventListener('click', () => setLocked(false));

  const shouldStartLocked = Boolean(pseudoInput.value.trim());
  setLocked(shouldStartLocked);
  if (shouldStartLocked) refreshProfile();
});

safe('last-server', () => {
  document.getElementById('last-server').textContent = localStorage.getItem('ngbe.lastServer') || 'aucun';
});
