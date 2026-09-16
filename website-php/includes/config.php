<?php

define('GITHUB_REPO', 'OmgaCraft/ngbe-launcher');
define('DOWNLOAD_URL', 'https://github.com/' . GITHUB_REPO . '/releases/latest/download/NGBE-Launcher.exe');

/**
 * Fetches the latest release version from GitHub, cached to a temp file
 * for a few minutes so we don't hit the API on every page load.
 */
function ngbe_fetch_latest_release() {
    $cacheFile = sys_get_temp_dir() . '/ngbe_latest_release.json';
    $cacheTtl = 300;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($cached)) {
            return $cached;
        }
    }

    $url = 'https://api.github.com/repos/' . GITHUB_REPO . '/releases/latest';
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

    $result = [
        'version' => $data['tag_name'],
    ];
    @file_put_contents($cacheFile, json_encode($result));

    return $result;
}
