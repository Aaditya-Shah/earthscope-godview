/* ==========================================================================
   GOD'S EYE — EXCLUSIVE STANDALONE COMMAND WORKSPACE
   Owns only #panel-godseye and its gx-* elements. It creates a completely
   separate MapLibre instance and never touches the classic Globe Explorer map,
   inspector, dock, SuperAgent drawer, or any other workspace.
   ========================================================================== */
(function () {
  'use strict';

  var API = (window.EARTHSCOPE_CONFIG && window.EARTHSCOPE_CONFIG.apiBase) || 'api.php';
  var $ = function (id) { return document.getElementById(id); };
  var qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function num(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
  }

  function fmt(value, digits) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: digits == null ? 1 : digits });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function coordLabel(lat, lon, digits) {
    var d = digits == null ? 5 : digits;
    return Math.abs(lat).toFixed(d) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' +
      Math.abs(lon).toFixed(d) + '° ' + (lon >= 0 ? 'E' : 'W');
  }

  function shortName(name) {
    var first = String(name || '').split(',')[0].trim().replace(/\s+(Sector|Target|Map pick)$/i, '').trim();
    return (first || 'Locked Target').slice(0, 48);
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad;
    var dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
  }

  var HAZARD_COLORS = {
    volcano: '#fb923c',
    flood: '#38bdf8',
    earthquake: '#f43f5e',
    wildfire: '#fbbf24',
    storm: '#a78bfa'
  };
  var HAZARD_ICONS = {
    volcano: '🌋',
    flood: '🌊',
    earthquake: '〰️',
    wildfire: '🔥',
    storm: '🌀'
  };

  var SATELLITE_DEFS = [
    { id: 'ISS', name: 'ISS (ZARYA)', norad: 25544, altKm: 408, incDeg: 51.6, periodMin: 92.8, phase: 0.15, raan: 25, color: '#38bdf8', sensor: 'Crew Earth Obs / HD' },
    { id: 'NISAR', name: 'NASA-ISRO NISAR', norad: 60125, altKm: 747, incDeg: 98.4, periodMin: 100.0, phase: 0.42, raan: 85, color: '#10b981', sensor: 'L+S Band Dual SAR' },
    { id: 'SENTINEL2', name: 'SENTINEL-2B', norad: 42063, altKm: 786, incDeg: 98.6, periodMin: 100.6, phase: 0.68, raan: 145, color: '#f59e0b', sensor: 'MSI 13-Band Optical' },
    { id: 'LANDSAT9', name: 'LANDSAT-9', norad: 49260, altKm: 705, incDeg: 98.2, periodMin: 98.9, phase: 0.88, raan: 210, color: '#a78bfa', sensor: 'OLI-2 / TIRS-2 Thermal' },
    { id: 'NOAA20', name: 'NOAA-20 (JPSS-1)', norad: 43013, altKm: 824, incDeg: 98.7, periodMin: 101.4, phase: 0.31, raan: 275, color: '#fb7185', sensor: 'VIIRS Active Fire/Flood' },
    { id: 'STARLINK', name: 'STARLINK-4102', norad: 53812, altKm: 550, incDeg: 53.2, periodMin: 95.6, phase: 0.56, raan: 320, color: '#22d3ee', sensor: 'Ku/Ka-Band LEO Relay' }
  ];

  var state = {
    map: null,
    mapLoaded: false,
    started: false,
    visible: false,
    basemap: 'satellite',
    globe: true,
    mode: 'normal',
    filter: 'all',
    target: { lat: 26.4525, lon: 87.2718, name: 'Biratnagar, Nepal' },
    targetSeq: 0,
    hazards: [],
    hazardSummary: null,
    sims: [],
    fires: [],
    fireFx: [],
    flights: [],
    infra: [],
    infraKey: '',
    newsKey: '',
    sats: SATELLITE_DEFS.map(function (s) { return Object.assign({}, s); }),
    routeData: null,
    routeFrom: '',
    routeTo: '',
    selectedRouteIndex: 0,
    ticketFocus: 'all',
    pendingTicketFocus: null,
    routeSeedAttempted: false,
    firesPending: false,
    tickerHover: false,
    canvas: null,
    ctx: null,
    raf: 0,
    lastSatList: 0,
    buildings3d: false,
    buildingsMeta: false,
    buildingsLoaded: false,
    buildingCount: 0,
    platformActive: true,
    platformReady: false,
    platformTimer: null
  };

  /* -----------------------------------------------------------------------
     NETWORK
     ----------------------------------------------------------------------- */
  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 25000);
    var opts = Object.assign({}, options || {}, { signal: controller.signal });
    return fetch(url, opts).finally(function () { clearTimeout(timer); });
  }

  async function apiGet(action, params, timeoutMs) {
    var url = new URL(API, window.location.href);
    url.searchParams.set('action', action);
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    var response;
    try {
      response = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } }, timeoutMs || 26000);
    } catch (error) {
      throw new Error(error && error.name === 'AbortError' ? 'Request timed out.' : 'Cannot reach the EARTHSCOPE API.');
    }
    var data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('Backend returned invalid JSON (HTTP ' + response.status + ').');
    }
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || ('Request failed (HTTP ' + response.status + ').'));
    }
    return data;
  }

  async function apiPost(action, body, timeoutMs) {
    var url = new URL(API, window.location.href);
    url.searchParams.set('action', action);
    var response;
    try {
      response = await fetchWithTimeout(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body || {})
      }, timeoutMs || 26000);
    } catch (error) {
      throw new Error(error && error.name === 'AbortError' ? 'Request timed out.' : 'Cannot reach the EARTHSCOPE API.');
    }
    var data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('Backend returned invalid JSON (HTTP ' + response.status + ').');
    }
    if (!response.ok || data.ok === false) throw new Error(data.error || ('Request failed (HTTP ' + response.status + ').'));
    return data;
  }

  /* -----------------------------------------------------------------------
     MAP
     ----------------------------------------------------------------------- */
  function gxMapStyle() {
    return {
      version: 8,
      projection: { type: 'globe' },
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sources: {
        'gx-google-road': {
          type: 'raster',
          tiles: [
            'https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}'
          ],
          tileSize: 256,
          maxzoom: 20,
          attribution: 'Map data © Google · © OpenStreetMap contributors'
        },
        'gx-google-sat': {
          type: 'raster',
          tiles: [
            'https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}'
          ],
          tileSize: 256,
          maxzoom: 20,
          attribution: 'Satellite & Hybrid: Google Earth / Maxar / Airbus · © OpenStreetMap'
        },
        'gx-osm-raster': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        { id: 'gx-map-bg', type: 'background', paint: { 'background-color': '#04101b' } },
        { id: 'gx-google-road-base', type: 'raster', source: 'gx-google-road', minzoom: 0, maxzoom: 22, paint: { 'raster-opacity': 0 } },
        { id: 'gx-google-sat-base', type: 'raster', source: 'gx-google-sat', minzoom: 0, maxzoom: 22, paint: { 'raster-opacity': 1 } },
        { id: 'gx-osm-base', type: 'raster', source: 'gx-osm-raster', minzoom: 0, maxzoom: 22, paint: { 'raster-opacity': 0 } }
      ]
    };
  }

  function initGxMap() {
    if (state.map) return state.map;
    if (!window.maplibregl) {
      setBrandStatus('MAP LIBRARY UNAVAILABLE · CHECK CDN CONNECTION');
      return null;
    }
    var map = new maplibregl.Map({
      container: 'gx-map',
      style: gxMapStyle(),
      center: [state.target.lon, state.target.lat],
      zoom: 5.35,
      minZoom: 0.8,
      maxZoom: 22,
      maxPitch: 85,
      projection: { type: 'globe' },
      attributionControl: false,
      renderWorldCopies: false,
      dragRotate: true,
      touchPitch: true,
      pitchWithRotate: true
    });
    state.map = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', function () {
      state.mapLoaded = true;
      setupGxLayers();
      resizeGxCanvas();
      setBasemap(state.basemap, true);
      setMode(state.mode);
      setTargetMarker();
      if (state.buildings3d) setBuildings3d(true, { keepCamera: true, quiet: true });
      updateBuildingsUi();
      updateHud();
    });
    map.on('move', updateHud);
    map.on('zoom', updateHud);
    map.on('moveend', updateBuildingsUi);
    map.on('idle', updateBuildingCount);
    map.on('sourcedata', function (event) {
      if (!event || event.sourceId !== 'gx-openfree-buildings') return;
      var changed = false;
      if (event.sourceDataType === 'metadata' && !state.buildingsMeta) {
        state.buildingsMeta = true;
        changed = true;
      }
      if (event.isSourceLoaded && !state.buildingsLoaded) {
        state.buildingsMeta = true;
        state.buildingsLoaded = true;
        changed = true;
      }
      if (changed) updateBuildingsUi();
    });
    map.on('click', function (event) {
      if (!event || !event.lngLat) return;
      lockTarget(event.lngLat.lat, event.lngLat.lng, 'Map pick', { keepZoom: true });
    });
    map.on('error', function (event) {
      if (event && event.error && event.error.status && event.error.status >= 400) {
        // Tile providers can be temporarily unavailable; do not spam the interface.
        console.warn('God’s Eye tile notice:', event.error.status);
      }
    });
    return map;
  }

  function addGeoSource(id) {
    if (!state.map || state.map.getSource(id)) return;
    state.map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }

  function setupGxLayers() {
    var map = state.map;
    if (!map || !map.isStyleLoaded()) return;
    ['gx-hazards', 'gx-flights', 'gx-infra', 'gx-target', 'gx-route-primary', 'gx-route-alt', 'gx-route-air', 'gx-route-traffic', 'gx-route-endpoints'].forEach(addGeoSource);

    if (!map.getLayer('gx-route-air-line')) {
      map.addLayer({
        id: 'gx-route-air-line', type: 'line', source: 'gx-route-air',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#38bdf8', 'line-width': 2.2, 'line-dasharray': [3, 3], 'line-opacity': 0.7 }
      });
    }
    if (!map.getLayer('gx-route-alt-line')) {
      map.addLayer({
        id: 'gx-route-alt-line', type: 'line', source: 'gx-route-alt',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#a855f7', 'line-width': 3, 'line-dasharray': [2, 2], 'line-opacity': 0.78 }
      });
    }
    if (!map.getLayer('gx-route-primary-glow')) {
      map.addLayer({
        id: 'gx-route-primary-glow', type: 'line', source: 'gx-route-primary',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#10b981', 'line-width': 11, 'line-opacity': 0.25 }
      });
    }
    if (!map.getLayer('gx-route-primary-line')) {
      map.addLayer({
        id: 'gx-route-primary-line', type: 'line', source: 'gx-route-primary',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#34d399', 'line-width': 4.5, 'line-opacity': 0.96 }
      });
    }
    if (!map.getLayer('gx-route-traffic-line')) {
      map.addLayer({
        id: 'gx-route-traffic-line', type: 'line', source: 'gx-route-traffic',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['coalesce', ['get', 'color'], '#ef4444'], 'line-width': 7.5, 'line-opacity': 0.94 }
      });
    }
    if (!map.getLayer('gx-route-endpoints-circle')) {
      map.addLayer({
        id: 'gx-route-endpoints-circle', type: 'circle', source: 'gx-route-endpoints',
        paint: {
          'circle-radius': 8, 'circle-color': ['get', 'color'],
          'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff'
        }
      });
    }
    if (!map.getLayer('gx-infra-circle')) {
      map.addLayer({
        id: 'gx-infra-circle', type: 'circle', source: 'gx-infra',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 5, 16, 7],
          'circle-color': '#f59e0b', 'circle-opacity': 0.8,
          'circle-stroke-color': '#fff7ed', 'circle-stroke-width': 0.7
        }
      });
    }
    if (!map.getLayer('gx-hazards-glow')) {
      map.addLayer({
        id: 'gx-hazards-glow', type: 'circle', source: 'gx-hazards',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 18, 12, 30],
          'circle-color': ['match', ['get', 'type'],
            'volcano', '#fb923c', 'flood', '#38bdf8', 'earthquake', '#f43f5e',
            'wildfire', '#fbbf24', 'storm', '#a78bfa', '#34d399'],
          'circle-opacity': 0.16, 'circle-blur': 1.2
        }
      });
    }
    if (!map.getLayer('gx-hazards-points')) {
      map.addLayer({
        id: 'gx-hazards-points', type: 'circle', source: 'gx-hazards',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 6, 5, 12, 8],
          'circle-color': ['match', ['get', 'type'],
            'volcano', '#fb923c', 'flood', '#38bdf8', 'earthquake', '#f43f5e',
            'wildfire', '#fbbf24', 'storm', '#a78bfa', '#34d399'],
          'circle-opacity': 0.9,
          'circle-stroke-width': 1.2, 'circle-stroke-color': '#f8fafc', 'circle-stroke-opacity': 0.76
        }
      });
    }
    if (!map.getLayer('gx-flights-circle')) {
      map.addLayer({
        id: 'gx-flights-circle', type: 'circle', source: 'gx-flights',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 9, 5, 14, 7],
          'circle-color': '#38bdf8', 'circle-opacity': 0.92,
          'circle-stroke-width': 1.2, 'circle-stroke-color': '#e0f2fe'
        }
      });
    }
    if (!map.getLayer('gx-flights-label')) {
      map.addLayer({
        id: 'gx-flights-label', type: 'symbol', source: 'gx-flights', minzoom: 5.5,
        layout: {
          'text-field': ['coalesce', ['get', 'flight'], ['get', 'title']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 9,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#bae6fd', 'text-halo-color': 'rgba(3,10,18,0.92)', 'text-halo-width': 1.4
        }
      });
    }
    if (!map.getLayer('gx-target-halo')) {
      map.addLayer({
        id: 'gx-target-halo', type: 'circle', source: 'gx-target',
        paint: { 'circle-radius': 19, 'circle-color': '#34d399', 'circle-opacity': 0.12, 'circle-blur': 1 }
      });
    }
    if (!map.getLayer('gx-target-circle')) {
      map.addLayer({
        id: 'gx-target-circle', type: 'circle', source: 'gx-target',
        paint: {
          'circle-radius': 7, 'circle-color': '#10b981',
          'circle-stroke-width': 2.3, 'circle-stroke-color': '#ffffff'
        }
      });
    }
    if (!map.getLayer('gx-target-label')) {
      map.addLayer({
        id: 'gx-target-label', type: 'symbol', source: 'gx-target',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 1.7],
          'text-anchor': 'top',
          'text-allow-overlap': true
        },
        paint: { 'text-color': '#a7f3d0', 'text-halo-color': 'rgba(3,10,18,0.94)', 'text-halo-width': 1.6 }
      });
    }
  }

  function setBasemap(name, silent) {
    state.basemap = name === 'normal' || name === 'osm' ? name : 'satellite';
    var map = state.map;
    if (map && map.isStyleLoaded()) {
      var vis = {
        'gx-google-road-base': state.basemap === 'normal' ? 'visible' : 'none',
        'gx-google-sat-base': state.basemap === 'satellite' ? 'visible' : 'none',
        'gx-osm-base': state.basemap === 'osm' ? 'visible' : 'none'
      };
      var opacity = {
        'gx-google-road-base': state.basemap === 'normal' ? 1 : 0,
        'gx-google-sat-base': state.basemap === 'satellite' ? 1 : 0,
        'gx-osm-base': state.basemap === 'osm' ? 1 : 0
      };
      Object.keys(vis).forEach(function (id) {
        if (!map.getLayer(id)) return;
        map.setLayoutProperty(id, 'visibility', vis[id]);
        // The initial style ships street/OSM at raster-opacity 0 so only the
        // satellite layer paints on boot. Toggle opacity as well as visibility
        // here or those two basemaps render as an empty map.
        map.setPaintProperty(id, 'raster-opacity', opacity[id]);
        map.setPaintProperty(id, 'raster-fade-duration', 0);
      });
    }
    qsa('[data-gx-basemap]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-gx-basemap') === state.basemap);
    });
    var label = state.basemap === 'satellite' ? 'GOOGLE HYBRID · MAX 22x' : state.basemap === 'osm' ? 'OPENSTREETMAP RASTER' : 'GOOGLE STREET MAP';
    var hud = $('gx-hud-link');
    if (hud) hud.textContent = label;
    if (!silent) setBrandStatus('BASE LAYER: ' + label);
  }

  /* -----------------------------------------------------------------------
     3D BUILDINGS — OpenFreeMap/OpenMapTiles vector footprints, no API key
     ----------------------------------------------------------------------- */
  function ensureBuildingsLayer() {
    var map = state.map;
    if (!map || !state.mapLoaded || !map.isStyleLoaded()) return false;
    try {
      if (!map.getSource('gx-openfree-buildings')) {
        map.addSource('gx-openfree-buildings', {
          type: 'vector',
          url: 'https://tiles.openfreemap.org/planet',
          attribution: '3D buildings © OpenStreetMap contributors · OpenFreeMap / OpenMapTiles'
        });
      }
      if (!map.getLayer('gx-3d-buildings')) {
        var before = null;
        ['gx-route-air-line', 'gx-route-alt-line', 'gx-route-primary-glow', 'gx-route-primary-line',
          'gx-route-traffic-line', 'gx-route-endpoints-circle', 'gx-infra-circle', 'gx-hazards-glow',
          'gx-hazards-points', 'gx-flights-circle', 'gx-flights-label', 'gx-target-halo'
        ].some(function (id) {
          if (map.getLayer(id)) { before = id; return true; }
          return false;
        });
        var layer = {
          id: 'gx-3d-buildings',
          type: 'fill-extrusion',
          source: 'gx-openfree-buildings',
          'source-layer': 'building',
          minzoom: 14.5,
          filter: ['!=', ['get', 'hide_3d'], true],
          paint: {
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-color': [
              'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8],
              0, '#dce9f6',
              12, '#c4d9ee',
              30, '#9dbfe0',
              70, '#79a5cf',
              150, '#5788b8',
              300, '#3e6f9f'
            ],
            'fill-extrusion-opacity': 0.9,
            'fill-extrusion-vertical-gradient': true
          },
          layout: { visibility: state.buildings3d ? 'visible' : 'none' }
        };
        if (before) map.addLayer(layer, before);
        else map.addLayer(layer);
      } else {
        map.setLayoutProperty('gx-3d-buildings', 'visibility', state.buildings3d ? 'visible' : 'none');
      }
      return true;
    } catch (error) {
      console.warn('God’s Eye 3D buildings unavailable:', error);
      state.buildingsLoaded = false;
      return false;
    }
  }

  function updateBuildingsUi() {
    var toggle = $('gx-buildings-toggle');
    if (toggle) {
      toggle.classList.toggle('active', state.buildings3d);
      toggle.setAttribute('aria-pressed', state.buildings3d ? 'true' : 'false');
    }
    var note = $('gx-3d-note');
    if (!note) return;
    var zoom = state.map ? state.map.getZoom() : 0;
    note.classList.toggle('is-active', state.buildings3d && state.buildingsLoaded);
    if (!state.buildings3d) {
      note.innerHTML = '<b>3D buildings off.</b> Use <strong>🏢 3D</strong> or <strong>STREET 3D</strong> to extrude mapped OSM footprints.';
    } else if (!state.buildingsMeta) {
      note.innerHTML = '<b>3D buildings on.</b> Connecting to the OpenFreeMap building tiles…';
    } else if (zoom < 14.5) {
      note.innerHTML = '<b>3D armed.</b> Zoom to 15x or press <strong>STREET 3D</strong> to raise the mapped footprints.';
    } else if (!state.buildingsLoaded) {
      note.innerHTML = '<b>3D buildings on.</b> Loading OSM footprints for this view…';
    } else {
      note.innerHTML = '<b>3D active.</b> ' +
        (state.buildingCount > 0 ? fmt(state.buildingCount, 0) + ' mapped OSM footprints in view.' : 'Mapped OSM footprints are rendering in this view.') +
        ' Photoreal Google Earth 3D needs a Google API key.';
    }
  }

  function updateBuildingCount() {
    var map = state.map;
    if (!map || !state.buildings3d || !map.getLayer('gx-3d-buildings')) {
      if (state.buildingCount !== 0) {
        state.buildingCount = 0;
        updateBuildingsUi();
      }
      return;
    }
    var count = 0;
    try {
      count = map.queryRenderedFeatures({ layers: ['gx-3d-buildings'] }).length;
    } catch (error) { count = 0; }
    if (count !== state.buildingCount) {
      state.buildingCount = count;
      updateBuildingsUi();
    }
    updateHud();
  }

  function setBuildings3d(enabled, options) {
    options = options || {};
    state.buildings3d = !!enabled;
    var map = state.map;
    if (map && state.mapLoaded) {
      if (state.buildings3d) {
        ensureBuildingsLayer();
        if (map.getLayer('gx-3d-buildings')) {
          map.setLayoutProperty('gx-3d-buildings', 'visibility', 'visible');
        }
        if (!options.keepCamera && map.getPitch() < 30) {
          map.easeTo({ pitch: 58, duration: 850 });
        }
      } else if (map.getLayer('gx-3d-buildings')) {
        map.setLayoutProperty('gx-3d-buildings', 'visibility', 'none');
      }
    }
    updateBuildingsUi();
    updateHud();
    if (!options.quiet) {
      setBrandStatus(state.buildings3d
        ? '3D BUILDINGS ON · OSM EXTRUDED FOOTPRINTS · VISIBLE FROM 15x'
        : '3D BUILDINGS OFF · RASTER BASEMAP ONLY');
    }
  }

  function openStreetView() {
    var map = state.map;
    var url = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' +
      state.target.lat.toFixed(6) + ',' + state.target.lon.toFixed(6);
    if (map) {
      url += '&heading=' + Math.round((map.getBearing() + 360) % 360) + '&pitch=0&fov=90';
    }
    var link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setBrandStatus('GOOGLE STREET VIEW OPENED FOR ' + shortName(state.target.name).toUpperCase());
  }


  function setMode(mode) {
    state.mode = ['normal', 'nvg', 'flir', 'crt', 'radar'].indexOf(mode) >= 0 ? mode : 'normal';
    var shell = $('gx-map-shell');
    if (shell) shell.setAttribute('data-gx-mode', state.mode);
    qsa('[data-gx-mode]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-gx-mode') === state.mode);
    });
    var names = {
      normal: 'STD OPTICAL', nvg: 'NVG NIGHT VISION', flir: 'FLIR THERMAL',
      crt: 'CRT SCANLINE', radar: 'SAR RADAR SWEEP'
    };
    var hud = $('gx-hud-mode');
    if (hud) hud.textContent = names[state.mode];
    var link = $('gx-hud-link');
    if (link && state.basemap) link.textContent = state.basemap === 'satellite' ? 'SAT-LINK ACTIVE' : 'BASE-LINK ACTIVE';
  }

  function toggleGlobe() {
    if (!state.map) return;
    state.globe = !state.globe;
    try {
      state.map.setProjection({ type: state.globe ? 'globe' : 'mercator' });
    } catch (error) {
      console.warn('Projection switch unavailable', error);
    }
    $('gx-globe-toggle') && $('gx-globe-toggle').classList.toggle('active', state.globe);
    setBrandStatus(state.globe ? '3D GLOBE PROJECTION ACTIVE' : 'FLAT MERCATOR PROJECTION ACTIVE');
    setTimeout(function () { if (state.map) state.map.resize(); }, 120);
  }

  function updateHud() {
    var map = state.map;
    if (!map) return;
    try {
      var c = map.getCenter();
      var z = map.getZoom();
      var coords = $('gx-hud-coords');
      if (coords) coords.textContent = coordLabel(c.lat, c.lng, 4);
      var zoom = $('gx-hud-zoom');
      if (zoom) {
        var zoomText = 'ZOOM ' + z.toFixed(1) + 'x / 22x';
        if (state.buildings3d) zoomText += state.buildingCount > 0 ? ' · 3D ' + fmt(state.buildingCount, 0) : ' · 3D ON';
        zoom.textContent = zoomText;
      }
      var telemetry = $('gx-hud-telemetry');
      if (telemetry) {
        telemetry.textContent = 'SAT ' + state.sats.length + ' · AIR ' + state.flights.length + ' · HAZ ' + (state.hazards.length + state.sims.length + state.fires.length) + ' · ZOOM ' + z.toFixed(1) + 'x';
      }
    } catch (error) { /* map may be mid-style */ }
  }

  /* -----------------------------------------------------------------------
     TARGET INTELLIGENCE
     ----------------------------------------------------------------------- */
  function setBrandStatus(text) {
    var el = $('gx-brand-status');
    if (el) el.textContent = String(text || '').slice(0, 120);
  }

  function setTargetUI() {
    var t = state.target;
    var name = $('gx-target-name');
    if (name) name.textContent = t.name || 'Locked Target';
    var coords = $('gx-target-coords');
    if (coords) coords.textContent = coordLabel(t.lat, t.lon, 5);
    var readout = $('gx-reticle-readout');
    if (readout) readout.textContent = 'LOCKED: ' + coordLabel(t.lat, t.lon, 4);
    var search = $('gx-search-input');
    if (search && document.activeElement !== search) search.value = t.name || '';
    var address = $('gx-target-address');
    if (address) address.textContent = 'Resolving street-level reverse geocode…';
  }

  function setTargetMarker() {
    var map = state.map;
    if (!map || !map.getSource('gx-target')) return;
    map.getSource('gx-target').setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { label: shortName(state.target.name) },
        geometry: { type: 'Point', coordinates: [state.target.lon, state.target.lat] }
      }]
    });
  }

  async function lockTarget(lat, lon, name, options) {
    options = options || {};
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setBrandStatus('INVALID TARGET COORDINATES');
      return;
    }
    state.target = { lat: lat, lon: lon, name: name || ('Target ' + lat.toFixed(4) + ', ' + lon.toFixed(4)) };
    state.targetSeq += 1;
    setTargetUI();
    setTargetMarker();
    if (state.map) {
      if (!options.keepZoom) {
        var zoom = Number(options.zoom);
        state.map.flyTo({
          center: [lon, lat],
          zoom: Number.isFinite(zoom) ? zoom : Math.max(8.6, Math.min(12.5, state.map.getZoom() + 1)),
          pitch: options.pitch == null ? 45 : options.pitch,
          bearing: options.bearing == null ? state.map.getBearing() : options.bearing,
          duration: 1300
        });
      }
    }
    setBrandStatus('TARGET LOCKED: ' + shortName(state.target.name).toUpperCase());
    await refreshTarget();
  }

  async function lockTargetQuery(raw) {
    var q = String(raw || '').trim();
    if (!q) return;
    var coordinates = parseCoordinates(q);
    if (coordinates) {
      await lockTarget(coordinates.lat, coordinates.lon, 'Target ' + coordinates.lat.toFixed(4) + ', ' + coordinates.lon.toFixed(4), { zoom: 13.2 });
      return;
    }
    setBrandStatus('RESOLVING TARGET “' + q.slice(0, 52).toUpperCase() + '”…');
    try {
      var response = await apiGet('geocode', { q: q });
      var hits = Array.isArray(response.data) ? response.data : [];
      var hit = hits.find(function (item) { return Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)); });
      if (!hit) throw new Error('No matching place found. Try a larger city or a coordinate pair.');
      var label = q || hit.display_name || hit.name || 'Locked Target';
      await lockTarget(Number(hit.lat), Number(hit.lon), label, { zoom: 12.8 });
    } catch (error) {
      setBrandStatus('TARGET LOCK FAILED: ' + String(error.message || 'Unknown error').toUpperCase().slice(0, 70));
    }
  }

  function parseCoordinates(raw) {
    var text = String(raw || '').trim();
    var plain = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (plain) {
      var a = Number(plain[1]), b = Number(plain[2]);
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b };
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lon: a };
    }
    var hemi = text.match(/^\s*(\d+(?:\.\d+)?)\s*°?\s*([NS])\s*[, ]?\s*(\d+(?:\.\d+)?)\s*°?\s*([EW])\s*$/i);
    if (hemi) {
      var lat = Number(hemi[1]) * (hemi[2].toUpperCase() === 'S' ? -1 : 1);
      var lon = Number(hemi[3]) * (hemi[4].toUpperCase() === 'W' ? -1 : 1);
      return { lat: lat, lon: lon };
    }
    return null;
  }

  async function refreshTarget() {
    if (!isVisible()) return;
    var seq = state.targetSeq;
    await Promise.allSettled([
      loadReverse(seq),
      loadWeather(seq),
      loadInfra(seq, false),
      loadNews(seq, false),
      loadFlights('adsb', seq)
    ]);
  }

  async function loadReverse(seq) {
    var t = state.target;
    try {
      var response = await apiGet('reverse', { lat: t.lat, lon: t.lon });
      if (seq !== state.targetSeq) return;
      var data = response.data || {};
      var address = $('gx-target-address');
      if (address) address.textContent = data.display_name || ('WGS84 sector ' + coordLabel(t.lat, t.lon, 4));
    } catch (error) {
      if (seq !== state.targetSeq) return;
      var fallback = $('gx-target-address');
      if (fallback) fallback.textContent = 'WGS84 sector ' + coordLabel(t.lat, t.lon, 4) + ' · reverse geocode unavailable';
    }
  }

  async function loadWeather(seq) {
    var t = state.target;
    try {
      var response = await apiGet('weather', { lat: t.lat, lon: t.lon });
      if (seq !== state.targetSeq) return;
      var current = (response.data || {}).current || {};
      var set = function (id, value) { var el = $(id); if (el) el.textContent = value; };
      set('gx-w-temp', current.temperature_2m !== undefined ? current.temperature_2m + ' °C' : '—');
      set('gx-w-wind', current.wind_speed_10m !== undefined ? current.wind_speed_10m + ' km/h' : '—');
      set('gx-w-hum', current.relative_humidity_2m !== undefined ? current.relative_humidity_2m + '%' : '—');
      set('gx-w-rain', current.precipitation !== undefined ? current.precipitation + ' mm' : '—');
    } catch (error) {
      if (seq !== state.targetSeq) return;
      ['gx-w-temp', 'gx-w-wind', 'gx-w-hum', 'gx-w-rain'].forEach(function (id) { var el = $(id); if (el) el.textContent = '—'; });
    }
  }

  /* -----------------------------------------------------------------------
     SATELLITES
     ----------------------------------------------------------------------- */
  function updateSatellitePositions(t) {
    state.sats.forEach(function (sat) {
      var angularSpeed = (Math.PI * 2) / (sat.periodMin * 60);
      var meanAnomaly = sat.phase * Math.PI * 2 + t * angularSpeed * 14;
      var inc = sat.incDeg * Math.PI / 180;
      var lat = Math.asin(Math.sin(inc) * Math.sin(meanAnomaly)) * 180 / Math.PI;
      var lon = ((sat.raan + (meanAnomaly * 180 / Math.PI) - t * 0.22) % 360 + 540) % 360 - 180;
      sat.meanAnomaly = meanAnomaly;
      sat.incRad = inc;
      sat.currentLat = lat;
      sat.currentLon = lon;
    });
  }

  function renderSatList() {
    if (!isVisible()) return;
    var list = $('gx-sat-list');
    if (!list) return;
    updateSatellitePositions(performance.now() / 1000);
    list.innerHTML = state.sats.map(function (sat) {
      var lat = Number.isFinite(sat.currentLat) ? sat.currentLat.toFixed(2) + '°' : '—';
      var lon = Number.isFinite(sat.currentLon) ? sat.currentLon.toFixed(2) + '°' : '—';
      return '<div class="gx-item">' +
        '<div><strong style="color:' + sat.color + '">🛰️ ' + esc(sat.name) + '</strong>' +
        '<small>NORAD ' + sat.norad + ' · ALT ' + sat.altKm + ' km · ' + esc(sat.sensor) + '</small>' +
        '<small>SUB-SAT ' + lat + ', ' + lon + ' · VEL 7.66 km/s</small></div>' +
        '<button type="button" class="gx-lock" data-gx-sat-lock="' + esc(sat.id) + '">🎯 TRACK</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-gx-sat-lock]').forEach(function (button) {
      button.addEventListener('click', function () {
        var sat = state.sats.find(function (item) { return item.id === button.getAttribute('data-gx-sat-lock'); });
        if (sat && Number.isFinite(sat.currentLat) && Number.isFinite(sat.currentLon) && state.map) {
          state.map.flyTo({ center: [sat.currentLon, sat.currentLat], zoom: 4.9, pitch: 38, duration: 1200 });
          setBrandStatus('TRACKING ' + sat.id + ' · NORAD ' + sat.norad);
        }
      });
    });
    var count = $('gx-sat-count');
    if (count) count.textContent = state.sats.length + ' ACTIVE';
    var status = $('gx-sat-status');
    if (status) status.textContent = 'Local SGP4-lite propagation · ' + state.sats.length + ' assets · sub-satellite positions are illustrative';
  }

  function drawSatellites(ctx, width, height, t) {
    if (!state.map) return;
    updateSatellitePositions(t);
    var targetVisible = isPointVisible(state.map, state.target.lat, state.target.lon);
    var targetScreen = targetVisible ? state.map.project([state.target.lon, state.target.lat]) : null;
    state.sats.forEach(function (sat, index) {
      if (!Number.isFinite(sat.currentLat) || !Number.isFinite(sat.currentLon)) return;
      if (!isPointVisible(state.map, sat.currentLat, sat.currentLon)) return;
      var point = state.map.project([sat.currentLon, sat.currentLat]);
      if (!point || point.x < -120 || point.x > width + 120 || point.y < -120 || point.y > height + 120) return;

      ctx.save();
      ctx.strokeStyle = sat.color;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      var started = false;
      for (var step = -12; step <= 12; step += 3) {
        var anomaly = sat.meanAnomaly + step * 0.04;
        var lat = Math.asin(Math.sin(sat.incRad) * Math.sin(anomaly)) * 180 / Math.PI;
        var lon = ((sat.raan + (anomaly * 180 / Math.PI) - t * 0.22) % 360 + 540) % 360 - 180;
        if (Math.abs(lon - sat.currentLon) > 90) continue;
        if (!isPointVisible(state.map, lat, lon)) { started = false; continue; }
        var projected = state.map.project([lon, lat]);
        if (!projected) continue;
        if (!started) { ctx.moveTo(projected.x, projected.y); started = true; }
        else ctx.lineTo(projected.x, projected.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      var swath = 17 + (index % 3) * 5;
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = sat.color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, swath, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.78;
      ctx.strokeStyle = sat.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, swath * (0.66 + 0.34 * Math.sin(t * 2.3 + index)), 0, Math.PI * 2);
      ctx.stroke();

      if (targetScreen) {
        var distance = Math.hypot(point.x - targetScreen.x, point.y - targetScreen.y);
        if (distance < 440) {
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(targetScreen.x, targetScreen.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0b1726';
      ctx.strokeStyle = sat.color;
      ctx.lineWidth = 1.5;
      ctx.fillRect(point.x - 10, point.y - 3, 6, 6);
      ctx.strokeRect(point.x - 10, point.y - 3, 6, 6);
      ctx.fillRect(point.x + 4, point.y - 3, 6, 6);
      ctx.strokeRect(point.x + 4, point.y - 3, 6, 6);
      ctx.fillStyle = sat.color;
      ctx.fillRect(point.x - 3, point.y - 4, 6, 8);
      ctx.font = '600 9px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var label = sat.id + ' · ' + sat.altKm + 'km';
      var labelWidth = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(4,12,22,0.86)';
      ctx.fillRect(point.x - labelWidth / 2, point.y + 10, labelWidth, 15);
      ctx.strokeStyle = sat.color;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(point.x - labelWidth / 2, point.y + 10, labelWidth, 15);
      ctx.fillStyle = '#f0f9ff';
      ctx.fillText(label, point.x, point.y + 17.5);
      ctx.restore();
    });
  }

  /* -----------------------------------------------------------------------
     HAZARDS, FIRMS, FLIGHTS, INFRA, NEWS
     ----------------------------------------------------------------------- */
  function normalizeHazard(item) {
    return {
      id: item.id || 'hz-' + Math.random().toString(36).slice(2),
      type: HAZARD_COLORS[item.type] ? item.type : (item.type === 'fire' ? 'wildfire' : 'storm'),
      title: item.title || 'Active Hazard',
      lat: num(item.lat), lon: num(item.lon),
      severity: item.severity || 'elevated',
      magnitude: item.magnitude,
      impact_radius_km: item.impact_radius_km,
      plume_height_km: item.plume_height_km,
      source: item.source || 'Live feed',
      url: item.url || '',
      updated_at: item.updated_at || '',
      simulated: false
    };
  }

  function fireToHazard(feature, index) {
    var props = feature.properties || {};
    var coords = feature.geometry && feature.geometry.coordinates || [];
    return {
      id: 'firms-' + index,
      type: 'wildfire',
      title: 'FIRMS thermal anomaly' + (props.date ? ' · ' + props.date : ''),
      lat: num(coords[1]), lon: num(coords[0]),
      severity: num(props.frp) >= 30 ? 'high' : 'elevated',
      source: 'NASA FIRMS VIIRS',
      frp: props.frp, brightness: props.brightness, confidence: props.confidence,
      date: props.date, time: props.time,
      simulated: false
    };
  }

  function hazardCounts() {
    var counts = { all: 0, volcano: 0, flood: 0, earthquake: 0, wildfire: 0, storm: 0 };
    var base = state.hazardSummary && state.hazardSummary.counts ? state.hazardSummary.counts : {};
    Object.keys(counts).forEach(function (key) {
      if (key === 'all') return;
      counts[key] = num(base[key], 0);
    });
    if (state.fires.length) counts.wildfire = Math.max(counts.wildfire, state.fires.length);
    state.hazards.forEach(function (h) { if (counts[h.type] !== undefined) counts[h.type] += 0; });
    state.sims.forEach(function (h) { if (counts[h.type] !== undefined) counts[h.type] += 1; });
    counts.wildfire = Math.max(counts.wildfire, state.hazards.filter(function (h) { return h.type === 'wildfire'; }).length);
    counts.all = counts.volcano + counts.flood + counts.earthquake + counts.wildfire + counts.storm;
    return counts;
  }

  function matchesFilter(hazard) {
    return state.filter === 'all' || hazard.type === state.filter;
  }

  function fireFeaturesForFilter() {
    if (state.filter !== 'all' && state.filter !== 'wildfire') return [];
    return state.fires.slice(0, 900);
  }

  function setHazardCounts() {
    var counts = hazardCounts();
    var mapping = { all: 'gx-count-all', volcano: 'gx-count-volcano', flood: 'gx-count-flood', earthquake: 'gx-count-quake', wildfire: 'gx-count-fire', storm: 'gx-count-storm' };
    Object.keys(mapping).forEach(function (key) {
      var el = $(mapping[key]);
      if (el) el.textContent = counts[key] > 999 ? Math.round(counts[key] / 1000) + 'k' : String(counts[key]);
    });
    return counts;
  }

  function updateHazardMap() {
    var map = state.map;
    if (!map || !map.getSource('gx-hazards')) return;
    var features = [];
    state.hazards.filter(matchesFilter).forEach(function (h) {
      features.push({
        type: 'Feature',
        properties: { type: h.type, title: h.title, simulated: false, severity: h.severity },
        geometry: { type: 'Point', coordinates: [h.lon, h.lat] }
      });
    });
    state.sims.filter(matchesFilter).forEach(function (h) {
      features.push({
        type: 'Feature',
        properties: { type: h.type, title: h.title, simulated: true, severity: h.severity },
        geometry: { type: 'Point', coordinates: [h.lon, h.lat] }
      });
    });
    fireFeaturesForFilter().forEach(function (fire) {
      var c = fire.geometry && fire.geometry.coordinates;
      if (!c) return;
      features.push({
        type: 'Feature',
        properties: { type: 'wildfire', title: 'FIRMS thermal anomaly', simulated: false, severity: 'elevated' },
        geometry: { type: 'Point', coordinates: [c[0], c[1]] }
      });
    });
    map.getSource('gx-hazards').setData({ type: 'FeatureCollection', features: features });
  }

  function renderHazardList() {
    var list = $('gx-hazard-list');
    if (!list) return;
    var items = [];
    if (state.filter === 'wildfire' && state.fires.length) {
      var near = state.fires.map(function (f) {
        var c = f.geometry && f.geometry.coordinates || [0, 0];
        return { hazard: fireToHazard(f, items.length), distance: haversineKm(state.target.lat, state.target.lon, num(c[1]), num(c[0])) };
      }).sort(function (a, b) { return a.distance - b.distance; }).slice(0, 36);
      near.forEach(function (entry) { items.push(entry.hazard); });
    } else {
      state.hazards.filter(matchesFilter).forEach(function (h) { items.push(h); });
      if (state.filter === 'all' && state.fires.length) {
        state.fires.map(function (f) {
          var c = f.geometry && f.geometry.coordinates || [0, 0];
          return { hazard: fireToHazard(f, items.length + 5000), distance: haversineKm(state.target.lat, state.target.lon, num(c[1]), num(c[0])) };
        }).sort(function (a, b) { return a.distance - b.distance; }).slice(0, 8).forEach(function (entry) { items.push(entry.hazard); });
      }
    }
    var severityRank = { extreme: 0, high: 1, moderate: 2, elevated: 3 };
    var typeRank = { volcano: 0, flood: 1, storm: 2, wildfire: 3, earthquake: 4 };
    items.sort(function (a, b) {
      var aSev = severityRank[a.severity] == null ? 9 : severityRank[a.severity];
      var bSev = severityRank[b.severity] == null ? 9 : severityRank[b.severity];
      if (aSev !== bSev) return aSev - bSev;
      var aType = typeRank[a.type] == null ? 9 : typeRank[a.type];
      var bType = typeRank[b.type] == null ? 9 : typeRank[b.type];
      return aType - bType;
    });
    state.sims.filter(matchesFilter).forEach(function (h) { items.unshift(h); });
    if (state.filter === 'all') {
      var groups = {};
      items.forEach(function (hazard) {
        if (!groups[hazard.type]) groups[hazard.type] = [];
        groups[hazard.type].push(hazard);
      });
      var order = ['volcano', 'flood', 'storm', 'wildfire', 'earthquake'];
      var mixed = [];
      var guard = 0;
      while (mixed.length < 48 && guard < 200) {
        var added = false;
        order.forEach(function (type) {
          if (groups[type] && groups[type].length && mixed.length < 48) {
            mixed.push(groups[type].shift());
            added = true;
          }
        });
        if (!added) break;
        guard += 1;
      }
      items = mixed;
    }
    state.listHazards = items.slice(0, 48);
    if (!state.listHazards.length) {
      list.innerHTML = '<div class="gx-empty">No active ' + esc(state.filter === 'all' ? 'hazards' : state.filter) + ' in the current feed. Try refreshing hazards or loading FIRMS thermal detections.</div>';
      return;
    }
    list.innerHTML = state.listHazards.map(function (hazard, index) {
      var color = HAZARD_COLORS[hazard.type] || '#34d399';
      var icon = hazard.simulated ? '＋' : (HAZARD_ICONS[hazard.type] || '◈');
      var sub = hazard.type === 'wildfire' && hazard.frp !== undefined
        ? 'FRP ' + (hazard.frp || '—') + ' MW · brightness ' + (hazard.brightness || '—') + 'K · ' + (hazard.confidence || 'nominal')
        : String(hazard.type).toUpperCase() + ' · ' + (hazard.source || 'Live feed') + ' · ' + hazard.lat.toFixed(2) + '°, ' + hazard.lon.toFixed(2) + '°';
      return '<div class="gx-item">' +
        '<div><strong style="color:' + color + '">' + icon + ' ' + esc(hazard.title) + (hazard.simulated ? ' <span style="color:#f59e0b">[SIM]</span>' : '') + '</strong>' +
        '<small>' + esc(sub) + '</small></div>' +
        '<button type="button" class="gx-lock" data-gx-hazard-idx="' + index + '">🎯 LOCK</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-gx-hazard-idx]').forEach(function (button) {
      button.addEventListener('click', function () {
        var hazard = state.listHazards[Number(button.getAttribute('data-gx-hazard-idx'))];
        if (hazard) lockTarget(hazard.lat, hazard.lon, hazard.title, { zoom: 8.6, pitch: 50 });
      });
    });
  }

  async function loadHazards(silent) {
    if (!silent) {
      var status = $('gx-hazard-status');
      if (status) status.textContent = 'Requesting USGS earthquakes, NASA EONET events and GloFAS hydrology…';
    }
    try {
      var response = await apiGet('live-impact', { lat: state.target.lat, lon: state.target.lon });
      var data = response.data || {};
      var impacts = Array.isArray(data.impacts) ? data.impacts : [];
      state.hazards = impacts.filter(function (h) { return Number.isFinite(Number(h.lat)) && Number.isFinite(Number(h.lon)); }).map(normalizeHazard);
      state.hazardSummary = data.summary || null;
      var localFlood = data.local_flood_hydrology;
      var statusEl = $('gx-hazard-status');
      if (statusEl) {
        var counts = setHazardCounts();
        statusEl.textContent = counts.all.toLocaleString() + ' active records · USGS + NASA EONET' +
          (localFlood ? ' · river: ' + (localFlood.flood_stage_label || 'modelled flow') : '') +
          (state.fires.length ? ' · FIRMS ' + state.fires.length.toLocaleString() : '');
      }
      updateHazardMap();
      renderHazardList();
      updateHud();
    } catch (error) {
      var errorEl = $('gx-hazard-status');
      if (errorEl) errorEl.textContent = 'Hazard feed notice: ' + (error.message || 'provider unavailable');
    }
  }

  async function loadFires() {
    var status = $('gx-hazard-status');
    if (status) status.textContent = 'Requesting NASA FIRMS VIIRS thermal anomalies…';
    try {
      var response = await apiGet('fires', {}, 35000);
      var payload = response.data || response;
      var features = Array.isArray(payload.features) ? payload.features : [];
      state.fires = features.filter(function (f) {
        var c = f.geometry && f.geometry.coordinates;
        return c && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]));
      });
      state.fireFx = state.fires.slice().sort(function (a, b) {
        return num(b.properties && b.properties.frp, 0) - num(a.properties && a.properties.frp, 0);
      }).slice(0, 80);
      if (status) {
        var combined = hazardCounts();
        status.textContent = combined.all.toLocaleString() + ' active records · USGS + NASA EONET + FIRMS (' +
          state.fires.length.toLocaleString() + ' thermal) · ' + (payload.source || 'VIIRS SNPP NRT');
      }
      setHazardCounts();
      updateHazardMap();
      renderHazardList();
      updateHud();
    } catch (error) {
      if (status) status.textContent = 'NASA FIRMS notice: ' + (error.message || 'MAP_KEY or provider unavailable');
    }
  }

  async function loadFlights(provider, seq, options) {
    provider = provider === 'aviationstack' ? 'aviationstack' : 'adsb';
    options = options || {};
    var quiet = !!options.quiet;
    var status = $('gx-flight-status');
    var countPill = $('gx-flight-count');
    if (!quiet && countPill) countPill.textContent = 'LIVE · …';
    if (!quiet && status) status.textContent = 'Scanning ' + provider.toUpperCase() + ' radar around ' + state.target.lat.toFixed(2) + '°, ' + state.target.lon.toFixed(2) + '°…';
    var flightList = $('gx-flight-list');
    if (!quiet && flightList) flightList.innerHTML = '<div class="gx-empty">Sweeping ' + esc(provider.toUpperCase()) + ' transponders around ' + esc(shortName(state.target.name)) + '…</div>';
    if (!quiet && state.map && state.map.getSource('gx-flights')) {
      state.map.getSource('gx-flights').setData({ type: 'FeatureCollection', features: [] });
    }
    try {
      var response = await apiGet('flights', { lat: state.target.lat, lon: state.target.lon, dist: 250, provider: provider });
      if (seq !== undefined && seq !== state.targetSeq) return;
      var data = response.data || {};
      var features = Array.isArray(data.features) ? data.features : [];
      state.flights = features;
      if (state.map && state.map.getSource('gx-flights')) {
        state.map.getSource('gx-flights').setData({ type: 'FeatureCollection', features: features.slice(0, 200) });
      }
      if (status) status.textContent = features.length + ' live aircraft via ' + (data.source || provider.toUpperCase()) + (data.radius_nm ? ' · ' + data.radius_nm + ' nm sweep' : '') + (quiet ? ' · refreshed ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') + '.';
      renderFlightList();
      updateFlightBadges();
      updateHud();
    } catch (error) {
      if (seq !== undefined && seq !== state.targetSeq) return;
      if (!quiet) {
        if (status) status.textContent = 'Air radar notice: ' + (error.message || 'provider unavailable');
        var failedList = $('gx-flight-list');
        if (failedList) failedList.innerHTML = '<div class="gx-empty">Air radar notice: ' + esc(error.message || 'provider unavailable') + '</div>';
      } else if (status) {
        status.textContent = 'Live radar refresh delayed: ' + (error.message || 'provider unavailable') + '. Showing the last sweep.';
      }
      updateFlightBadges();
    }
  }

  function updateFlightBadges() {
    var count = state.flights.length;
    var pill = $('gx-flight-count');
    if (pill) pill.textContent = 'LIVE · ' + count;
    var tickerCount = $('gx-live-air-count');
    if (tickerCount) tickerCount.textContent = count ? String(count) : '—';
    var live = $('gx-live-air');
    if (live) live.classList.toggle('has-air', count > 0);
  }

  function renderFlightList() {
    var list = $('gx-flight-list');
    if (!list) return;
    if (!state.flights.length) {
      list.innerHTML = '<div class="gx-empty">No positioned aircraft in this 250 nm sector. Lock a major hub (Tokyo, Delhi, London) or try Aviationstack.</div>';
      return;
    }
    list.innerHTML = state.flights.slice(0, 18).map(function (feature, index) {
      var props = feature.properties || {};
      var coords = feature.geometry && feature.geometry.coordinates || [state.target.lon, state.target.lat];
      return '<div class="gx-item"><div>' +
        '<strong>✈️ ' + esc(props.flight || props.title || 'AIRCRAFT') + '</strong>' +
        '<small>' + esc(props.aircraft_type || props.airline || 'Transponder') + ' · ALT ' + esc(props.altitude == null ? '—' : props.altitude) + ' ft</small>' +
        '<small>SPD ' + esc(props.ground_speed == null ? '—' : props.ground_speed) + ' kt · HDG ' + esc(props.track == null ? '—' : props.track) + '° · ' + Number(coords[1]).toFixed(2) + '°, ' + Number(coords[0]).toFixed(2) + '°</small>' +
        '</div><button type="button" class="gx-lock" data-gx-flight-idx="' + index + '">🎯 LOCK</button></div>';
    }).join('');
    list.querySelectorAll('[data-gx-flight-idx]').forEach(function (button) {
      button.addEventListener('click', function () {
        var feature = state.flights[Number(button.getAttribute('data-gx-flight-idx'))];
        var coords = feature && feature.geometry && feature.geometry.coordinates;
        if (coords && state.map) {
          state.map.flyTo({ center: [Number(coords[0]), Number(coords[1])], zoom: 10.8, pitch: 48, duration: 1100 });
          setBrandStatus('AIRCRAFT LOCKED: ' + (feature.properties.flight || feature.properties.title || 'TRANSPONDER'));
        }
      });
    });
  }

  async function loadInfra(seq, force) {
    var key = state.target.lat.toFixed(3) + ',' + state.target.lon.toFixed(3);
    if (!force && state.infraKey === key && state.infra.length) {
      renderInfraList();
      return;
    }
    if (state.infraKey !== key) {
      state.infra = [];
      state.infraKey = '';
      var pendingList = $('gx-infra-list');
      if (pendingList) pendingList.innerHTML = '<div class="gx-empty">Indexing OpenStreetMap nodes around ' + esc(shortName(state.target.name)) + '…</div>';
      if (state.map && state.map.getSource('gx-infra')) {
        state.map.getSource('gx-infra').setData({ type: 'FeatureCollection', features: [] });
      }
    }
    var status = $('gx-infra-status');
    if (status) status.textContent = 'Indexing OpenStreetMap civic, transport and utility nodes around ' + shortName(state.target.name) + '…';
    try {
      var response = await apiGet('godseye-infra', {
        lat: state.target.lat,
        lon: state.target.lon,
        radius: 12000,
        place: shortName(state.target.name)
      }, 30000);
      if (seq !== undefined && seq !== state.targetSeq) return;
      var nodes = response.data && Array.isArray(response.data.nodes) ? response.data.nodes : [];
      applyInfraNodes(nodes, key, response.data || {});
    } catch (error) {
      if (seq !== undefined && seq !== state.targetSeq) return;
      if (status) status.textContent = 'OSM infrastructure notice: ' + (error.message || 'provider unavailable') + ' — retry with “SCAN OSM LAYER”.';
    }
  }

  function applyInfraNodes(nodes, key, meta) {
    var seen = {};
    var items = [];
    nodes.forEach(function (node) {
      var lat = Number(node.lat);
      var lon = Number(node.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      var name = String(node.name || 'Unnamed node').slice(0, 84);
      var dedupe = name.toLowerCase() + '|' + lat.toFixed(4) + '|' + lon.toFixed(4);
      if (seen[dedupe]) return;
      seen[dedupe] = true;
      items.push({
        name: name,
        category: String(node.category || 'civic').replace(/_/g, ' '),
        lat: lat,
        lon: lon,
        distance_km: Number.isFinite(Number(node.distance_km)) ? Number(node.distance_km) : haversineKm(state.target.lat, state.target.lon, lat, lon),
        address: String(node.address || '').slice(0, 120)
      });
    });
    items.sort(function (a, b) { return a.distance_km - b.distance_km; });
    state.infra = items.slice(0, 40);
    state.infraKey = key;
    if (state.map && state.map.getSource('gx-infra')) {
      state.map.getSource('gx-infra').setData({
        type: 'FeatureCollection',
        features: state.infra.map(function (item) {
          return {
            type: 'Feature',
            properties: { name: item.name, category: item.category },
            geometry: { type: 'Point', coordinates: [item.lon, item.lat] }
          };
        })
      });
    }
    var status = $('gx-infra-status');
    if (status) status.textContent = state.infra.length + ' OSM civic, transport and utility nodes within 12 km' + (meta && meta.source ? ' · ' + meta.source : '') + '.';
    renderInfraList();
  }

  function renderInfraList() {
    var list = $('gx-infra-list');
    if (!list) return;
    if (!state.infra.length) {
      list.innerHTML = '<div class="gx-empty">No dense OSM nodes returned in the immediate radius. Pan to an urban sector and scan again.</div>';
      return;
    }
    list.innerHTML = state.infra.slice(0, 18).map(function (item, index) {
      return '<div class="gx-item"><div>' +
        '<strong>🏛️ ' + esc(item.name) + '</strong>' +
        '<small>' + esc(item.category) + ' · ' + item.distance_km.toFixed(2) + ' km away' + (item.address ? ' · ' + esc(item.address) : '') + '</small></div>' +
        '<button type="button" class="gx-lock" data-gx-infra-idx="' + index + '">🎯 PIN</button></div>';
    }).join('');
    list.querySelectorAll('[data-gx-infra-idx]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = state.infra[Number(button.getAttribute('data-gx-infra-idx'))];
        if (item && state.map) {
          state.map.flyTo({ center: [item.lon, item.lat], zoom: 17.6, pitch: 55, duration: 1000 });
          setBrandStatus('NODE LOCK: ' + item.name.toUpperCase().slice(0, 54));
        }
      });
    });
  }

  async function loadNews(seq, force) {
    var query = shortName(state.target.name);
    var key = query.toLowerCase();
    if (!force && state.newsKey === key) return;
    var pendingNews = $('gx-news-list');
    if (pendingNews) {
      pendingNews.innerHTML = '<div class="gx-empty">Intercepting GDELT wire for “' + esc(query) + '”…</div>';
    }
    try {
      var response = await apiGet('news', { q: query });
      if (seq !== undefined && seq !== state.targetSeq) return;
      state.newsKey = key;
      var articles = response.data && Array.isArray(response.data.articles) ? response.data.articles : [];
      var list = $('gx-news-list');
      if (!list) return;
      if (!articles.length) {
        list.innerHTML = '<div class="gx-empty">No recent GDELT wire intercepts for “' + esc(query) + '”.</div>';
        return;
      }
      list.innerHTML = articles.slice(0, 8).map(function (article) {
        return '<div class="gx-item"><div>' +
          '<a href="' + esc(article.url || '#') + '" target="_blank" rel="noopener">📰 ' + esc(article.title || 'Intel wire') + ' ↗</a>' +
          '<small>' + esc(article.domain || 'Wire') + ' · ' + esc(article.seendate || '') + '</small></div></div>';
      }).join('');
    } catch (error) {
      var newsList = $('gx-news-list');
      if (newsList) newsList.innerHTML = '<div class="gx-empty">News wire notice: ' + esc(error.message || 'provider unavailable') + '</div>';
    }
  }

  async function generateSitrep() {
    var box = $('gx-sitrep');
    var button = $('gx-ai-btn');
    var counts = hazardCounts();
    var weather = [$('gx-w-temp') && $('gx-w-temp').textContent, $('gx-w-wind') && $('gx-w-wind').textContent, $('gx-w-hum') && $('gx-w-hum').textContent].filter(Boolean).join(' · ');
    if (box) box.textContent = 'Synthesizing OSINT situational awareness for ' + shortName(state.target.name) + ' via OpenRouter…';
    if (button) button.disabled = true;
    try {
      var response = await apiPost('assistant', {
        question: 'Generate a concise 4-bullet God’s Eye OSINT situational-awareness sitrep for ' + state.target.name +
          ' (' + state.target.lat.toFixed(4) + ', ' + state.target.lon.toFixed(4) + '). Cover geographic/strategic context, current weather or environmental conditions, regional hazard profile, and key infrastructure/transport notes. Separate observations from interpretation and unknowns.',
        language: 'en-US',
        context: {
          selected_place: state.target.name,
          coordinates: { lat: state.target.lat, lon: state.target.lon },
          weather_summary: weather || 'Live weather telemetry requested',
          selected_event: 'Standalone God’s Eye tactical workspace',
          source_facts: [
            'Active hazard records: ' + counts.all + ' (volcano ' + counts.volcano + ', flood ' + counts.flood + ', earthquake ' + counts.earthquake + ', wildfire ' + counts.wildfire + ', storm ' + counts.storm + ')',
            'NASA FIRMS thermal detections loaded: ' + state.fires.length,
            'Aircraft visible in current sweep: ' + state.flights.length,
            'OSM infrastructure nodes loaded: ' + state.infra.length,
            'Orbital constellation tracked: ' + state.sats.length + ' satellites (illustrative propagation from public elements)'
          ]
        }
      });
      var text = String(response.answer || '').trim();
      if (box) box.innerHTML = text ? esc(text).replace(/\n/g, '<br>') : 'The AI returned an empty sitrep.';
    } catch (error) {
      if (box) box.textContent = 'AI sitrep notice: ' + (error.message || 'provider unavailable');
    } finally {
      if (button) button.disabled = false;
    }
  }

  /* -----------------------------------------------------------------------
     HAZARD FILTER + SIMULATION
     ----------------------------------------------------------------------- */
  function setFilter(filter) {
    state.filter = ['all', 'volcano', 'flood', 'earthquake', 'wildfire', 'storm'].indexOf(filter) >= 0 ? filter : 'all';
    qsa('[data-gx-filter]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-gx-filter') === state.filter);
    });
    updateHazardMap();
    renderHazardList();
    setHazardCounts();
    setBrandStatus('THREAT FILTER: ' + state.filter.toUpperCase());
  }

  function spawnSim(type) {
    var labels = {
      volcano: { title: 'Simulated eruption at ' + shortName(state.target.name), plume: 14.5, radius: 65, severity: 'extreme' },
      flood: { title: 'Simulated flood surge at ' + shortName(state.target.name), plume: 0, radius: 85, severity: 'high' },
      earthquake: { title: 'Simulated M7.5 seismic event at ' + shortName(state.target.name), plume: 0, radius: 320, severity: 'extreme' },
      storm: { title: 'Simulated cyclone at ' + shortName(state.target.name), plume: 15, radius: 220, severity: 'high' },
      wildfire: { title: 'Simulated wildfire at ' + shortName(state.target.name), plume: 5, radius: 42, severity: 'elevated' }
    };
    var preset = labels[type];
    if (!preset) return;
    state.sims.push({
      id: 'sim-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      type: type,
      title: preset.title,
      lat: state.target.lat,
      lon: state.target.lon,
      severity: preset.severity,
      magnitude: type === 'earthquake' ? 7.5 : 6.5,
      plume_height_km: preset.plume,
      impact_radius_km: preset.radius,
      source: 'God’s Eye simulation',
      simulated: true,
      created_at: Date.now()
    });
    updateHazardMap();
    renderHazardList();
    setHazardCounts();
    setBrandStatus('SIMULATION DEPLOYED: ' + type.toUpperCase() + ' AT TARGET');
    if (state.map) state.map.flyTo({ center: [state.target.lon, state.target.lat], zoom: 8.4, pitch: 52, duration: 1300 });
  }

  function clearSims() {
    state.sims = [];
    updateHazardMap();
    renderHazardList();
    setHazardCounts();
    setBrandStatus('SIMULATIONS CLEARED');
  }

  /* -----------------------------------------------------------------------
     ROUTE / TRAFFIC / TICKET ENGINE
     ----------------------------------------------------------------------- */
  function parseRouteQuery(raw) {
    var text = ' ' + String(raw || '') + ' ';
    text = text.replace(/[“”"]/g, ' ');
    text = text.replace(/\b(?:please|can you|could you|show me|tell me|what is|what's|calculate|find|plan|give me)\b/gi, ' ');
    text = text.replace(/\b(?:the\s+)?(?:distance|route|routes|tickets?|fares?|prices?|traffic|travel|trip)\b/gi, ' ');
    text = text.replace(/\b(?:and|with|plus)\b.*$/i, ' ');
    text = text.replace(/\s+/g, ' ').trim();

    var from = '', to = '';
    var match = text.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/i);
    if (!match) match = text.match(/\bbetween\s+(.+?)\s+and\s+(.+)$/i);
    if (!match) match = text.match(/^(.+?)\s*(?:->|→|\bto\b)\s*(.+)$/i);
    if (match) { from = match[1]; to = match[2]; }

    var clean = function (value) {
      return String(value || '')
        .replace(/^[\s,.;:!-]+|[\s,.;:!-]+$/g, '')
        .replace(/\b(?:routes?|tickets?|prices?|traffic|everything|all|please)\b.*$/i, '')
        .replace(/^(?:from|to|towards?)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    from = clean(from);
    to = clean(to);

    if (!from && state.target && state.target.name) from = shortName(state.target.name);
    if (!from) from = 'Biratnagar';
    if (!to) to = 'Bangalore';
    return { from: from.slice(0, 80), to: to.slice(0, 80) };
  }

  function isRouteQuery(raw) {
    var lower = String(raw || '').toLowerCase();
    return /\b(?:from\s+.+\s+to\s+|between\s+.+\s+and\s+|route|routes|distance|ticket|tickets|fare|fares|price|prices|traffic|drive|driving|flight|train|bus)\b/i.test(lower) ||
      /(?:->|→)/.test(lower);
  }

  function syncRouteInputs(data) {
    if (!data) return;
    var from = $('gx-sa-from');
    var to = $('gx-sa-to');
    if (from && data.origin && data.origin.name) from.value = data.origin.name;
    if (to && data.destination && data.destination.name) to.value = data.destination.name;
  }

  async function executeRoute(raw, options) {
    options = options || {};
    var silent = !!options.silent;
    var parsed = parseRouteQuery(raw);
    var samePlace = function (a, b) { return shortName(a).toLowerCase() === shortName(b).toLowerCase(); };
    if (state.routeData && samePlace(parsed.from, state.routeFrom) && samePlace(parsed.to, state.routeTo)) {
      if (!silent) {
        renderRoutesOnGxMap(state.routeData);
        renderRouteDrawer(state.routeData);
      }
      setBrandStatus('ROUTE READY: ' + Math.round(num(state.routeData.road_distance_km)) + ' KM · ' + (state.routeData.driving_duration || ''));
      return;
    }
    var drawer = $('gx-route-drawer');
    var button = $('gx-sa-submit');
    if (!silent && drawer) {
      drawer.hidden = false;
      drawer.innerHTML = '<div class="sa-loading">🤖 SuperAgent computing primary and alternative routes, traffic bottlenecks and multi-modal ticket fares from <b>' +
        esc(parsed.from) + '</b> to <b>' + esc(parsed.to) + '</b>…</div>';
    }
    if (button && !silent) { button.disabled = true; button.textContent = 'ROUTING…'; }
    setBrandStatus('SUPERAGENT ROUTING: ' + parsed.from.toUpperCase() + ' → ' + parsed.to.toUpperCase());
    if (silent) renderTickerHint('SUPERAGENT CALCULATING ' + parsed.from.toUpperCase() + ' → ' + parsed.to.toUpperCase() + ' · LIVE FARES, TRAFFIC & TICKETS…');
    try {
      var response = await apiGet('route-planner', { from: parsed.from, to: parsed.to, q: raw }, 46000);
      var data = response.routes ? response : (response.data || {});
      if (!data || !Array.isArray(data.routes) || !data.routes.length) throw new Error('Route calculation did not return any route geometry.');
      state.routeData = data;
      state.routeFrom = parsed.from;
      state.routeTo = parsed.to;
      state.selectedRouteIndex = 0;
      syncRouteInputs(data);
      renderTicker(data);
      if (!silent) {
        renderRoutesOnGxMap(data);
        renderRouteDrawer(data);
      }
      setBrandStatus('ROUTE READY: ' + Math.round(num(data.road_distance_km)) + ' KM · ' + (data.driving_duration || ''));
    } catch (error) {
      if (drawer && !silent) {
        drawer.hidden = false;
        drawer.innerHTML = '<div class="sa-card-header"><strong>⚠️ SuperAgent notice</strong>' +
          '<button type="button" class="sa-close-btn" data-gx-route-close>✕</button></div>' +
          '<p class="sa-summary-text">' + esc(error.message || 'Could not compute the route.') + '</p>';
        bindRouteDrawer();
      }
      if (!silent) setBrandStatus('ROUTE ENGINE NOTICE: ' + String(error.message || 'unavailable').toUpperCase().slice(0, 80));
      if (silent) renderTickerHint('ROUTE ENGINE OFFLINE · TRY AGAIN');
    } finally {
      if (button && !silent) { button.disabled = false; button.textContent = 'CALCULATE ↗'; }
    }
  }

  function routeForTicker(data) {
    return (data.routes && (data.routes[state.selectedRouteIndex] || data.routes[0])) || {};
  }

  function tickerItem(kind, label, value, sub) {
    return '<button type="button" class="gx-tick ' + kind + '" data-gx-tick-open="1" data-gx-tick-mode="' + esc(kind) + '" title="Open the full route, traffic and ticket matrix">' +
      '<span class="gx-tick-mode">' + esc(label) + '</span><b>' + esc(value) + '</b>' +
      (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';
  }

  function renderTicker(data) {
    var track = $('gx-ticker-track');
    if (!track) return;
    var route = routeForTicker(data);
    var tickets = data.tickets || {};
    var flight = tickets.flight || {};
    var train = tickets.train || {};
    var bus = tickets.bus || {};
    var car = tickets.car || {};
    var traffic = Array.isArray(data.traffic_hotspots) ? data.traffic_hotspots : [];
    var parts = [];
    parts.push('<button type="button" class="gx-tick hint" title="Click any fare to reopen the route drawer">' +
      esc(shortName(data.origin && data.origin.name) + ' → ' + shortName(data.destination && data.destination.name)) + '</button>');
    parts.push(tickerItem('route', '🛣️ ROUTE', Math.round(num(route.distance_km || data.road_distance_km)) + ' km', route.duration_formatted || data.driving_duration || ''));
    if (flight.mode) parts.push(tickerItem('flight', '✈️ FLIGHT', flight.fare_inr || '—', flight.estimated_duration || ''));
    if (train.mode) parts.push(tickerItem('train', '🚆 TRAIN', train.fare_inr || '—', train.estimated_duration || ''));
    if (bus.mode) parts.push(tickerItem('bus', '🚌 BUS', bus.fare_inr || '—', bus.estimated_duration || ''));
    if (car.mode) parts.push(tickerItem('car', '🚗 CAR', car.fare_inr || '—', car.fuel_liters || ''));
    if (traffic.length) parts.push(tickerItem('route', '🚦 TRAFFIC', '+' + (data.traffic_delay_minutes || 0) + ' min', traffic.length + ' hotspots'));
    track.innerHTML = parts.join('');
    bindTicker();
  }

  function renderTickerHint(text) {
    var track = $('gx-ticker-track');
    if (!track) return;
    track.innerHTML = '<button type="button" class="gx-tick hint">' + esc(text || 'SUPERAGENT READY · ASK ANY ROUTE FOR LIVE FARES') + '</button>' +
      '<button type="button" class="gx-tick hint">✈️ FLIGHT</button><button type="button" class="gx-tick hint">🚆 TRAIN</button>' +
      '<button type="button" class="gx-tick hint">🚌 BUS</button><button type="button" class="gx-tick hint">🚗 CAR</button>';
  }

  function bindTicker() {
    var track = $('gx-ticker-track');
    if (!track || track.dataset.bound === '1') return;
    track.dataset.bound = '1';
    track.addEventListener('click', function (event) {
      var button = event.target.closest('[data-gx-tick-open]');
      if (!button) return;
      var mode = button.getAttribute('data-gx-tick-mode') || 'all';
      openRouteDrawer(mode);
    });
  }

  function openRouteDrawer(mode) {
    state.ticketFocus = mode && mode !== 'route' ? mode : 'all';
    if (!state.routeData) {
      state.pendingTicketFocus = state.ticketFocus;
      executeRoute('Distance from Biratnagar to Bangalore, routes, traffic and ticket prices', {});
      return;
    }
    renderRoutesOnGxMap(state.routeData);
    renderRouteDrawer(state.routeData);
    if (state.ticketFocus !== 'all') {
      var card = document.querySelector('#gx-route-drawer [data-gx-ticket="' + state.ticketFocus + '"]');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function greatCircleArc(a, b, steps) {
    steps = steps || 72;
    var toRad = Math.PI / 180;
    var lat1 = Number(a.lat) * toRad, lon1 = Number(a.lon) * toRad;
    var lat2 = Number(b.lat) * toRad, lon2 = Number(b.lon) * toRad;
    var d = 2 * Math.asin(Math.min(1, Math.sqrt(
      Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)
    )));
    var coords = [];
    if (!d) return { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] };
    for (var i = 0; i <= steps; i++) {
      var f = i / steps;
      var A = Math.sin((1 - f) * d) / Math.sin(d);
      var B = Math.sin(f * d) / Math.sin(d);
      var x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
      var y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
      var z = A * Math.sin(lat1) + B * Math.sin(lat2);
      coords.push([Math.atan2(y, x) / toRad, Math.atan2(z, Math.sqrt(x * x + y * y)) / toRad]);
    }
    return { type: 'LineString', coordinates: coords };
  }

  function renderRoutesOnGxMap(data) {
    var map = state.map;
    if (!map || !map.getSource('gx-route-primary')) return;
    var routes = Array.isArray(data.routes) ? data.routes : [];
    var primary = routes[state.selectedRouteIndex] || routes[0];
    var alternatives = routes.filter(function (_, index) { return index !== state.selectedRouteIndex; });
    var primaryFeatures = primary && primary.geometry ? [{
      type: 'Feature',
      properties: { label: primary.label || '', distance_km: primary.distance_km, duration_label: primary.duration_formatted },
      geometry: primary.geometry
    }] : [];
    var altFeatures = alternatives.filter(function (route) { return route && route.geometry; }).map(function (route) {
      return { type: 'Feature', properties: { label: route.label || '' }, geometry: route.geometry };
    });
    var airFeatures = [];
    if (data.origin && data.destination && Number.isFinite(num(data.origin.lon)) && Number.isFinite(num(data.destination.lon))) {
      airFeatures.push({
        type: 'Feature',
        properties: { label: 'Schematic air corridor' },
        geometry: greatCircleArc(data.origin, data.destination, 72)
      });
    }
    var trafficFeatures = (Array.isArray(data.traffic_hotspots) ? data.traffic_hotspots : []).filter(function (hotspot) {
      return hotspot && hotspot.geometry;
    }).map(function (hotspot) {
      return {
        type: 'Feature',
        properties: {
          title: hotspot.title || hotspot.name || 'Traffic bottleneck',
          severity: hotspot.severity || 'heavy',
          delay_min: hotspot.delay_minutes || hotspot.delay_min || 20,
          color: hotspot.severity === 'heavy' ? '#ef4444' : '#f59e0b'
        },
        geometry: hotspot.geometry
      };
    });
    var endpoints = [];
    if (data.origin) endpoints.push({
      type: 'Feature',
      properties: { role: 'ORIGIN', label: 'START: ' + (data.origin.name || 'Origin'), color: '#10b981' },
      geometry: { type: 'Point', coordinates: [num(data.origin.lon), num(data.origin.lat)] }
    });
    if (data.destination) endpoints.push({
      type: 'Feature',
      properties: { role: 'DESTINATION', label: 'END: ' + (data.destination.name || 'Destination'), color: '#38bdf8' },
      geometry: { type: 'Point', coordinates: [num(data.destination.lon), num(data.destination.lat)] }
    });
    map.getSource('gx-route-primary').setData({ type: 'FeatureCollection', features: primaryFeatures });
    map.getSource('gx-route-alt').setData({ type: 'FeatureCollection', features: altFeatures });
    map.getSource('gx-route-air').setData({ type: 'FeatureCollection', features: airFeatures });
    map.getSource('gx-route-traffic').setData({ type: 'FeatureCollection', features: trafficFeatures });
    map.getSource('gx-route-endpoints').setData({ type: 'FeatureCollection', features: endpoints });

    if (data.origin && data.destination && Number.isFinite(num(data.origin.lon)) && Number.isFinite(num(data.destination.lon))) {
      var minLon = Math.min(num(data.origin.lon), num(data.destination.lon));
      var maxLon = Math.max(num(data.origin.lon), num(data.destination.lon));
      var minLat = Math.min(num(data.origin.lat), num(data.destination.lat));
      var maxLat = Math.max(num(data.origin.lat), num(data.destination.lat));
      map.fitBounds([[minLon - 1.5, minLat - 1.2], [maxLon + 1.5, maxLat + 1.2]], {
        padding: { top: 70, bottom: 285, left: 70, right: 70 }, duration: 1500
      });
    }
  }

  function ticketRows(ticket) {
    if (!ticket) return '';
    var rows = '';
    if (Array.isArray(ticket.tiers)) {
      rows = ticket.tiers.map(function (tier) {
        return '<div class="sa-ticket-tier"><span>' + esc(tier.class) + '</span><strong>₹' + Number(tier.inr || 0).toLocaleString() +
          ' <small>(रू ' + Number(tier.npr || 0).toLocaleString() + ' · $' + esc(tier.usd) + ')</small></strong></div>';
      }).join('');
    } else {
      if (ticket.classes && typeof ticket.classes === 'object') {
        rows += Object.keys(ticket.classes).map(function (key) {
          return '<div class="sa-ticket-tier"><span>' + esc(key) + '</span><strong>' + esc(ticket.classes[key]) + '</strong></div>';
        }).join('');
      }
      if (ticket.fare_inr) {
        rows += '<div class="sa-ticket-tier"><span>Estimated fare</span><strong>' + esc(ticket.fare_inr) +
          ' <small>(' + esc(ticket.fare_npr || '') + ' · ' + esc(ticket.fare_usd || '') + ')</small></strong></div>';
      }
      if (ticket.fuel_liters) {
        rows += '<div class="sa-ticket-tier"><span>Fuel & tolls</span><strong>' + esc(ticket.fuel_liters) +
          ' · Tolls ' + esc(ticket.tolls_inr || '—') + '</strong></div>';
      }
    }
    return rows;
  }

  function ticketFareFrom(ticket) {
    var match = String(ticket && ticket.fare_inr || '').match(/₹\s?[\d,]+/);
    return match ? 'from ' + match[0].replace(/\s+/g, '') : '—';
  }

  function modeCompareCard(data, mode, icon, title) {
    var ticket = (data.tickets || {})[mode];
    if (!ticket) return '';
    var distance = mode === 'flight'
      ? Math.round(num(data.aerial_distance_km)) + ' km air'
      : mode === 'train'
        ? Math.round(num(ticket.rail_distance_km || num(data.road_distance_km) * 0.96)) + ' km rail'
        : Math.round(num(data.road_distance_km)) + ' km road';
    return '<button type="button" class="gx-mode-card ' + mode + (state.ticketFocus === mode ? ' is-focused' : '') + '" data-gx-ticket-jump="' + mode + '" title="Jump to ' + esc(title) + ' fares">' +
      '<span class="gx-mode-icon">' + icon + '</span>' +
      '<span class="gx-mode-copy"><b>' + esc(title) + '</b><small>' + esc(ticket.estimated_duration || data.driving_duration || '') + ' · ' + esc(distance) + '</small></span>' +
      '<strong>' + esc(ticketFareFrom(ticket)) + '</strong></button>';
  }

  function ticketDetailCard(mode, icon, data, ticket) {
    if (!ticket) return '';
    var sub = ticket.airports || ticket.stations ||
      (mode === 'bus' ? 'Intercity luxury coach / sleeper' : mode === 'car' ? 'Self-drive petrol/diesel vs EV fast-charge' : ticket.note || '');
    return '<div class="sa-ticket-card ' + mode + (state.ticketFocus === mode ? ' is-focused' : '') + '" data-gx-ticket="' + mode + '">' +
      '<div class="sa-ticket-head"><strong>' + icon + ' ' + esc(ticket.mode || mode) + '</strong><span>' + esc(ticket.estimated_duration || '') + '</span></div>' +
      '<small class="sa-ticket-sub">' + esc(sub) + '</small>' + ticketRows(ticket) + '</div>';
  }

  function scrollToTicketFocus() {
    var drawer = $('gx-route-drawer');
    if (!drawer || drawer.hidden) return;
    if (state.ticketFocus === 'all') { drawer.scrollTop = 0; return; }
    var card = drawer.querySelector('[data-gx-ticket="' + state.ticketFocus + '"]');
    if (!card) return;
    var drawerRect = drawer.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    drawer.scrollTop += cardRect.top - drawerRect.top - 64;
  }

  function focusTicketMode(mode) {
    state.ticketFocus = ['flight', 'train', 'bus', 'car'].indexOf(mode) >= 0 ? mode : 'all';
    qsa('[data-gx-ticket-focus]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-gx-ticket-focus') === state.ticketFocus);
    });
    if (!state.routeData) {
      state.pendingTicketFocus = state.ticketFocus;
      executeRoute('Distance from Biratnagar to Bangalore, routes, traffic and ticket prices', {});
      return;
    }
    renderRouteDrawer(state.routeData);
  }

  function hidePlaceSuggestions(list) {
    if (!list) return;
    list.hidden = true;
    list.innerHTML = '';
    delete list.dataset.loadedFor;
  }

  async function fetchPlaceSuggestions(input, list) {
    var query = String(input && input.value || '').trim();
    if (!query || query.length < 2) { hidePlaceSuggestions(list); return; }
    list.hidden = false;
    list.innerHTML = '<div class="gx-sa-suggest-empty">Searching OpenStreetMap / Photon…</div>';
    list.dataset.loadedFor = query;
    try {
      var response = await apiGet('geocode', { q: query }, 14000);
      if (!input.isConnected || list.dataset.loadedFor !== query) return;
      var hits = Array.isArray(response.data) ? response.data : [];
      if (!hits.length) {
        list.innerHTML = '<div class="gx-sa-suggest-empty">No matching place. Try a city, airport, station or landmark.</div>';
        return;
      }
      list.innerHTML = hits.slice(0, 6).map(function (hit) {
        var label = hit.display_name || hit.name || 'Place';
        return '<button type="button" class="gx-sa-suggest-item" data-gx-place="' + esc(label) + '" role="option">' +
          '<span aria-hidden="true">◎</span><span class="gx-sa-suggest-copy"><b>' + esc(hit.name || label) + '</b>' +
          '<small>' + esc(label) + '</small></span><em>' + esc(hit.country || hit.type || '') + '</em></button>';
      }).join('');
      list.querySelectorAll('[data-gx-place]').forEach(function (option) {
        option.addEventListener('mousedown', function (event) { event.preventDefault(); });
        option.addEventListener('click', function () {
          input.value = option.getAttribute('data-gx-place') || option.textContent.trim();
          hidePlaceSuggestions(list);
          input.focus();
        });
      });
    } catch (error) {
      if (list.dataset.loadedFor !== query) return;
      list.innerHTML = '<div class="gx-sa-suggest-empty">Live place search is unavailable. You can still type the place name.</div>';
    }
  }

  function bindPlaceAutocomplete(inputId, listId) {
    var input = $(inputId);
    var list = $(listId);
    if (!input || !list) return;
    var timer = 0;
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listId);
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var value = input.value.trim();
      if (value.length < 2) { hidePlaceSuggestions(list); return; }
      timer = setTimeout(function () { fetchPlaceSuggestions(input, list); }, 320);
    });
    input.addEventListener('keydown', function (event) {
      if (list.hidden) return;
      var options = qsa('.gx-sa-suggest-item', list);
      if (!options.length) return;
      var active = list.querySelector('.gx-sa-suggest-item.is-active');
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        var index = active ? options.indexOf(active) : -1;
        index += event.key === 'ArrowDown' ? 1 : -1;
        if (index < 0) index = options.length - 1;
        if (index >= options.length) index = 0;
        options.forEach(function (option) { option.classList.remove('is-active'); });
        options[index].classList.add('is-active');
        options[index].scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && active) {
        event.preventDefault();
        active.click();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        hidePlaceSuggestions(list);
      }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () { hidePlaceSuggestions(list); }, 180);
    });
  }

  function renderRouteDrawer(data) {
    var drawer = $('gx-route-drawer');
    if (!drawer) return;
    drawer.hidden = false;
    var routes = Array.isArray(data.routes) ? data.routes : [];
    var activeRoute = routes[state.selectedRouteIndex] || routes[0] || {};
    var traffic = Array.isArray(data.traffic_hotspots) ? data.traffic_hotspots : [];
    var tickets = data.tickets || {};

    var routeTabs = routes.map(function (route, index) {
      return '<button type="button" class="sa-route-tab ' + (index === state.selectedRouteIndex ? 'active' : '') + '" data-gx-route-idx="' + index + '">' +
        '<span class="sa-route-dot" style="background:' + esc(route.color || (index === 0 ? '#10b981' : '#a855f7')) + '"></span>' +
        '<div><strong>' + esc(route.label || ('Route ' + (index + 1))) + '</strong>' +
        '<small>' + esc(route.distance_km) + ' km · ' + esc(route.duration_formatted || data.driving_duration) + ' · ' + esc(route.summary || 'Highway corridor') + '</small></div></button>';
    }).join('');

    var trafficHtml = traffic.map(function (hotspot) {
      var lat = Number(hotspot.center && hotspot.center.lat != null ? hotspot.center.lat : hotspot.lat);
      var lon = Number(hotspot.center && hotspot.center.lon != null ? hotspot.center.lon : hotspot.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        var coords = hotspot.geometry && hotspot.geometry.coordinates;
        if (Array.isArray(coords) && coords.length) {
          var mid = coords[Math.floor(coords.length / 2)];
          lon = Number(mid[0]); lat = Number(mid[1]);
        }
      }
      return '<button type="button" class="sa-traffic-item" data-gx-route-fly-lat="' + lat + '" data-gx-route-fly-lon="' + lon + '" title="Zoom to traffic bottleneck">' +
        '<span class="sa-traffic-badge ' + esc(hotspot.severity || 'heavy') + '">' + esc(String(hotspot.severity || 'heavy').toUpperCase()) + '</span>' +
        '<div class="sa-traffic-info"><strong>' + esc(hotspot.title || 'Corridor congestion') + '</strong>' +
        '<small>+' + esc(hotspot.delay_minutes || 20) + ' min · avg ' + esc(hotspot.avg_speed_kmh || 22) + ' km/h</small></div>' +
        '<span class="sa-zoom-tag">Zoom ↗</span></button>';
    }).join('');

    var compareHtml = [
      modeCompareCard(data, 'flight', '✈️', 'Flight'),
      modeCompareCard(data, 'train', '🚆', 'Train'),
      modeCompareCard(data, 'bus', '🚌', 'Bus'),
      modeCompareCard(data, 'car', '🚗', 'Car')
    ].join('');

    var ticketHtml = [
      ticketDetailCard('flight', '✈️', data, tickets.flight),
      ticketDetailCard('train', '🚆', data, tickets.train),
      ticketDetailCard('bus', '🚌', data, tickets.bus),
      ticketDetailCard('car', '🚗', data, tickets.car)
    ].join('');

    var summary = data.agent_summary || ('Autonomous route analysis from ' + (data.origin && data.origin.name || 'origin') + ' to ' +
      (data.destination && data.destination.name || 'destination') + ': ' + data.road_distance_km + ' km by road (' +
      data.driving_duration + ', +' + (data.traffic_delay_minutes || 0) + ' min traffic across ' + traffic.length + ' bottlenecks); ' +
      data.aerial_distance_km + ' km aerial distance.');

    drawer.innerHTML = '<div class="sa-card-header"><div>' +
      '<span class="sa-route-kicker">AUTONOMOUS SUPERAGENT · ROUTE · TRAFFIC · MULTI-MODAL TICKET MATRIX</span>' +
      '<h4>📍 ' + esc(data.origin && data.origin.name || 'Origin') + ' → 🎯 ' + esc(data.destination && data.destination.name || 'Destination') + '</h4></div>' +
      '<div class="sa-header-actions"><span class="sa-dist-pill">✈️ Aerial <b>' + esc(data.aerial_distance_km) + ' km</b></span>' +
      '<span class="sa-dist-pill primary">🛣️ Road <b>' + esc(activeRoute.distance_km || data.road_distance_km) + ' km</b> (' + esc(activeRoute.duration_formatted || data.driving_duration) + ')</span>' +
      '<button type="button" class="sa-close-btn" data-gx-route-close title="Close and clear route">✕</button></div></div>' +
      '<p class="sa-summary-text">' + esc(summary) + '</p>' +
      (compareHtml ? '<div class="gx-mode-compare">' + compareHtml + '</div>' : '') +
      '<div class="sa-route-tabs">' + routeTabs + '</div>' +
      '<div class="sa-grid"><div class="sa-col traffic-col"><h5>🚦 Live traffic congestion hotspots (click to inspect)</h5>' +
      '<div class="sa-traffic-list">' + (trafficHtml || '<div class="gx-empty">No congestion records returned.</div>') + '</div>' +
      '<div class="sa-route-corridor-note"><strong>Selected corridor:</strong> ' +
      esc((activeRoute.major_roads || []).slice(0, 5).join(' → ') || activeRoute.summary || 'Primary corridor') + '</div></div>' +
      '<div class="sa-col tickets-col"><h5>🎫 Multi-modal ticket prices (₹ INR · रू NPR · $ USD)</h5>' +
      '<div class="sa-tickets-grid">' + (ticketHtml || '<div class="gx-empty">No ticket matrix returned.</div>') + '</div></div></div>' +
      '<div class="gx-route-legend"><span><i></i>Selected road route</span><span><i class="alt"></i>Alternative road route</span><span><i class="flight"></i>Air corridor (schematic)</span><span><i class="traffic"></i>Traffic bottleneck</span></div>';
    bindRouteDrawer();
    qsa('[data-gx-ticket-focus]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-gx-ticket-focus') === state.ticketFocus);
    });
    setTimeout(scrollToTicketFocus, 50);
  }

  function bindRouteDrawer() {
    var drawer = $('gx-route-drawer');
    if (!drawer) return;
    drawer.querySelectorAll('[data-gx-route-close]').forEach(function (button) {
      button.addEventListener('click', function () {
        drawer.hidden = true;
        clearRouteLayers();
      });
    });
    drawer.querySelectorAll('[data-gx-route-idx]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.selectedRouteIndex = parseInt(tab.getAttribute('data-gx-route-idx'), 10) || 0;
        if (state.routeData) {
          renderRoutesOnGxMap(state.routeData);
          renderRouteDrawer(state.routeData);
        }
      });
    });
    drawer.querySelectorAll('[data-gx-ticket-jump]').forEach(function (card) {
      card.addEventListener('click', function () {
        focusTicketMode(card.getAttribute('data-gx-ticket-jump') || 'all');
      });
    });
    drawer.querySelectorAll('[data-gx-route-fly-lat]').forEach(function (button) {
      button.addEventListener('click', function () {
        var lat = Number(button.getAttribute('data-gx-route-fly-lat'));
        var lon = Number(button.getAttribute('data-gx-route-fly-lon'));
        if (state.map && Number.isFinite(lat) && Number.isFinite(lon)) {
          state.map.flyTo({ center: [lon, lat], zoom: 14.5, pitch: 58, duration: 1500 });
        }
      });
    });
  }

  function clearRouteLayers() {
    if (!state.map) return;
    ['gx-route-primary', 'gx-route-alt', 'gx-route-air', 'gx-route-traffic', 'gx-route-endpoints'].forEach(function (id) {
      var source = state.map.getSource(id);
      if (source && source.setData) source.setData({ type: 'FeatureCollection', features: [] });
    });
  }

  /* -----------------------------------------------------------------------
     COMMAND ROUTER
     ----------------------------------------------------------------------- */
  function handleCommand(raw) {
    var text = String(raw || '').trim();
    if (!text) return;
    var lower = text.toLowerCase();
    if (isRouteQuery(text)) {
      executeRoute(text, {});
      return;
    }
    if (/\b(?:god'?s\s*eye|flir|thermal|night\s*vision|nvg|crt|sar\s*radar|radar)\b/.test(lower)) {
      var mode = 'flir';
      if (/\bnvg\b|night/.test(lower)) mode = 'nvg';
      else if (/\bcrt\b/.test(lower)) mode = 'crt';
      else if (/\bsar\b|radar/.test(lower)) mode = 'radar';
      else if (/\bnormal\b|\boff\b/.test(lower)) mode = 'normal';
      setMode(mode);
      setBrandStatus('OPTICAL MODE: ' + mode.toUpperCase());
      return;
    }
    if (/\bvolcano|volcanoes|eruption\b/.test(lower)) {
      setFilter('volcano');
      flyToFirstHazard('volcano');
      return;
    }
    if (/\bflood|floods|inundation\b/.test(lower)) {
      setFilter('flood');
      flyToFirstHazard('flood');
      return;
    }
    if (/\bearthquake|quake|seismic\b/.test(lower)) {
      setFilter('earthquake');
      flyToFirstHazard('earthquake');
      return;
    }
    if (/\bcyclone|storm|hurricane|typhoon\b/.test(lower)) {
      setFilter('storm');
      flyToFirstHazard('storm');
      return;
    }
    if (/\bwildfire|fire\b/.test(lower)) {
      setFilter('wildfire');
      flyToFirstHazard('wildfire');
      return;
    }
    lockTargetQuery(text);
  }

  function flyToFirstHazard(type) {
    var hazard = state.hazards.find(function (item) { return item.type === type; });
    if (hazard) {
      if (state.map) state.map.flyTo({ center: [hazard.lon, hazard.lat], zoom: 8.5, pitch: 50, duration: 1400 });
      setBrandStatus('FILTER: ' + type.toUpperCase() + ' · ' + hazard.title.toUpperCase().slice(0, 50));
    } else {
      setBrandStatus('FILTER: ' + type.toUpperCase() + ' · NO LIVE RECORD; USE SIMULATE');
    }
  }

  /* -----------------------------------------------------------------------
     CANVAS / FX
     ----------------------------------------------------------------------- */
  function isPointVisible(map, lat, lon) {
    if (!map) return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    try {
      if (state.globe && map.transform && typeof map.transform.isLocationOccluded === 'function') {
        if (map.transform.isLocationOccluded({ lng: lon, lat: lat })) return false;
      }
      if (state.globe && typeof map.getCenter === 'function') {
        var center = map.getCenter();
        var rad = Math.PI / 180;
        var phi1 = center.lat * rad;
        var phi2 = lat * rad;
        var dLon = (lon - center.lng) * rad;
        var cosAngle = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLon);
        if (cosAngle < 0.015) return false;
      }
    } catch (error) { /* visibility is best-effort */ }
    return true;
  }

  function resizeGxCanvas() {
    var canvas = $('gx-fx-canvas');
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.round(rect.width * dpr);
    var height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    state.canvas = canvas;
    if (!state.ctx) state.ctx = canvas.getContext('2d');
    return { width: rect.width, height: rect.height, dpr: dpr };
  }

  function drawHazardFx(ctx, x, y, hazard, scale, t, seed) {
    var type = hazard.type;
    if (type === 'volcano') {
      var base = (hazard.simulated ? 34 : 22) * scale;
      var glow = ctx.createRadialGradient(x, y, 1, x, y, base * 1.6);
      glow.addColorStop(0, 'rgba(255,240,130,0.95)');
      glow.addColorStop(0.25, 'rgba(255,86,20,0.7)');
      glow.addColorStop(0.65, 'rgba(180,24,10,0.24)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, base * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(40,28,24,0.72)';
      ctx.beginPath();
      ctx.moveTo(x - base * 0.8, y + base * 0.42);
      ctx.lineTo(x - base * 0.2, y - base * 0.28);
      ctx.lineTo(x + base * 0.2, y - base * 0.28);
      ctx.lineTo(x + base * 0.8, y + base * 0.42);
      ctx.closePath();
      ctx.fill();
      var wave = (t * 0.7 + seed * 0.31) % 1;
      ctx.strokeStyle = 'rgba(255,125,35,' + (1 - wave) * 0.72 + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, base * (0.35 + wave * 1.3), 0, Math.PI * 2);
      ctx.stroke();
      for (var i = 0; i < 8; i++) {
        var life = (t * 0.32 + i * 0.125 + seed * 0.07) % 1;
        var px = x + Math.sin(i * 2.7 + t * 0.8) * base * 0.38 * life;
        var py = y - base * 0.3 - life * base * 1.5;
        ctx.globalAlpha = (1 - life) * 0.7;
        ctx.fillStyle = life < 0.5 ? '#ffd166' : '#94a3b8';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.8, 2.6 * (1 - life) * Math.min(1.8, scale)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (type === 'flood') {
      var radius = (hazard.simulated ? 28 : 19) * scale;
      ctx.fillStyle = 'rgba(14,165,233,0.14)';
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
      ctx.fill();
      for (var ring = 0; ring < 3; ring++) {
        var progress = (t * 0.36 + ring * 0.33 + seed * 0.1) % 1;
        ctx.strokeStyle = 'rgba(56,189,248,' + (1 - progress) * 0.8 + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius * (0.3 + progress * 1.7), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(125,211,252,0.75)';
      ctx.lineWidth = 1.2;
      for (var waveIndex = 0; waveIndex < 2; waveIndex++) {
        ctx.beginPath();
        for (var pxStep = 0; pxStep <= 16; pxStep++) {
          var px = x - radius * 1.2 + (pxStep / 16) * radius * 2.4;
          var py = y + Math.sin(pxStep * 0.8 + t * 2 + waveIndex * 1.7) * radius * 0.1 + waveIndex * 5;
          if (pxStep === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if (type === 'earthquake') {
      var quakeRadius = (hazard.simulated ? 35 : 24) * scale * (1 + Math.min(1.8, num(hazard.magnitude, 5) * 0.045));
      for (var waveIndex2 = 0; waveIndex2 < 3; waveIndex2++) {
        var progress2 = (t * 0.48 + waveIndex2 * 0.27 + seed * 0.08) % 1;
        ctx.strokeStyle = 'rgba(244,63,94,' + (1 - progress2) * 0.8 + ')';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, quakeRadius * (0.22 + progress2 * 1.5), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(253,164,175,0.95)';
      ctx.lineWidth = 1.2;
      for (var angle = 0; angle < 4; angle++) {
        var a = angle * Math.PI / 2 + t * 0.1;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * quakeRadius * 0.16, y + Math.sin(a) * quakeRadius * 0.16);
        ctx.lineTo(x + Math.cos(a) * quakeRadius * 0.6, y + Math.sin(a) * quakeRadius * 0.6);
        ctx.stroke();
      }
    } else if (type === 'storm') {
      var stormRadius = (hazard.simulated ? 36 : 25) * scale;
      ctx.fillStyle = 'rgba(139,92,246,0.11)';
      ctx.beginPath();
      ctx.arc(x, y, stormRadius * 1.2, 0, Math.PI * 2);
      ctx.fill();
      for (var arm = 0; arm < 3; arm++) {
        ctx.strokeStyle = 'rgba(196,181,253,0.74)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var step = 0; step <= 28; step++) {
          var theta = t * 1.2 + arm * 2.1 + step * 0.16;
          var rr = stormRadius * (0.12 + step / 28 * 1.1);
          var sx = x + Math.cos(theta) * rr;
          var sy = y + Math.sin(theta) * rr;
          if (step === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(237,233,254,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'wildfire') {
      var fireRadius = (hazard.simulated ? 27 : 16) * scale;
      var fireGlow = ctx.createRadialGradient(x, y, 0, x, y, fireRadius * 1.8);
      fireGlow.addColorStop(0, 'rgba(255,225,100,0.9)');
      fireGlow.addColorStop(0.35, 'rgba(249,115,22,0.46)');
      fireGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fireGlow;
      ctx.beginPath();
      ctx.arc(x, y, fireRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      for (var flame = 0; flame < 5; flame++) {
        var flicker = 0.65 + 0.35 * Math.sin(t * 5 + flame * 1.9 + seed);
        var fx = x + Math.cos(flame * 2.4) * fireRadius * 0.45;
        var fy = y + Math.sin(flame * 1.7) * fireRadius * 0.25;
        ctx.fillStyle = flame % 2 ? 'rgba(251,191,36,0.85)' : 'rgba(249,115,22,0.82)';
        ctx.beginPath();
        ctx.ellipse(fx, fy - fireRadius * 0.25, fireRadius * 0.23 * flicker, fireRadius * 0.58 * flicker, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRadarSweep(ctx, width, height, t) {
    var cx = width / 2;
    var cy = height / 2;
    var maxR = Math.hypot(cx, cy);
    var angle = (t * 1.4) % (Math.PI * 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    var gradient = ctx.createLinearGradient(0, 0, maxR, 0);
    gradient.addColorStop(0, 'rgba(16,185,129,0.42)');
    gradient.addColorStop(1, 'rgba(16,185,129,0.015)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, maxR, -0.3, 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,231,183,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(maxR, 0);
    ctx.stroke();
    ctx.restore();
  }

  function renderGxFrame(timestamp) {
    state.raf = requestAnimationFrame(renderGxFrame);
    if (!isVisible() || !state.mapLoaded || !state.map) return;
    var dims = resizeGxCanvas();
    if (!dims || !state.ctx) return;
    var ctx = state.ctx;
    var width = dims.width;
    var height = dims.height;
    ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    var t = timestamp / 1000;
    var zoomScale = Math.max(0.45, Math.min(4.2, Math.pow(1.26, state.map.getZoom() - 3))) * 1.1;

    var canvasHazards = state.hazards.filter(matchesFilter).slice(0, 80).concat(state.sims.filter(matchesFilter));
    canvasHazards.forEach(function (hazard, index) {
      if (!isPointVisible(state.map, hazard.lat, hazard.lon)) return;
      var point = state.map.project([hazard.lon, hazard.lat]);
      if (!point || point.x < -180 || point.x > width + 180 || point.y < -180 || point.y > height + 180) return;
      drawHazardFx(ctx, point.x, point.y, hazard, zoomScale, t, index + 1);
    });

    if (state.filter === 'all' || state.filter === 'wildfire') {
      state.fireFx.forEach(function (fire, index) {
        var coords = fire.geometry && fire.geometry.coordinates;
        if (!coords) return;
        if (!isPointVisible(state.map, Number(coords[1]), Number(coords[0]))) return;
        var point = state.map.project([Number(coords[0]), Number(coords[1])]);
        if (!point || point.x < -100 || point.x > width + 100 || point.y < -100 || point.y > height + 100) return;
        drawHazardFx(ctx, point.x, point.y, { type: 'wildfire', simulated: false }, zoomScale * 0.9, t, index + 3);
      });
    }

    drawSatellites(ctx, width, height, t);
    if (state.mode === 'radar') drawRadarSweep(ctx, width, height, t);
  }

  /* -----------------------------------------------------------------------
     FULL GOD'S EYE VIEW PLATFORM (CESIUM) BRIDGE
     The complete upstream platform runs on a separate host (e.g. Vercel) and
     is framed inside this tab via the configured godseyePlatformUrl. The
     command deck remains the fallback.
     ----------------------------------------------------------------------- */
  var PLATFORM_MODE_KEY = 'earthscope-godseye-mode';
  var platformUrlCache = '';

  function platformUrl() {
    if (platformUrlCache) return platformUrlCache;
    var configured = window.EARTHSCOPE_CONFIG && window.EARTHSCOPE_CONFIG.godseyePlatformUrl;
    if (configured) {
      platformUrlCache = String(configured);
      return platformUrlCache;
    }
    // No Vercel URL configured yet — show the fallback so the operator knows
    // to set EARTHSCOPE_CONFIG.godseyePlatformUrl to their Vercel deployment.
    platformUrlCache = '';
    return platformUrlCache;
  }

  function platformStandaloneUrl() {
    try {
      var parsed = new URL(platformUrl());
      return parsed.origin + '/?welcome=0#' + platformTargetHash();
    } catch (error) {
      return platformUrl();
    }
  }

  function platformTargetHash() {
    var params = new URLSearchParams({
      v: '2',
      lat: Number(state.target.lat).toFixed(4),
      lon: Number(state.target.lon).toFixed(4),
      alt: '1800',
      heading: '0',
      pitch: '-35',
      roll: '0',
      style: 'normal',
      map: 'esri-imagery'
    });
    return params.toString();
  }

  function platformLaunchUrl(forceReload) {
    var base = platformUrl();
    if (!base) return base; // No Vercel URL configured yet.
    try {
      var url = new URL(base);
      if (forceReload) url.searchParams.set('reload', String(Date.now()));
      url.hash = platformTargetHash();
      return url.href;
    } catch (error) {
      return base;
    }
  }

  function platformOrigin() {
    try { return new URL(platformUrl()).origin; } catch (error) { return ''; }
  }

  function savedPlatformMode() {
    try { return localStorage.getItem(PLATFORM_MODE_KEY) === 'deck' ? 'deck' : 'platform'; }
    catch (error) { return 'platform'; }
  }

  function rememberPlatformMode(mode) {
    try { localStorage.setItem(PLATFORM_MODE_KEY, mode); } catch (error) {}
  }

  function applyPlatformModeUi() {
    var panel = $('panel-godseye');
    if (panel) panel.classList.toggle('gx-platform-mode', !!state.platformActive);
    var openButton = $('gx-open-platform');
    if (openButton) openButton.classList.toggle('active', !!state.platformActive);
  }

  function setPlatformStatus(kind, label, detail) {
    var box = document.querySelector('.gx-platform-status');
    var labelEl = $('gx-platform-status');
    var detailEl = $('gx-platform-detail');
    if (box) box.classList.toggle('gx-platform-status-warn', kind === 'warn');
    if (box) box.title = (label || '') + (detail ? ' — ' + detail : '');
    if (labelEl) labelEl.textContent = label || 'CONNECTING';
    if (detailEl) detailEl.textContent = detail || '';
  }

  function platformFrame() {
    return $('gx-platform-frame');
  }

  function armPlatformWatchdog() {
    if (state.platformTimer) clearTimeout(state.platformTimer);
    state.platformTimer = null;
    if (!state.platformActive || state.platformReady) return;
    state.platformTimer = setTimeout(function () {
      state.platformTimer = null;
      if (!state.platformActive || state.platformReady) return;
      var fallback = $('gx-platform-fallback');
      if (fallback) fallback.hidden = false;
      setPlatformStatus('warn', 'STILL CONNECTING', 'The full platform service has not completed its handshake yet.');
    }, 24000);
  }

  function ensurePlatformFrame() {
    var frame = platformFrame();
    if (!frame) return null;
    var url = platformLaunchUrl();
    if (!url) {
      // No Vercel URL configured — show setup instruction instead of blank iframe.
      frame.removeAttribute('src');
      var fallback = $('gx-platform-fallback');
      if (fallback) {
        fallback.hidden = false;
        var card = fallback.querySelector('.gx-platform-fallback-card');
        if (card) {
          card.innerHTML = [
            '<b>God\'s Eye platform not configured</b>',
            '<p>Deploy the full God\'s Eye View platform to Vercel, then set <code>godseyePlatformUrl</code> in <code>config.local.php</code> to your Vercel deployment URL (e.g. <code>https://your-app.vercel.app/?embed=1&chrome=1</code>).</p>',
            '<div>',
            '<button type="button" id="gx-platform-retry">↻ RETRY</button>',
            '<button type="button" id="gx-platform-deck-2">⌘ USE COMMAND DECK</button>',
            '</div>'
          ].join('');
          $('gx-platform-retry') && $('gx-platform-retry').addEventListener('click', reloadPlatform);
          $('gx-platform-deck-2') && $('gx-platform-deck-2').addEventListener('click', openCommandDeck);
        }
      }
      setPlatformStatus('warn', 'NOT CONFIGURED', 'Set godseyePlatformUrl to your Vercel Gods Eye deployment.');
      return frame;
    }
    if (!frame.getAttribute('src')) {
      frame.addEventListener('load', function () {
        if (state.platformReady) return;
        setPlatformStatus('loading', 'CONNECTED', 'Cesium cockpit handshake in progress…');
      });
      setPlatformStatus('loading', 'CONNECTING', 'Loading the Cesium cockpit and live feeds…');
      frame.src = url;
    }
    return frame;
  }

  function openPlatform(options) {
    state.platformActive = true;
    rememberPlatformMode('platform');
    applyPlatformModeUi();
    if (options && options.announce !== false) {
      setPlatformStatus(state.platformReady ? 'live' : 'loading',
        state.platformReady ? 'LIVE · FULL PLATFORM' : 'CONNECTING',
        state.platformReady ? 'Cesium online. Keyless feeds live. Add keys for Google 3D + Mapillary street level.' : 'Starting the full God’s Eye View platform…');
    }
    ensurePlatformFrame();
    if (state.platformReady) {
      var fallback = $('gx-platform-fallback');
      if (fallback) fallback.hidden = true;
    }
    if (!state.platformReady) armPlatformWatchdog();
    setTimeout(function () { if (state.map && !state.platformActive) state.map.resize(); }, 160);
  }

  function openCommandDeck() {
    state.platformActive = false;
    rememberPlatformMode('deck');
    applyPlatformModeUi();
    var fallback = $('gx-platform-fallback');
    if (fallback) fallback.hidden = true;
    if (!state.map) initGxMap();
    openWorkspace();
    setTimeout(function () { if (state.map && isVisible()) state.map.resize(); }, 180);
    setBrandStatus('COMMAND DECK ACTIVE — ROUTE, TRAFFIC AND TICKET CONSOLE ONLINE');
  }

  function reloadPlatform() {
    state.platformReady = false;
    var fallback = $('gx-platform-fallback');
    if (fallback) fallback.hidden = true;
    setPlatformStatus('loading', 'RECONNECTING', 'Reloading the full God’s Eye View platform…');
    var frame = platformFrame();
    if (frame) {
      frame.src = platformLaunchUrl(true);
    } else {
      ensurePlatformFrame();
    }
    armPlatformWatchdog();
  }

  function togglePlatformFullscreen() {
    var wrap = document.querySelector('.gx-platform-frame-wrap');
    if (!wrap) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    } else if (wrap.requestFullscreen) {
      wrap.requestFullscreen().catch(function () {});
    }
  }

  function onPlatformMessage(event) {
    if (event.origin !== platformOrigin()) return;
    var frame = platformFrame();
    if (frame && event.source !== frame.contentWindow) return;
    var data = event.data || {};
    if (data.type === 'gev:ready') {
      state.platformReady = true;
      if (state.platformTimer) clearTimeout(state.platformTimer);
      state.platformTimer = null;
      var fallback = $('gx-platform-fallback');
      if (fallback) fallback.hidden = true;
      setPlatformStatus('live', 'LIVE · FULL PLATFORM', 'Cesium online. Keyless feeds live. Add keys for Google 3D + Mapillary street level.');
    } else if (data.type === 'gev:view-applied') {
      setPlatformStatus('live', 'LIVE · FULL PLATFORM', 'View applied in the Cesium cockpit.');
    }
  }

  /* -----------------------------------------------------------------------
     UI WIRING
     ----------------------------------------------------------------------- */
  function bindUi() {
    var root = $('gx-root');
    if (!root) return;

    $('gx-open-platform') && $('gx-open-platform').addEventListener('click', function () { openPlatform(); });
    $('gx-platform-deck') && $('gx-platform-deck').addEventListener('click', openCommandDeck);
    $('gx-platform-deck-2') && $('gx-platform-deck-2').addEventListener('click', openCommandDeck);
    $('gx-platform-reload') && $('gx-platform-reload').addEventListener('click', reloadPlatform);
    $('gx-platform-retry') && $('gx-platform-retry').addEventListener('click', reloadPlatform);
    $('gx-platform-full') && $('gx-platform-full').addEventListener('click', togglePlatformFullscreen);
    $('gx-platform-open') && $('gx-platform-open').addEventListener('click', function () {
      window.open(platformStandaloneUrl(), '_blank', 'noopener');
    });

    $('gx-search-form') && $('gx-search-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = $('gx-search-input');
      var query = input && input.value.trim();
      if (query) handleCommand(query);
    });
    qsa('[data-gx-target]').forEach(function (button) {
      button.addEventListener('click', function () {
        var target = button.getAttribute('data-gx-target') || '';
        var input = $('gx-search-input');
        if (input) input.value = target;
        lockTargetQuery(target);
      });
    });
    qsa('[data-gx-basemap]').forEach(function (button) {
      button.addEventListener('click', function () { setBasemap(button.getAttribute('data-gx-basemap') || 'satellite'); });
    });
    qsa('[data-gx-mode]').forEach(function (button) {
      button.addEventListener('click', function () { setMode(button.getAttribute('data-gx-mode') || 'normal'); });
    });
    $('gx-globe-toggle') && $('gx-globe-toggle').addEventListener('click', toggleGlobe);
    $('gx-wings-toggle') && $('gx-wings-toggle').addEventListener('click', function () {
      root.classList.toggle('gx-wings-off');
      $('gx-wings-toggle').classList.toggle('active', !root.classList.contains('gx-wings-off'));
      setTimeout(function () { if (state.map) state.map.resize(); }, 160);
    });
    $('gx-fullscreen-btn') && $('gx-fullscreen-btn').addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else if (root.requestFullscreen) root.requestFullscreen().catch(function () {});
    });
    $('gx-exit-btn') && $('gx-exit-btn').addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      var explore = document.querySelector('.nav-item[data-panel="explore"]');
      if (explore) explore.click();
    });
    qsa('[data-gx-filter]').forEach(function (button) {
      button.addEventListener('click', function () { setFilter(button.getAttribute('data-gx-filter') || 'all'); });
    });
    qsa('[data-gx-spawn]').forEach(function (button) {
      button.addEventListener('click', function () { spawnSim(button.getAttribute('data-gx-spawn')); });
    });
    $('gx-clear-sim') && $('gx-clear-sim').addEventListener('click', clearSims);

    $('gx-sa-form') && $('gx-sa-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var from = $('gx-sa-from');
      var to = $('gx-sa-to');
      var fromValue = from && from.value.trim();
      var toValue = to && to.value.trim();
      if (!fromValue || !toValue) {
        setBrandStatus('ROUTE NEEDS BOTH AN ORIGIN AND A DESTINATION');
        (!fromValue ? from : to)?.focus();
        return;
      }
      executeRoute('from ' + fromValue + ' to ' + toValue, {});
    });
    bindPlaceAutocomplete('gx-sa-from', 'gx-sa-from-suggest');
    bindPlaceAutocomplete('gx-sa-to', 'gx-sa-to-suggest');
    $('gx-sa-swap') && $('gx-sa-swap').addEventListener('click', function () {
      var from = $('gx-sa-from');
      var to = $('gx-sa-to');
      if (!from || !to) return;
      var value = from.value;
      from.value = to.value;
      to.value = value;
      hidePlaceSuggestions($('gx-sa-from-suggest'));
      hidePlaceSuggestions($('gx-sa-to-suggest'));
      from.focus();
      if (state.routeData && from.value.trim() && to.value.trim()) {
        executeRoute('from ' + from.value.trim() + ' to ' + to.value.trim(), {});
      }
    });
    qsa('[data-gx-ticket-focus]').forEach(function (button) {
      button.addEventListener('click', function () { focusTicketMode(button.getAttribute('data-gx-ticket-focus') || 'all'); });
    });
    qsa('[data-gx-prompt]').forEach(function (button) {
      button.addEventListener('click', function () {
        var prompt = button.getAttribute('data-gx-prompt') || '';
        if (isRouteQuery(prompt)) {
          var parsed = parseRouteQuery(prompt);
          var from = $('gx-sa-from');
          var to = $('gx-sa-to');
          if (from) from.value = parsed.from;
          if (to) to.value = parsed.to;
        }
        handleCommand(prompt);
      });
    });
    $('gx-live-air') && $('gx-live-air').addEventListener('click', function () {
      if (!state.flights.length) {
        loadFlights('adsb');
        return;
      }
      var card = document.querySelector('#gx-flight-list');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setBrandStatus(state.flights.length + ' LIVE AIRCRAFT IN THE TARGET SECTOR');
    });

    $('gx-adsb-btn') && $('gx-adsb-btn').addEventListener('click', function () { loadFlights('adsb'); });
    $('gx-avstack-btn') && $('gx-avstack-btn').addEventListener('click', function () { loadFlights('aviationstack'); });
    $('gx-firms-btn') && $('gx-firms-btn').addEventListener('click', loadFires);
    $('gx-hazards-btn') && $('gx-hazards-btn').addEventListener('click', function () { loadHazards(false); });

    $('gx-buildings-toggle') && $('gx-buildings-toggle').addEventListener('click', function () {
      setBuildings3d(!state.buildings3d);
    });
    $('gx-google-streetview') && $('gx-google-streetview').addEventListener('click', openStreetView);

    $('gx-zoom19') && $('gx-zoom19').addEventListener('click', function () {
      setBuildings3d(true, { keepCamera: true, quiet: true });
      setBasemap('normal', true);
      if (state.map) state.map.flyTo({ center: [state.target.lon, state.target.lat], zoom: 19, pitch: 73, bearing: -18, duration: 1400 });
      setBrandStatus('STREET 3D · OSM BUILDING EXTRUSIONS · 19x');
    });
    $('gx-sat20') && $('gx-sat20').addEventListener('click', function () {
      setBuildings3d(true, { keepCamera: true, quiet: true });
      setBasemap('satellite', true);
      if (state.map) state.map.flyTo({ center: [state.target.lon, state.target.lat], zoom: 19.2, pitch: 68, bearing: 0, duration: 1400 });
      setBrandStatus('SAT 20x · OSM 3D BUILDINGS OVER SATELLITE');
    });
    $('gx-orbit3d') && $('gx-orbit3d').addEventListener('click', function () {
      setBuildings3d(true, { keepCamera: true, quiet: true });
      if (state.map) state.map.flyTo({ center: [state.target.lon, state.target.lat], zoom: Math.max(state.map.getZoom(), 16.4), pitch: 68, bearing: state.map.getBearing() + 45, duration: 1200 });
      setBrandStatus('TACTICAL PITCH · OSM 3D BUILDINGS ON');
    });
    $('gx-globe-view') && $('gx-globe-view').addEventListener('click', function () {
      if (state.map) state.map.flyTo({ center: [state.target.lon, state.target.lat], zoom: 2.3, pitch: 0, bearing: 0, duration: 1200 });
    });

    $('gx-scan-infra') && $('gx-scan-infra').addEventListener('click', function () { loadInfra(state.targetSeq, true); });
    $('gx-ai-btn') && $('gx-ai-btn').addEventListener('click', generateSitrep);

    var ticker = document.querySelector('.gx-ticker');
    if (ticker) {
      ticker.addEventListener('mouseenter', function () { state.tickerHover = true; });
      ticker.addEventListener('mouseleave', function () { state.tickerHover = false; });
    }
    bindTicker();
    renderTickerHint();

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var drawer = $('gx-route-drawer');
        if (drawer && !drawer.hidden) {
          drawer.hidden = true;
          clearRouteLayers();
        }
      }
    });
    document.addEventListener('fullscreenchange', function () {
      $('gx-fullscreen-btn') && $('gx-fullscreen-btn').classList.toggle('active', !!document.fullscreenElement);
      $('toggle-fullscreen') && $('toggle-fullscreen').classList.toggle('active', !!document.fullscreenElement);
      var platformFull = $('gx-platform-full');
      if (platformFull) platformFull.textContent = document.fullscreenElement ? '⛶ EXIT FULL' : '⛶ FULLSCREEN';
      setTimeout(function () { if (state.map && isVisible()) state.map.resize(); }, 220);
    });

    if (window.ResizeObserver && $('gx-map-shell')) {
      new ResizeObserver(function () { if (state.map && isVisible()) state.map.resize(); }).observe($('gx-map-shell'));
    }
  }

  /* -----------------------------------------------------------------------
     WORKSPACE LIFECYCLE
     ----------------------------------------------------------------------- */
  function panelVisible() {
    var panel = $('panel-godseye');
    return !!panel && !panel.hidden;
  }

  function isVisible() {
    return panelVisible() && !state.platformActive;
  }

  function startInitial() {
    if (state.started) return;
    state.started = true;
    state.target = { lat: 26.4525, lon: 87.2718, name: 'Biratnagar, Nepal' };
    state.targetSeq = 1;
    setTargetUI();
    setTargetMarker();
    setBrandStatus('ACQUIRING LIVE OSINT FEEDS…');
    renderSatList();
    seedRoute();
    loadHazards(false);
    loadReverse(1);
    loadWeather(1);
    loadFlights('adsb', 1);
    updateFlightBadges();
    setInterval(function () {
      if (isVisible() && state.started) loadFlights('adsb', state.targetSeq, { quiet: true });
    }, 90000);
    setTimeout(function () { if (isVisible()) loadInfra(1, false); }, 3600);
    setTimeout(function () { if (isVisible()) loadNews(1, false); }, 6800);
    setTimeout(function () {
      if (isVisible()) loadFires();
      else state.firesPending = true;
    }, 12500);
    setInterval(function () { if (isVisible()) renderSatList(); }, 2400);
    if (!state.raf) state.raf = requestAnimationFrame(renderGxFrame);
    var windowEl = $('gx-ticker-window');
    if (!windowEl) return;
    setInterval(function () {
      if (!isVisible() || state.tickerHover) return;
      var windowEl = $('gx-ticker-window');
      if (!windowEl) return;
      var max = windowEl.scrollWidth - windowEl.clientWidth;
      if (max <= 4) return;
      windowEl.scrollLeft += 1;
      if (windowEl.scrollLeft >= max - 1) windowEl.scrollLeft = 0;
    }, 55);
  }

  function seedRoute() {
    if (state.routeSeedAttempted) return;
    state.routeSeedAttempted = true;
    executeRoute('Distance from Biratnagar to Bangalore, routes, traffic and ticket prices', { silent: true });
  }

  function openWorkspace() {
    if (state.platformActive) {
      openPlatform({ announce: false });
      return;
    }
    if (!state.map) initGxMap();
    var map = state.map;
    if (!map) return;
    var run = function () {
      map.resize();
      if (!state.started) startInitial();
      if (state.firesPending && !state.fires.length) {
        state.firesPending = false;
        setTimeout(function () { if (isVisible()) loadFires(); }, 900);
      }
      updateHud();
    };
    if (map.loaded()) {
      setTimeout(run, 120);
    } else {
      map.once('load', function () { setTimeout(run, 120); });
    }
    setTimeout(function () { if (state.map && isVisible()) state.map.resize(); }, 450);
  }

  function onPanelChange(event) {
    var panel = event && event.detail && event.detail.panel;
    state.visible = panel === 'godseye';
    if (!state.visible) return;
    if (state.platformActive) openPlatform({ announce: false });
    else openWorkspace();
  }

  function boot() {
    if (!$('gx-root') || !$('panel-godseye')) return;
    state.platformActive = savedPlatformMode() !== 'deck';
    applyPlatformModeUi();
    bindUi();
    window.addEventListener('message', onPlatformMessage);
    window.addEventListener('earthscope:panelchange', onPanelChange);
    if (panelVisible()) {
      if (state.platformActive) openPlatform();
      else openWorkspace();
    }
    // The app may restore a non-default panel after boot; handle the current state once more.
    setTimeout(function () {
      if (!panelVisible()) return;
      if (state.platformActive) openPlatform({ announce: false });
      else openWorkspace();
    }, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
