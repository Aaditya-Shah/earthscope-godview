<?php
declare(strict_types=1);

/**
 * EARTHSCOPE Local Private Configuration (Server-Side Only)
 *
 * Blank template. Add your own keys on the server / local machine only.
 * Never commit real API keys to a public repository.
 */
return [
    'app_name' => 'EARTHSCOPE',
    'app_env' => 'production',
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
];