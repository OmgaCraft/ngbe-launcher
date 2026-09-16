<?php
require __DIR__ . '/includes/config.php';
$currentPage = 'accueil';
require __DIR__ . '/includes/header.php';
?>
      <section class="hero">
        <img class="hero-logo" src="assets/logo.svg" alt="" />
        <h1>NGBE Launcher</h1>
        <p class="tagline">
          Un launcher pour Minecraft Bedrock qui te donne un accès direct aux serveurs
          de NationsGlory Bedrock Edition (HUB, Alpha, Sigma, Omega, Delta, Epsilon…),
          ou au mode solo, en un clic.
        </p>
        <a class="btn" href="telechargement.php">Télécharger le launcher</a>
      </section>

      <section class="features">
        <div class="feature-card">
          <h3>Serveurs prédéfinis</h3>
          <p>Rejoins le HUB, Alpha, Sigma, Omega, Delta, Epsilon ou NG Island directement, sans chercher l'adresse à chaque fois.</p>
        </div>
        <div class="feature-card">
          <h3>Mode Solo</h3>
          <p>Un bouton pour lancer Minecraft Bedrock directement, sans passer par un serveur.</p>
        </div>
        <div class="feature-card">
          <h3>Profil en direct</h3>
          <p>Affiche ton pseudo, ta description, ton pays, ton rang et ton temps de jeu à partir des données publiques de NationsGlory.</p>
        </div>
      </section>

      <div class="notice">
        <strong>Avertissement :</strong> ce site et ce launcher sont un projet communautaire indépendant.
        Ils ne sont ni développés, ni gérés, ni affiliés à NationsGlory ou à WebNations SARL.
        Les noms, serveurs et logos NationsGlory cités appartiennent à leurs propriétaires respectifs.
      </div>
<?php require __DIR__ . '/includes/footer.php'; ?>
