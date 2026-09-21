(function () {
  const ANDROID_REPO = 'OmgaCraft/ngbe-launcher-android';

  const isAndroid = /android/i.test(navigator.userAgent);
  const windowsCard = document.getElementById('windows-card');
  const androidCard = document.getElementById('android-card');
  const grid = document.getElementById('platform-grid');

  if (isAndroid) {
    document.getElementById('android-badge').hidden = false;
    grid.insertBefore(androidCard, windowsCard);
  } else {
    document.getElementById('windows-badge').hidden = false;
  }

  async function loadAndroidRelease() {
    const descEl = document.getElementById('android-desc');
    const versionEl = document.getElementById('android-version');
    const btnEl = document.getElementById('android-download-btn');

    try {
      const res = await fetch(`https://api.github.com/repos/${ANDROID_REPO}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error('no release yet');
      const data = await res.json();
      const asset = (data.assets || []).find((a) => a.name.endsWith('.apk'));

      descEl.textContent = 'Application mobile — installation directe via APK.';
      versionEl.textContent = `Version ${data.tag_name}`;

      if (asset) {
        btnEl.href = asset.browser_download_url;
        btnEl.textContent = "Télécharger l'APK";
      } else {
        btnEl.href = data.html_url;
        btnEl.textContent = 'Voir la release';
      }
    } catch (err) {
      descEl.textContent = 'Pas encore de version publiée — revient bientôt.';
    }
  }

  loadAndroidRelease();
})();
