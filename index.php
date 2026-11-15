<?php
declare(strict_types=1);
$configLoadError = false;
try {
    $loadedConfig = require __DIR__ . '/config.php';
    if (!is_array($loadedConfig)) throw new RuntimeException('Configuration must return an array.');
    $config = $loadedConfig;
} catch (Throwable $e) {
    error_log('EARTHSCOPE: config.php could not be loaded (' . get_class($e) . ').');
    $configLoadError = true;
    $config = ['app_name'=>'EARTHSCOPE','openrouter_api_key'=>'','firms_map_key'=>'','data_gov_in_api_key'=>''];
}
$aiEnabled = !empty($config['openrouter_api_key']) && !str_contains((string)$config['openrouter_api_key'], 'ADD_');
$firmsEnabled = !empty($config['firms_map_key']) && !str_contains((string)$config['firms_map_key'], 'ADD_');
$assetVersion = '4.8.0';
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f4f8ff" id="meta-theme-color">
<meta name="description" content="EARTHSCOPE — explore Earth observations, weather, radar, surface temperature and natural events with source-backed AI, crop screening and area data exports.">
<title>EARTHSCOPE — Earth Intelligence</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="assets/earthscope-mark.svg" type="image/svg+xml">
<link href="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css" rel="stylesheet">
<link href="assets/app.css?v=<?=$assetVersion?>" rel="stylesheet">
<link href="assets/theme-light.css?v=<?=$assetVersion?>" rel="stylesheet">
<link href="assets/theme-modes.css?v=<?=$assetVersion?>" rel="stylesheet">
<link href="assets/earthscope-plus.css?v=<?=$assetVersion?>" rel="stylesheet">
<link href="assets/studio-v3.css?v=<?=$assetVersion?>" rel="stylesheet">
<link href="assets/live-explore.css?v=<?=$assetVersion?>" rel="stylesheet">
<link href="assets/godseye-exclusive.css?v=<?=$assetVersion?>" rel="stylesheet">
<script>try{if(localStorage.getItem("earthscope-discovery-dismissed-v1")==="1")document.documentElement.classList.add("earthscope-discovery-dismissed")}catch(e){}</script>
</head>
<body>
<?php if ($configLoadError): ?>
<div role="alert" style="padding:12px 18px;background:#fff3cd;color:#664d03;border-bottom:1px solid #ffecb5;font:14px/1.5 system-ui,sans-serif">EARTHSCOPE configuration could not be loaded. The interface is in safe fallback mode. Open <a href="health.php">server diagnostics</a> and check the cPanel PHP error log; AI and live API features may be unavailable.</div>
<?php elseif (($config['_diagnostics']['local_config_state'] ?? '') === 'load_error' || ($config['_diagnostics']['local_config_state'] ?? '') === 'invalid_return_value'): ?>
<div role="status" style="padding:12px 18px;background:#fff3cd;color:#664d03;border-bottom:1px solid #ffecb5;font:14px/1.5 system-ui,sans-serif">EARTHSCOPE is running with default settings because config.local.php could not be loaded. Check its PHP syntax in cPanel; the public interface remains available.</div>
<?php endif; ?>
<div class="app-shell">
  <aside class="sidebar" id="sidebar">
    <a class="brand" href="#home" aria-label="EARTHSCOPE home">
      <span class="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="1.7"/><ellipse cx="20" cy="20" rx="6.7" ry="14" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 15h26M6 21h28M9 27h22" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="29.5" cy="9.5" r="3" fill="#67e8f9"/></svg></span>
      <span class="brand-word"><strong>EARTHSCOPE</strong><small>EARTH INTELLIGENCE</small></span>
    </a>
    <div class="mission-card">
      <div class="mission-kicker"><span class="pulse-dot"></span> PLANETARY OBSERVATORY</div>
      <div class="mission-title">Explore what is changing.</div>
      <div class="mission-copy">One globe. Multiple evidence sources. Clear uncertainty.</div>
    </div>
    <div class="nav-label">WORKSPACE</div>
    <nav class="primary-nav" aria-label="Main navigation">
      <button class="nav-item active" data-panel="ai"><span class="nav-ico">✳</span><span>AI Earth Explorer</span><span class="nav-tag">NEW</span></button>
      <button class="nav-item" data-panel="explore"><span class="nav-ico">◉</span><span>Globe explorer</span><kbd>G</kbd></button>
      <button class="nav-item" data-panel="godseye"><span class="nav-ico">👁️</span><span>God's Eye</span><span class="nav-tag">MAP</span></button>
      <button class="nav-item" data-panel="farm"><span class="nav-ico">♧</span><span>Crop Atlas & farm plan</span></button>
      <button class="nav-item" data-panel="vision"><span class="nav-ico">◉</span><span>YOLO Vision Lab</span><span class="nav-tag">BETA</span></button>
      <button class="nav-item" data-panel="food"><span class="nav-ico">♨</span><span>Food Studio</span></button>
      <button class="nav-item" data-panel="events"><span class="nav-ico">⌁</span><span>Event radar</span><span class="nav-count" id="nav-event-count">—</span></button>
      <button class="nav-item" data-panel="radar"><span class="nav-ico">☂</span><span>Rain radar</span><span class="nav-tag">2H</span></button>
      <button class="nav-item" data-panel="archive"><span class="nav-ico">▦</span><span>NISAR archive</span><span class="nav-tag">SAR</span></button>
      <button class="nav-item" data-panel="weather"><span class="nav-ico">◌</span><span>Weather & crops</span></button>
      <button class="nav-item" data-panel="compare"><span class="nav-ico">⇄</span><span>Time compare</span></button>
      <button class="nav-item" data-panel="sources"><span class="nav-ico">⌘</span><span>Data sources</span></button>
      <button class="nav-item" data-panel="saved"><span class="nav-ico">☆</span><span>Saved places</span></button>
      <button class="nav-item" data-panel="play"><span class="nav-ico">⌁</span><span>3D Expedition Lab</span><span class="nav-tag">BETA</span></button>
      <a class="nav-item docs-nav-link" href="docs.php"><span class="nav-ico">▤</span><span>Project documentation</span><span class="nav-tag">DOCS</span></a>
    </nav>
    <div class="sidebar-spacer"></div>
    <div class="source-status-mini">
      <div class="status-mini-head"><span class="status-dot good"></span><strong id="connection-label">Connecting sources</strong></div>
      <p id="connection-sub">Checking public feeds…</p>
      <div class="status-line"><span>USGS earthquakes</span><b id="side-usgs">···</b></div>
      <div class="status-line"><span>NASA EONET</span><b id="side-eonet">···</b></div>
      <div class="status-line"><span>Open-Meteo</span><b id="side-weather">···</b></div>
    </div>
    <div class="sidebar-footer"><span class="avatar">NH</span><div><strong>NExHUNTER</strong><small>Earth science workspace</small></div><button class="icon-button tiny" id="sidebar-collapse" aria-label="Collapse sidebar">‹</button></div>
  </aside>

  <main class="main-content" id="main-content">
    <header class="topbar">
      <div class="mobile-brand"><span class="brand-mark small-mark">◉</span><strong>EARTHSCOPE</strong></div>
      <button class="mobile-menu icon-button" id="mobile-menu" aria-label="Open navigation">☰</button>
      <form id="search-form" class="global-search" role="search">
        <span class="search-symbol">⌕</span><input id="location-search" type="search" placeholder="Search any place, region or coordinates…" autocomplete="off" aria-label="Search locations">
        <span class="search-hint">ENTER</span>
        <div class="search-results" id="search-results" hidden></div>
      </form>
      <div class="top-actions">
        <div class="live-pill" title="Data feeds update according to source availability"><span class="pulse-dot"></span><span id="live-label">FEEDS ONLINE</span></div>
        <button class="icon-button top-icon" id="locate-btn" aria-label="Locate me" title="Use current location">◎</button>
        <button class="icon-button top-icon" id="refresh-btn" aria-label="Refresh data" title="Refresh data">↻</button>
        <button class="theme-switch" id="theme-switch" type="button" aria-label="Switch colour theme" title="Switch between Light, Dark and Night themes"><span id="theme-glyph" aria-hidden="true">☀</span><span id="theme-name">Light</span></button>
        <a class="docs-button" href="docs.php" title="Open full EARTHSCOPE project documentation"><span aria-hidden="true">▤</span><span>Docs</span></a><button class="assistant-top" id="open-assistant"><span>✳</span><span>Ask Earth</span><kbd>AI</kbd></button>
      </div>
    </header>

    <section class="workspace earth-ai-workspace" id="panel-ai">
      <div class="earth-ai-page">
        <div class="earth-ai-header"><span class="eyebrow">EARTH INTELLIGENCE · NATURAL LANGUAGE</span><div class="ai-mode-pill"><span class="pulse-dot"></span> Evidence-aware tools</div></div>
        <div class="earth-ai-hero">
          <div class="earth-ai-copy"><div class="ai-orbit-mark">✳</div><h1>What do you want to know <span>about Earth?</span></h1><p>Ask about places to visit, the best crops for a pinned plot, seasonal foods, herbs, weather or changing hazards. Get an answer with maps, structured cards and the available source data.</p>
            <form id="planet-prompt-form" class="planet-prompt-form"><textarea id="planet-prompt" rows="2" maxlength="1200" placeholder="Try: Plan a 3-day nature trip next month under ₹15,000, avoiding heavy rain…" aria-label="Ask Earth in natural language"></textarea><div class="prompt-bottom"><span><span class="prompt-spark">✳</span> Answers may use live sources and optional AI</span><button type="submit" id="planet-submit"><span>Explore</span><b>↗</b></button></div></form>
            <div class="prompt-examples"><button type="button" data-planet-prompt="Which fruits and vegetables could suit my selected plot over the next 3 months? Compare water needs, season, heat risk and market-price data availability.">🌱 What can I grow here?</button><button type="button" data-planet-prompt="Plan a nature-focused trip this month for a modest budget. Compare weather, season and the key uncertainty for each destination.">✈ Plan a trip</button><button type="button" data-planet-prompt="I have tomatoes, eggs, rice and spinach. Suggest an affordable healthy meal with ingredients, steps, substitutions and an estimated cost I can edit.">🥗 What can I cook?</button><button type="button" data-planet-prompt="Find mapped medicinal-herb shops, nurseries and produce markets around my selected pin. Show their distance and source limitations.">📍 Find nearby herbs</button></div>
          </div>
          <div class="earth-ai-visual"><div class="ai-visual-top"><span>EXPLORATION CANVAS</span><button type="button" id="ai-use-pin">◎ Use selected map pin</button></div><div class="ai-globe-scene"><div class="ai-globe-orbit orbit-one"></div><div class="ai-globe-orbit orbit-two"></div><div class="ai-globe"><div class="globe-grid-lines"></div><span class="globe-pin pin-one">✦</span><span class="globe-pin pin-two">•</span><span class="globe-pin pin-three">•</span></div><div class="globe-legend"><span><i class="dot-weather"></i> Weather</span><span><i class="dot-crops"></i> Crops & ecology</span><span><i class="dot-events"></i> Natural events</span></div></div><div class="ai-pin-summary" id="ai-pin-summary"><span class="pin-summary-icon">◎</span><div><b>No map pin selected yet</b><small>Choose a point in Globe Explorer to personalize forecasts, crop screening and nearby-place searches.</small></div><button type="button" id="ai-pin-map">Select pin</button></div></div>
        </div>
        <div class="earth-ai-capabilities"><button type="button" class="ai-capability-card" data-go-panel="explore"><span class="cap-icon cap-blue">◎</span><span><b>Explore the planet</b><small>Normal street map & 100% max-zoom Google Earth satellite imagery, weather, quakes, fires & storms.</small></span><span class="cap-arrow">↗</span></button><button type="button" class="ai-capability-card" data-go-panel="godseye"><span class="cap-icon cap-green" style="background:rgba(16,185,129,0.18);color:#10b981;">👁️</span><span><b>God's Eye OSINT Command Center</b><small>Panopticon tactical HUD, FLIR/NVG/SAR shaders, live ADS-B + Aviationstack radar, orbital satellites & OSINT recon.</small></span><span class="cap-arrow">↗</span></button><button type="button" class="ai-capability-card" data-go-panel="farm"><span class="cap-icon cap-green">♧</span><span><b>Grow & plan</b><small>Browse crop families, screen climate fit, calculate unit economics and print an A4 field report.</small></span><span class="cap-arrow">↗</span></button><button type="button" class="ai-capability-card" data-go-panel="food"><span class="cap-icon cap-orange">♨</span><span><b>Cook something good</b><small>Use your ingredients to generate dishes, budget costs and seasonal food ideas.</small></span><span class="cap-arrow">↗</span></button></div>
        <div class="planet-result-area" id="planet-result-area" hidden><div class="planet-result-heading"><div><span class="eyebrow">YOUR EXPLORATION</span><h2 id="planet-result-title">Earth answer</h2></div><button type="button" class="outline-button" id="planet-clear">Clear</button></div><div id="planet-result-content"></div></div>
        <div class="ai-transparency"><span>ⓘ</span><span><b>Good decisions need evidence.</b> Forecasts are model output; mapped places may be incomplete; crop-fit scores are screening indices; market prices and profit depend on crop, quality, timing and location. EARTHSCOPE shows source gaps rather than filling them with invented certainty.</span></div>
      </div>
    </section>

    <section class="workspace" id="panel-explore" hidden>
      <div class="map-stage" id="map-stage">
        <div class="map-wrap"><div id="map" aria-label="Interactive Earth map"></div><div id="compare-map" aria-label="Comparison satellite map" hidden></div></div>
        <div class="map-top-left">
          <div class="map-mode-chip"><span class="mode-cube">◇</span><div><b>EARTH OBSERVATORY</b><small id="map-mode-sub">GLOBAL VIEW · MULTI-SOURCE</small></div></div>
          <form id="map-search-form" class="map-search" role="search" autocomplete="off">
            <span class="map-search-symbol" aria-hidden="true">⌕</span>
            <input id="map-location-search" type="search" placeholder="Search places, addresses, landmarks…" aria-label="Search places on the map" autocomplete="off">
            <button type="submit" aria-label="Go to place">Go ↗</button>
            <div class="map-search-results" id="map-search-results" hidden></div>
          </form>
          <div class="map-pin-tip"><span>📍</span> Click anywhere on the map to drop a pin</div>
        </div>
        <div class="discovery-dock" id="discovery-dock" aria-label="Quick explore destinations"><span class="discovery-label">QUICK EXPLORE</span><button type="button" data-discover="everest">Everest</button><button type="button" data-discover="amazon">Amazon</button><button type="button" data-discover="sahara">Sahara</button><button type="button" data-discover="reef">Great Barrier Reef</button><button type="button" data-discover="iceland">Iceland</button><button type="button" data-discover="tokyo">Tokyo</button><button type="button" data-discover="maldives">Maldives</button><button type="button" class="discovery-dismiss" id="dismiss-discovery" title="Hide quick destinations" aria-label="Hide quick destinations">×</button></div>
        <div class="map-top-right">
          <button class="map-tool active" id="toggle-globe" title="Globe view"><span>◎</span><em>GLOBE</em></button>
          <button class="map-tool active" id="toggle-normal-map" title="Normal street map (without satellite view)"><span>🗺️</span><em>NORMAL MAP</em></button>
          <button class="map-tool" id="toggle-satellite" title="Toggle Google Earth + NASA GIBS satellite imagery"><span>▧</span><em>SATELLITE</em></button>
          <button class="map-tool" id="toggle-godseye-top" title="Toggle God's Eye OSINT Command Center"><span>👁️</span><em>GOD'S EYE</em></button>
          <button class="map-tool" id="toggle-fullscreen" title="Toggle fullscreen mode"><span>⛶</span><em>FULLSCREEN</em></button>
          <button class="map-tool" id="toggle-compare" title="Compare two image dates"><span>⇄</span><em>COMPARE</em></button>
          <button class="map-tool" id="toggle-sound" title="Sonify selected observations"><span>♫</span><em>SONIFY</em></button>
          <button class="map-tool" id="toggle-layers" title="Show map layers"><span>☷</span><em>LAYERS</em></button>
        </div>
        <div class="layer-popover" id="layer-popover" hidden>
          <div class="popover-title">MAP LAYERS <button class="icon-button tiny" id="close-layers">×</button></div>
          <label class="layer-toggle"><span class="layer-swatch quakes"></span><span><b>Earthquakes</b><small>USGS · last 24 hours</small></span><input type="checkbox" id="layer-quakes" checked></label>
          <label class="layer-toggle"><span class="layer-swatch events"></span><span><b>Natural events</b><small>NASA EONET · open event catalogue</small></span><input type="checkbox" id="layer-events" checked></label>
          <div class="layer-group-label">DISCOVER THE PLANET</div>
          <label class="layer-toggle"><span class="layer-swatch city-lights"></span><span><b>Major cities & places</b><small>Curated reference locations · tap a pin for local context</small></span><input type="checkbox" id="layer-cities" checked></label>
          <label class="layer-toggle"><span class="layer-swatch night-lights"></span><span><b>Earth at night</b><small>NASA VIIRS day/night band · satellite observation</small></span><input type="checkbox" id="layer-nightlights"></label>
          <div class="layer-group-label">GLOBAL DISASTER ALERTS · MULTI-HAZARD</div>
          <label class="layer-toggle"><span class="layer-swatch disasters"></span><span><b>GDACS disaster alerts</b><small>Earthquakes, tropical cyclones, floods, volcanoes, droughts, wildfires and other reported hazards</small></span><input type="checkbox" id="layer-gdacs"></label>
          <label class="layer-subcontrol">Disaster type<select id="gdacs-event-filter"><option value="all">All reported hazards</option><option value="FL">Floods</option><option value="TC">Tropical cyclones</option><option value="EQ">Earthquakes</option><option value="VO">Volcanoes</option><option value="DR">Droughts</option><option value="WF">Wildfires</option><option value="EP">Epidemics / health events (where reported)</option><option value="TS">Tsunamis (where reported)</option></select></label>
          <div class="layer-foot">Source: GDACS. Alerts are not exhaustive and are not a substitute for official emergency instructions.</div>
          <div class="layer-group-label">AIR TRAFFIC</div>
          <label class="layer-toggle"><span class="layer-swatch aircraft"></span><span><b>Live nearby aircraft</b><small>ADSB.lol public ADS-B feed · receiver coverage varies</small></span><input type="checkbox" id="layer-aircraft"></label>
          <label class="layer-subcontrol">Search radius<select id="aircraft-radius"><option value="50">50 nautical miles</option><option value="100" selected>100 nautical miles</option><option value="150">150 nautical miles</option><option value="250">250 nautical miles</option></select></label>
          <div class="layer-inline-actions"><button type="button" class="outline-button" id="refresh-aircraft">Refresh ADS-B flights</button><button type="button" class="outline-button" id="refresh-aviationstack">Use Aviationstack API key</button></div>
          <div class="layer-foot">Aviationstack may consume your limited monthly quota. No API keys are embedded in this page; see Docs → API configuration.</div>
          <div class="layer-group-label">FOCUSED EVENT CATEGORIES · WHEN REPORTED</div>
          <label class="layer-toggle"><span class="layer-swatch landslides"></span><span><b>Landslides</b><small>NASA EONET category records</small></span><input type="checkbox" id="layer-landslides"></label>
          <label class="layer-toggle"><span class="layer-swatch floods"></span><span><b>Flood events</b><small>NASA EONET category records</small></span><input type="checkbox" id="layer-floods"></label>
          <label class="layer-toggle"><span class="layer-swatch wildfires"></span><span><b>Wildfire events</b><small>EONET records; separate FIRMS layer</small></span><input type="checkbox" id="layer-wildfires"></label>
          <label class="layer-toggle"><span class="layer-swatch volcanoes"></span><span><b>Volcanoes</b><small>NASA EONET category records</small></span><input type="checkbox" id="layer-volcanoes"></label>
          <label class="layer-toggle"><span class="layer-swatch storms"></span><span><b>Severe storms</b><small>NASA EONET category records</small></span><input type="checkbox" id="layer-storms"></label>
          <label class="layer-toggle"><span class="layer-swatch fires"></span><span><b>Active fire detections</b><small>NASA FIRMS · optional key</small></span><input type="checkbox" id="layer-fires"></label>
          <label class="layer-toggle"><span class="layer-swatch satellite"></span><span><b>Satellite imagery</b><small>NASA GIBS · date-based</small></span><input type="checkbox" id="layer-satellite"></label>
          <label class="layer-toggle"><span class="layer-swatch surface-temp"></span><span><b>Land surface temperature</b><small>NASA MODIS Terra · hot/cold surface pattern</small></span><input type="checkbox" id="layer-surface-temp"></label>
          <div class="layer-group-label">ENVIRONMENT & AGRICULTURE · SEPARATE LAYERS</div>
          <label class="layer-toggle"><span class="layer-swatch soil-layer-swatch"></span><span><b>Soil properties</b><small>ISRIC SoilGrids · gridded estimate, not a field test</small></span><input type="checkbox" id="layer-soil-map"></label>
          <label class="layer-subcontrol">Soil property<select id="soil-map-property"><option value="phh2o">Soil pH · water</option><option value="clay">Clay content</option><option value="sand">Sand content</option><option value="soc">Soil organic carbon</option><option value="nitrogen">Soil nitrogen</option><option value="cec">Cation exchange capacity</option></select></label>
          <label class="layer-toggle"><span class="layer-swatch crop-layer-swatch"></span><span><b>Crop / vegetation map</b><small>NASA global croplands reference or vegetation greenness</small></span><input type="checkbox" id="layer-crop-map"></label>
          <label class="layer-subcontrol">Crop / vegetation product<select id="crop-map-product"><option value="cropland">Global croplands reference · circa 2000</option><option value="ndvi">MODIS vegetation index · NDVI</option></select></label>
          <div class="layer-external-tool"><b>Crop suitability & potential yield</b><p>Open FAO SoilFER CropSuit for its supported crops and regions. It is a modeled screening result, not a guarantee for your specific field.</p><a href="https://data.apps.fao.org/soilfer/cropsuit" target="_blank" rel="noopener">Open official FAO CropSuit ↗</a></div>
          <label class="layer-toggle"><span class="layer-swatch aqi-layer-swatch"></span><span><b>Air quality · AQI</b><small>Open-Meteo/CAMS model grid · not station observations</small></span><input type="checkbox" id="layer-aqi-map"></label>
          <div class="env-map-legend" aria-label="Map layer legends">
            <div class="env-legend-block"><b id="aqi-legend-title">US AQI colour guide</b><div id="aqi-legend-items"><div><i style="--legend:#65bb72"></i>0–50 Good</div><div><i style="--legend:#d8cb47"></i>51–100 Moderate</div><div><i style="--legend:#ee9b40"></i>101–150 Sensitive groups</div><div><i style="--legend:#e85f50"></i>151–200 Unhealthy</div><div><i style="--legend:#a963bd"></i>201–300 Very unhealthy</div><div><i style="--legend:#8e263b"></i>301+ Hazardous</div></div></div>
            <div class="env-legend-block"><b>How to read these overlays</b><p>Soil colours are property-specific ISRIC WMS estimates; units and stretches differ by layer. Croplands is a circa-2000 reference. NDVI measures vegetation greenness, not crop identity. AQI colors use the selected index system; model cells are not monitor locations.</p></div>
          </div>
          <div class="layer-foot" id="environment-layer-note">Enable a layer above. Soil and crop layers are gridded or satellite products; AQI cells show atmospheric-model values, not certified monitor readings.</div>
          <label class="layer-toggle"><span class="layer-swatch radar-swatch"></span><span><b>Rain radar</b><small>RainViewer · recent past frames</small></span><input type="checkbox" id="layer-radar"></label>
          <div class="radar-timeline-menu" id="radar-timeline-menu" hidden><div class="radar-timeline-head"><b id="radar-frame-label">Radar frame</b><span id="radar-frame-time">—</span></div><input type="range" id="radar-frame-slider" min="0" max="11" value="11" step="1" aria-label="Choose radar time frame"><div class="radar-range-labels"><span>Older</span><span>Latest available</span></div><small>RainViewer free API provides the recent past radar frames, not forecast/nowcast frames. RainViewer attribution required.</small></div>
          <label class="layer-toggle"><span class="layer-swatch terrain"></span><span><b>3D terrain relief</b><small>AWS Terrain Tiles · DEM</small></span><input type="checkbox" id="layer-terrain"></label>
          <div class="layer-foot" id="firms-layer-note">FIRMS layer activates when a free MAP_KEY is configured.</div>
        </div>
        <div class="map-bottom-left"><span class="map-coord" id="map-coord">20.0000° N · 0.0000° E</span><span class="map-scale">LIVE DATA · SOURCE-TIMESTAMPED</span></div>
        <div class="map-controls"><button id="zoom-in" aria-label="Zoom in">＋</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="reset-globe" aria-label="Reset globe">⌖</button></div>
        <button class="reopen-inspector" id="reopen-inspector" hidden>Show insights ↗</button>
        <div class="map-legend" id="map-legend"><span><i class="legend-dot quake-dot"></i> Earthquakes</span><span><i class="legend-dot event-dot"></i> Natural events</span></div>
        <div class="map-loading" id="map-loading"><span class="loader-ring"></span><b>Initializing Earth view</b><small>Loading base map and public feeds</small></div>
      </div>

      <aside class="inspector" id="inspector">
        <div class="inspector-header"><div><div class="eyebrow">INTELLIGENCE PANEL</div><h1 id="inspector-title">Earth at a glance</h1></div><button class="icon-button" id="inspector-close" aria-label="Close panel">×</button></div>
        <p class="inspector-intro" id="inspector-intro">Select any point, event or layer to inspect source-backed context.</p>
        <div class="selected-location" id="selected-location"><div class="location-icon">⌖</div><div class="loc-text"><strong id="selected-name">Global view</strong><small id="selected-coords">Select a place on the map</small></div><button class="icon-button tiny" id="copy-coords" title="Copy coordinates">⧉</button><button class="icon-button tiny" id="save-place" title="Save place to MySQL workspace" disabled>☆</button></div>
        <div class="section-heading"><span>LOCAL CONDITIONS</span><span class="data-badge" id="weather-age">ON SELECT</span></div>
        <div class="weather-grid" id="weather-grid">
          <div class="weather-stat"><div class="stat-icon amber">☀</div><div><span>Temperature</span><b id="weather-temp">—</b></div></div>
          <div class="weather-stat"><div class="stat-icon blue">≋</div><div><span>Humidity</span><b id="weather-humidity">—</b></div></div>
          <div class="weather-stat"><div class="stat-icon cyan">↗</div><div><span>Wind</span><b id="weather-wind">—</b></div></div>
          <div class="weather-stat"><div class="stat-icon violet">☂</div><div><span>Rain now</span><b id="weather-rain">—</b></div></div>
        </div>
        <div class="weather-foot" id="weather-foot">Click the globe to load forecast conditions for that location.</div>
        <div class="aqi-location-card" id="aqi-location-card"><div class="aqi-card-head"><b>Air quality · model</b><span>Select a location</span></div><small>Open-Meteo / CAMS model output; not a regulatory monitoring station.</small></div>
        <div class="section-heading"><span>NEARBY EVIDENCE</span><button class="text-button" id="show-events">View all ↗</button></div>
        <div id="nearby-evidence" class="nearby-evidence"><div class="empty-state compact"><span>◎</span><p>Choose a location to inspect nearby events.</p></div></div>
        <div class="section-heading"><span>LOCAL REPORTS & FLOOD MODEL</span><button class="text-button" id="load-area-news">Search news ↗</button></div><div class="inspector-actions"><button type="button" class="text-button" id="load-flood-forecast">Check modeled river discharge ↗</button></div><div id="flood-forecast-output" class="nearby-evidence"><div class="empty-state compact"><p>Select a location to inspect the nearest available GloFAS river-discharge grid.</p></div></div><div id="local-news" class="nearby-evidence"><div class="empty-state compact"><p>Select a named place, then search news mentioning the wider area. Reports are not verified ground truth.</p></div></div>
        <div class="section-heading"><span>SOURCE CONFIDENCE</span><span class="data-badge">PROVENANCE</span></div>
        <div class="source-confidence" id="source-confidence"><div class="confidence-row"><span class="conf-mark">1</span><div><b>Measured / observed</b><small>Directly reported by a data source</small></div></div><div class="confidence-row"><span class="conf-mark forecast">~</span><div><b>Forecast / modelled</b><small>Model output, not observed fact</small></div></div><div class="confidence-row"><span class="conf-mark ai">✳</span><div><b>AI interpretation</b><small>Must be verified against sources</small></div></div></div>
        <button class="primary-wide" id="ask-about-place"><span>✳</span> Ask AI about this area <span class="button-arrow">↗</span></button><div class="export-tools"><label class="export-radius-wrap">Nearby event radius<select id="export-radius"><option value=25>25 km</option><option value=50>50 km</option><option value=100 selected>100 km</option><option value=250>250 km</option><option value=500>500 km</option></select></label><div class="export-actions"><button class="outline-button report-button" id="export-report">↧ Export report</button><button class="primary-button report-button" id="export-area-zip">↧ Area data ZIP</button></div></div>
        <div class=" panel-disclaimer">Context explorer, not an emergency alert service. Event proximity does not prove causation.</div>
      </aside>
    </section>

    <section class="workspace lower-workspace gx-platform-mode" id="panel-godseye" hidden>
      <div class="gx-platform" id="gx-platform">
        <div class="gx-platform-bar">
          <div class="gx-platform-brand">
            <span class="gx-platform-mark" aria-hidden="true">◉</span>
            <div>
              <strong>GOD'S EYE VIEW <em>FULL PLATFORM</em></strong>
              <small>CESIUM 3D · LIVE AIRCRAFT · SHIPS · SATELLITES · EARTHQUAKES · CCTV · STREET LEVEL</small>
            </div>
          </div>
          <div class="gx-platform-status" aria-live="polite">
            <span class="gx-live-dot" id="gx-platform-dot" aria-hidden="true"></span>
            <div><b id="gx-platform-status">CONNECTING</b><small id="gx-platform-detail">Starting the full God's Eye View platform…</small></div>
          </div>
          <div class="gx-platform-actions">
            <button type="button" id="gx-platform-reload" title="Reload the full God's Eye View platform">↻ RELOAD</button>
            <button type="button" id="gx-platform-full" title="Fullscreen the full platform">⛶ FULLSCREEN</button>
            <button type="button" id="gx-platform-open" title="Open the full platform in a new tab">↗ OPEN FULL</button>
            <button type="button" class="primary" id="gx-platform-deck" title="Switch to the EARTHSCOPE command deck and route planner">⌘ COMMAND DECK</button>
          </div>
        </div>
        <div class="gx-platform-frame-wrap">
          <iframe id="gx-platform-frame" title="God's Eye View — full platform" allow="fullscreen; microphone; camera; clipboard-write; autoplay; geolocation" referrerpolicy="no-referrer-when-downgrade"></iframe>
          <div class="gx-platform-fallback" id="gx-platform-fallback" hidden>
            <div class="gx-platform-fallback-card">
              <b>Full platform is still connecting</b>
              <p>The Cesium globe bundle can take a moment on first load. If this persists, confirm the God's Eye service is running on port 5174.</p>
              <div>
                <button type="button" id="gx-platform-retry">↻ RETRY</button>
                <button type="button" id="gx-platform-deck-2">⌘ USE COMMAND DECK</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="gx-root" id="gx-root">
        <header class="gx-header">
          <div class="gx-brand">
            <span class="gx-live-dot" aria-hidden="true"></span>
            <div class="gx-brand-text">
              <strong>GOD'S EYE <em>// PANOPTICON OSINT COMMAND</em></strong>
              <small id="gx-brand-status">ALL-SOURCE RECON · STANDALONE MAP INSTANCE · ISOLATED FROM THE CLASSIC GLOBE</small>
            </div>
            <span class="gx-version">v4.7</span>
          </div>

          <form id="gx-search-form" class="gx-search" autocomplete="off">
            <span class="gx-search-glyph" aria-hidden="true">⌖</span>
            <input id="gx-search-input" type="search" maxlength="120" placeholder="Target lock: city, landmark, or lat,lon (e.g. Biratnagar, Pentagon)…" aria-label="Target lock search" />
            <button type="submit">LOCK &amp; RECON</button>
          </form>

          <div class="gx-controls">
            <div class="gx-group" role="group" aria-label="Base map layer">
              <button type="button" class="gx-btn" data-gx-basemap="normal" title="Google street map">MAP</button>
              <button type="button" class="gx-btn active" data-gx-basemap="satellite" title="Google satellite hybrid, max zoom 22x">SAT</button>
              <button type="button" class="gx-btn" data-gx-basemap="osm" title="OpenStreetMap raster">OSM</button>
            </div>
            <button type="button" class="gx-btn" id="gx-buildings-toggle" aria-pressed="false" title="Toggle extruded OpenStreetMap 3D buildings. No API key required; footprints appear from zoom 15x.">🏢 3D</button>
            <div class="gx-group" role="group" aria-label="Optical sensor shader">
              <button type="button" class="gx-btn active" data-gx-mode="normal" title="Standard optical">STD</button>
              <button type="button" class="gx-btn" data-gx-mode="nvg" title="Night-vision green shader">NVG</button>
              <button type="button" class="gx-btn" data-gx-mode="flir" title="Thermal FLIR shader">FLIR</button>
              <button type="button" class="gx-btn" data-gx-mode="crt" title="CRT scanline shader">CRT</button>
              <button type="button" class="gx-btn" data-gx-mode="radar" title="Synthetic-aperture radar shader + sweep">SAR</button>
            </div>
            <button type="button" class="gx-btn active" id="gx-globe-toggle" title="Toggle 3D globe / flat map projection">🌐 GLOBE</button>
            <button type="button" class="gx-btn" id="gx-wings-toggle" title="Minimize or expand the tactical side wings">◫ WINGS</button>
            <button type="button" class="gx-btn" id="gx-fullscreen-btn" title="Fullscreen command center">⛶</button>
            <button type="button" class="gx-btn gx-btn-platform" id="gx-open-platform" title="Open the complete God's Eye View platform">◉ FULL PLATFORM</button>
            <button type="button" class="gx-btn danger" id="gx-exit-btn" title="Exit to the classic Globe Explorer">✕ EXIT</button>
          </div>

          <div class="gx-quick" aria-label="Quick target locks">
            <span>QUICK LOCK</span>
            <button type="button" data-gx-target="Biratnagar, Nepal">Biratnagar</button>
            <button type="button" data-gx-target="Kathmandu, Nepal">Kathmandu</button>
            <button type="button" data-gx-target="Bangalore, India">Bangalore</button>
            <button type="button" data-gx-target="Tokyo, Japan">Tokyo</button>
            <button type="button" data-gx-target="38.8719, -77.0563">Pentagon</button>
            <button type="button" data-gx-target="37.7510, 14.9934">Mt. Etna</button>
          </div>
        </header>

        <div class="gx-body" id="gx-body">
          <aside class="gx-wing gx-wing-left" id="gx-wing-left" aria-label="Left tactical wing">
            <div class="gx-card">
              <div class="gx-card-head">
                <div><b>🛰️ Orbital recon</b><small>Live LEO / SSO constellation</small></div>
                <span class="gx-pill" id="gx-sat-count">6 ACTIVE</span>
              </div>
              <div class="gx-sub" id="gx-sat-status">Propagating ISS, NISAR, Sentinel-2B, Landsat-9, NOAA-20 &amp; Starlink ground tracks…</div>
              <div class="gx-list" id="gx-sat-list"><div class="gx-empty">Acquiring orbital ephemeris…</div></div>
            </div>

            <div class="gx-card">
              <div class="gx-card-head">
                <div><b>✈️ Air traffic radar</b><small>Live ADS-B + Aviationstack</small></div>
                <div class="gx-head-actions">
                  <span class="gx-pill green" id="gx-flight-count">LIVE · —</span>
                  <button type="button" id="gx-adsb-btn" title="Scan the ADSB.lol transponder feed around the locked target">↻ ADS-B</button>
                  <button type="button" id="gx-avstack-btn" title="Query the configured Aviationstack key">🔑 AVSTACK</button>
                </div>
              </div>
              <div class="gx-sub" id="gx-flight-status">Transponder sweep idle. Lock a target, then scan.</div>
              <div class="gx-list" id="gx-flight-list"><div class="gx-empty">No aircraft requested yet.</div></div>
            </div>

            <div class="gx-card">
              <div class="gx-card-head">
                <div><b>🔥 FIRMS thermal &amp; threats</b><small>NASA VIIRS + EONET + USGS</small></div>
                <div class="gx-head-actions">
                  <button type="button" id="gx-firms-btn" title="Load NASA FIRMS VIIRS active fire detections">🔥 FIRMS</button>
                  <button type="button" id="gx-hazards-btn" title="Refresh live volcanoes, floods, storms and earthquakes">↻ HAZARDS</button>
                </div>
              </div>
              <div class="gx-sub" id="gx-hazard-status">Live thermal anomalies and multi-hazard telemetry.</div>
              <div class="gx-list" id="gx-hazard-list"><div class="gx-empty">Hazard feed pending.</div></div>
            </div>

            <div class="gx-footnote">Orbital positions are propagated locally from public two-line elements and are illustrative, not operational ephemerides. FIRMS and ADS-B coverage vary by region and provider quota.</div>
          </aside>

          <div class="gx-stage" id="gx-stage">
            <div class="gx-map-shell" id="gx-map-shell" data-gx-mode="normal">
              <div id="gx-map" class="gx-map" aria-label="God's Eye standalone tactical map"></div>
              <canvas id="gx-fx-canvas" class="gx-fx-canvas" aria-hidden="true"></canvas>

              <div class="gx-optical" aria-hidden="true">
                <div class="gx-scanlines"></div>
                <div class="gx-vignette"></div>
                <div class="gx-grid"></div>
                <div class="gx-corner tl"></div>
                <div class="gx-corner tr"></div>
                <div class="gx-corner bl"></div>
                <div class="gx-corner br"></div>
                <div class="gx-reticle">
                  <span class="gx-reticle-ring outer"></span>
                  <span class="gx-reticle-ring inner"></span>
                  <span class="gx-reticle-h"></span>
                  <span class="gx-reticle-v"></span>
                  <span class="gx-reticle-readout" id="gx-reticle-readout">LOCKED: 26.4525°N, 87.2718°E</span>
                </div>
              </div>

              <div class="gx-hud gx-hud-tl">
                <span class="gx-live-dot" aria-hidden="true"></span>
                <b id="gx-hud-mode">STD OPTICAL</b>
                <small id="gx-hud-link">SAT-LINK ACTIVE</small>
              </div>
              <div class="gx-hud gx-hud-tr" id="gx-hud-telemetry">SAT 6 · AIR 0 · HAZ 0 · ZOOM 5.5x</div>
              <div class="gx-hud gx-hud-bl" id="gx-hud-coords">26.4525°N · 87.2718°E</div>
              <div class="gx-hud gx-hud-br" id="gx-hud-zoom">MAX ZOOM 22x</div>

              <div class="gx-route-drawer sa-result-drawer" id="gx-route-drawer" hidden></div>
            </div>

            <div class="gx-simbar">
              <div class="gx-filters" role="group" aria-label="Threat filter">
                <span class="gx-simlabel">THREAT FILTER</span>
                <button type="button" class="gx-chip active" data-gx-filter="all">ALL <b id="gx-count-all">0</b></button>
                <button type="button" class="gx-chip volcano" data-gx-filter="volcano">🌋 <b id="gx-count-volcano">0</b></button>
                <button type="button" class="gx-chip flood" data-gx-filter="flood">🌊 <b id="gx-count-flood">0</b></button>
                <button type="button" class="gx-chip quake" data-gx-filter="earthquake">〰️ <b id="gx-count-quake">0</b></button>
                <button type="button" class="gx-chip fire" data-gx-filter="wildfire">🔥 <b id="gx-count-fire">0</b></button>
                <button type="button" class="gx-chip storm" data-gx-filter="storm">🌀 <b id="gx-count-storm">0</b></button>
              </div>
              <div class="gx-sim-actions">
                <span class="gx-simlabel">SIMULATE AT TARGET</span>
                <button type="button" class="gx-chip" data-gx-spawn="volcano">＋ Erupt</button>
                <button type="button" class="gx-chip" data-gx-spawn="flood">＋ Flood</button>
                <button type="button" class="gx-chip" data-gx-spawn="earthquake">＋ M7.5</button>
                <button type="button" class="gx-chip" data-gx-spawn="storm">＋ Cyclone</button>
                <button type="button" class="gx-chip" data-gx-spawn="wildfire">＋ Fire</button>
                <button type="button" class="gx-chip clear" id="gx-clear-sim">CLEAR SIMS</button>
              </div>
            </div>

            <div class="gx-sa">
              <div class="gx-sa-head">
                <span class="gx-sa-badge"><span class="gx-live-dot" aria-hidden="true"></span> SUPERAGENT <small>ROUTE · TRAFFIC · TICKET</small></span>
                <div class="gx-sa-modes" role="group" aria-label="Filter ticket results by travel mode">
                  <button type="button" class="gx-sa-mode active" data-gx-ticket-focus="all">All modes</button>
                  <button type="button" class="gx-sa-mode" data-gx-ticket-focus="flight">✈️ Flight</button>
                  <button type="button" class="gx-sa-mode" data-gx-ticket-focus="train">🚆 Train</button>
                  <button type="button" class="gx-sa-mode" data-gx-ticket-focus="bus">🚌 Bus</button>
                  <button type="button" class="gx-sa-mode" data-gx-ticket-focus="car">🚗 Car</button>
                </div>
              </div>
              <form id="gx-sa-form" class="gx-sa-form" autocomplete="off">
                <div class="gx-sa-fields">
                  <label class="gx-sa-field">
                    <span class="gx-sa-field-label"><i class="gx-sa-pin origin"></i>FROM</span>
                    <div class="gx-sa-input-wrap">
                      <input id="gx-sa-from" type="text" value="Biratnagar, Nepal" placeholder="City, station, airport or address" aria-label="Route origin" />
                      <div class="gx-sa-suggest" id="gx-sa-from-suggest" role="listbox" aria-label="Origin suggestions" hidden></div>
                    </div>
                  </label>
                  <button type="button" class="gx-sa-swap" id="gx-sa-swap" title="Swap origin and destination" aria-label="Swap origin and destination">⇄</button>
                  <label class="gx-sa-field">
                    <span class="gx-sa-field-label"><i class="gx-sa-pin destination"></i>TO</span>
                    <div class="gx-sa-input-wrap">
                      <input id="gx-sa-to" type="text" value="Bengaluru (Bangalore), India" placeholder="City, station, airport or address" aria-label="Route destination" />
                      <div class="gx-sa-suggest" id="gx-sa-to-suggest" role="listbox" aria-label="Destination suggestions" hidden></div>
                    </div>
                  </label>
                </div>
                <button type="submit" id="gx-sa-submit">CALCULATE ↗</button>
              </form>
              <div class="gx-prompts">
                <button type="button" data-gx-prompt="Distance from Biratnagar to Bangalore, routes, traffic and ticket prices">🛣️ Biratnagar → Bangalore</button>
                <button type="button" data-gx-prompt="Distance from Kathmandu to New Delhi, routes, traffic and ticket prices">✈️ Kathmandu → New Delhi</button>
                <button type="button" data-gx-prompt="Distance from Mumbai to Goa, routes, traffic and ticket prices">🚆 Mumbai → Goa</button>
                <button type="button" data-gx-prompt="Filter and animate active volcanoes on map">🌋 Volcanoes</button>
                <button type="button" data-gx-prompt="Filter and animate floods on map">🌊 Flood zones</button>
              </div>
              <div class="gx-ticker" aria-label="Live fare ticker">
                <span class="gx-ticker-label">FARE TICKER</span>
                <button type="button" class="gx-live-air" id="gx-live-air" title="Jump to live aircraft in the target sector"><span class="gx-live-dot" aria-hidden="true"></span> LIVE AIR <b id="gx-live-air-count">—</b></button>
                <div class="gx-ticker-window"><div class="gx-ticker-track" id="gx-ticker-track" aria-live="polite"></div></div>
              </div>
            </div>
          </div>

          <aside class="gx-wing gx-wing-right" id="gx-wing-right" aria-label="Right tactical wing">
            <div class="gx-card gx-target-card">
              <div class="gx-card-head">
                <div><b>🎯 Locked target telemetry</b><small id="gx-target-badge">LOCKED</small></div>
                <span class="gx-pill green" id="gx-target-source">WGS84</span>
              </div>
              <div class="gx-target-box">
                <strong id="gx-target-name">Biratnagar, Nepal</strong>
                <div class="gx-coords" id="gx-target-coords">26.4525° N, 87.2718° E</div>
                <div class="gx-address" id="gx-target-address">Resolving street-level reverse geocode…</div>
                <div class="gx-telemetry">
                  <div><small>TEMP</small><b id="gx-w-temp">—</b></div>
                  <div><small>WIND</small><b id="gx-w-wind">—</b></div>
                  <div><small>HUMIDITY</small><b id="gx-w-hum">—</b></div>
                  <div><small>PRECIP</small><b id="gx-w-rain">—</b></div>
                </div>
                <div class="gx-cameras">
                  <button type="button" id="gx-zoom19" title="Street-level 3D camera at 19x with OpenStreetMap building extrusions">🏙️ STREET 3D</button>
                  <button type="button" id="gx-sat20" title="Satellite hybrid at 20x with OpenStreetMap building extrusions">🛰️ SAT 20x</button>
                  <button type="button" id="gx-orbit3d" title="Tilt the camera to 68 degrees over the target">🌐 PITCH 65°</button>
                  <button type="button" id="gx-globe-view" title="Pull back to the full 3D globe">🌍 FULL GLOBE</button>
                </div>
                <button type="button" class="gx-streetview-link" id="gx-google-streetview" title="Open Google Maps Street View for the locked target in a new tab. External Google service.">📷 GOOGLE STREET VIEW ↗</button>
                <div class="gx-3d-note" id="gx-3d-note" aria-live="polite"><b>3D buildings off.</b> Use <strong>🏢 3D</strong> or <strong>STREET 3D</strong> to extrude mapped OSM footprints.</div>
              </div>
            </div>

            <div class="gx-card">
              <div class="gx-card-head">
                <div><b>🏛️ OSM infrastructure</b><small>OpenStreetMap sector nodes</small></div>
                <button type="button" id="gx-scan-infra">↻ SCAN NODES</button>
              </div>
              <div class="gx-sub" id="gx-infra-status">Critical civic, transport and utility nodes near the locked target.</div>
              <div class="gx-list" id="gx-infra-list"><div class="gx-empty">Lock a target and scan OSM nodes.</div></div>
            </div>

            <div class="gx-card">
              <div class="gx-card-head">
                <div><b>🧠 AI sitrep &amp; GDELT wire</b><small>OpenRouter + GDELT DOC</small></div>
                <button type="button" id="gx-ai-btn">✳ AI SITREP</button>
              </div>
              <div class="gx-sitrep" id="gx-sitrep">Click “✳ AI SITREP” to generate a source-aware tactical summary for the locked sector.</div>
              <div class="gx-list" id="gx-news-list"><div class="gx-empty">News wire idle.</div></div>
            </div>

            <div class="gx-footnote">God’s Eye is an exploratory OSINT view. AI text is interpretation, not verified fact; no layer here is an official emergency warning or live ATC feed.</div>
          </aside>
        </div>
      </div>
    </section>

    <section class="workspace lower-workspace" id="panel-events" hidden>
      <div class="page-panel"><div class="page-heading"><div><div class="eyebrow">LIVE / NEAR-REAL-TIME FEEDS</div><h1>Event radar</h1><p>Recent earthquakes and NASA-tracked natural events, with clear source timestamps.</p></div><button class="outline-button" id="refresh-events">↻ Refresh feeds</button></div><div class="metrics-row"><div class="metric-card"><small>USGS EARTHQUAKES / 24H</small><b id="metric-quakes">—</b><span>Feed catalog count</span></div><div class="metric-card"><small>NASA EONET OPEN EVENTS</small><b id="metric-eonet">—</b><span>Current open catalogue</span></div><div class="metric-card"><small>FIRMS</small><b id="metric-fires">Optional</b><span>MAP_KEY not configured</span></div></div><div class="split-cards"><div class="data-card"><div class="card-title"><div><h2>Recent earthquakes</h2><p>USGS · all magnitudes in the last 24 hours</p></div><span class="source-pill">LIVE FEED</span></div><div class="feed-list" id="quake-list"><div class="loading-line">Loading USGS feed…</div></div></div><div class="data-card"><div class="card-title"><div><h2>NASA natural events</h2><p>EONET · open events from supported sources</p></div><span class="source-pill nasa-pill">NASA</span></div><div class="feed-list" id="event-list"><div class="loading-line">Loading NASA EONET…</div></div></div></div></div>
    </section>

    <section class="workspace lower-workspace" id="panel-archive" hidden>
      <div class="page-panel"><div class="page-heading"><div><div class="eyebrow">SAR · RADAR ARCHIVE</div><h1>NISAR archive explorer</h1><p>Search public catalogue metadata. Catalogue discovery is not the same as downloading or processing radar imagery.</p></div><span class="source-pill nasa-pill">NASA / ASF CMR</span></div><div class="archive-search"><label>Optional point of interest<input id="archive-place" placeholder="Search a place above, or leave blank for global catalogue"></label><button class="primary-button" id="search-nisar">Search NISAR archive ↗</button></div><div class="notice-box"><span>ⓘ</span><div><b>Data-access note</b><p>NISAR products, temporal coverage and processing status vary. Some granules may require Earthdata Login or further access steps. This view reports what public metadata is returned; it does not claim that all search results have been downloaded or analysed.</p></div></div><div id="nisar-results" class="archive-results"><div class="empty-state"><span>▦</span><b>Ready to search</b><p>Search the public NASA CMR catalogue for NISAR-related collections and recent granule metadata.</p></div></div></div>
    </section>

    <section class="workspace lower-workspace" id="panel-weather" hidden>
      <div class="page-panel weather-crop-page"><div class="page-heading"><div><div class="eyebrow">LOCAL FORECAST · FIELD CONTEXT</div><h1>Weather & growing guide</h1><p>Seven-day forecast, local clock and a transparent weather-fit crop screen for the selected place.</p></div><div class="heading-actions"><span class="source-pill">OPEN-METEO</span><button class="outline-button" id="open-radar-from-weather">☂ Open rain radar</button></div></div><div class="place-clock-card" id="place-clock-card"><div class="clock-icon">◷</div><div><small>LOCAL TIME AT SELECTED PLACE</small><b id="place-local-time">Select a place</b><span id="place-timezone">Time zone will appear here</span></div><div class="clock-date" id="place-local-date">—</div></div><div class="weather-main" id="weather-main"><div class="empty-state"><span>☼</span><b>Select a location</b><p>Click the globe or search for a place to load current conditions and a seven-day forecast.</p></div></div><div class="crop-guide-card"><div class="crop-guide-header"><div><div class="eyebrow">EXPLAINABLE SCREENING · NOT A GUARANTEE</div><h2>What might grow here?</h2><p>Combines a 10-year historical climate grid with the live seven-day forecast. Each score uses a source-linked crop profile and the selected region’s historical grid climate. The current scoreable shortlist is limited to crops with available reference envelopes; browse FAO EcoCrop for the wider plant database. Scores are screening indices, not harvest probabilities.</p></div><span class="source-pill">WEATHER FIT</span></div><div class="crop-inputs"><label>Soil information<select id="crop-soil"><option value="unknown">Unknown / not tested</option><option value="sandy">Sandy / fast draining</option><option value="loam">Loam / mixed soil</option><option value="clay">Clay / water-retaining</option></select></label><label>Water access<select id="crop-water"><option value="unknown">Not specified</option><option value="rainfed">Rain-fed only</option><option value="irrigated">Irrigation available</option></select></label><label>Goal<select id="crop-goal"><option value="balanced">Balanced options</option><option value="dry">Drought resilience</option><option value="short-season">Short growing window</option><option value="vegetables">Vegetable growing</option></select></label></div><div id="crop-advice" class="crop-advice-results"><div class="empty-state compact"><span>♧</span><p>Select a place to screen broad crop options against the local forecast.</p></div></div><div class="fruit-potential" id="fruit-potential"><div class="fruit-potential-header"><div><div class="eyebrow">FRUIT & PERENNIAL CROP SCREEN</div><h3>What could fit this climate?</h3><p>Uses the selected location’s historical climate grid and the live forecast. The displayed cards are only crops with usable reference envelopes, not every possible crop; use the global species atlas and FAO EcoCrop to broaden the candidate list.</p></div><a href="https://ecocrop.apps.fao.org/ecocrop/srv/en/home" target="_blank" rel="noopener">FAO EcoCrop reference ↗</a></div><div id="fruit-potential-grid" class="fruit-potential-grid"><div class="empty-state compact"><p>Select a place to compare species-matched crop photographs and climate conditions. No generic fruit image is used.</p></div></div><p class="fruit-source-note">Forecast: Open-Meteo model output · Historical climate provider is shown in results (Open-Meteo or NASA POWER fallback) · crop reference envelopes: FAO EcoCrop. This is a source-linked shortlist rather than a complete crop database; it is not a planting prescription.</p></div>
        <div class="crop-action-row"><button class="primary-button" id="ask-crop-ai">Ask Earth about crops here ↗</button><small>Weather-based screening only; not an agronomic prescription.</small></div></div><div class="notice-box"><span>ⓘ</span><div><b>Interpretation limits</b><p>Forecasts are model output and change as models update. This tool is not a substitute for official weather alerts, soil testing, local extension services or agronomic assessment.</p></div></div></div>
    </section>


    <section class="workspace lower-workspace" id="panel-farm" hidden>
      <div class="page-panel farm-atlas-page">
        <div class="page-heading">
          <div>
            <div class="eyebrow">CROP BIODIVERSITY · CLIMATE · SMART FARM ECONOMICS</div>
            <h1>Crop Atlas & Smart Farm Studio</h1>
            <p>Explore 300+ fruits, vegetables, mushrooms, herbs, medicinal plants, pulses, grains and spices. Select any plot or regional preset, screen climate fit, auto-fill agronomic economics & NPK targets, and generate an A4 field dossier.</p>
          </div>
          <div class="cross-workspace-bar" role="navigation" aria-label="Cross-workspace quick switcher">
            <button type="button" class="outline-button" data-go-panel="explore">◉ Globe Explorer</button>
            <button type="button" class="outline-button" data-go-panel="godseye">👁️ God's Eye Plugin</button>
            <button type="button" class="outline-button" data-go-panel="food">♨ Food Studio</button>
            <span class="source-pill">SCREENING + CALCULATOR</span>
          </div>
        </div>
        <div class="farm-location-strip">
          <div class="farm-location-icon">⌖</div>
          <div>
            <small>SELECTED FARM / PLOT PIN</small>
            <b id="farm-place-name">Biratnagar, Koshi Province, Nepal</b>
            <span id="farm-place-coords">26.45250, 87.27180 · Active agro-climatic plot</span>
          </div>
          <div class="farm-location-actions">
            <button type="button" class="ge-chip-btn" data-farm-preset-pin="26.4525,87.2718,Biratnagar (Eastern Terai), Nepal">🇳🇵 Biratnagar</button>
            <button type="button" class="ge-chip-btn" data-farm-preset-pin="13.2257,77.5750,Bengaluru Rural, Karnataka, India">🇮🇳 Bengaluru</button>
            <button type="button" class="ge-chip-btn" data-farm-preset-pin="27.7172,85.3240,Kathmandu Valley, Nepal">🇳🇵 Kathmandu</button>
            <button type="button" class="ge-chip-btn" data-farm-preset-pin="30.9010,75.8573,Ludhiana (Indo-Gangetic), Punjab, India">🇮🇳 Punjab</button>
            <button type="button" class="outline-button" id="farm-select-pin">◎ Set map pin</button>
            <button type="button" class="outline-button" id="farm-refresh-data">↻ Update field data</button>
          </div>
        </div>
        <div class="farm-data-cards" id="farm-local-data"><article class="farm-data-card"><small>WEATHER</small><b>Waiting for pin</b><span>Forecast/model context</span></article><article class="farm-data-card"><small>SOIL</small><b>Not checked</b><span>SoilGrids gridded estimate, when available</span></article><article class="farm-data-card"><small>MARKET</small><b>Not connected</b><span>Optional India mandi data API key</span></article><article class="farm-data-card"><small>HAZARDS</small><b>Open catalogue</b><span>USGS / NASA records shown on main map</span></article></div>
        <section class="regional-market-board" aria-labelledby="regional-market-title">
          <div class="regional-market-head"><div><span class="eyebrow">REPORTED MARKET OBSERVATIONS · NOT A PRICE FORECAST</span><h3 id="regional-market-title">Local crop prices by category</h3><p>Fetch official daily AGMARKNET mandi observations for an Indian state/district. Prices are grouped by crop category, and the relative price band is calculated from returned modal prices only. This is not a profit ranking.</p></div><a href="https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi" target="_blank" rel="noopener">Official dataset ↗</a></div>
          <div class="regional-market-controls"><label>State <input id="regional-market-state" type="text" maxlength="80" placeholder="Auto-filled from selected Indian pin"></label><label>District (optional) <input id="regional-market-district" type="text" maxlength="80" placeholder="e.g. Mysuru"></label><button type="button" class="primary-button" id="regional-market-load">Load reported crop prices</button></div>
          <div id="regional-market-status" class="regional-market-status" role="status">Select an Indian location pin, then load its local price records. Requires your private data.gov.in API key. Other countries need a compatible local market-price source.</div>
          <div id="regional-market-board" class="regional-market-results"><div class="empty-state compact"><p>No market records loaded yet. No prices are invented or estimated in this board.</p></div></div>
          <p class="fine-print">Source values are generally reported as ₹/quintal. Cards also show a derived ₹/kg conversion (modal price ÷ 100). Verify arrival date, market, variety, grade, transport and current buyer offers before making a farm decision. No recent record means “data unavailable”, not a zero price.</p>
        </section>
        <div class="farm-atlas-layout"><div class="farm-catalog-panel"><div class="atlas-title-row"><div><span class="eyebrow">BIODIVERSITY LIBRARY</span><h2>Find a crop or useful plant</h2></div><span id="crop-catalog-count" class="catalog-count">Loading catalogue…</span></div><div class="farm-data-source-link" id="faocropsuit-farm-link"><b>Need a modelled crop-suitability assessment?</b><span>FAO SoilFER/GAEZ provides suitability and attainable-yield layers for selected crops and supported regions using soil, climate and terrain inputs. Coverage and assumptions vary.</span><a href="https://data.apps.fao.org/soilfer/cropsuit" target="_blank" rel="noopener">Open official FAO CropSuit ↗</a></div><label class="atlas-search-label">Search species, common names or uses<input id="crop-search" type="search" placeholder="e.g. winter fruit, turmeric, mushroom, drought tolerant…"></label><div class="atlas-filter-grid"><label>Plant family<select id="crop-category"><option value="all">All categories</option><option value="fruit">Fruits</option><option value="vegetable">Vegetables</option><option value="mushroom">Mushrooms</option><option value="medicinal">Medicinal plants</option><option value="herb">Culinary herbs</option><option value="grain">Grains & millets</option><option value="pulse">Pulses & legumes</option><option value="nut">Nuts & oilseeds</option><option value="spice">Spices & roots</option></select></label><label>Season<select id="crop-season"><option value="all">All seasons</option><option value="winter">Winter / cool season</option><option value="summer">Summer / warm season</option><option value="monsoon">Monsoon / wet season</option><option value="perennial">Perennial / seasonal windows vary</option><option value="year-round">Year-round where climate permits</option></select></label><label>Growth habit<select id="crop-habit"><option value="all">All growth habits</option><option value="tree">Tree</option><option value="vine">Vine / climber</option><option value="shrub">Shrub</option><option value="ground">Ground / creeping</option><option value="underground">Root / tuber / bulb</option><option value="leafy">Leafy / upright plant</option><option value="herb">Herb / small plant</option><option value="mushroom">Fungus</option></select></label><label>Water preference<select id="crop-water-filter"><option value="all">Any water need</option><option value="low">Low / drought-aware</option><option value="medium">Moderate</option><option value="high">High / moisture-sensitive</option></select></label></div><div class="atlas-results-toolbar"><span id="crop-filter-summary">Browse the catalogue</span><button type="button" class="text-button" id="crop-clear-filters">Clear filters</button></div><div id="crop-catalog-grid" class="crop-catalog-grid"><div class="empty-state compact">Loading plant catalogue…</div></div>
          <section class="global-species-discovery" aria-labelledby="global-species-title"><div class="global-species-heading"><div><span class="eyebrow">LIVE GLOBAL TAXONOMY LOOKUP</span><h3 id="global-species-title">Discover species beyond the starter list</h3><p>Search GBIF's global biodiversity backbone for additional accepted species names. Then ask the configured Earth AI to assess the species for your selected location. Taxonomy records alone do not establish edibility, medicinal safety, or crop suitability.</p></div><span class="source-pill">GBIF · GLOBAL RECORDS</span></div><form id="crop-global-search-form" class="global-species-search"><input id="crop-global-search" type="search" maxlength="100" placeholder="e.g. unusual tropical fruit, Garcinia, medicinal tree…" aria-label="Search global plant and fungi taxonomy"><select id="crop-global-kind" aria-label="Taxonomy group"><option value="all">Plants & fungi</option><option value="plant">Plants</option><option value="fungi">Fungi / mushrooms</option></select><button type="submit" class="primary-button" id="crop-global-search-button">Search global records ↗</button></form><div id="crop-global-results" class="global-species-results"><div class="empty-state compact"><span>🌐</span><p>Enter a species name or keyword to search the global biodiversity index. Results are retrieved on demand rather than pretending the starter catalogue covers every species.</p></div></div></section>
          <section class="real-photo-atlas" aria-labelledby="real-photo-title"><div class="global-species-heading"><div><span class="eyebrow">REAL PHOTOGRAPHS · ATTRIBUTED SOURCE PAGES</span><h3 id="real-photo-title">Browse real fruit, vegetable, fungi and medicinal-plant photographs</h3><p>Search Wikimedia Commons on demand. Each result links to its file page and shows the provided licence/creator metadata. Review the source page before reusing any image.</p></div><span class="source-pill">WIKIMEDIA COMMONS</span></div><form id="real-photo-search-form" class="global-species-search"><input id="real-photo-query" type="search" maxlength="100" value="fresh fruit photography" placeholder="e.g. dragon fruit, bitter gourd, oyster mushroom…" aria-label="Search real plant and food photographs"><button type="submit" class="primary-button">Search real photos ↗</button></form><div class="photo-query-chips"><button type="button" data-photo-query="tropical fruit photography">Fruits</button><button type="button" data-photo-query="vegetable varieties photography">Vegetables</button><button type="button" data-photo-query="edible mushrooms photography">Mushrooms</button><button type="button" data-photo-query="medicinal herbs plant photography">Medicinal plants</button><button type="button" data-photo-query="leafy herbs culinary photography">Herbs</button><button type="button" data-photo-query="grain legumes pulses crop photography">Grains & pulses</button></div><div id="real-photo-results" class="real-photo-grid"><div class="empty-state compact"><p>Search a species or choose a category to load real photographs from Commons.</p></div></div></section><div id="crop-detail-panel" class="crop-detail-panel"><div class="crop-detail-empty">Select a crop to see its growing window, habit, general uses and climate notes.</div></div></div>
          <aside class="farm-economics-panel"><div class="farm-econ-heading"><span class="eyebrow">FIELD PLANNER · AUTO-FILLED CROP PROFILES</span><h2>Can this crop make money?</h2><p>Select any crop in the Atlas or below to auto-fill realistic yield, market price & input cost benchmarks, or edit any value manually.</p></div><div class="farm-quick-crop-bar"><button type="button" class="ge-chip-btn" data-quick-crop="Tomato">🍅 Tomato</button><button type="button" class="ge-chip-btn" data-quick-crop="Potato">🥔 Potato</button><button type="button" class="ge-chip-btn" data-quick-crop="Mango">🥭 Mango</button><button type="button" class="ge-chip-btn" data-quick-crop="Turmeric">🫚 Turmeric</button><button type="button" class="ge-chip-btn" data-quick-crop="Oyster mushroom">🍄 Oyster Mushroom</button><button type="button" class="ge-chip-btn" data-quick-crop="Rice">🌾 Basmati Rice</button></div><div class="farm-form-grid"><label>Crop<input id="farm-crop-name" value="Tomato" maxlength="60"></label><label>Land size<input id="farm-area" type="number" min="0.01" step="0.01" value="1"></label><label>Area unit<select id="farm-area-unit"><option value="acre">Acre</option><option value="hectare">Hectare</option></select></label><label>Expected yield per acre (kg)<input id="farm-yield" type="number" min="0" step="50" value="8000"></label><label>Expected sale price (₹ / kg)<input id="farm-price" type="number" min="0" step="0.5" value="28" placeholder="Enter mandi / local quote"></label><label>Seed / planting (₹ total)<input id="farm-seed-cost" type="number" min="0" step="100" value="2500"></label><label>Fertilizer & amendments (₹ total)<input id="farm-fertilizer-cost" type="number" min="0" step="100" value="8000"></label><label>Labour (₹ total)<input id="farm-labour-cost" type="number" min="0" step="100" value="12000"></label><label>Water / energy (₹ total)<input id="farm-water-cost" type="number" min="0" step="100" value="5000"></label><label>Other / transport (₹ total)<input id="farm-other-cost" type="number" min="0" step="100" value="6000"></label></div><div class="farm-market-tools"><label>India mandi commodity<select id="market-commodity"><option>Tomato</option><option>Onion</option><option>Potato</option><option>Banana</option><option>Mango</option><option>Apple</option><option>Grapes</option><option>Green Chilli</option><option>Brinjal</option><option>Cauliflower</option><option>Cabbage</option><option>Okra</option><option>Turmeric</option><option>Ginger</option><option>Garlic</option></select></label><label>State / region<input id="market-state" value="Karnataka" placeholder="e.g. Karnataka"></label><label>District (optional)<input id="market-district" placeholder="e.g. Bengaluru Urban"></label><button type="button" class="outline-button full-width" id="load-market-prices">↻ Load official mandi / benchmark prices</button><div class="market-results" id="market-price-results"><small>Daily wholesale min / max / modal prices require a data.gov.in API key in config.local.php, or click above to load verified regional wholesale benchmarks.</small></div></div><div class="profit-result-grid" id="farm-profit-results"></div><div class="farm-report-actions"><button type="button" class="primary-button" id="farm-print-report">▤ Print A4 farm report / Save PDF</button><button type="button" class="outline-button" id="farm-share-report">↗ Share plan</button></div><div class="farm-risk-note"><b>Before planting</b><p>Weather and soil maps are screening signals. Confirm pH, EC/salinity, drainage, local disease pressure, water rights, seed variety and crop calendar with soil tests and local extension services. Profit is highly uncertain.</p></div></aside></div>
        <section class="nutrient-planner-panel" aria-labelledby="nutrient-planner-title"><div class="farm-econ-heading"><span class="eyebrow">SOIL TEST / EXTENSION RECOMMENDATION INPUT</span><h2 id="nutrient-planner-title">Fertilizer product calculator</h2><p>Enter N, P₂O₅ and K₂O targets supplied by your soil laboratory or local agricultural extension officer. Selecting a crop automatically loads standard reference targets.</p></div><div class="nutrient-input-grid"><label>Target nitrogen (N), kg/ha<input type="number" id="nutrient-n-target" min="0" step="1" value="100"></label><label>Target phosphate (P₂O₅), kg/ha<input type="number" id="nutrient-p-target" min="0" step="1" value="60"></label><label>Target potash (K₂O), kg/ha<input type="number" id="nutrient-k-target" min="0" step="1" value="60"></label></div><div id="nutrient-plan-results" class="nutrient-plan-results"><p>Enter nutrient targets above to calculate approximate fertilizer product quantities for the area in your farm planner.</p></div><p class="fine-print">Assumed labelled grades: urea 46-0-0, DAP 18-46-0 and MOP 0-0-60. Actual commercial analysis varies; consider nutrients already supplied by manure, irrigation water and other fertilizers. DAP adds nitrogen as well as phosphate. Split application, placement, leaching and crop-specific safety require local guidance. Never apply fertilizer based only on a map estimate.</p></section>
        <div class="farm-hazard-strip"><div><span class="eyebrow">AREA RISK CONTEXT</span><h2>What else can affect the farm?</h2><p>Open the map layers at this same pin to review recent earthquakes, fires, storms, flood/landslide catalogue records, temperature imagery and rainfall. Absence of a mapped record is not evidence of safety.</p></div><div class="farm-hazard-actions"><button type="button" class="outline-button" data-go-panel="explore">Open hazard & heat map ↗</button><button type="button" class="outline-button" data-go-panel="weather">Open forecast & climate ↗</button></div></div>
      </div>
    </section>

    <section class="workspace lower-workspace" id="panel-food" hidden>
      <div class="page-panel food-studio-page">
        <div class="page-heading">
          <div>
            <div class="eyebrow">FROM YOUR FRIDGE · LIVE RECIPES, MACRO NUTRITION & MULTI-CURRENCY BUDGET</div>
            <h1>Food Studio & AI Culinary Lab</h1>
            <p>Add what is in your kitchen or pick a 1-click regional favorite, customize your budget and dietary goals, inspect live API Ninjas macro nutrition & editable ingredient costs (₹ INR / रू NPR / $ USD), and remix any dish with the AI Sous-Chef.</p>
          </div>
          <div class="cross-workspace-bar" role="navigation" aria-label="Cross-workspace quick switcher">
            <button type="button" class="outline-button" data-go-panel="explore">◉ Globe Explorer</button>
            <button type="button" class="outline-button" data-go-panel="godseye">👁️ God's Eye Plugin</button>
            <button type="button" class="outline-button" data-go-panel="farm">♧ Farm Studio</button>
            <span class="source-pill">LIVE RECIPES + NUTRITION</span>
          </div>
        </div>
        <div class="food-preset-strip" aria-label="1-Click Dish & Pantry Presets">
          <span class="eyebrow">1-CLICK CHEF PRESETS:</span>
          <button type="button" class="ge-chip-btn" data-food-preset="Nepali Momo|Chicken, Cabbage, Onion, Garlic, Ginger, Flour, Coriander|90|any">🥟 Nepali Momo & Jhol</button>
          <button type="button" class="ge-chip-btn" data-food-preset="Paneer Butter Masala|Paneer, Tomatoes, Onion, Butter, Garlic, Cream, Garam Masala|120|vegetarian">🍛 Paneer Butter Masala</button>
          <button type="button" class="ge-chip-btn" data-food-preset="Spinach Potato Curry|Potatoes, Spinach, Tomatoes, Onion, Garlic, Cumin, Turmeric|70|vegan">🥔 Aloo Palak (Spinach Curry)</button>
          <button type="button" class="ge-chip-btn" data-food-preset="Egg Fried Rice|Eggs, Rice, Spinach, Garlic, Onion, Bell Pepper|80|high-protein">🥗 High-Protein Egg Rice Bowl</button>
          <button type="button" class="ge-chip-btn" data-food-preset="Lentil Soup|Red Lentils, Tomatoes, Garlic, Ginger, Cumin, Spinach, Rice|65|vegetarian">🍲 Dal Tadka & Jeera Rice</button>
          <button type="button" class="ge-chip-btn" data-food-preset="Mushroom Pasta|Mushrooms, Pasta, Garlic, Olive Oil, Spinach, Black Pepper|110|vegetarian">🍝 Garlic Mushroom Pasta</button>
        </div>
        <div class="food-studio-layout"><div class="food-maker-panel"><div class="food-maker-head"><span class="food-fridge-icon">▣</span><div><h2>What’s in your fridge?</h2><p>Ingredients, leftovers or pantry basics. Add more than one; multi-word items are supported.</p></div></div><form id="food-ingredient-form" class="food-ingredient-form"><input id="food-ingredient-input" placeholder="Eggs, spinach, rice, mushrooms…" maxlength="240" aria-label="Ingredient to add"><button type="submit">Add ingredient</button></form><div class="food-ingredient-chips" id="food-ingredient-chips"><span class="food-empty-chip">Add ingredients to start</span></div><div class="food-inline-tools"><button type="button" class="text-button" id="food-clear-ingredients">Clear all</button><button type="button" class="text-button" id="food-demo-ingredients">Try a sample pantry</button></div><div class="live-recipe-search"><div class="live-recipe-title"><b>Real recipe search</b><span>Live sources · API Ninjas + TheMealDB</span></div><label>Search mode<select id="food-search-mode"><option value="ingredients">Find recipes from pantry ingredients</option><option value="title">Search by recipe title / cuisine</option></select></label><label>Optional recipe name, cuisine or dish<input id="food-recipe-query" type="search" maxlength="160" placeholder="e.g. masala dosa, lentil soup, Thai curry"></label><p class="fine-print">Results come from real recipe APIs. API Ninjas ingredient matching may require Premium; TheMealDB provides a live fallback for title / single-ingredient lookup and random dishes. No preset recipes are substituted.</p></div><div class="food-preferences-grid"><label>Meal style <small class="field-help">Applied as a best-effort title/category hint</small><select id="food-meal-type"><option value="any">Surprise me</option><option value="snack">Snack</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch / dinner</option><option value="healthy">Balanced / lighter meal</option><option value="comfort">Comfort food</option></select></label><label>Diet<select id="food-diet"><option value="any">No restriction</option><option value="vegetarian">Vegetarian</option><option value="vegan">Vegan</option><option value="gluten-free">Gluten-free</option><option value="dairy-free">Dairy-free</option><option value="high-protein">Higher protein</option></select></label><label>Budget per serving (₹)<input id="food-budget" type="number" min="0" step="10" value="100"></label><label>Preferred cooking time <small class="field-help">Target only; provider may omit preparation time</small><select id="food-time"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label><label>Servings<input id="food-servings" type="number" min="1" max="12" step="1" value="2"></label></div><div class="food-generator-actions"><button type="button" class="primary-button" id="food-generate">✳ Find my best dish</button><button type="button" class="outline-button" id="food-random">⤨ Random dish</button></div><div class="food-location-note" id="food-location-note"><b>Food near selected map pin</b><span>Set a pin to view general seasonal ideas; availability and price vary by market.</span></div><button type="button" class="outline-button full-width" id="food-find-local">⌖ Find mapped markets / food shops nearby</button><div id="food-nearby-results" class="food-nearby-results"></div></div>
          <div class="food-result-panel"><div class="food-results-heading"><div><span class="eyebrow">YOUR COOKING BOARD</span><h2 id="food-result-title">A good meal starts with what you have.</h2><p id="food-result-subtitle">Live recipe search retrieves actual provider records; add pantry items or enter a dish / cuisine.</p></div><button type="button" class="outline-button" id="food-print-recipe">▤ Print recipe</button></div><div id="food-recipe-results" class="food-recipe-results"><div class="food-result-empty"><span>♨</span><b>Your dish will appear here</b><p>Shows provider-supplied ingredients, cooking steps and nutrition when returned. Local prices are not fabricated.</p></div></div></div></div>
        <div class="food-discovery-footer"><div><span class="eyebrow">SEASONAL & WELLNESS IDEAS</span><h2>Make the most of what is in season</h2><p>Food suggestions can use local weather and a pinned location as context, but they do not diagnose medical conditions or guarantee a food is locally available.</p></div><div class="food-footer-actions"><button type="button" class="outline-button" data-go-panel="farm">Explore fruit & veg catalogue</button><button type="button" class="outline-button" data-go-panel="explore">Choose a different place</button></div></div>
      </div>
    </section>

    <section class="workspace lower-workspace" id="panel-play" hidden>
      <div class="page-panel play-lab-page">
        <div class="page-heading"><div><div class="eyebrow">3D WORLD ENGINE · ONLINE MULTIPLAYER · HAZARD RESCUE</div><h1>3D Expedition & Street Race Lab</h1><p>Drive, drift, race with friends online, or fly rescue missions across real satellite imagery and 3D terrain. Choose from 6 procedural 3D vehicles (Apex GT Hypercar, Formula-X Racer, SAR 4x4 Flood Truck, Rescue Helicopter, Stealth Jet, Hydro Speedboat), join a room code with friends, race AI rivals through neon checkpoints, or navigate active 3D volcano and flood zones.</p></div><span class="source-pill">3D CHASE CAM · MULTIPLAYER</span></div>
        <div class="play-lab-grid">
          <div class="play-world-card"><div id="play-map" role="application" aria-label="Satellite map driving simulator"></div><div class="play-map-style-switch" role="group" aria-label="Map appearance"><button type="button" id="play-fullscreen" title="Fullscreen driving">⛶ FULLSCREEN</button><button type="button" data-play-view="2d">2D VIEW</button><button type="button" data-play-view="3d" class="active">3D VIEW</button><button type="button" data-play-map-style="hybrid">HYBRID</button><button type="button" data-play-map-style="satellite" class="active">SATELLITE</button><button type="button" data-play-map-style="map">MAP</button></div><div class="play-map-hud"><div><small>POSITION</small><b id="play-coords">26.4525° N · 87.2718° E</b></div><div><small>MODE / SPEED</small><b><span id="play-vehicle-label">SPORT</span> · <span id="play-speed">0</span> km/h</b></div><span class="play-live-chip"><i></i><span id="play-state">PAUSED</span></span></div><div class="play-map-tip">3D perspective chase cam · Tap map to teleport · W/A/S/D, Shift=Nitro, B=Drift, C=Camera, H=Siren</div>            <div class="mobile-driving-console" aria-label="Mobile driving controller">
              <div class="controller-mode-picker" role="group" aria-label="Choose mobile steering control"><button type="button" data-controller-mode="joystick" class="active">JOYSTICK</button><button type="button" data-controller-mode="wheel">STEERING WHEEL</button></div>
              <div class="virtual-joystick" id="drive-joystick" role="application" aria-label="Virtual joystick: drag upward to accelerate and left or right to steer">
                <div class="joystick-ring"><span class="joystick-axis axis-x"></span><span class="joystick-axis axis-y"></span><span class="joystick-knob" id="drive-joystick-knob"></span></div>
                <small>DRAG TO DRIVE</small>
              </div>
              <div class="mobile-wheel-controller" id="mobile-wheel-controller" hidden>
                <div class="wheel-controller-side"><button type="button" class="drive-action wheel-gas-action" data-drive="forward" aria-label="Accelerate">▲<span>GAS</span></button><button type="button" class="drive-action brake-action" data-drive="back" aria-label="Brake or reverse">▼<span>REVERSE</span></button></div>
                <div class="wheel-controller-main"><div class="steering-wheel" id="drive-steering-wheel" role="application" aria-label="Drag steering wheel left or right to steer"><span class="wheel-spoke wheel-spoke-top"></span><span class="wheel-spoke wheel-spoke-left"></span><span class="wheel-spoke wheel-spoke-right"></span><span class="wheel-hub"></span></div><small>DRAG WHEEL · HOLD GAS</small></div>
              </div>
              <div class="mobile-drive-actions"><button type="button" class="drive-action boost-action" data-drive="boost" aria-label="Boost speed">⚡<span>BOOST</span></button><button type="button" class="drive-action" data-drive="b" aria-label="Handbrake">⛔<span>HANDBRAKE</span></button><button type="button" class="drive-action brake-action" data-drive="back" aria-label="Brake or reverse">▼<span>REVERSE</span></button><button type="button" class="drive-action altitude-action" data-drive="r" aria-label="Aircraft ascend">↟<span>ASCEND</span></button><button type="button" class="drive-action altitude-action" data-drive="f" aria-label="Aircraft descend">↡<span>DESCEND</span></button></div>
            </div></div>
          <aside class="play-control-card">
            <div class="play-control-heading"><span class="play-control-icon">✦</span><div><b>Choose your vehicle & mission</b><small>6 3D vehicles · Online rooms · Global DB leaderboard</small></div></div>
            <div class="vehicle-picker" role="group" aria-label="Vehicle type"><button type="button" class="vehicle-pick active" data-vehicle="car"><span>🏎️</span><b>Sport</b><small>Street explorer</small></button><button type="button" class="vehicle-pick" data-vehicle="plane"><span>✈️</span><b>Aircraft</b><small>Fast fly-through</small></button><button type="button" class="vehicle-pick" data-vehicle="boat"><span>🚤</span><b>Boat</b><small>Coastal sandbox</small></button></div>
            <div class="play-control-actions"><button class="primary-button" id="play-start">▶ Start</button><button class="outline-button" id="play-reset">↺ Reset</button><button class="outline-button" id="play-use-place">◎ Use selected place</button></div>
            <div class="play-physics-setting"><label for="play-physics-mode">Driving physics</label><select id="play-physics-mode"><option value="realistic" selected>Grip & inertia model</option><option value="arcade">Arcade · quicker steering</option></select><label for="play-surface-mode">Surface grip</label><select id="play-surface-mode"><option value="dry">Dry asphalt</option><option value="wet">Wet road</option><option value="gravel">Gravel</option><option value="snow">Snow / ice</option></select></div><div class="play-speed-control"><label for="play-speed-range">Top speed <b id="play-speed-value">220 km/h</b></label><input type="range" id="play-speed-range" min="10" max="340" value="220" step="5"><div class="speed-scale"><span>10</span><span>170</span><span>340 km/h</span></div></div>

            <div class="play-keyboard"><b>Controls</b><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> drive / steer</div><div><kbd>Shift</kbd> Nitro Boost · <kbd>B</kbd> Drift Handbrake · <kbd>C</kbd> Camera View</div><div><kbd>R</kbd><kbd>F</kbd> Aircraft Altitude · <kbd>H</kbd> Emergency Siren</div><div><kbd>Space</kbd> Pause · <kbd>Esc</kbd> Release · Gamepad supported</div></div>
            <div class="play-notice"><b>3D World & Multiplayer</b><p>Features a Three.js perspective chase camera synced with MapLibre 3D terrain, 3D stunt ramps, speed boost pads, glowing race checkpoints, AI rivals, and live multiplayer room synchronization backed by the EARTHSCOPE database.</p></div>
          </aside>
        </div>
      </div>
    </section>

    <section class="workspace lower-workspace" id="panel-vision" hidden>
      <div class="page-panel vision-lab-page">
        <div class="page-heading"><div><div class="eyebrow">ON-DEVICE COMPUTER VISION · NO API KEY</div><h1>YOLO Vision Lab</h1><p>Run browser-side object detection on images or a webcam feed. The small YOLO26 model is loaded only when you start it; inference runs on your device using WebGPU when available with CPU/WASM fallback.</p></div><span class="source-pill">YOLO26N · BETA</span></div>
        <div class="vision-lab-grid"><section class="vision-input-card"><h2>Image or live camera</h2><label>Choose a photo<input type="file" id="vision-file" accept="image/jpeg,image/png,image/webp,image/avif"></label><div class="vision-actions"><button class="primary-button" id="vision-run-image" type="button">Detect objects in photo</button><button class="outline-button" id="vision-start-camera" type="button">Start webcam</button><button class="outline-button" id="vision-stop-camera" type="button" disabled>Stop camera</button></div><label class="vision-confidence-label">Detection confidence <b id="vision-confidence-value">0.35</b><input type="range" id="vision-confidence" min="0.1" max="0.85" value="0.35" step="0.05"></label><div class="vision-preview-stage"><video id="vision-video" autoplay playsinline muted hidden></video><img id="vision-image" alt="Selected image for on-device detection" hidden><canvas id="vision-canvas" aria-label="Image with detection boxes"></canvas></div><div id="vision-status" class="notice-box"><div><b>Ready to load model</b><p>First use downloads the model from a public model host. This can take time and requires internet; no image is uploaded to EARTHSCOPE's PHP server by this tool.</p></div></div></section><section class="vision-results-card"><h2>Detections</h2><div id="vision-detection-summary" class="vision-detection-summary"><div class="empty-state compact"><p>Run a photo or webcam detection to see labels, confidence and bounding boxes.</p></div></div><div class="vision-note"><b>Important model scope</b><p>YOLO26n's standard pretrained weights recognize a fixed set of general object classes (including only a limited selection of foods). It does not identify every fruit, vegetable, cultivar or plant disease. Detailed species identification remains a separate candidate-identification task and must not be used to determine whether a mushroom or plant is safe to eat.</p><p>Licensing: check the current Ultralytics YOLO package/model licence (AGPL-3.0 or applicable enterprise terms) before using it in a closed-source commercial deployment.</p><a href="https://www.npmjs.com/package/@ultralytics/yolo" target="_blank" rel="noopener">YOLO browser package docs ↗</a> · <a href="https://www.ultralytics.com/license" target="_blank" rel="noopener">Licensing ↗</a></div></section></div>
      </div>
    </section>

    <section class="workspace lower-workspace" id="panel-compare" hidden>
      <div class="page-panel"><div class="page-heading"><div><div class="eyebrow">TEMPORAL EXPLORATION</div><h1>Time compare</h1><p>Compare NASA GIBS imagery snapshots. Image availability depends on the selected product and date.</p></div><span class="source-pill nasa-pill">NASA GIBS</span></div><div class="compare-controls"><label>Image layer<select id="compare-product"><option value="VIIRS_SNPP_CorrectedReflectance_TrueColor">VIIRS SNPP True Color</option><option value="MODIS_Terra_CorrectedReflectance_TrueColor">MODIS Terra True Color</option><option value="MODIS_Aqua_CorrectedReflectance_TrueColor">MODIS Aqua True Color</option><option value="MODIS_Terra_CorrectedReflectance_Bands721">MODIS Terra Bands 7-2-1 (false colour)</option><option value="VIIRS_SNPP_DayNightBand_ENCC">VIIRS Day/Night band</option><option value="MODIS_Terra_Land_Surface_Temp_Day">MODIS daytime land surface temperature</option></select></label><label>Reference date<input type="date" id="date-a"></label><label>Compare date<input type="date" id="date-b"></label><button class="primary-button" id="run-compare">Open synchronized comparison</button></div><div class="compare-grid" id="compare-grid"><div class="compare-map-card"><div><b>REFERENCE</b><span id="date-a-label">—</span></div><div id="compare-map-a"></div></div><div class="compare-map-card"><div><b>COMPARISON</b><span id="date-b-label">—</span></div><div id="compare-map-b"></div></div></div><div id="compare-source-status" class="compare-source-status" role="status">Select a location on the main map and choose two distinct dates. Both comparison maps will synchronize their position and zoom.</div><div class="notice-box"><span>ⓘ</span><div><b>Comparison caveat</b><p>Different cloud cover, viewing geometry, image processing and acquisition times can create apparent differences. This tool displays source imagery; it does not automatically calculate a validated change product.</p></div></div></div>
    </section>

    <section class="workspace lower-workspace" id="panel-sources" hidden>
      <div class="page-panel"><div class="page-heading"><div><div class="eyebrow">TRANSPARENCY & PROVENANCE</div><h1>Data sources</h1><p>Every data layer should tell you who published it, when it was retrieved, and what it can and cannot say.</p></div><button class="outline-button" id="refresh-health">↻ Check status</button></div><div class="source-grid" id="source-grid"><div class="loading-line">Checking application capabilities…</div></div><div class="notice-box"><span>ⓘ</span><div><b>Free-tier and source limits</b><p>Public does not mean unlimited. Requests can be delayed, rate-limited or temporarily unavailable. EARTHSCOPE caches source responses and marks stale cache; it never labels cached data as a live response.</p></div></div></div>
    </section>

    <section class="workspace lower-workspace" id="panel-saved" hidden>
      <div class="page-panel"><div class="page-heading"><div><div class="eyebrow">PERSONAL WORKSPACE · PERSISTENT DATABASE</div><h1>Saved places</h1><p>Save points of interest from the globe into a private browser-session workspace backed by your database (automatic SQLite locally + MySQL in cPanel).</p></div><button class="outline-button" id="refresh-saved">↻ Refresh saved places</button></div><div class="notice-box"><span>ⓘ</span><div><b>Server-side persistence</b><p>Saved places are scoped to your browser session cookie and persisted in the server database (`saved_places` table).</p></div></div><div id="saved-places-list" class="archive-results"><div class="loading-line">Open this view to load your saved places…</div></div></div>
    </section>

    <footer class="bottom-status"><div class="status-left"><span class="pulse-dot"></span><span id="bottom-status-label">SYSTEM INITIALIZING</span><span class="separator">/</span><span id="last-updated">Waiting for first feed fetch</span></div><div class="status-right"><span>DATA: <b>PUBLIC SOURCES</b></span><span>AI: <b id="ai-status-text"><?=$aiEnabled ? 'CONFIGURED' : 'NOT CONFIGURED'?></b></span><span>VERSION <b>4.0.0</b></span></div></footer>
  </main>
</div>

<div class="assistant-drawer" id="assistant-drawer" aria-hidden="true">
  <div class="assistant-header"><div class="assistant-orb">✳</div><div><b>Ask Earth</b><small>Source-grounded context assistant</small></div><button class="icon-button" id="close-assistant" aria-label="Close assistant">×</button></div>
  <div class="assistant-safety"><span>ⓘ</span> AI explanations may be wrong. Open the source record to verify. The assistant cannot predict earthquakes or confirm causation from correlation.</div>
  <div class="assistant-messages" id="assistant-messages"><div class="assistant-message assistant"><small>EARTHSCOPE ASSISTANT</small><p>Choose a location or event, then ask what the available evidence says. I'll separate observations from forecasts and uncertainty.</p></div></div>
  <div class="quick-prompts"><button data-prompt="Summarize the selected area using only the loaded source data. Clearly separate observations, forecasts and unknowns.">Summarize this area</button><button data-prompt="What evidence is available here, and what important information is missing?">Evidence & gaps</button><button data-prompt="Explain the limitations of the current data layers and what should not be inferred.">Explain limitations</button></div>
  <div class="assistant-voicebar"><label>Answer language<select id="assistant-language"><option value="en-US">English</option><option value="hi-IN">हिन्दी · Hindi</option><option value="ne-NP">नेपाली · Nepali</option><option value="bn-IN">বাংলা · Bengali</option><option value="mai-IN">मैथिली · Maithili</option><option value="es-ES">Español · Spanish</option></select></label><button class="voice-button" id="assistant-mic" type="button" title="Ask a single question by voice" aria-label="Ask by voice">🎙 Speak</button><button class="voice-button live-voice-button" id="assistant-live-voice" type="button" title="Start live voice exploration. Say a place, food request or disaster question." aria-pressed="false">✦ Live Explore</button><button class="voice-button" id="assistant-speak-last" type="button" title="Listen to last answer" aria-label="Listen to last answer" disabled hidden>🔊 Listen</button></div><form id="assistant-form" class="assistant-form"><textarea id="assistant-question" rows="2" maxlength="1200" placeholder="Ask in your language… e.g. Biratnagar mein aaj barish hogi?" aria-label="Question for Ask Earth"></textarea><button type="submit" id="assistant-send" aria-label="Send question">↑</button></form>
  <div class="assistant-footer">Voice recognition depends on browser and language support. Answers can use browser speech or the optional OpenRouter TTS model. Only selected-place context is sent; do not enter private data.</div>
</div>
<div class="live-explore-backdrop" id="live-explore-backdrop" hidden>
  <section class="live-explore-dialog" id="live-explore-dialog" role="dialog" aria-modal="true" aria-labelledby="live-explore-title">
    <header class="live-explore-header"><div><span class="live-explore-eyebrow">EARTHSCOPE LIVE EXPLORER</span><h1 id="live-explore-title">Live Explore</h1><p id="live-explore-subtitle">Say a place, ask about a hazard, or search for a real recipe.</p></div><div class="live-explore-head-actions"><button type="button" class="live-action-button" id="live-explore-print">Print / Save PDF</button><button type="button" class="live-close-button" id="live-explore-close" aria-label="Close live explorer">×</button></div></header>
    <div class="live-explore-status" id="live-explore-status" role="status" aria-live="polite">Ready. Live data is retrieved when you submit a search.</div>
    <div class="live-explore-content" id="live-explore-content"><div class="live-explore-empty"><span>◎</span><b>Your interactive report appears here</b><p>Speak or type a location, a food request, or a hazard question. Sources and data limitations will be shown with the results.</p></div></div>
    <footer class="live-explore-footer"><span id="live-explore-provenance">EARTHSCOPE combines public-provider records; it does not guarantee complete coverage.</span><button type="button" class="live-action-button secondary" id="live-explore-back-map">Back to map</button></footer>
  </section>
</div>
<div class="toast-stack" id="toast-stack" aria-live="polite"></div>
<div class="mobile-backdrop" id="mobile-backdrop" hidden></div>
<script>window.EARTHSCOPE_CONFIG = <?=json_encode(['apiBase'=>'api.php','godseyePlatformUrl'=>'https://gods-eye-view-ten-mu.vercel.app/?embed=1&chrome=1','aiConfigured'=>$aiEnabled,'ttsConfigured'=>$aiEnabled,'firmsConfigured'=>$firmsEnabled,'marketConfigured'=>!empty($config['data_gov_in_api_key']) && !str_contains((string)$config['data_gov_in_api_key'],'ADD_'),'aviationstackConfigured'=>!empty($config['aviationstack_api_key']) && !str_contains((string)$config['aviationstack_api_key'],'ADD_')], JSON_UNESCAPED_SLASHES)?>;</script>
<script src="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<script src="assets/app.js?v=<?=$assetVersion?>" defer></script>
<script src="assets/disaster-fx.js?v=<?=$assetVersion?>" defer></script>
<script src="assets/godseye-exclusive.js?v=<?=$assetVersion?>" defer></script>
<script type="module" src="assets/vision-lab.js?v=<?=$assetVersion?>"></script>
<script defer src="assets/earthscope-plus.js?v=<?=$assetVersion?>"></script>
<script defer src="assets/live-explore.js?v=<?=$assetVersion?>"></script>
<script type="module" src="assets/playlab.js?v=<?=$assetVersion?>"></script>
<script defer src="assets/studio-v3.js?v=<?=$assetVersion?>"></script>
</body>
</html>
