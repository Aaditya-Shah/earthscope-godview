<?php
declare(strict_types=1);

// Compatibility helpers keep the UI/config loader usable on older shared-host PHP builds.
if (!function_exists('str_contains')) {
    function str_contains(string $haystack, string $needle): bool { return $needle === '' || strpos($haystack, $needle) !== false; }
}
if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool { return $needle === '' || strpos($haystack, $needle) === 0; }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with(string $haystack, string $needle): bool { return $needle === '' || substr($haystack, -strlen($needle)) === $needle; }
}

/**
 * EARTHSCOPE configuration. Keep secrets server-side.
 * Copy config.local.php.example to config.local.php and add keys there.
 */
$defaults = [
    'app_name' => 'EARTHSCOPE',
    'app_env' => 'production',
    'db_host' => 'localhost',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',
    'db_charset' => 'utf8mb4',
    'openrouter_api_key' => '',
    'openrouter_model' => 'openrouter/free',
    'openrouter_fallback_model' => 'openrouter/free',
    'openrouter_vision_model' => '',
    'openrouter_tts_model' => 'fish-audio/s2.1-pro-free:free',
    'openrouter_stt_model' => 'openai/whisper-large-v3-turbo',
    'openrouter_site_url' => '',
    'openrouter_app_name' => 'EARTHSCOPE Earth Intelligence',
    'firms_map_key' => '',
    'data_gov_in_api_key' => '',
    // TheMealDB V1: '1' is for development/educational testing. Configure a proper supporter key for a public production deployment.
    'themealdb_api_key' => '1',
    // Optional API Ninjas account key. Used only server-side; never expose it to browser JS.
    'api_ninjas_api_key' => '',
    'api_ninjas_mcp_endpoint' => 'https://mcp.api-ninjas.com/mcp',
    // Optional aviation metadata provider. Keep key private; the free plan has very limited monthly requests.
    'aviationstack_api_key' => '',
    'nominatim_user_agent' => 'EARTHSCOPE/1.0 (configure your contact email in config.local.php)',
    'cache_ttl_seconds' => [
        'earthquakes' => 180,
        'events' => 600,
        'weather' => 600,
        'geocode' => 86400,
        'nisar' => 3600,
        'fires' => 900,
    ],
];
$local = __DIR__ . '/config.local.php';
$localConfigState = 'not_present';
if (is_file($local)) {
    try {
        $custom = require $local;
        if (is_array($custom)) {
            $defaults = array_replace_recursive($defaults, $custom);
            $localConfigState = 'loaded';
        } else {
            $localConfigState = 'invalid_return_value';
            error_log('EARTHSCOPE: config.local.php must return an array; defaults retained.');
        }
    } catch (Throwable $e) {
        // A malformed optional private config must not take down the public landing page.
        $localConfigState = 'load_error';
        error_log('EARTHSCOPE: unable to load config.local.php (' . get_class($e) . '); defaults retained.');
    }
}
$defaults['_diagnostics'] = ['local_config_state' => $localConfigState];
return $defaults;
