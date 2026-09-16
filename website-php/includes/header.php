<?php
$currentPage = $currentPage ?? '';
$pageTitle = $pageTitle ?? null;
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title><?php echo $pageTitle ? htmlspecialchars($pageTitle) . ' — NGBE Launcher' : 'NGBE Launcher'; ?></title>
<link rel="icon" href="assets/logo.svg" type="image/svg+xml" />
<link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="index.php">
        <img src="assets/logo.svg" alt="" />
        NGBE Launcher
      </a>
      <nav class="site-nav">
        <a href="index.php" class="<?php echo $currentPage === 'accueil' ? 'active' : ''; ?>">Accueil</a>
        <a href="telechargement.php" class="<?php echo $currentPage === 'telechargement' ? 'active' : ''; ?>">Téléchargement</a>
        <a href="faq.php" class="<?php echo $currentPage === 'faq' ? 'active' : ''; ?>">FAQ</a>
      </nav>
    </div>
  </header>

  <main>
    <div class="wrap">
