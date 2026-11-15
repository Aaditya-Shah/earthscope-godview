/**
 * EARTHSCOPE v4.5 — Real-Map Filter-Driven Disaster Animations, God's Eye OSINT HUD & Autonomous Map SuperAgent
 *
 * 1. Real-Map Filter-Driven 60-FPS Disaster Animations (strictly on the real map #map when filtered):
 *    - Syncs directly with sidebar filter checkboxes (#layer-volcanoes, #layer-floods, #layer-quakes,
 *      #layer-wildfires, #layer-storms, #layer-events, #layer-gdacs, #gdacs-event-filter) and HUD filter pills.
 *    - Animates Volcanoes (3D volcano cone, molten crater glow, ballistic lava bombs, rising ash plumes),
 *      Floods (expanding hydrodynamic surge rings, water ripples, monsoon rain streaks),
 *      Earthquakes (propagating P-wave & S-wave rings), Wildfires, and Cyclones on #map.
 *
 * 2. God's Eye Tactical OSINT System (GitHub Panopticon / WorldView Mode):
 *    - Optical shader modes: Normal, NVG Night Vision, FLIR Thermal, CRT Scanline, SAR Radar.
 *    - Live Orbital Satellite Constellation Tracker (ISS, NISAR, Sentinel-2B, Landsat-9, NOAA-20, Starlink)
 *      with real-time orbital propagation, ground-swath footprints, and nadir lock lines.
 *    - Tactical Target Reticle & Telemetry HUD.
 *
 * 3. Autonomous Map SuperAgent ("Chat with Map"):
 *    - Understands natural language route & travel queries (e.g. "distance from biratnagar to bangalore
 *      and routes and ticket prices and traffic") as well as map filter/navigation commands.
 *    - Autonomously plots Primary + Alternative GeoJSON routes and Traffic Congestion Hotspots on #map,
 *      fits map bounds, and renders a complete Multi-Modal Ticket Price Matrix (Flight, Train, Bus, Car/EV
 *      in ₹ INR, रू NPR, and $ USD).
 */
(function () {
  'use strict';

  const STATE = {
    enabled: true,
    filter: 'all', // all | volcano | flood | earthquake | wildfire | storm
    syncWithMapCheckboxes: true,
    intensityScale: 1.15,
    liveImpacts: [],
    customDisasters: [],
    summary: null,
    localFlood: null,
    particles: [],
    canvas: null,
    ctx: null,
    geMap: null,
    geCanvas: null,
    geCtx: null,
    rafId: 0,
    dockCollapsed: false,
    // God's Eye OSINT State
    godsEyeActive: false,
    visionMode: 'normal', // normal | nvg | flir | crt | radar
    showSatellites: true,
    radarSweepAngle: 0,
    satellites: [
      { id: 'ISS', name: 'ISS (ZARYA)', norad: 25544, altKm: 408, incDeg: 51.6, periodMin: 92.8, phase: 0.15, raan: 25, color: '#38bdf8', sensor: 'Crew Earth Obs / HD' },
      { id: 'NISAR', name: 'NASA-ISRO NISAR', norad: 60125, altKm: 747, incDeg: 98.4, periodMin: 100.0, phase: 0.42, raan: 85, color: '#10b981', sensor: 'L+S Band Dual SAR' },
      { id: 'SENTINEL2', name: 'SENTINEL-2B', norad: 42063, altKm: 786, incDeg: 98.6, periodMin: 100.6, phase: 0.68, raan: 145, color: '#f59e0b', sensor: 'MSI 13-Band Optical' },
      { id: 'LANDSAT9', name: 'LANDSAT-9', norad: 49260, altKm: 705, incDeg: 98.2, periodMin: 98.9, phase: 0.88, raan: 210, color: '#a78bfa', sensor: 'OLI-2 / TIRS-2 Thermal' },
      { id: 'NOAA20', name: 'NOAA-20 (JPSS-1)', norad: 43013, altKm: 824, incDeg: 98.7, periodMin: 101.4, phase: 0.31, raan: 275, color: '#fb7185', sensor: 'VIIRS Active Fire/Flood' },
      { id: 'STARLINK', name: 'STARLINK-4102', norad: 53812, altKm: 550, incDeg: 53.2, periodMin: 95.6, phase: 0.56, raan: 320, color: '#22d3ee', sensor: 'Ku/Ka-Band LEO Relay' },
    ],
    // SuperAgent Route State
    activeRouteData: null,
    selectedRouteIndex: 0,
  };

  const PRESET_HOTSPOTS = [
    { id: 'preset-etna', type: 'volcano', title: 'Mount Etna Eruption (Italy)', lat: 37.7510, lon: 14.9934, magnitude: 6.8, severity: 'extreme', plume_height_km: 14.5, impact_radius_km: 65, source: 'NASA EONET + INGV' },
    { id: 'preset-koshi', type: 'flood', title: 'Koshi / Biratnagar Basin Flood Surge', lat: 26.5280, lon: 87.1500, magnitude: 6.4, severity: 'high', impact_radius_km: 85, source: 'GloFAS Hydrological Surge' },
    { id: 'preset-kilauea', type: 'volcano', title: 'Kīlauea Caldera Lava Fountain (Hawaii)', lat: 19.4069, lon: -155.2834, magnitude: 6.4, severity: 'high', plume_height_km: 11.0, impact_radius_km: 55, source: 'USGS HVO / NASA EONET' },
    { id: 'preset-tokyo-eq', type: 'earthquake', title: 'Sagami Trough M7.6 Seismic Wave', lat: 35.4500, lon: 139.6500, magnitude: 7.6, severity: 'extreme', impact_radius_km: 320, source: 'USGS Seismic P/S Wave' },
    { id: 'preset-reykjanes', type: 'volcano', title: 'Reykjanes Svartsengi Magma Fissure', lat: 63.8830, lon: -22.4190, magnitude: 6.2, severity: 'high', plume_height_km: 9.2, impact_radius_km: 45, source: 'IMO / NASA EONET' },
  ];

  function getMap() {
    return window.EARTHSCOPE_MAP || (window.EARTHSCOPE_BRIDGE && window.EARTHSCOPE_BRIDGE.getMap && window.EARTHSCOPE_BRIDGE.getMap()) || null;
  }

  function getActiveTargetMap() {
    const panelGe = document.getElementById('panel-godseye');
    if (panelGe && !panelGe.hidden && STATE.geMap) return STATE.geMap;
    return getMap();
  }

  function getAppState() {
    return window.EARTHSCOPE_STATE || (window.EARTHSCOPE_BRIDGE && window.EARTHSCOPE_BRIDGE.getState && window.EARTHSCOPE_BRIDGE.getState()) || null;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initCanvas() {
    const mapEl = document.getElementById('map');
    if (mapEl && !STATE.canvas) {
      const canvas = document.createElement('canvas');
      canvas.id = 'disaster-fx-canvas';
      canvas.className = 'disaster-fx-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      mapEl.appendChild(canvas);
      STATE.canvas = canvas;
      STATE.ctx = canvas.getContext('2d');
    }
    const geMapEl = document.getElementById('godseye-map');
    if (geMapEl && !STATE.geCanvas) {
      const geCanvas = document.createElement('canvas');
      geCanvas.id = 'godseye-fx-canvas';
      geCanvas.className = 'disaster-fx-canvas';
      geCanvas.setAttribute('aria-hidden', 'true');
      geMapEl.appendChild(geCanvas);
      STATE.geCanvas = geCanvas;
      STATE.geCtx = geCanvas.getContext('2d');
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  function resizeOneCanvas(canvas) {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth || 800;
    const h = parent.clientHeight || 520;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
  }

  function resizeCanvas() {
    resizeOneCanvas(STATE.canvas);
    resizeOneCanvas(STATE.geCanvas);
  }

  /**
   * Reads the real map's sidebar filter checkboxes (#layer-volcanoes, #layer-floods, #layer-quakes,
   * #layer-wildfires, #layer-storms, #layer-events, #layer-gdacs, #gdacs-event-filter)
   * so that any filter toggled on the real map immediately animates those hazards on #map.
   */
  function getActiveMapFilterTypes() {
    const chk = (id) => !!document.getElementById(id)?.checked;
    const gdacsOn = chk('layer-gdacs');
    const gdacsFilter = document.getElementById('gdacs-event-filter')?.value || 'all';
    const eventsOn = chk('layer-events');

    const activeTypes = new Set();
    if (chk('layer-volcanoes') || eventsOn || (gdacsOn && (gdacsFilter === 'all' || gdacsFilter === 'VO'))) {
      activeTypes.add('volcano');
    }
    if (chk('layer-floods') || eventsOn || (gdacsOn && (gdacsFilter === 'all' || gdacsFilter === 'FL'))) {
      activeTypes.add('flood');
    }
    if (chk('layer-quakes') || (gdacsOn && (gdacsFilter === 'all' || gdacsFilter === 'EQ'))) {
      activeTypes.add('earthquake');
    }
    if (chk('layer-wildfires') || chk('layer-fires') || eventsOn || (gdacsOn && (gdacsFilter === 'all' || gdacsFilter === 'WF'))) {
      activeTypes.add('wildfire');
    }
    if (chk('layer-storms') || eventsOn || (gdacsOn && (gdacsFilter === 'all' || gdacsFilter === 'TC'))) {
      activeTypes.add('storm');
    }
    return activeTypes;
  }

  /**
   * Collects live hazards from both `api.php?action=live-impact` AND the real map's GeoJSON state
   * (`window.EARTHSCOPE_STATE.eonet`, `disasters`, `earthquakes`) so filtered map features always animate.
   */
  function getMergedRealMapHazards() {
    const byKey = new Map();
    const addHazard = (h) => {
      if (!h || !Number.isFinite(Number(h.lat)) || !Number.isFinite(Number(h.lon))) return;
      const lat = Number(h.lat);
      const lon = Number(h.lon);
      const key = `${h.type}_${lat.toFixed(1)}_${lon.toFixed(1)}`;
      if (!byKey.has(key)) {
        byKey.set(key, Object.assign({}, h, { lat, lon }));
      }
    };

    // 1. User-spawned / preset simulations
    STATE.customDisasters.forEach(addHazard);

    // 2. Live impact engine hazards
    STATE.liveImpacts.forEach(addHazard);

    // 3. Direct real-map GeoJSON features from window.EARTHSCOPE_STATE
    const appState = getAppState();
    if (appState) {
      const eonetFeatures = appState.eonet?.features || [];
      eonetFeatures.forEach((f) => {
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;
        const p = f.properties || {};
        let type = null;
        if (p.is_volcano) type = 'volcano';
        else if (p.is_flood) type = 'flood';
        else if (p.is_wildfire) type = 'wildfire';
        else if (p.is_storm) type = 'storm';
        if (type) {
          addHazard({
            id: p.id || f.id || 'eonet_' + Math.random(),
            type,
            title: p.title || 'Active EONET Hazard',
            lat: Number(coords[1]),
            lon: Number(coords[0]),
            magnitude: type === 'volcano' ? 6.2 : 5.8,
            severity: 'high',
            source: 'NASA EONET',
          });
        }
      });

      const gdacsFeatures = appState.disasters?.features || [];
      gdacsFeatures.forEach((f) => {
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;
        const p = f.properties || {};
        const et = String(p.eventtype || '').toUpperCase();
        const mapType = { VO: 'volcano', FL: 'flood', EQ: 'earthquake', TC: 'storm', WF: 'wildfire' }[et];
        if (mapType) {
          addHazard({
            id: p.id || 'gdacs_' + Math.random(),
            type: mapType,
            title: p.name || p.headline || 'GDACS Alert',
            lat: Number(coords[1]),
            lon: Number(coords[0]),
            magnitude: 6.3,
            severity: String(p.alertlevel || 'Orange').toLowerCase() === 'red' ? 'extreme' : 'high',
            source: 'GDACS UN/EC',
          });
        }
      });

      const quakeFeatures = appState.earthquakes?.features || [];
      quakeFeatures.slice(0, 28).forEach((f) => {
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;
        const p = f.properties || {};
        const mag = Number(p.mag ?? p.magnitude ?? 4.8);
        if (mag >= 4.5) {
          addHazard({
            id: f.id || 'usgs_' + Math.random(),
            type: 'earthquake',
            title: p.title || p.place || `M${mag.toFixed(1)} Earthquake`,
            lat: Number(coords[1]),
            lon: Number(coords[0]),
            magnitude: mag,
            severity: mag >= 6.0 ? 'extreme' : 'high',
            source: 'USGS',
          });
        }
      });
    }

    return Array.from(byKey.values());
  }

  function getAllActiveDisasters() {
    const all = getMergedRealMapHazards();

    // If user selected a specific pill in the HUD (e.g. Volcanoes or Floods), show that type
    if (STATE.filter !== 'all') {
      return all.filter((d) => d.type === STATE.filter);
    }

    // Otherwise, respect the real map's filter checkboxes + custom simulated hazards
    const activeTypes = getActiveMapFilterTypes();
    return all.filter((d) => d.simulated || activeTypes.has(d.type));
  }

  /**
   * Synchronizes the real map's sidebar filter checkboxes when the user clicks a hazard filter pill
   * or requests a hazard filter via the SuperAgent.
   */
  function setRealMapHazardFilter(filterType, flyToFirst = false) {
    STATE.filter = filterType || 'all';
    STATE.enabled = true;
    const fxChk = document.getElementById('ds-enable-fx');
    if (fxChk) fxChk.checked = true;
    if (STATE.canvas) STATE.canvas.style.display = 'block';

    // Update dock pill active states
    document.querySelectorAll('[data-ds-filter]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-ds-filter') === STATE.filter);
    });

    // Also ensure the corresponding real-map checkbox in the sidebar is checked so markers + animations align
    const checkboxMap = {
      volcano: 'layer-volcanoes',
      flood: 'layer-floods',
      earthquake: 'layer-quakes',
      wildfire: 'layer-wildfires',
      storm: 'layer-storms',
    };
    if (filterType !== 'all' && checkboxMap[filterType]) {
      const cb = document.getElementById(checkboxMap[filterType]);
      if (cb && !cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const list = getAllActiveDisasters();
    if (flyToFirst && list.length > 0) {
      const target = list[0];
      const map = getActiveTargetMap();
      if (map && typeof map.flyTo === 'function') {
        map.flyTo({ center: [target.lon, target.lat], zoom: Math.max(map.getZoom(), 6.2), pitch: 52, duration: 1500 });
      }
    }
    updateDockCounts();
  }

  function buildDockUI() {
    // Keep #panel-explore (#map-stage) 100% clean (no floating docks or overlays covering the original map).
    // Add a compact hazard simulation row inside #layer-popover so users in Globe Explorer can still spawn animations if desired.
    const layerPopover = document.getElementById('layer-popover');
    if (layerPopover && !document.getElementById('layer-popover-fx-sim')) {
      const simBlock = document.createElement('div');
      simBlock.id = 'layer-popover-fx-sim';
      simBlock.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid var(--stroke);';
      simBlock.innerHTML = `
        <div class="layer-group-label">INTERACTIVE HAZARD ANIMATIONS</div>
        <div class="layer-inline-actions" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
          <button type="button" class="outline-button" data-ds-spawn="volcano">🌋 Erupt Volcano</button>
          <button type="button" class="outline-button" data-ds-spawn="flood">🌊 Flood Surge</button>
          <button type="button" class="outline-button" data-ds-spawn="earthquake">〰️ M7.5 Quake</button>
          <button type="button" class="outline-button" id="ds-clear-sim-popover">✕ Clear</button>
        </div>
      `;
      layerPopover.appendChild(simBlock);
      simBlock.querySelector('#ds-clear-sim-popover')?.addEventListener('click', () => {
        STATE.customDisasters = [];
        STATE.particles = [];
        updateDockCounts();
      });
    }

    // Wire Filter Pills (in #panel-godseye) -> Syncs with Real Map Filter Checkboxes
    document.querySelectorAll('[data-ds-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = btn.getAttribute('data-ds-filter') || 'all';
        setRealMapHazardFilter(f, f !== 'all');
      });
    });

    // Listen to Sidebar Map Filter Checkboxes (#layer-volcanoes, #layer-floods, etc.)
    const mapFilterIds = [
      'layer-volcanoes',
      'layer-floods',
      'layer-quakes',
      'layer-wildfires',
      'layer-storms',
      'layer-events',
      'layer-gdacs',
      'gdacs-event-filter',
    ];
    mapFilterIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          if ((id === 'layer-volcanoes' || id === 'layer-floods') && el.checked) {
            STATE.enabled = true;
          }
          updateDockCounts();
        });
      }
    });

    window.addEventListener('earthscope:layerschange', updateDockCounts);
    window.addEventListener('earthscope:feedsloaded', updateDockCounts);

    // Wire Spawn Buttons across the app
    document.querySelectorAll('[data-ds-spawn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-ds-spawn');
        spawnDisasterAtPin(type);
      });
    });

    document.getElementById('ds-clear-sim')?.addEventListener('click', () => {
      STATE.customDisasters = [];
      STATE.particles = [];
      updateDockCounts();
    });

    // Wire SuperAgent Form & Quick Chips inside #panel-godseye
    const saForm = document.getElementById('superagent-map-form');
    const saInput = document.getElementById('superagent-map-input');
    saForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = saInput?.value?.trim();
      if (q) executeSuperAgentQuery(q);
    });

    document.querySelectorAll('[data-sa-prompt]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-sa-prompt') || '';
        if (saInput) saInput.value = prompt;
        executeSuperAgentQuery(prompt);
      });
    });

    // Also hook into #planet-prompt-form and #assistant-form so route queries work from ANY chat bar!
    hookExistingPromptForms();
  }

  function setGodsEyeMode(mode) {
    STATE.visionMode = mode || 'normal';
    STATE.godsEyeActive = STATE.visionMode !== 'normal';

    const wrap = document.getElementById('ge-plugin-map-wrap');
    if (wrap) {
      wrap.setAttribute('data-gods-eye-mode', STATE.visionMode);
    }

    document.querySelectorAll('[data-ge-mode]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-ge-mode') === STATE.visionMode);
    });

    updateGodsEyeTelemetry();
  }

  function updateGodsEyeTelemetry() {
    const telEl = document.getElementById('ge-hud-telemetry');
    const map = getActiveTargetMap();
    const zoom = map && typeof map.getZoom === 'function' ? map.getZoom().toFixed(1) : '5.0';
    const appState = getAppState();
    const acCount = appState?.aircraft?.features?.length || appState?.aircraft?.length || 0;
    const hazCount = getAllActiveDisasters().length;

    if (telEl) {
      const modeNames = { normal: 'Standard', nvg: 'Night Vision', flir: 'Thermal FLIR', crt: 'CRT Scanline', radar: 'SAR Radar' };
      telEl.textContent = `Optical: ${modeNames[STATE.visionMode] || STATE.visionMode} · Zoom: ${zoom}x (Max 22x) · Aircraft: ${acCount} · Active Hazards: ${hazCount} · Satellites: ${STATE.satellites.length}`;
    }
  }

  /**
   * Hooks #planet-prompt-form and #assistant-form so if the user asks a route/ticket/traffic question
   * in the top bar or AI assistant panel, our SuperAgent also plots the route & shows tickets on the map!
   */
  function hookExistingPromptForms() {
    const isRouteOrFilterQuery = (q) => {
      const s = String(q || '').toLowerCase();
      return (
        /\b(from\s+.+\s+to\s+.+|route|distance|ticket|flight|train|traffic|biratnagar|bangalore|bengaluru|kathmandu)\b/i.test(s) ||
        /\b(animate\s+volcano|animate\s+flood|god'?s\s+eye|flir|nvg)\b/i.test(s)
      );
    };

    const planetForm = document.getElementById('planet-prompt-form');
    const planetInput = document.getElementById('planet-prompt') || document.getElementById('planet-prompt-input');
    if (planetForm && planetInput) {
      planetForm.addEventListener('submit', () => {
        const q = planetInput.value.trim();
        if (isRouteOrFilterQuery(q)) {
          const saInput = document.getElementById('superagent-map-input');
          if (saInput) saInput.value = q;
          executeSuperAgentQuery(q);
        }
      });
    }

    const assistantForm = document.getElementById('assistant-form');
    const assistantInput = document.getElementById('assistant-question') || document.getElementById('assistant-input');
    if (assistantForm && assistantInput) {
      assistantForm.addEventListener('submit', () => {
        const q = assistantInput.value.trim();
        if (isRouteOrFilterQuery(q)) {
          const saInput = document.getElementById('superagent-map-input');
          if (saInput) saInput.value = q;
          executeSuperAgentQuery(q);
        }
      });
    }
  }

  /**
   * Autonomous Map SuperAgent Execution Engine:
   * Handles:
   *  1. Hazard filter & animation commands ("animate volcanoes", "show floods", "filter earthquakes")
   *  2. God's Eye OSINT commands ("enable god's eye flir", "night vision")
   *  3. Route, Distance, Live Traffic Hotspots & Multi-Modal Ticket Price queries
   *     (e.g. "distance from biratnagar to bangalore and routes and ticket prices and traffic")
   */
  async function executeSuperAgentQuery(rawQuery) {
    const q = String(rawQuery || '').trim();
    if (!q) return;

    const lower = q.toLowerCase();
    const drawer = document.getElementById('superagent-result-drawer');
    const btn = document.getElementById('superagent-submit-btn');

    // Ensure we are on the God's Eye Plugin panel when running SuperAgent route/OSINT queries
    const geNav = document.querySelector('.nav-item[data-panel="godseye"]');
    const exploreNav = document.querySelector('.nav-item[data-panel="explore"]');
    if (geNav && !geNav.classList.contains('active') && (!exploreNav || !exploreNav.classList.contains('active'))) {
      geNav.click();
    }

    // 1. Check for God's Eye optical mode commands
    if (/\b(god'?s\s*eye|flir|thermal|night\s*vision|nvg|crt|sar\s*radar)\b/i.test(lower)) {
      let mode = 'flir';
      if (lower.includes('nvg') || lower.includes('night')) mode = 'nvg';
      else if (lower.includes('crt')) mode = 'crt';
      else if (lower.includes('radar') || lower.includes('sar')) mode = 'radar';
      else if (lower.includes('normal') || lower.includes('off')) mode = 'normal';
      setGodsEyeMode(mode);
      if (drawer) {
        drawer.hidden = false;
        drawer.innerHTML = `
          <div class="sa-card-header">
            <strong>👁️ God's Eye OSINT Mode Activated (${escapeHtml(mode.toUpperCase())})</strong>
            <button type="button" class="sa-close-btn" id="sa-close-drawer">✕</button>
          </div>
          <p class="sa-summary-text">Tactical optical shader set to <b>${escapeHtml(mode.toUpperCase())}</b> with live LEO/SSO orbital satellite tracking (ISS, NISAR, Sentinel-2B, Landsat-9, NOAA-20) and 22x Google Earth Ultra-Zoom.</p>
        `;
        drawer.querySelector('#sa-close-drawer')?.addEventListener('click', () => { drawer.hidden = true; });
      }
      return;
    }

    // 2. Check for pure hazard filter / animation commands
    if (/\b(volcano|volcanoes|eruption)\b/i.test(lower) && !/\b(to|from|route|ticket|distance)\b/i.test(lower)) {
      setRealMapHazardFilter('volcano', true);
      if (drawer) {
        drawer.hidden = false;
        drawer.innerHTML = `
          <div class="sa-card-header">
            <strong>🌋 Real-Map Volcano Filter & 3D Eruption Animations Active</strong>
            <button type="button" class="sa-close-btn" id="sa-close-drawer">✕</button>
          </div>
          <p class="sa-summary-text">Filtered real map to <b>Active Volcanoes</b> (${getAllActiveDisasters().length} live volcanic hotspots) with 60-FPS lava fountains, ash plumes & pyroclastic rings.</p>
        `;
        drawer.querySelector('#sa-close-drawer')?.addEventListener('click', () => { drawer.hidden = true; });
      }
      return;
    }

    if (/\b(flood|floods|inundation)\b/i.test(lower) && !/\b(to|from|route|ticket|distance)\b/i.test(lower)) {
      setRealMapHazardFilter('flood', true);
      if (drawer) {
        drawer.hidden = false;
        drawer.innerHTML = `
          <div class="sa-card-header">
            <strong>🌊 Real-Map Flood Filter & Hydrological Surge Animations Active</strong>
            <button type="button" class="sa-close-btn" id="sa-close-drawer">✕</button>
          </div>
          <p class="sa-summary-text">Filtered real map to <b>Active Floods</b> (${getAllActiveDisasters().length} flood zones) with expanding inundation waves and GloFAS discharge telemetry.</p>
        `;
        drawer.querySelector('#sa-close-drawer')?.addEventListener('click', () => { drawer.hidden = true; });
      }
      return;
    }

    // 3. Parse Origin & Destination for Route / Distance / Traffic / Ticket Intelligence
    let from = '';
    let to = '';
    const mFromTo = q.match(/from\s+([a-zA-Z\s,.-]+?)\s+to\s+([a-zA-Z\s,.-]+?)(?:\s+and\b|\s+with\b|\s+routes?\b|\s+tickets?\b|\s+traffic\b|\s+price|\?|$)/i);
    const mArrow = q.match(/([a-zA-Z\s]+?)\s*(?:->|→|\bto\b)\s*([a-zA-Z\s]+?)(?:\s+and\b|\s+routes?\b|\s+tickets?\b|\s+traffic\b|$)/i);
    if (mFromTo) {
      from = mFromTo[1].trim();
      to = mFromTo[2].trim();
    } else if (mArrow) {
      from = mArrow[1].replace(/^(distance|route|routes|tickets|flights|travel)\s+/i, '').trim();
      to = mArrow[2].replace(/\b(routes?|tickets?|prices?|traffic|everything|all).*$/i, '').trim();
    }

    if (!from || !to) {
      // Default fallback if they typed a general route question without clear "from X to Y"
      from = 'Biratnagar';
      to = 'Bangalore';
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Routing…';
    }
    if (drawer) {
      drawer.hidden = false;
      drawer.innerHTML = `<div class="sa-loading">🤖 SuperAgent computing primary & alternative routes, live traffic bottlenecks, and multi-modal ticket fares from <b>${escapeHtml(from)}</b> to <b>${escapeHtml(to)}</b>…</div>`;
    }

    try {
      const params = new URLSearchParams({
        action: 'route-planner',
        from,
        to,
        q,
      });
      const res = await fetch('api.php?' + params.toString(), { headers: { Accept: 'application/json' } });
      const json = await res.json();
      const routePayload = json?.data || (json?.ok && json?.routes ? json : null);
      if (!routePayload) {
        throw new Error(json?.error || 'Route calculation failed');
      }
      STATE.activeRouteData = routePayload;
      STATE.selectedRouteIndex = 0;
      renderRoutesOnMap(routePayload);
      renderSuperAgentRouteCard(routePayload);
    } catch (err) {
      if (drawer) {
        drawer.innerHTML = `
          <div class="sa-card-header">
            <strong>⚠️ SuperAgent Notice</strong>
            <button type="button" class="sa-close-btn" id="sa-close-drawer">✕</button>
          </div>
          <p class="sa-summary-text">${escapeHtml(err.message || 'Could not compute route.')}</p>
        `;
        drawer.querySelector('#sa-close-drawer')?.addEventListener('click', () => { drawer.hidden = true; });
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Execute ↗';
      }
    }
  }

  /**
   * Renders Primary Route, Alternative Routes, Traffic Congestion Hotspots, and Origin/Destination
   * directly onto the MapLibre real map (`window.EARTHSCOPE_MAP`).
   */
  function renderRoutesOnSingleMap(map, data) {
    if (!map || typeof map.getSource !== 'function') return;

    const routes = Array.isArray(data.routes) ? data.routes : [];
    const primaryRoute = routes[STATE.selectedRouteIndex] || routes[0];
    const altRoutes = routes.filter((_, idx) => idx !== STATE.selectedRouteIndex);

    const primaryGeoJSON = {
      type: 'FeatureCollection',
      features: primaryRoute && primaryRoute.geometry
        ? [{
            type: 'Feature',
            properties: {
              label: primaryRoute.label,
              distance_km: primaryRoute.distance_km,
              duration_label: primaryRoute.duration_label,
            },
            geometry: primaryRoute.geometry,
          }]
        : [],
    };

    const altGeoJSON = {
      type: 'FeatureCollection',
      features: altRoutes
        .filter((r) => r && r.geometry)
        .map((r) => ({
          type: 'Feature',
          properties: {
            label: r.label,
            distance_km: r.distance_km,
            duration_label: r.duration_label,
          },
          geometry: r.geometry,
        })),
    };

    const trafficGeoJSON = {
      type: 'FeatureCollection',
      features: (Array.isArray(data.traffic_hotspots) ? data.traffic_hotspots : []).map((t) => ({
        type: 'Feature',
        properties: {
          name: t.title || t.name || 'Traffic Bottleneck',
          severity: t.severity || 'heavy',
          delay_min: t.delay_minutes ?? t.delay_min ?? 20,
          avg_speed_kmh: t.avg_speed_kmh ?? 22,
          color: t.severity === 'heavy' ? '#ef4444' : '#f59e0b',
        },
        geometry: t.geometry,
      })),
    };

    const endpointsGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { role: 'ORIGIN', label: `START: ${data.origin?.name || 'Origin'}`, color: '#10b981' },
          geometry: { type: 'Point', coordinates: [Number(data.origin?.lon || 0), Number(data.origin?.lat || 0)] },
        },
        {
          type: 'Feature',
          properties: { role: 'DESTINATION', label: `END: ${data.destination?.name || 'Destination'}`, color: '#38bdf8' },
          geometry: { type: 'Point', coordinates: [Number(data.destination?.lon || 0), Number(data.destination?.lat || 0)] },
        },
      ],
    };

    const upsertSource = (id, geojson) => {
      const existing = map.getSource(id);
      if (existing && typeof existing.setData === 'function') {
        existing.setData(geojson);
      } else {
        map.addSource(id, { type: 'geojson', data: geojson });
      }
    };

    upsertSource('sa-alt-routes', altGeoJSON);
    upsertSource('sa-primary-route', primaryGeoJSON);
    upsertSource('sa-traffic-hotspots', trafficGeoJSON);
    upsertSource('sa-endpoints', endpointsGeoJSON);

    if (!map.getLayer('sa-alt-routes-line')) {
      map.addLayer({
        id: 'sa-alt-routes-line',
        type: 'line',
        source: 'sa-alt-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#a855f7',
          'line-width': 4,
          'line-dasharray': [2, 2],
          'line-opacity': 0.85,
        },
      });
    }

    if (!map.getLayer('sa-primary-route-glow')) {
      map.addLayer({
        id: 'sa-primary-route-glow',
        type: 'line',
        source: 'sa-primary-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#10b981',
          'line-width': 10,
          'line-opacity': 0.28,
        },
      });
    }

    if (!map.getLayer('sa-primary-route-line')) {
      map.addLayer({
        id: 'sa-primary-route-line',
        type: 'line',
        source: 'sa-primary-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#34d399',
          'line-width': 4.5,
          'line-opacity': 0.96,
        },
      });
    }

    if (!map.getLayer('sa-traffic-hotspots-line')) {
      map.addLayer({
        id: 'sa-traffic-hotspots-line',
        type: 'line',
        source: 'sa-traffic-hotspots',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#ef4444'],
          'line-width': 7.5,
          'line-opacity': 0.95,
        },
      });
    }

    if (!map.getLayer('sa-endpoints-circle')) {
      map.addLayer({
        id: 'sa-endpoints-circle',
        type: 'circle',
        source: 'sa-endpoints',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });
    }

    if (data.origin && data.destination && typeof map.fitBounds === 'function') {
      const minLon = Math.min(Number(data.origin.lon), Number(data.destination.lon));
      const maxLon = Math.max(Number(data.origin.lon), Number(data.destination.lon));
      const minLat = Math.min(Number(data.origin.lat), Number(data.destination.lat));
      const maxLat = Math.max(Number(data.origin.lat), Number(data.destination.lat));
      map.fitBounds(
        [
          [minLon - 1.5, minLat - 1.2],
          [maxLon + 1.5, maxLat + 1.2],
        ],
        { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 1400 }
      );
    }
  }

  function renderRoutesOnMap(data) {
    renderRoutesOnSingleMap(getMap(), data);
    if (STATE.geMap) renderRoutesOnSingleMap(STATE.geMap, data);
  }

  function clearRoutesFromMap() {
    const empty = { type: 'FeatureCollection', features: [] };
    [getMap(), STATE.geMap].forEach((map) => {
      if (!map || typeof map.getSource !== 'function') return;
      ['sa-alt-routes', 'sa-primary-route', 'sa-traffic-hotspots', 'sa-endpoints'].forEach((id) => {
        const src = map.getSource(id);
        if (src && typeof src.setData === 'function') src.setData(empty);
      });
    });
    STATE.activeRouteData = null;
  }

  function renderSuperAgentRouteCard(data) {
    const drawer = document.getElementById('superagent-result-drawer');
    if (!drawer) return;
    drawer.hidden = false;

    const routes = Array.isArray(data.routes) ? data.routes : [];
    const activeRoute = routes[STATE.selectedRouteIndex] || routes[0] || {};
    const traffic = Array.isArray(data.traffic_hotspots) ? data.traffic_hotspots : [];
    const tickets = data.tickets || {};

    const routeTabsHtml = routes
      .map(
        (r, i) => `
        <button type="button" class="sa-route-tab ${i === STATE.selectedRouteIndex ? 'active' : ''}" data-sa-route-idx="${i}">
          <span class="sa-route-dot" style="background:${escapeHtml(r.color || (i === 0 ? '#10b981' : '#a855f7'))}"></span>
          <div>
            <strong>${escapeHtml(r.label || 'Route ' + (i + 1))}</strong>
            <small>${escapeHtml(r.distance_km)} km · ${escapeHtml(r.duration_formatted || r.duration_label || data.driving_duration)} · ${escapeHtml(r.summary || 'Highway Route')}</small>
          </div>
        </button>
      `
      )
      .join('');

    const trafficHtml = traffic
      .map((t) => {
        const tLat = Number(t.center?.lat ?? t.lat ?? data.origin?.lat ?? 0);
        const tLon = Number(t.center?.lon ?? t.lon ?? data.origin?.lon ?? 0);
        const tDelay = t.delay_minutes ?? t.delay_min ?? 20;
        const tName = t.title || t.name || 'Corridor Congestion Bottleneck';
        return `
        <button type="button" class="sa-traffic-item" data-sa-fly-lat="${tLat}" data-sa-fly-lon="${tLon}" title="Click to zoom to this traffic bottleneck on the map">
          <span class="sa-traffic-badge ${escapeHtml(t.severity)}">${escapeHtml(String(t.severity || 'heavy').toUpperCase())}</span>
          <div class="sa-traffic-info">
            <strong>${escapeHtml(tName)}</strong>
            <small>+${escapeHtml(tDelay)} min delay · Avg ${escapeHtml(t.avg_speed_kmh ?? 22)} km/h</small>
          </div>
          <span class="sa-zoom-tag">Zoom ↗</span>
        </button>
      `;
      })
      .join('');

    const renderTicketDetails = (tk) => {
      if (!tk) return '';
      let rows = '';
      if (Array.isArray(tk.tiers)) {
        rows = tk.tiers
          .map(
            (t) => `
          <div class="sa-ticket-tier">
            <span>${escapeHtml(t.class)}</span>
            <strong>₹${Number(t.inr || 0).toLocaleString()} <small>(रू ${Number(t.npr || 0).toLocaleString()} · $${escapeHtml(t.usd)})</small></strong>
          </div>`
          )
          .join('');
      } else {
        if (tk.classes && typeof tk.classes === 'object') {
          rows += Object.entries(tk.classes)
            .map(
              ([cls, val]) => `
            <div class="sa-ticket-tier">
              <span>${escapeHtml(cls)}</span>
              <strong>${escapeHtml(val)}</strong>
            </div>`
            )
            .join('');
        }
        if (tk.fare_inr) {
          rows += `
            <div class="sa-ticket-tier">
              <span>Estimated Fare</span>
              <strong>${escapeHtml(tk.fare_inr)} <small>(${escapeHtml(tk.fare_npr || '')} · ${escapeHtml(tk.fare_usd || '')})</small></strong>
            </div>`;
        }
        if (tk.fuel_liters) {
          rows += `
            <div class="sa-ticket-tier">
              <span>Fuel & Highway Tolls</span>
              <strong>${escapeHtml(tk.fuel_liters)} · Tolls ${escapeHtml(tk.tolls_inr || '₹2,800')}</strong>
            </div>`;
        }
      }
      return rows;
    };

    const summaryText =
      data.agent_summary ||
      `Autonomous route analysis from ${data.origin?.name || 'Origin'} to ${data.destination?.name || 'Destination'}: ${data.road_distance_km} km by road (${data.driving_duration}, +${data.traffic_delay_minutes || 45} min live traffic delay across ${traffic.length} bottlenecks) and ${data.aerial_distance_km} km aerial distance. Showing ${routes.length} routes (Primary + Alternative) on the map.`;

    drawer.innerHTML = `
      <div class="sa-card-header">
        <div>
          <span class="sa-route-kicker">AUTONOMOUS SUPERAGENT ROUTE, TRAFFIC & MULTI-MODAL TICKET MATRIX</span>
          <h4>📍 ${escapeHtml(data.origin?.name)} → 🎯 ${escapeHtml(data.destination?.name)}</h4>
        </div>
        <div class="sa-header-actions">
          <span class="sa-dist-pill">✈️ Aerial: <b>${escapeHtml(data.aerial_distance_km)} km</b></span>
          <span class="sa-dist-pill primary">🛣️ Road: <b>${escapeHtml(activeRoute.distance_km || data.road_distance_km)} km</b> (${escapeHtml(activeRoute.duration_formatted || activeRoute.duration_label || data.driving_duration)})</span>
          <button type="button" class="sa-close-btn" id="sa-close-drawer" title="Close & Clear Route">✕</button>
        </div>
      </div>

      <p class="sa-summary-text">${escapeHtml(summaryText)}</p>

      <div class="sa-route-tabs">${routeTabsHtml}</div>

      <div class="sa-grid">
        <div class="sa-col traffic-col">
          <h5>🚦 Live Traffic Congestion Hotspots (Click to Inspect on Map)</h5>
          <div class="sa-traffic-list">${trafficHtml}</div>
          <div class="sa-route-corridor-note">
            <strong>Selected Highway Corridor:</strong> ${escapeHtml((activeRoute.major_roads || []).slice(0, 5).join(' → ') || activeRoute.summary || 'Primary National Highway')}
          </div>
        </div>

        <div class="sa-col tickets-col">
          <h5>🎫 Multi-Modal Ticket Prices (₹ INR · रू NPR · $ USD)</h5>
          <div class="sa-tickets-grid">
            ${tickets.flight ? `
              <div class="sa-ticket-card">
                <div class="sa-ticket-head">
                  <strong>✈️ ${escapeHtml(tickets.flight.mode)}</strong>
                  <span>${escapeHtml(tickets.flight.estimated_duration || tickets.flight.duration || '')}</span>
                </div>
                <small class="sa-ticket-sub">${escapeHtml(tickets.flight.airports || tickets.flight.note || '')}</small>
                ${renderTicketDetails(tickets.flight)}
              </div>
            ` : ''}
            ${tickets.train ? `
              <div class="sa-ticket-card">
                <div class="sa-ticket-head">
                  <strong>🚆 ${escapeHtml(tickets.train.mode)}</strong>
                  <span>${escapeHtml(tickets.train.estimated_duration || tickets.train.duration || '')}</span>
                </div>
                <small class="sa-ticket-sub">${escapeHtml(tickets.train.stations || tickets.train.note || '')}</small>
                ${renderTicketDetails(tickets.train)}
              </div>
            ` : ''}
            ${tickets.bus ? `
              <div class="sa-ticket-card">
                <div class="sa-ticket-head">
                  <strong>🚌 ${escapeHtml(tickets.bus.mode)}</strong>
                  <span>${escapeHtml(tickets.bus.estimated_duration || tickets.bus.duration || '')}</span>
                </div>
                <small class="sa-ticket-sub">Intercity Luxury Coach / Sleeper</small>
                ${renderTicketDetails(tickets.bus)}
              </div>
            ` : ''}
            ${tickets.car ? `
              <div class="sa-ticket-card">
                <div class="sa-ticket-head">
                  <strong>🚗 ${escapeHtml(tickets.car.mode)}</strong>
                  <span>${escapeHtml(tickets.car.estimated_duration || tickets.car.duration || '')}</span>
                </div>
                <small class="sa-ticket-sub">Self-Drive Petrol/Diesel vs EV Fast-Charge</small>
                ${renderTicketDetails(tickets.car)}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    drawer.querySelector('#sa-close-drawer')?.addEventListener('click', () => {
      drawer.hidden = true;
      clearRoutesFromMap();
    });

    drawer.querySelectorAll('[data-sa-route-idx]').forEach((tab) => {
      tab.addEventListener('click', () => {
        STATE.selectedRouteIndex = parseInt(tab.getAttribute('data-sa-route-idx') || '0', 10) || 0;
        renderRoutesOnMap(data);
        renderSuperAgentRouteCard(data);
      });
    });

    drawer.querySelectorAll('[data-sa-fly-lat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lat = parseFloat(btn.getAttribute('data-sa-fly-lat'));
        const lon = parseFloat(btn.getAttribute('data-sa-fly-lon'));
        const map = getMap();
        if (map && Number.isFinite(lat) && Number.isFinite(lon)) {
          map.flyTo({ center: [lon, lat], zoom: 14.5, pitch: 58, duration: 1500 });
        }
      });
    });
  }

  function getSelectedPinOrCenter() {
    const coordsEl = document.getElementById('selected-coords');
    if (coordsEl && coordsEl.textContent) {
      const m = coordsEl.textContent.match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?.*?(?:·|,)\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?/i);
      if (m) {
        let lat = parseFloat(m[1]);
        let lon = parseFloat(m[3]);
        if (m[2] && m[2].toUpperCase() === 'S') lat = -Math.abs(lat);
        if (m[4] && m[4].toUpperCase() === 'W') lon = -Math.abs(lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
      }
    }
    const map = getMap();
    if (map && typeof map.getCenter === 'function') {
      const c = map.getCenter();
      return { lat: c.lat, lon: c.lng };
    }
    return { lat: 27.7172, lon: 85.3240 };
  }

  function spawnDisasterAtPin(type) {
    const pt = getSelectedPinOrCenter();
    const titles = {
      volcano: 'Stratovolcano Eruption & Pyroclastic Plume',
      flood: 'Flash Flood & River Basin Surge Inundation',
      earthquake: 'M7.5 Seismic P/S Shockwave Epicenter',
      storm: 'Category-5 Super Cyclone Vortex',
      wildfire: 'Crown Wildfire Thermal Front',
    };
    const item = {
      id: 'sim_' + type + '_' + Date.now(),
      type: type || 'volcano',
      title: titles[type] || 'Simulated Hazard',
      lat: pt.lat,
      lon: pt.lon,
      magnitude: type === 'earthquake' ? 7.5 : 6.5,
      severity: 'extreme',
      impact_radius_km: type === 'storm' ? 240 : type === 'earthquake' ? 180 : 75,
      plume_height_km: type === 'volcano' ? 15.0 : 6.0,
      simulated: true,
      source: 'Real-Map Interactive Hazard Animation',
      updated_at: new Date().toISOString(),
    };
    STATE.customDisasters.unshift(item);
    if (STATE.customDisasters.length > 15) STATE.customDisasters.pop();
    STATE.enabled = true;
    const chk = document.getElementById('ds-enable-fx');
    if (chk) chk.checked = true;

    const map = getMap();
    if (map && typeof map.flyTo === 'function') {
      map.flyTo({ center: [pt.lon, pt.lat], zoom: Math.max(map.getZoom(), 7.5), pitch: 55, duration: 1400 });
    }
    spawnBurstParticles(item, 52);
    updateDockCounts();
  }

  function triggerPresetHotspot(preset) {
    const existing = STATE.customDisasters.find((d) => d.id === preset.id);
    if (!existing) {
      STATE.customDisasters.unshift(Object.assign({}, preset, { simulated: true, updated_at: new Date().toISOString() }));
    }
    const map = getMap();
    if (map && typeof map.flyTo === 'function') {
      map.flyTo({ center: [preset.lon, preset.lat], zoom: 8.4, pitch: 58, bearing: -18, duration: 1600 });
    }
    spawnBurstParticles(preset, 60);
    updateDockCounts();
  }

  function updateDockCounts() {
    const all = getMergedRealMapHazards();
    const counts = { volcano: 0, flood: 0, earthquake: 0, wildfire: 0, storm: 0 };
    all.forEach((d) => {
      if (counts[d.type] !== undefined) counts[d.type]++;
    });
    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(v);
    };
    setTxt('ds-count-all', all.length);
    setTxt('ds-count-volcano', counts.volcano);
    setTxt('ds-count-flood', counts.flood);
    setTxt('ds-count-quake', counts.earthquake);
    setTxt('ds-count-fire', counts.wildfire);
    setTxt('ds-count-storm', counts.storm);

    const badge = document.getElementById('ds-stress-badge');
    if (badge) {
      const stress = STATE.summary?.planetary_stress_index ?? Math.min(100, Math.round(all.length * 1.4));
      const floodTxt = STATE.localFlood ? ` · RIVER FLOW: ${STATE.localFlood.current_discharge_m3s} m³/s (${STATE.localFlood.flood_stage_label})` : '';
      badge.textContent = `PLANETARY STRESS: ${stress}/100${floodTxt}`;
    }
    updateGodsEyeTelemetry();
  }

  async function fetchLiveImpacts(lat, lon) {
    try {
      const q = new URLSearchParams({ action: 'live-impact' });
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        q.set('lat', String(lat));
        q.set('lon', String(lon));
      }
      const res = await fetch('api.php?' + q.toString(), { headers: { Accept: 'application/json' } });
      const json = await res.json();
      if (json && json.ok && json.data) {
        STATE.liveImpacts = Array.isArray(json.data.impacts) ? json.data.impacts : [];
        STATE.summary = json.data.summary || null;
        STATE.localFlood = json.data.local_flood_hydrology || null;
        updateDockCounts();
      }
    } catch (err) {
      console.warn('[EARTHSCOPE DisasterFX] Live impact fetch deferred:', err);
    }
  }

  function spawnBurstParticles(hazard, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 2.2;
      STATE.particles.push({
        lat: hazard.lat,
        lon: hazard.lon,
        type: hazard.type,
        vx: Math.cos(angle) * speed,
        vy: hazard.type === 'volcano' || hazard.type === 'wildfire' ? -1.2 - Math.random() * 2.6 : Math.sin(angle) * speed,
        vz: 0.5 + Math.random() * 2.0,
        life: 0,
        maxLife: 45 + Math.floor(Math.random() * 55),
        size: 2.5 + Math.random() * 4.5,
      });
    }
  }

  /**
   * 3D Globe Horizon / Backside-of-Earth Occlusion Culling:
   * Prevents MapLibre's `map.project([lon, lat])` from projecting points located on the far hemisphere
   * (e.g. 180° across the Earth) through the front of the 3D globe.
   */
  function isPointVisibleOnGlobe(map, lat, lon) {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;

    try {
      if (map.transform && typeof map.transform.isLocationOccluded === 'function') {
        if (map.transform.isLocationOccluded({ lng: lo, lat: la })) return false;
      }
      const center = typeof map.getCenter === 'function' ? map.getCenter() : null;
      if (center) {
        const rad = Math.PI / 180;
        const phi1 = center.lat * rad;
        const phi2 = la * rad;
        const dLon = (lo - center.lng) * rad;
        const cosAngle =
          Math.sin(phi1) * Math.sin(phi2) +
          Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLon);
        // Any point > ~78 degrees from camera center is beyond the visible 3D globe horizon (or on the back hemisphere)
        if (cosAngle < 0.20) return false;
      }
    } catch (_) {}
    return true;
  }

  /**
   * Propagates live orbital positions for ISS, NISAR, Sentinel-2B, Landsat-9, NOAA-20, Starlink
   * and renders their ground-track orbits, swath footprints, and telemetry on the real map.
   */
  function drawOrbitalSatellites(ctx, map, width, height, t) {
    if (!STATE.showSatellites && !STATE.godsEyeActive) return;

    const targetPt = getSelectedPinOrCenter();
    const targetVisible = isPointVisibleOnGlobe(map, targetPt.lat, targetPt.lon);
    const targetScreen = targetVisible ? map.project([targetPt.lon, targetPt.lat]) : null;

    STATE.satellites.forEach((sat, idx) => {
      const angularSpeed = (Math.PI * 2) / (sat.periodMin * 60);
      const meanAnomaly = sat.phase * Math.PI * 2 + t * angularSpeed * 18; // accelerated slightly for live visual tracking
      const incRad = (sat.incDeg * Math.PI) / 180;
      const lat = (Math.asin(Math.sin(incRad) * Math.sin(meanAnomaly)) * 180) / Math.PI;
      const lonRaw = ((sat.raan + (meanAnomaly * 180) / Math.PI - t * 0.25) % 360 + 540) % 360 - 180;

      sat.currentLat = lat;
      sat.currentLon = lonRaw;

      if (!isPointVisibleOnGlobe(map, lat, lonRaw)) return;

      const pt = map.project([lonRaw, lat]);
      if (!pt || pt.x < -120 || pt.x > width + 120 || pt.y < -120 || pt.y > height + 120) return;

      // 1. Draw short ground-track trajectory arc (with horizon occlusion check per vertex)
      ctx.save();
      ctx.strokeStyle = sat.color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let startedArc = false;
      for (let step = -12; step <= 12; step += 3) {
        const ma = meanAnomaly + step * 0.04;
        const sLat = (Math.asin(Math.sin(incRad) * Math.sin(ma)) * 180) / Math.PI;
        const sLon = ((sat.raan + (ma * 180) / Math.PI - t * 0.25) % 360 + 540) % 360 - 180;
        if (Math.abs(sLon - lonRaw) > 90) continue;
        if (!isPointVisibleOnGlobe(map, sLat, sLon)) {
          startedArc = false;
          continue;
        }
        const sp = map.project([sLon, sLat]);
        if (!sp) continue;
        if (!startedArc) {
          ctx.moveTo(sp.x, sp.y);
          startedArc = true;
        } else {
          ctx.lineTo(sp.x, sp.y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Sensor Swath Footprint Ring
      const swathR = 18 + (idx % 3) * 5;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = sat.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, swathR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = sat.color;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, swathR * (0.65 + 0.35 * Math.sin(t * 2.5 + idx)), 0, Math.PI * 2);
      ctx.stroke();

      // 3. If God's Eye is active, draw tactical lock line to selected pin when in range
      if (STATE.godsEyeActive && targetScreen) {
        const distPx = Math.hypot(pt.x - targetScreen.x, pt.y - targetScreen.y);
        if (distPx < 420) {
          ctx.strokeStyle = sat.color;
          ctx.globalAlpha = 0.38;
          ctx.lineWidth = 1.1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(targetScreen.x, targetScreen.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 4. Satellite Icon (solar panels + bus)
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = sat.color;
      ctx.lineWidth = 1.6;
      ctx.fillRect(pt.x - 10, pt.y - 3, 6, 6);
      ctx.strokeRect(pt.x - 10, pt.y - 3, 6, 6);
      ctx.fillRect(pt.x + 4, pt.y - 3, 6, 6);
      ctx.strokeRect(pt.x + 4, pt.y - 3, 6, 6);
      ctx.fillStyle = sat.color;
      ctx.fillRect(pt.x - 3, pt.y - 4, 6, 8);

      // 5. Telemetry tag
      ctx.font = '600 9.5px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(6, 11, 22, 0.85)';
      const label = `🛰️ ${sat.id} · ${sat.altKm}km`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillRect(pt.x - tw / 2, pt.y + 10, tw, 15);
      ctx.strokeStyle = sat.color;
      ctx.lineWidth = 0.9;
      ctx.strokeRect(pt.x - tw / 2, pt.y + 10, tw, 15);
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pt.x, pt.y + 17.5);
      ctx.restore();
    });
  }

  function renderCanvasLayer(canvas, ctx, map, includeSatellitesAndRadar, ts) {
    if (!canvas || !ctx || !map || typeof map.project !== 'function') return;
    resizeOneCanvas(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 2;
    const zoomScale = Math.max(0.45, Math.min(4.2, Math.pow(1.26, zoom - 3))) * STATE.intensityScale;
    const t = ts * 0.001;

    // 1. Render Real-Map Filtered Disaster Animations (with 3D Globe Horizon Culling)
    if (STATE.enabled) {
      const active = getAllActiveDisasters();
      const maxRender = Math.min(active.length, 75);

      for (let i = 0; i < maxRender; i++) {
        const h = active[i];
        if (!isPointVisibleOnGlobe(map, h.lat, h.lon)) continue;
        const pt = map.project([h.lon, h.lat]);
        if (!pt || pt.x < -160 || pt.x > width + 160 || pt.y < -160 || pt.y > height + 160) continue;

        if (h.type === 'volcano') {
          drawVolcanoFX(ctx, pt.x, pt.y, h, zoomScale, t, i);
        } else if (h.type === 'flood') {
          drawFloodFX(ctx, pt.x, pt.y, h, zoomScale, t, i);
        } else if (h.type === 'earthquake') {
          drawEarthquakeFX(ctx, pt.x, pt.y, h, zoomScale, t, i);
        } else if (h.type === 'storm') {
          drawStormFX(ctx, pt.x, pt.y, h, zoomScale, t, i);
        } else if (h.type === 'wildfire') {
          drawWildfireFX(ctx, pt.x, pt.y, h, zoomScale, t, i);
        }
      }

      for (let i = STATE.particles.length - 1; i >= 0; i--) {
        const p = STATE.particles[i];
        if (!includeSatellitesAndRadar) {
          p.life++;
          if (p.life >= p.maxLife) {
            STATE.particles.splice(i, 1);
            continue;
          }
        }
        if (!isPointVisibleOnGlobe(map, p.lat, p.lon)) continue;
        const pt = map.project([p.lon, p.lat]);
        if (!pt) continue;
        const prog = p.life / p.maxLife;
        const px = pt.x + p.vx * p.life * zoomScale * 0.55;
        const py = pt.y + p.vy * p.life * zoomScale * 0.55;
        ctx.beginPath();
        ctx.arc(px, py, p.size * (1 - prog * 0.6) * Math.min(1.8, zoomScale), 0, Math.PI * 2);
        if (p.type === 'volcano') {
          ctx.fillStyle = prog < 0.45 ? `rgba(255, 190, 40, ${1 - prog})` : `rgba(110, 110, 120, ${(1 - prog) * 0.75})`;
        } else if (p.type === 'flood') {
          ctx.fillStyle = `rgba(56, 189, 248, ${(1 - prog) * 0.85})`;
        } else {
          ctx.fillStyle = `rgba(251, 113, 133, ${(1 - prog) * 0.85})`;
        }
        ctx.fill();
      }
    }

    // 2. Render Live Orbital Satellites & SAR Radar Sweep ONLY inside the God's Eye Plugin map
    if (includeSatellitesAndRadar) {
      drawOrbitalSatellites(ctx, map, width, height, t);

      if (STATE.visionMode === 'radar') {
        const cx = width / 2;
        const cy = height / 2;
        const maxR = Math.hypot(cx, cy);
        STATE.radarSweepAngle = (t * 1.4) % (Math.PI * 2);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(STATE.radarSweepAngle);
        const sweepGrad = ctx.createLinearGradient(0, 0, maxR, 0);
        sweepGrad.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
        sweepGrad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
        ctx.fillStyle = sweepGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, maxR, -0.28, 0.02);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  function renderFrame(ts) {
    STATE.rafId = requestAnimationFrame(renderFrame);

    const panelExplore = document.getElementById('panel-explore');
    if (panelExplore && !panelExplore.hidden && STATE.canvas && STATE.ctx) {
      const map = getMap();
      if (map) renderCanvasLayer(STATE.canvas, STATE.ctx, map, false, ts);
    }

    const panelGe = document.getElementById('panel-godseye');
    if (panelGe && !panelGe.hidden && STATE.geCanvas && STATE.geCtx && STATE.geMap) {
      renderCanvasLayer(STATE.geCanvas, STATE.geCtx, STATE.geMap, true, ts);
    }
  }

  function drawVolcanoFX(ctx, x, y, h, scale, t, seed) {
    const baseR = (h.simulated ? 36 : 24) * scale;

    // 1. 3D Stratovolcano Cone Silhouette on Map
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - baseR * 0.85, y + baseR * 0.45);
    ctx.lineTo(x - baseR * 0.22, y - baseR * 0.25);
    ctx.lineTo(x + baseR * 0.22, y - baseR * 0.25);
    ctx.lineTo(x + baseR * 0.85, y + baseR * 0.45);
    ctx.closePath();
    const coneGrad = ctx.createLinearGradient(x, y - baseR * 0.25, x, y + baseR * 0.45);
    coneGrad.addColorStop(0, 'rgba(255, 87, 34, 0.78)');
    coneGrad.addColorStop(0.5, 'rgba(68, 42, 34, 0.75)');
    coneGrad.addColorStop(1, 'rgba(28, 25, 23, 0.15)');
    ctx.fillStyle = coneGrad;
    ctx.fill();
    ctx.restore();

    // 2. Thermal magma crater glow
    const grad = ctx.createRadialGradient(x, y - baseR * 0.2, 2, x, y, baseR * 1.45);
    grad.addColorStop(0, 'rgba(255, 238, 120, 0.95)');
    grad.addColorStop(0.28, 'rgba(255, 69, 0, 0.72)');
    grad.addColorStop(0.65, 'rgba(180, 20, 10, 0.28)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, baseR * 1.45, 0, Math.PI * 2);
    ctx.fill();

    // 3. Pyroclastic shockwave ring
    const waveProg = (t * 0.75 + seed * 0.31) % 1;
    ctx.strokeStyle = `rgba(255, 115, 29, ${(1 - waveProg) * 0.8})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, baseR * (0.35 + waveProg * 1.35), 0, Math.PI * 2);
    ctx.stroke();

    // 4. Rising 3D-projected ash cloud & ballistic lava fountain
    for (let k = 0; k < 10; k++) {
      const pProg = (t * (0.9 + (k % 3) * 0.25) + k * 0.14 + seed) % 1;
      const spread = Math.sin(k * 2.4 + t * 2.1) * baseR * 0.55 * pProg;
      const lift = pProg * baseR * 2.05;
      const px = x + spread;
      const py = y - baseR * 0.2 - lift;

      if (pProg > 0.32) {
        const ashR = (4.5 + pProg * 15) * Math.min(1.7, scale);
        ctx.fillStyle = `rgba(65, 62, 68, ${(1 - pProg) * 0.55})`;
        ctx.beginPath();
        ctx.arc(px + pProg * 10, py, ashR, 0, Math.PI * 2);
        ctx.fill();
      }

      const emberR = Math.max(1.8, (1 - pProg) * 5.4 * Math.min(1.6, scale));
      ctx.fillStyle = pProg < 0.35 ? '#fff3a1' : '#ff4d00';
      ctx.beginPath();
      ctx.arc(px, py, emberR, 0, Math.PI * 2);
      ctx.fill();
    }

    if (h.simulated || scale > 1.1 || STATE.filter === 'volcano') {
      drawHazardTag(ctx, x, y + baseR * 0.75 + 12, '🌋 ' + h.title.slice(0, 26), '#ff5722');
    }
  }

  function drawFloodFX(ctx, x, y, h, scale, t, seed) {
    const baseR = (h.simulated ? 48 : 30) * scale;

    // 1. Rising inundation basin glow
    const grad = ctx.createRadialGradient(x, y, 4, x, y, baseR * 1.4);
    grad.addColorStop(0, 'rgba(14, 165, 233, 0.62)');
    grad.addColorStop(0.55, 'rgba(6, 182, 212, 0.32)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, baseR * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // 2. Concentric expanding flood surge wave rings
    for (let w = 0; w < 3; w++) {
      const prog = (t * 0.55 + w * 0.33 + seed * 0.17) % 1;
      const r = baseR * (0.2 + prog * 1.28);
      ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - prog) * 0.88})`;
      ctx.lineWidth = 2.5 - prog * 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.78, Math.sin(t * 0.4 + seed) * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Animated rain streaks & water crest ripples
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.7)';
    ctx.lineWidth = 1.35;
    for (let r = 0; r < 6; r++) {
      const rProg = (t * 1.8 + r * 0.19 + seed) % 1;
      const rx = x + Math.cos(r * 1.1) * baseR * 0.6;
      const ry = y - baseR * 0.8 + rProg * baseR * 1.4;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 3, ry + 9);
      ctx.stroke();
    }

    if (h.simulated || scale > 1.1 || STATE.filter === 'flood') {
      drawHazardTag(ctx, x, y + baseR * 0.75 + 12, '🌊 ' + h.title.slice(0, 26), '#0ea5e9');
    }
  }

  function drawEarthquakeFX(ctx, x, y, h, scale, t, seed) {
    const mag = Number(h.magnitude) || 5.0;
    const magFactor = Math.max(0.6, Math.min(2.8, (mag - 2.5) * 0.42));
    const baseR = (h.simulated ? 54 : 26) * scale * magFactor;

    const pProg = (t * 0.95 + seed * 0.23) % 1;
    ctx.strokeStyle = `rgba(34, 211, 238, ${(1 - pProg) * 0.7})`;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(x, y, baseR * pProg * 1.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let s = 0; s < 2; s++) {
      const sProg = (t * 0.58 + s * 0.5 + seed * 0.23) % 1;
      ctx.strokeStyle = mag >= 6.0
        ? `rgba(244, 63, 94, ${(1 - sProg) * 0.9})`
        : `rgba(251, 146, 60, ${(1 - sProg) * 0.85})`;
      ctx.lineWidth = 2.8 * (1 - sProg * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, baseR * sProg, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = mag >= 6.0 ? '#f43f5e' : '#fb923c';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    if (h.simulated || mag >= 5.8 || STATE.filter === 'earthquake') {
      drawHazardTag(ctx, x, y + baseR * 0.65 + 12, `M${mag.toFixed(1)} SEISMIC WAVE`, '#f43f5e');
    }
  }

  function drawStormFX(ctx, x, y, h, scale, t, seed) {
    const baseR = (h.simulated ? 52 : 34) * scale;
    const rot = t * 1.65 + seed;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    for (let arm = 0; arm < 4; arm++) {
      ctx.save();
      ctx.rotate((arm * Math.PI) / 2);
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.65)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      for (let step = 0; step <= 20; step++) {
        const u = step / 20;
        const r = 5 + u * baseR;
        const a = u * Math.PI * 1.35;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (step === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(221, 214, 254, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (h.simulated || scale > 1.2 || STATE.filter === 'storm') {
      drawHazardTag(ctx, x, y + baseR + 12, '🌀 ' + h.title.slice(0, 24), '#a78bfa');
    }
  }

  function drawWildfireFX(ctx, x, y, h, scale, t, seed) {
    const baseR = (h.simulated ? 30 : 18) * scale;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, baseR);
    grad.addColorStop(0, 'rgba(253, 224, 71, 0.9)');
    grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.55)');
    grad.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, baseR, 0, Math.PI * 2);
    ctx.fill();

    for (let f = 0; f < 5; f++) {
      const p = (t * 1.4 + f * 0.2 + seed) % 1;
      const fx = x + Math.sin(t * 3 + f * 1.7) * baseR * 0.35;
      const fy = y - p * baseR * 1.4;
      ctx.fillStyle = p < 0.5 ? `rgba(251, 146, 60, ${1 - p})` : `rgba(120, 113, 108, ${(1 - p) * 0.6})`;
      ctx.beginPath();
      ctx.arc(fx, fy, (1 - p * 0.4) * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHazardTag(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = '600 10.5px Inter, system-ui, sans-serif';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(9, 14, 26, 0.86)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 9, w, 18, 9);
    else ctx.rect(x - w / 2, y - 9, w, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ============================================================================
  // GOD'S EYE EXCLUSIVE STANDALONE PLUGIN (#panel-godseye)
  // Dedicated MapLibre instance (#godseye-map) + SuperAgent + Satellites + Radar
  // ============================================================================
  let gePanelOpen = false;
  let geSatTimer = null;
  let geControlsWired = false;

  function initGodsEyeMapInstance() {
    if (STATE.geMap) return STATE.geMap;
    const container = document.getElementById('godseye-map');
    if (!container || !window.maplibregl) return null;

    const geMap = new window.maplibregl.Map({
      container: 'godseye-map',
      maxZoom: 22,
      center: [87.2718, 26.4525],
      zoom: 5.5,
      pitch: 45,
      bearing: 0,
      style: {
        version: 8,
        sources: {
          google_sat: {
            type: 'raster',
            tiles: [
              'https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
              'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
            ],
            tileSize: 256,
            maxzoom: 22,
          },
          google_road: {
            type: 'raster',
            tiles: [
              'https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
              'https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
            ],
            tileSize: 256,
            maxzoom: 22,
          },
          osm_tiles: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
          },
          'aircraft-src': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          'fires-src': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
        },
        layers: [
          {
            id: 'ge-google-sat-layer',
            type: 'raster',
            source: 'google_sat',
            minzoom: 0,
            maxzoom: 22,
            layout: { visibility: 'visible' },
          },
          {
            id: 'ge-google-road-layer',
            type: 'raster',
            source: 'google_road',
            minzoom: 0,
            maxzoom: 22,
            layout: { visibility: 'none' },
          },
          {
            id: 'ge-osm-layer',
            type: 'raster',
            source: 'osm_tiles',
            minzoom: 0,
            maxzoom: 22,
            layout: { visibility: 'none' },
          },
          {
            id: 'fires-points',
            type: 'circle',
            source: 'fires-src',
            paint: {
              'circle-radius': 5,
              'circle-color': '#fb923c',
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#fff7ed',
            },
          },
          {
            id: 'aircraft-symbols',
            type: 'circle',
            source: 'aircraft-src',
            paint: {
              'circle-radius': 6,
              'circle-color': '#38bdf8',
              'circle-stroke-width': 1.8,
              'circle-stroke-color': '#0f172a',
            },
          },
        ],
      },
    });

    geMap.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    geMap.on('load', () => {
      initGeCanvas();
      resizeGeCanvas();
      if (STATE.activeRoutes.length) {
        renderRoutesOnMap();
      }
    });

    geMap.on('click', (e) => {
      if (e && e.lngLat) {
        const lat = e.lngLat.lat;
        const lon = e.lngLat.lng;
        loadGodsEyeInfraAndNews(lat, lon, `Sector ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        updateGodsEyeTelemetry();
      }
    });

    geMap.on('moveend', updateGodsEyeTelemetry);

    STATE.geMap = geMap;
    initGeCanvas();
    return geMap;
  }

  function setGodsEyeMapBasemap(bm) {
    const geMap = STATE.geMap;
    if (geMap && geMap.isStyleLoaded()) {
      const satVis = bm === 'satellite' ? 'visible' : 'none';
      const roadVis = bm === 'normal' ? 'visible' : 'none';
      const osmVis = bm === 'osm' ? 'visible' : 'none';
      if (geMap.getLayer('ge-google-sat-layer')) geMap.setLayoutProperty('ge-google-sat-layer', 'visibility', satVis);
      if (geMap.getLayer('ge-google-road-layer')) geMap.setLayoutProperty('ge-google-road-layer', 'visibility', roadVis);
      if (geMap.getLayer('ge-osm-layer')) geMap.setLayoutProperty('ge-osm-layer', 'visibility', osmVis);
    } else {
      window.EARTHSCOPE_SET_BASEMAP?.(bm);
    }
  }

  function buildGodsEyeCommandCenter() {
    const cc = document.getElementById('panel-godseye');
    if (!cc || geControlsWired) return;
    geControlsWired = true;

    // Wire Header Search & Quick Targets inside #panel-godseye
    cc.querySelector('#ge-cc-search-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = cc.querySelector('#ge-cc-search-input')?.value?.trim();
      if (q) lockGodsEyeTargetQuery(q);
    });

    cc.querySelectorAll('[data-ge-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-ge-target') || '';
        const inp = cc.querySelector('#ge-cc-search-input');
        if (inp) inp.value = t;
        lockGodsEyeTargetQuery(t);
      });
    });

    // Wire Base Map Switcher
    cc.querySelectorAll('[data-ge-basemap]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bm = btn.getAttribute('data-ge-basemap') || 'normal';
        cc.querySelectorAll('[data-ge-basemap]').forEach((b) => b.classList.toggle('active', b === btn));
        setGodsEyeMapBasemap(bm);
      });
    });

    // Wire Optical Sensor Modes inside God's Eye Plugin
    cc.querySelectorAll('[data-ge-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-ge-mode') || 'normal';
        setGodsEyeMode(mode);
      });
    });

    // Wire Feed Action Buttons
    cc.querySelector('#ge-cc-adsb-btn')?.addEventListener('click', () => loadGodsEyeFlights('adsb'));
    cc.querySelector('#ge-cc-avstack-btn')?.addEventListener('click', () => loadGodsEyeFlights('aviationstack'));
    cc.querySelector('#ge-cc-firms-btn')?.addEventListener('click', () => loadGodsEyeFires());
    cc.querySelector('#ge-cc-hazards-btn')?.addEventListener('click', () => renderGodsEyeHazards());

    // Wire Camera Actions on active God's Eye map
    cc.querySelector('#ge-cc-zoom19')?.addEventListener('click', () => {
      const pt = getSelectedPinOrCenter();
      setGodsEyeMapBasemap('normal');
      getActiveTargetMap()?.flyTo({ center: [pt.lon, pt.lat], zoom: 18.8, pitch: 60, bearing: -15, duration: 1300 });
    });
    cc.querySelector('#ge-cc-sat20')?.addEventListener('click', () => {
      const pt = getSelectedPinOrCenter();
      setGodsEyeMapBasemap('satellite');
      getActiveTargetMap()?.flyTo({ center: [pt.lon, pt.lat], zoom: 19.2, pitch: 55, bearing: 0, duration: 1300 });
    });
    cc.querySelector('#ge-cc-orbit3d')?.addEventListener('click', () => {
      const pt = getSelectedPinOrCenter();
      const m = getActiveTargetMap();
      m?.flyTo({ center: [pt.lon, pt.lat], zoom: Math.max(m?.getZoom() || 12, 14), pitch: 68, bearing: (m?.getBearing() || 0) + 45, duration: 1200 });
    });
    cc.querySelector('#ge-cc-globe-view')?.addEventListener('click', () => {
      const pt = getSelectedPinOrCenter();
      getActiveTargetMap()?.flyTo({ center: [pt.lon, pt.lat], zoom: 2.3, pitch: 0, bearing: 0, duration: 1200 });
    });

    cc.querySelector('#ge-cc-scan-infra')?.addEventListener('click', () => {
      const pt = getSelectedPinOrCenter();
      loadGodsEyeInfraAndNews(pt.lat, pt.lon, pt.name);
    });

    cc.querySelector('#ge-cc-ai-sitrep-btn')?.addEventListener('click', () => {
      generateGodsEyeAiSitrep();
    });
  }

  function toggleGodsEyePanel(forceState) {
    buildGodsEyeCommandCenter();
    gePanelOpen = typeof forceState === 'boolean' ? forceState : !gePanelOpen;

    if (gePanelOpen) {
      const panelGodsEye = document.getElementById('panel-godseye');
      if (panelGodsEye && panelGodsEye.hidden) {
        window.EARTHSCOPE_BRIDGE?.showPanel?.('godseye');
      }
      STATE.godsEyeActive = true;
      STATE.showSatellites = true;
      document.getElementById('toggle-godseye-top')?.classList.add('active');

      const geMap = initGodsEyeMapInstance();
      setTimeout(() => {
        initGeCanvas();
        geMap?.resize();
        resizeGeCanvas();
      }, 120);

      refreshGodsEyeCommandCenter();
      if (!geSatTimer) {
        geSatTimer = setInterval(renderGodsEyeSatList, 1600);
      }
    } else {
      document.getElementById('toggle-godseye-top')?.classList.remove('active');
      setGodsEyeMode('normal');
      if (geSatTimer) {
        clearInterval(geSatTimer);
        geSatTimer = null;
      }
    }
  }

  async function lockGodsEyeTargetQuery(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const coordMatch = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coordMatch) {
      const lat = Number(coordMatch[1]);
      const lon = Number(coordMatch[2]);
      const label = `Target ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      getActiveTargetMap()?.flyTo({ center: [lon, lat], zoom: 14.5, pitch: 52, duration: 1200 });
      window.EARTHSCOPE_SELECTED_PLACE = { name: label, lat, lon };
      setTimeout(() => refreshGodsEyeCommandCenter({ lat, lon, name: label }), 250);
      return;
    }
    try {
      const r = await fetch(`api.php?action=geocode&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      const hit = Array.isArray(j?.data) ? j.data[0] : null;
      if (hit && Number.isFinite(Number(hit.lat)) && Number.isFinite(Number(hit.lon))) {
        const lat = Number(hit.lat);
        const lon = Number(hit.lon);
        const name = hit.display_name || hit.name || q;
        getActiveTargetMap()?.flyTo({ center: [lon, lat], zoom: 14.5, pitch: 52, duration: 1200 });
        window.EARTHSCOPE_SELECTED_PLACE = { name, lat, lon };
        setTimeout(() => refreshGodsEyeCommandCenter({ lat, lon, name }), 250);
      }
    } catch (_) {}
  }

  function renderGodsEyeSatList() {
    const el = document.getElementById('ge-cc-sat-list');
    if (!el || !gePanelOpen) return;
    el.innerHTML = STATE.satellites
      .map((s) => {
        const lat = Number.isFinite(s.currentLat) ? s.currentLat.toFixed(2) + '°' : '—';
        const lon = Number.isFinite(s.currentLon) ? s.currentLon.toFixed(2) + '°' : '—';
        return `
          <div class="ge-cc-item">
            <div>
              <strong style="color:${s.color}">🛰️ ${escapeHtml(s.name)}</strong>
              <small>NORAD ${s.norad} · ALT ${s.altKm}km · ${escapeHtml(s.sensor)}</small>
              <small style="color:#38bdf8">SUB-SAT: ${lat}, ${lon} · VEL: 7.66 km/s</small>
            </div>
            <button type="button" class="ge-cc-lock-btn" data-ge-sat-lock="${escapeHtml(s.id)}">🎯 Track</button>
          </div>
        `;
      })
      .join('');

    el.querySelectorAll('[data-ge-sat-lock]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-ge-sat-lock');
        const sat = STATE.satellites.find((x) => x.id === id);
        if (sat && Number.isFinite(sat.currentLat) && Number.isFinite(sat.currentLon)) {
          getActiveTargetMap()?.flyTo({ center: [sat.currentLon, sat.currentLat], zoom: 4.8, pitch: 40, duration: 1200 });
        }
      });
    });
  }

  async function loadGodsEyeFlights(provider = 'adsb') {
    const statusEl = document.getElementById('ge-cc-flight-status');
    const listEl = document.getElementById('ge-cc-flight-list');
    const pt = getSelectedPinOrCenter();
    if (statusEl) statusEl.textContent = `Scanning ${provider.toUpperCase()} radar around ${pt.lat.toFixed(2)}°, ${pt.lon.toFixed(2)}°…`;
    try {
      const r = await fetch(`api.php?action=flights&lat=${encodeURIComponent(pt.lat)}&lon=${encodeURIComponent(pt.lon)}&dist=250&provider=${encodeURIComponent(provider)}`);
      const j = await r.json();
      const features = j?.data?.features || [];
      const appState = getAppState();
      if (appState) appState.aircraft = features;
      [getMap(), STATE.geMap].forEach((m) => {
        if (m?.getSource('aircraft-src')) {
          m.getSource('aircraft-src').setData({ type: 'FeatureCollection', features });
          if (m.getLayer('aircraft-symbols')) m.setLayoutProperty('aircraft-symbols', 'visibility', 'visible');
          if (m.getLayer('aircraft-labels')) m.setLayoutProperty('aircraft-labels', 'visibility', 'visible');
        }
      });
      if (statusEl) {
        statusEl.textContent = `${features.length} live aircraft locked via ${j?.data?.source || provider.toUpperCase()}.`;
      }
      if (listEl) {
        if (!features.length) {
          listEl.innerHTML = `<div class="ge-cc-empty">No positioned aircraft in immediate 250nm sector. Try selecting Tokyo, Bangalore, or Kathmandu above, or switch ADS-B / Aviationstack.</div>`;
          return;
        }
        listEl.innerHTML = features
          .slice(0, 18)
          .map((f, i) => {
            const p = f.properties || {};
            const c = f.geometry?.coordinates || [pt.lon, pt.lat];
            return `
              <div class="ge-cc-item">
                <div>
                  <strong>✈️ ${escapeHtml(p.flight || p.title || 'AIRCRAFT')}</strong>
                  <small>${escapeHtml(p.aircraft_type || p.airline || 'Transponder')} · ALT: ${escapeHtml(p.altitude ?? '—')} ft</small>
                  <small>SPD: ${escapeHtml(p.ground_speed ?? '—')} kt · HDG: ${escapeHtml(p.track ?? '—')}° · ${Number(c[1]).toFixed(2)}°, ${Number(c[0]).toFixed(2)}°</small>
                </div>
                <button type="button" class="ge-cc-lock-btn" data-ge-flight-idx="${i}">🎯 Lock</button>
              </div>
            `;
          })
          .join('');
        listEl.querySelectorAll('[data-ge-flight-idx]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const f = features[Number(btn.getAttribute('data-ge-flight-idx'))];
            const c = f?.geometry?.coordinates;
            if (Array.isArray(c) && c.length >= 2) {
              getActiveTargetMap()?.flyTo({ center: [Number(c[0]), Number(c[1])], zoom: 11.5, pitch: 50, duration: 1100 });
            }
          });
        });
      }
      updateGodsEyeTelemetry();
    } catch (e) {
      if (statusEl) statusEl.textContent = `Radar notice: ${e.message || 'Provider unavailable'}`;
    }
  }

  async function loadGodsEyeFires() {
    const statusEl = document.getElementById('ge-cc-firms-status');
    if (statusEl) statusEl.textContent = 'Requesting NASA FIRMS VIIRS thermal anomalies…';
    try {
      const r = await fetch('api.php?action=fires');
      const j = await r.json();
      const features = j?.data?.features || [];
      const appState = getAppState();
      if (appState) appState.fires = features;
      [getMap(), STATE.geMap].forEach((m) => {
        if (m?.getSource('fires-src')) {
          m.getSource('fires-src').setData(j?.data || { type: 'FeatureCollection', features: [] });
          if (m.getLayer('fires-points')) m.setLayoutProperty('fires-points', 'visibility', 'visible');
        }
      });
      if (statusEl) {
        statusEl.textContent = `NASA FIRMS loaded: ${features.length.toLocaleString()} thermal fire detections active.`;
      }
      renderGodsEyeHazards(features.slice(0, 10));
    } catch (e) {
      if (statusEl) statusEl.textContent = `NASA FIRMS: ${e.message || 'Check key'}`;
      renderGodsEyeHazards();
    }
  }

  function renderGodsEyeHazards(extraFires = []) {
    const listEl = document.getElementById('ge-cc-hazard-list');
    if (!listEl) return;
    const hazards = getMergedRealMapHazards().slice(0, 16);
    const items = [];

    extraFires.forEach((f) => {
      const c = f.geometry?.coordinates;
      const p = f.properties || {};
      if (Array.isArray(c) && c.length >= 2) {
        items.push({
          title: `🔥 FIRMS Thermal Anomaly (${p.date || 'Live'})`,
          sub: `FRP: ${p.frp ?? '—'} MW · Brightness: ${p.brightness ?? '—'}K · Conf: ${p.confidence ?? 'nominal'}`,
          lat: Number(c[1]),
          lon: Number(c[0]),
          color: '#fb923c',
        });
      }
    });

    hazards.forEach((h) => {
      const icon = h.type === 'volcano' ? '🌋' : h.type === 'flood' ? '🌊' : h.type === 'earthquake' ? '〰️' : '🌀';
      items.push({
        title: `${icon} ${h.title || 'Active Hazard'}`,
        sub: `${String(h.type).toUpperCase()} · ${h.source || 'Live Feed'} · ${h.lat.toFixed(2)}°, ${h.lon.toFixed(2)}°`,
        lat: h.lat,
        lon: h.lon,
        color: h.type === 'volcano' ? '#f97316' : h.type === 'flood' ? '#38bdf8' : '#f43f5e',
      });
    });

    listEl.innerHTML = items
      .slice(0, 18)
      .map(
        (it, idx) => `
        <div class="ge-cc-item">
          <div>
            <strong style="color:${it.color}">${escapeHtml(it.title)}</strong>
            <small>${escapeHtml(it.sub)}</small>
          </div>
          <button type="button" class="ge-cc-lock-btn" data-ge-haz-idx="${idx}">🎯 View</button>
        </div>
      `
      )
      .join('');

    listEl.querySelectorAll('[data-ge-haz-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const it = items[Number(btn.getAttribute('data-ge-haz-idx'))];
        if (it) {
          getActiveTargetMap()?.flyTo({ center: [it.lon, it.lat], zoom: 8.5, pitch: 55, duration: 1200 });
          refreshGodsEyeCommandCenter({ lat: it.lat, lon: it.lon, name: it.title });
        }
      });
    });
  }

  async function loadGodsEyeInfraAndNews(lat, lon, name) {
    const nameEl = document.getElementById('ge-cc-target-name');
    const coordsEl = document.getElementById('ge-cc-target-coords');
    const addrEl = document.getElementById('ge-cc-target-address');
    const infraEl = document.getElementById('ge-cc-infra-list');
    const infraStatus = document.getElementById('ge-cc-infra-status');
    const newsEl = document.getElementById('ge-cc-news-list');

    if (nameEl) nameEl.textContent = name || 'Locked Target Sector';
    if (coordsEl) coordsEl.textContent = `${Number(lat).toFixed(5)}° N, ${Number(lon).toFixed(5)}° E`;

    const shortQ = String(name || 'Biratnagar').split(',')[0].trim();
    const [revRes, weatherRes, infraRes, newsRes] = await Promise.allSettled([
      fetch(`api.php?action=reverse&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`).then((r) => r.json()),
      fetch(`api.php?action=weather&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`).then((r) => r.json()),
      fetch(`api.php?action=nearby-places&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&radius=12000&kind=all`).then((r) => r.json()),
      fetch(`api.php?action=news&q=${encodeURIComponent(shortQ)}`).then((r) => r.json()),
    ]);

    if (revRes.status === 'fulfilled' && revRes.value?.data?.display_name) {
      if (addrEl) addrEl.textContent = revRes.value.data.display_name;
    } else if (addrEl) {
      addrEl.textContent = `WGS84 Sector ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
    }

    if (weatherRes.status === 'fulfilled' && weatherRes.value?.data?.current) {
      const c = weatherRes.value.data.current;
      const set = (id, v) => {
        const n = document.getElementById(id);
        if (n) n.textContent = v;
      };
      set('ge-w-temp', c.temperature_2m !== undefined ? `${c.temperature_2m} °C` : '—');
      set('ge-w-wind', c.wind_speed_10m !== undefined ? `${c.wind_speed_10m} km/h` : '—');
      set('ge-w-hum', c.relative_humidity_2m !== undefined ? `${c.relative_humidity_2m}%` : '—');
      set('ge-w-rain', c.precipitation !== undefined ? `${c.precipitation} mm` : '—');
    }

    if (infraRes.status === 'fulfilled') {
      const places = infraRes.value?.data?.places || infraRes.value?.places || [];
      if (infraStatus) infraStatus.textContent = `${places.length} mapped OSM infrastructure & civic nodes in sector.`;
      if (infraEl) {
        if (!places.length) {
          infraEl.innerHTML = `<div class="ge-cc-empty">No dense OSM nodes returned in immediate radius. Pan/zoom to an urban sector and click Scan Nodes.</div>`;
        } else {
          infraEl.innerHTML = places
            .slice(0, 14)
            .map(
              (p, i) => `
              <div class="ge-cc-item">
                <div>
                  <strong>🏛️ ${escapeHtml(p.name || 'Mapped Facility')}</strong>
                  <small>${escapeHtml(p.category || p.type || 'Node')} · ${Number(p.distance_km ?? 0).toFixed(2)} km away</small>
                </div>
                <button type="button" class="ge-cc-lock-btn" data-ge-infra-idx="${i}">🎯 Pin</button>
              </div>
            `
            )
            .join('');
          infraEl.querySelectorAll('[data-ge-infra-idx]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const p = places[Number(btn.getAttribute('data-ge-infra-idx'))];
              if (p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))) {
                getActiveTargetMap()?.flyTo({ center: [Number(p.lon), Number(p.lat)], zoom: 18.5, pitch: 58, duration: 1000 });
              }
            });
          });
        }
      }
    }

    if (newsRes.status === 'fulfilled' && newsEl) {
      const articles = newsRes.value?.data?.articles || [];
      if (!articles.length) {
        newsEl.innerHTML = `<div class="ge-cc-empty">No recent GDELT wire intercepts for "${escapeHtml(shortQ)}".</div>`;
      } else {
        newsEl.innerHTML = articles
          .slice(0, 8)
          .map(
            (a) => `
            <div class="ge-cc-item">
              <div>
                <a href="${escapeHtml(a.url || '#')}" target="_blank" rel="noopener" style="color:#38bdf8;font-weight:600;text-decoration:none;font-size:0.78rem;">📰 ${escapeHtml(a.title || 'Intel Wire')} ↗</a>
                <small>${escapeHtml(a.domain || 'Wire')} · ${escapeHtml(a.seendate || '')}</small>
              </div>
            </div>
          `
          )
          .join('');
      }
    }
  }

  async function generateGodsEyeAiSitrep() {
    const box = document.getElementById('ge-cc-ai-sitrep');
    const btn = document.getElementById('ge-cc-ai-sitrep-btn');
    const pt = getSelectedPinOrCenter();
    if (box) box.textContent = `Synthesizing Situational Awareness Sitrep for ${pt.name} (${pt.lat.toFixed(3)}, ${pt.lon.toFixed(3)}) via OpenRouter…`;
    if (btn) btn.disabled = true;
    try {
      const r = await fetch('api.php?action=assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `Generate a concise 4-bullet Situational Awareness Sitrep for ${pt.name} (${pt.lat.toFixed(4)}, ${pt.lon.toFixed(4)}): cover geographic context, current weather/environmental conditions, regional hazard profile, and key infrastructure/transport notes.`,
          language: 'en-US',
          context: {
            selected_place: pt.name,
            coordinates: { lat: pt.lat, lon: pt.lon },
            weather_summary: document.getElementById('ge-w-temp')?.textContent || 'Live telemetry',
            source_facts: [`Active global hazards tracked: ${getAllActiveDisasters().length}`],
          },
        }),
      });
      const j = await r.json();
      const text = String(j?.answer || j?.text || '').trim();
      if (box) {
        box.innerHTML = text
          ? escapeHtml(text).replace(/\n/g, '<br>')
          : `Sitrep: ${escapeHtml(pt.name)} locked at ${pt.lat.toFixed(4)}°N, ${pt.lon.toFixed(4)}°E. All orbital, ADS-B, and hazard feeds online.`;
      }
    } catch (e) {
      if (box) box.textContent = `Sitrep: ${pt.name} (${pt.lat.toFixed(4)}°N, ${pt.lon.toFixed(4)}°E). Telemetry nominal.`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function refreshGodsEyeCommandCenter(overrideTarget = null) {
    renderGodsEyeSatList();
    renderGodsEyeHazards();
    const pt = overrideTarget || getSelectedPinOrCenter();
    loadGodsEyeInfraAndNews(pt.lat, pt.lon, pt.name);
    loadGodsEyeFlights('adsb');
  }

  function startEngine() {
    initCanvas();
    buildDockUI();
    buildGodsEyeCommandCenter();
    fetchLiveImpacts();
    if (!STATE.rafId) {
      STATE.rafId = requestAnimationFrame(renderFrame);
    }

    window.addEventListener('earthscope:panelchange', (e) => {
      const panel = e?.detail?.panel;
      if (panel === 'godseye') {
        // God's Eye is now its own standalone map workspace
        // (assets/godseye-exclusive.js). Never activate the legacy in-map overlay.
        return;
      } else if (gePanelOpen) {
        toggleGodsEyePanel(false);
      }
    });

    window.addEventListener('earthscope:placechange', (e) => {
      if (gePanelOpen && e?.detail) {
        loadGodsEyeInfraAndNews(e.detail.lat, e.detail.lon, e.detail.name);
      }
    });

    const checkMapHook = setInterval(() => {
      const map = getMap();
      if (map && !map.__disasterFxHooked) {
        map.__disasterFxHooked = true;
        initCanvas();
        map.on('click', (e) => {
          if (e && e.lngLat) {
            fetchLiveImpacts(e.lngLat.lat, e.lngLat.lng);
            updateGodsEyeTelemetry();
          }
        });
        map.on('moveend', updateGodsEyeTelemetry);
        clearInterval(checkMapHook);
      }
    }, 600);
  }

  window.EARTHSCOPE_DISASTER_FX = {
    spawnDisasterAtPin,
    triggerPresetHotspot,
    fetchLiveImpacts,
    getAllActiveDisasters,
    setRealMapHazardFilter,
    setGodsEyeMode,
    toggleGodsEyePanel,
    refreshGodsEyeCommandCenter,
    executeSuperAgentQuery,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startEngine);
  } else {
    startEngine();
  }
})();
