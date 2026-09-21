<?php

define('GITHUB_REPO', 'OmgaCraft/ngbe-launcher');
define('DOWNLOAD_URL', 'https://github.com/' . GITHUB_REPO . '/releases/latest/download/NGBE-Launcher.exe');

define('ANDROID_REPO', 'OmgaCraft/ngbe-launcher-android');
define('ANDROID_RELEASES_URL', 'https://github.com/' . ANDROID_REPO . '/releases');

/**
 * Fetches a repo's latest GitHub release (tag, html_url, matching asset
 * download URL), cached to a temp file for a few minutes per repo so we
 * don't hit the API on every page load. Returns null if there's no
 * release yet or the request fails — callers should degrade gracefully.
 */
function ngbe_fetch_latest_release($repo, $assetSuffix = null) {
    $cacheFile = sys_get_temp_dir() . '/ngbe_latest_release_' . md5($repo) . '.json';
    $cacheTtl = 300;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($cached)) {
            return $cached;
        }
    }

    $url = 'https://api.github.com/repos/' . $repo . '/releases/latest';
    $response = false;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['User-Agent: NGBE-Launcher-Website', 'Accept: application/vnd.github+json'],
            CURLOPT_TIMEOUT => 5,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);
    }

    if ($response === false && ini_get('allow_url_fopen')) {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "User-Agent: NGBE-Launcher-Website\r\nAccept: application/vnd.github+json\r\n",
                'timeout' => 5,
            ],
        ]);
        $response = @file_get_contents($url, false, $context);
    }

    if ($response === false) {
        return null;
    }

    $data = json_decode($response, true);
    if (!is_array($data) || !isset($data['tag_name'])) {
        return null;
    }

    $assetUrl = null;
    if ($assetSuffix && !empty($data['assets'])) {
        foreach ($data['assets'] as $asset) {
            if (substr($asset['name'], -strlen($assetSuffix)) === $assetSuffix) {
                $assetUrl = $asset['browser_download_url'];
                break;
            }
        }
    }

    $result = [
        'version' => $data['tag_name'],
        'html_url' => $data['html_url'],
        'asset_url' => $assetUrl,
    ];
    @file_put_contents($cacheFile, json_encode($result));

    return $result;
}

/** Very small check — only distinguishes Android from everything else for now. */
function ngbe_is_android_visitor() {
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    return stripos($ua, 'android') !== false;
}
