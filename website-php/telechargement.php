<?php
require __DIR__ . '/includes/config.php';
$pageTitle = 'Téléchargement';
$currentPage = 'telechargement';
$release = ngbe_fetch_latest_release();
require __DIR__ . '/includes/header.php';
?>
      <div class="download-card">
        <h2 class="section-title">Télécharger NGBE Launcher</h2>
        <p style="color: var(--muted); font-size: 13px; margin-bottom: 24px;">
          Version portable pour Windows — aucune installation requise, exécute directement le fichier.
        </p>
        <a class="btn" href="<?php echo htmlspecialchars(DOWNLOAD_URL); ?>">
          Télécharger le .exe
        </a>
        <p class="version">
          Windows 10/11 · 64 bits<?php if ($release && !empty($release['version'])): ?> · Version <?php echo htmlspecialchars($release['version']); ?><?php endif; ?>
        </p>
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
