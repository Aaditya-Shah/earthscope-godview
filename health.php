<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
$root = __DIR__;
$checks = [];
$checks['index_exists'] = is_file($root . '/index.php');
$checks['api_exists'] = is_file($root . '/api.php');
$checks['assets_exists'] = is_dir($root . '/assets');
$checks['storage_exists'] = is_dir($root . '/storage');
$checks['storage_writable'] = is_dir($root . '/storage') && is_writable($root . '/storage');
$checks['cache_writable'] = is_dir($root . '/storage/cache') && is_writable($root . '/storage/cache');
$checks['ratelimit_writable'] = is_dir($root . '/storage/ratelimit') && is_writable($root . '/storage/ratelimit');
$checks['config_php_exists'] = is_file($root . '/config.php');
$checks['local_config_present'] = is_file($root . '/config.local.php');
$configStatus = 'not_checked';
$config = [];
try {
    if (is_file($root . '/config.php')) {
        $loaded = require $root . '/config.php';
        if (is_array($loaded)) {
            $config = $loaded;
            $configStatus = isset($loaded['_diagnostics']['local_config_state']) ? (string)$loaded['_diagnostics']['local_config_state'] : 'loaded';
        } else {
            $configStatus = 'invalid_return_value';
        }
    } else {
        $configStatus = 'config_missing';
    }
} catch (Throwable $e) {
    $configStatus = 'load_error';
    error_log('EARTHSCOPE health check: config load failed (' . get_class($e) . ').');
}
$checks['config_status'] = $configStatus;
$checks['php_version_supported'] = version_compare(PHP_VERSION, '7.4.0', '>=');
$checks['php_version_recommended'] = version_compare(PHP_VERSION, '8.2.0', '>=');
$checks['json_extension'] = extension_loaded('json');
$checks['openssl_extension'] = extension_loaded('openssl');
$checks['curl_extension'] = extension_loaded('curl');
$checks['https_streams_enabled'] = filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN);
$checks['configured_openrouter'] = !empty($config['openrouter_api_key']) && strpos((string)$config['openrouter_api_key'], 'ADD_') === false;
$checks['configured_firms'] = !empty($config['firms_map_key']) && strpos((string)$config['firms_map_key'], 'ADD_') === false;
$checks['configured_mandi_api'] = !empty($config['data_gov_in_api_key']) && strpos((string)$config['data_gov_in_api_key'], 'ADD_') === false;
$checks['configured_api_ninjas'] = !empty($config['api_ninjas_api_key']) && strpos((string)$config['api_ninjas_api_key'], 'ADD_') === false;
$mysqlReady = !empty($config['db_name']) && !empty($config['db_user']) && extension_loaded('pdo_mysql');
$sqliteReady = extension_loaded('pdo_sqlite') && is_dir($root . '/storage') && is_writable($root . '/storage');
$checks['configured_database'] = $mysqlReady || $sqliteReady;
$checks['database_driver'] = $mysqlReady ? 'mysql' : ($sqliteReady ? 'sqlite' : 'none');
$critical = $checks['index_exists'] && $checks['config_php_exists'] && $checks['php_version_supported'];
http_response_code($critical ? 200 : 503);
echo json_encode([
  'ok' => $critical,
  'app' => 'EARTHSCOPE',
  'release' => '4.0.0',
  'checked_at_utc' => gmdate('c'),
  'php_version' => PHP_VERSION,
  'server' => isset($_SERVER['SERVER_SOFTWARE']) ? preg_replace('/[^A-Za-z0-9 ._()\/-]/', '', (string)$_SERVER['SERVER_SOFTWARE']) : 'unknown',
  'checks' => $checks,
  'next_step' => !$critical ? 'Select a supported PHP version and verify that index.php and config.php are uploaded to the web root.' : (($configStatus === 'load_error' || $configStatus === 'invalid_return_value') ? 'Check config.local.php syntax in cPanel; fallback defaults are being used.' : ((!$checks['storage_writable'] || !$checks['cache_writable'] || !$checks['ratelimit_writable']) ? 'Correct storage/cache and storage/ratelimit directory ownership and permissions.' : 'If index.php still returns HTTP 500, inspect cPanel Metrics > Errors or the PHP error log for the exact fatal error.'))
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
