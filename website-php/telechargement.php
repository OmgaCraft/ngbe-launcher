<?php
require __DIR__ . '/includes/config.php';
$pageTitle = 'Téléchargement';
$currentPage = 'telechargement';

$windowsRelease = ngbe_fetch_latest_release(GITHUB_REPO, '.exe');
$androidRelease = ngbe_fetch_latest_release(ANDROID_REPO, '.apk');
$isAndroid = ngbe_is_android_visitor();

require __DIR__ . '/includes/header.php';

$windowsCard = function () use ($windowsRelease, $isAndroid) {
    ?>
      <div class="download-card" id="windows-card">
        <?php if (!$isAndroid): ?><span class="platform-badge">Détecté pour toi</span><?php endif; ?>
        <h2 class="section-title">Windows</h2>
        <p class="card-desc">Version portable — aucune installation requise, exécute directement le fichier.</p>
        <a class="btn" href="<?php echo htmlspecialchars(DOWNLOAD_URL); ?>">
          Télécharger le .exe
        </a>
        <p class="version">
          Windows 10/11 · 64 bits<?php if ($windowsRelease): ?> · Version <?php echo htmlspecialchars($windowsRelease['version']); ?><?php endif; ?>
        </p>
      </div>
    <?php
};

$androidCard = function () use ($androidRelease, $isAndroid) {
    ?>
      <div class="download-card" id="android-card">
        <?php if ($isAndroid): ?><span class="platform-badge">Détecté pour toi</span><?php endif; ?>
        <h2 class="section-title">Android</h2>
        <p class="card-desc">
          <?php echo $androidRelease ? 'Application mobile — installation directe via APK.' : 'Bientôt disponible.'; ?>
        </p>
        <a class="btn secondary" href="<?php echo htmlspecialchars($androidRelease['asset_url'] ?? ($androidRelease['html_url'] ?? ANDROID_RELEASES_URL)); ?>">
          <?php echo $androidRelease ? ($androidRelease['asset_url'] ? "Télécharger l'APK" : 'Voir la release') : 'Voir le dépôt'; ?>
        </a>
        <p class="version"><?php echo $androidRelease ? 'Version ' . htmlspecialchars($androidRelease['version']) : ''; ?></p>
      </div>
    <?php
};
?>
      <div class="platform-grid">
        <?php if ($isAndroid) { $androidCard(); $windowsCard(); } else { $windowsCard(); $androidCard(); } ?>
      </div>

      <div class="notice">
        <strong>Windows va afficher "Éditeur inconnu" au premier lancement.</strong>
        C'est normal : ce launcher n'est pas signé avec un certificat payant (comme la grande majorité
        des petits logiciels communautaires gratuits). Clique sur "Informations complémentaires" puis
        "Exécuter quand même" pour continuer. Le code source du launcher est disponible publiquement
        si tu veux vérifier ce qu'il fait avant de l'exécuter.
      </div>

      <div class="notice">
        <strong>Rappel :</strong> ce launcher est un projet communautaire indépendant, non affilié à NationsGlory.
      </div>
<?php require __DIR__ . '/includes/footer.php'; ?>
