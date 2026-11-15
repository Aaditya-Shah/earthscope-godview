import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js';

/**
 * EARTHSCOPE v4.0 — 3D World Racing, Online Multiplayer & Disaster Rescue Engine
 * Features:
 *  - True 3D Perspective Chase / Cockpit / Drone / Top-Down Camera synced with MapLibre 3D Terrain & Buildings
 *  - 6 Procedural 3D Vehicles: GTA Hypercar, Formula-X Racer, SAR 4x4 Flood Truck, Rescue Helicopter, Stealth Jet, Speedboat
 *  - Real-Time Online Multiplayer Rooms (Database API + BroadcastChannel) & 4 Autonomous AI Street Racers
 *  - 3D Neon Checkpoints, Stunt Jump Ramps, Nitro Boost Pads, Drift Tire Smoke & Dual Nitro Flame Particles
 *  - 3D Volumetric Volcano Eruptions, Rising Floodwater Waves & Seismic Shockwaves in the 3D Driving View
 *  - Persistent SQLite/MySQL Global Race Leaderboard & Web Audio Engine Synthesizer
 */
(() => {
  const $ = (id) => document.getElementById(id);

  const SURFACE_GRIP = { dry: 1.0, wet: 0.74, gravel: 0.64, snow: 0.44 };
  const VEHICLE_SPECS = {
    car:     { label: 'APEX GT HYPERCAR', maxKmh: 280, accel: 48, brake: 92, rev: 36, baseAlt: 0, fly: false },
    f1racer: { label: 'FORMULA-X RACER',  maxKmh: 330, accel: 64, brake: 115, rev: 30, baseAlt: 0, fly: false },
    offroad: { label: 'SAR 4x4 TRUCK',    maxKmh: 195, accel: 38, brake: 78, rev: 32, baseAlt: 0, fly: false },
    heli:    { label: 'RESCUE HELICOPTER',maxKmh: 260, accel: 44, brake: 62, rev: 25, baseAlt: 45, fly: true },
    plane:   { label: 'STEALTH JET',      maxKmh: 480, accel: 85, brake: 58, rev: 0,  baseAlt: 95, fly: true },
    boat:    { label: 'HYDRO SPEEDBOAT',  maxKmh: 165, accel: 32, brake: 48, rev: 20, baseAlt: 0, fly: false },
  };

  const AI_RIVALS_TEMPLATE = [
    { id: 'ai_1', callsign: 'ApexGT [AI]',     vehicle: 'car',     color: '#f43f5e', speedSkill: 0.88, offsetAngle: 0 },
    { id: 'ai_2', callsign: 'FormulaX [AI]',   vehicle: 'f1racer', color: '#eab308', speedSkill: 0.93, offsetAngle: 1.5 },
    { id: 'ai_3', callsign: 'TitanSAR [AI]',   vehicle: 'offroad', color: '#22c55e', speedSkill: 0.81, offsetAngle: 3.1 },
    { id: 'ai_4', callsign: 'Valkyrie [AI]',   vehicle: 'car',     color: '#a855f7', speedSkill: 0.85, offsetAngle: 4.6 },
  ];

  const s = {
    map: null,
    three: THREE,
    visual: null,
    active: false,
    running: false,
    vehicle: 'car',
    paintColor: '#38bdf8',
    mapStyle: 'satellite',
    viewMode: '3d',
    camMode: 'chase', // chase | hood | drone | topdown
    controllerMode: 'joystick',
    physicsMode: 'realistic',
    surface: 'dry',
    speed: 220,
    velocity: 0,
    verticalVelocity: 0,
    jumpAlt: 0,
    heading: 0,
    slipAngle: 0,
    sirenOn: false,
    sfxEnabled: false,
    audioCtx: null,
    engineOsc: null,
    engineGain: null,
    gamepadName: '',
    pos: { lat: 27.7172, lon: 85.3240, alt: 0, name: 'Kathmandu Valley 3D' },
    spawn: { lat: 27.7172, lon: 85.3240, alt: 0, name: 'Kathmandu Valley 3D' },
    keys: new Set(),
    joy: { x: 0, y: 0, active: false },
    wheel: { active: false },
    raf: 0,
    lastTime: 0,
    lastCenter: 0,
    lastHud: 0,
    // Multiplayer & AI
    playerId: 'plr_' + Math.random().toString(36).slice(2, 10),
    callsign: localStorage.getItem('es_callsign') || ('Pilot-' + Math.floor(100 + Math.random() * 899)),
    roomCode: new URLSearchParams(window.location.search).get('room') || 'NASA-GLOBAL',
    remotePlayers: new Map(),
    aiEnabled: true,
    aiRacers: [],
    bc: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('earthscope_mp_v4') : null,
    mpSyncTimer: 0,
    // Racing & Missions
    gameMode: 'freeroam', // freeroam | race | rescue
    checkpoints: [],
    boostPads: [],
    stuntRamps: [],
    hazards3D: [],
    currentCheckpoint: 0,
    lap: 1,
    totalLaps: 3,
    raceStartTime: 0,
    lapStartTime: 0,
    bestLapMs: 0,
    topSpeedRecorded: 0,
    stuntScore: 0,
    raceFinished: false,
    leaders: [],
  };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function currentPlace() {
    const c = $('selected-coords')?.textContent || '';
    const m = c.match(/(-?\d+(?:\.\d+)?)\s*°\s*([NS]).*?(-?\d+(?:\.\d+)?)\s*°\s*([EW])/i);
    if (!m) return { ...s.spawn };
    const lat = Number(m[1]) * (m[2].toUpperCase() === 'S' ? -1 : 1);
    const lon = Number(m[3]) * (m[4].toUpperCase() === 'W' ? -1 : 1);
    return {
      name: $('selected-name')?.textContent?.trim() || 'Selected place',
      lat: Number.isFinite(lat) ? lat : s.spawn.lat,
      lon: Number.isFinite(lon) ? lon : s.spawn.lon,
    };
  }

  // Convert (lat, lon) difference from player into local meters (east = +X, north = -Z)
  function gpsToLocalMeters(lat, lon) {
    const dLat = (lat - s.pos.lat) * 111320;
    const dLon = (lon - s.pos.lon) * 111320 * Math.max(0.15, Math.cos((s.pos.lat * Math.PI) / 180));
    return { east: dLon, north: dLat };
  }

  // Generate 3D Street Circuit Checkpoints, Boost Pads, Stunt Ramps & 3D Disasters around s.spawn
  function generateWorldCourse(mode = 'freeroam') {
    const centerLat = s.pos.lat;
    const centerLon = s.pos.lon;
    const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));

    s.checkpoints = [];
    s.boostPads = [];
    s.stuntRamps = [];
    s.hazards3D = [];

    // 8-Gate Circuit around the current coordinates (~260m radius loop)
    const numGates = mode === 'rescue' ? 6 : 8;
    const radiusM = mode === 'rescue' ? 220 : 250;
    for (let i = 0; i < numGates; i++) {
      const ang = (i / numGates) * Math.PI * 2;
      const rVar = radiusM * (0.82 + 0.28 * Math.sin(i * 2.1));
      const northM = Math.cos(ang) * rVar;
      const eastM = Math.sin(ang) * rVar;
      s.checkpoints.push({
        idx: i,
        lat: centerLat + northM / 111320,
        lon: centerLon + eastM / (111320 * cosLat),
        heading: ((ang * 180) / Math.PI + 90) % 360,
      });
    }

    // 6 Speed Boost Pads & 4 Stunt Jump Ramps near the player
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.35;
      const dist = 55 + (i % 3) * 55;
      s.boostPads.push({
        lat: centerLat + (Math.cos(ang) * dist) / 111320,
        lon: centerLon + (Math.sin(ang) * dist) / (111320 * cosLat),
        heading: (ang * 180) / Math.PI,
      });
    }
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.78;
      const dist = 75 + (i % 2) * 65;
      s.stuntRamps.push({
        lat: centerLat + (Math.cos(ang) * dist) / 111320,
        lon: centerLon + (Math.sin(ang) * dist) / (111320 * cosLat),
        heading: (ang * 180) / Math.PI,
      });
    }

    // Clean 3D driving circuit without fake volcano/flood cones in the game world
    s.hazards3D = [];

    // Initialize AI Racers on the circuit
    s.aiRacers = AI_RIVALS_TEMPLATE.map((tpl, idx) => {
      const startGate = s.checkpoints[idx % s.checkpoints.length] || { lat: centerLat, lon: centerLon };
      return {
        ...tpl,
        lat: startGate.lat + (idx - 1.5) * 0.00005,
        lon: startGate.lon + (idx - 1.5) * 0.00005,
        alt: 0,
        heading: 0,
        speedKmh: 0,
        targetGate: (idx + 1) % s.checkpoints.length,
        lap: 1,
      };
    });

    s.visual?.rebuildWorldObjects?.();
  }

  function buildStyle(mode = 'satellite') {
    const m = ['satellite', 'hybrid', 'map'].includes(mode) ? mode : 'satellite';
    const sources = {
      'google-sat': {
        type: 'raster',
        tiles: [
          'https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
          'https://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
          'https://mt2.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
          'https://mt3.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
        ],
        tileSize: 256,
        maxzoom: 20,
        attribution: 'Google Earth Ultra-Zoom Satellite',
      },
      'google-hybrid': {
        type: 'raster',
        tiles: [
          'https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
          'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
          'https://mt2.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
          'https://mt3.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
        ],
        tileSize: 256,
        maxzoom: 20,
        attribution: 'Google Earth Hybrid',
      },
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap',
      },
      openfreemap: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      },
    };
    const buildingLayer = {
      id: 'play-3d-buildings',
      type: 'fill-extrusion',
      source: 'openfreemap',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['zoom'], 14, '#1e293b', 18, '#334155'],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 11],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.72,
      },
    };
    const layers = m === 'map'
      ? [{ id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 22 }, buildingLayer]
      : m === 'satellite'
        ? [{ id: 'google-sat-layer', type: 'raster', source: 'google-sat', minzoom: 0, maxzoom: 22 }, buildingLayer]
        : [{ id: 'google-hybrid-layer', type: 'raster', source: 'google-hybrid', minzoom: 0, maxzoom: 22 }, buildingLayer];
    return { version: 8, sources, layers };
  }

  function enhanceMapWith3D(map) {
    if (!map) return;
    try {
      if (!map.getSource('play-terrain-dem')) {
        map.addSource('play-terrain-dem', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 15,
          encoding: 'terrarium',
        });
      }
      if (s.viewMode === '3d' && typeof map.setTerrain === 'function') {
        map.setTerrain({ source: 'play-terrain-dem', exaggeration: 1.35 });
      } else if (typeof map.setTerrain === 'function') {
        map.setTerrain(null);
      }
    } catch (_) {}
  }

  function playCameraOptions(pos = s.pos, heading = s.heading) {
    const is2D = s.viewMode === '2d' || s.camMode === 'topdown';
    const spec = VEHICLE_SPECS[s.vehicle] || VEHICLE_SPECS.car;
    const speedRatio = clamp(Math.abs(s.velocity) / Math.max(100, spec.maxKmh), 0, 1);
    const zoomBase = spec.fly ? 16.4 : 18.15;
    const zoom = is2D ? 17.6 : zoomBase - speedRatio * 0.45;
    const pitch = is2D ? 0 : s.camMode === 'hood' ? 76 : s.camMode === 'drone' ? 54 : spec.fly ? 60 : 68;
    const host = $('play-map');
    const h = host?.clientHeight || 560;
    const followPad = is2D ? 0 : Math.round(clamp(h * 0.24, 70, 165));
    return {
      center: [pos.lon, pos.lat],
      zoom,
      pitch,
      bearing: is2D ? 0 : heading,
      padding: { top: followPad, bottom: 0, left: 0, right: 0 },
    };
  }

  // Build True-to-Life Detailed 3D Procedural Aircraft & Vehicles in Three.js
  function buildVehicleMesh(T, type = 'car', hexColor = '#38bdf8') {
    const g = new T.Group();
    const primaryHex = new T.Color(hexColor || '#38bdf8');
    const paint = new T.MeshStandardMaterial({ color: primaryHex, metalness: 0.65, roughness: 0.22 });
    const whitePaint = new T.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.35, roughness: 0.28 });
    const dark = new T.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.42, roughness: 0.48 });
    const carbon = new T.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.55, roughness: 0.35 });
    const chrome = new T.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.12 });
    const glass = new T.MeshStandardMaterial({ color: 0x0284c7, transparent: true, opacity: 0.78, metalness: 0.92, roughness: 0.08 });
    const darkGlass = new T.MeshStandardMaterial({ color: 0x091526, transparent: true, opacity: 0.86, metalness: 0.95, roughness: 0.06 });
    const headGlow = new T.MeshBasicMaterial({ color: 0xfef9c3 });
    const tailGlow = new T.MeshBasicMaterial({ color: 0xff1e42 });
    const caliperMat = new T.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5, roughness: 0.3 });
    const nitroMat = new T.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.0 });

    const wheels = [];
    const rotors = [];
    const nitroCones = [];
    let sirenBar = null;

    if (type === 'plane') {
      // REALISTIC WIDE-BODY / SUPERSONIC TWIN-ENGINE JET AIRCRAFT
      // 1. Cylindrical Fuselage + Sleek Aerodynamic Nose Cone + Tapered Tail Cone
      const fuseRadius = 0.66;
      const fuseBody = new T.Mesh(new T.CylinderGeometry(fuseRadius, fuseRadius, 5.8, 28), whitePaint);
      fuseBody.rotation.x = Math.PI / 2;
      fuseBody.position.set(0, 1.45, 0.1);

      // Livery Accent Belly & Cheatline Stripe in user's selected color
      const bellyStripe = new T.Mesh(new T.CylinderGeometry(fuseRadius * 1.008, fuseRadius * 1.008, 5.75, 28, 1, false, -Math.PI * 0.35, Math.PI * 0.7), paint);
      bellyStripe.rotation.x = Math.PI / 2;
      bellyStripe.position.set(0, 1.44, 0.1);

      // Forward Nose Cone (Parabolic/Conical Radome)
      const noseCone = new T.Mesh(new T.ConeGeometry(fuseRadius, 2.35, 28), whitePaint);
      noseCone.rotation.x = -Math.PI / 2;
      noseCone.position.set(0, 1.45, -3.95);
      const radomeTip = new T.Mesh(new T.ConeGeometry(0.24, 0.75, 20), dark);
      radomeTip.rotation.x = -Math.PI / 2;
      radomeTip.position.set(0, 1.45, -4.85);

      // Wrap-around Cockpit Flight Deck Windshield
      const cockpitVisor = new T.Mesh(new T.SphereGeometry(fuseRadius * 0.96, 24, 16), darkGlass);
      cockpitVisor.scale.set(0.96, 0.62, 1.85);
      cockpitVisor.position.set(0, 1.72, -2.95);

      // Tapered Rear Tail Cone & APU Exhaust
      const tailCone = new T.Mesh(new T.ConeGeometry(fuseRadius, 2.45, 28), whitePaint);
      tailCone.rotation.x = Math.PI / 2;
      tailCone.position.set(0, 1.52, 4.2);
      const apuNozzle = new T.Mesh(new T.CylinderGeometry(0.12, 0.18, 0.45, 16), chrome);
      apuNozzle.rotation.x = Math.PI / 2;
      apuNozzle.position.set(0, 1.55, 5.35);

      // Illuminated Cabin Windows along port & starboard fuselage
      const winMat = new T.MeshBasicMaterial({ color: 0xbae6fd });
      const winGeo = new T.BoxGeometry(0.06, 0.14, 0.11);
      for (let z = -2.1; z <= 2.3; z += 0.36) {
        const wL = new T.Mesh(winGeo, winMat);
        wL.position.set(-fuseRadius * 0.98, 1.62, z);
        const wR = new T.Mesh(winGeo, winMat);
        wR.position.set(fuseRadius * 0.98, 1.62, z);
        g.add(wL, wR);
      }

      // 2. True Swept-Back Aerodynamic Main Wings with Upturned Sharklet Winglets
      const buildSweptWing = (side) => {
        const wg = new T.Group();
        const shape = new T.Shape();
        shape.moveTo(0, -1.1);
        shape.lineTo(4.65 * side, 0.95);
        shape.lineTo(4.65 * side, 1.58);
        shape.lineTo(0, 0.85);
        shape.closePath();
        const wingGeo = new T.ExtrudeGeometry(shape, { depth: 0.11, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
        wingGeo.rotateX(Math.PI / 2);
        const wingMesh = new T.Mesh(wingGeo, whitePaint);
        wingMesh.position.y = 1.32;
        wg.add(wingMesh);

        // Flap Track Fairings under wing
        [1.4, 2.5, 3.5].forEach((xPos) => {
          const fairing = new T.Mesh(new T.ConeGeometry(0.07, 0.75, 10), paint);
          fairing.rotation.x = Math.PI / 2;
          fairing.position.set(xPos * side, 1.24, 0.65 + (xPos / 4.65) * 0.55);
          wg.add(fairing);
        });

        // Upturned Aerodynamic Winglet (Sharklet) at Wingtip
        const winglet = new T.Mesh(new T.BoxGeometry(0.08, 0.78, 0.58), paint);
        winglet.position.set(4.62 * side, 1.66, 1.26);
        winglet.rotation.z = -side * 0.22;
        winglet.rotation.y = side * 0.15;
        wg.add(winglet);

        // Wingtip Navigation Strobe (Red on Port/Left, Green on Starboard/Right)
        const navLight = new T.Mesh(
          new T.SphereGeometry(0.09, 10, 10),
          new T.MeshBasicMaterial({ color: side < 0 ? 0xff1e42 : 0x22c55e })
        );
        navLight.position.set(4.68 * side, 1.35, 1.02);
        wg.add(navLight);
        return wg;
      };
      g.add(buildSweptWing(-1), buildSweptWing(1));

      // 3. Twin Under-Wing High-Bypass Turbofan Jet Engines with Spinning Fan Blades
      [-1.78, 1.78].forEach((x) => {
        const engGroup = new T.Group();
        engGroup.position.set(x, 0.92, 0.15);

        // Engine Pylon Strut connecting to wing
        const pylon = new T.Mesh(new T.BoxGeometry(0.14, 0.42, 1.15), paint);
        pylon.position.set(0, 0.32, 0.1);

        // Cylindrical Nacelle Cowl
        const nacelle = new T.Mesh(new T.CylinderGeometry(0.38, 0.34, 1.55, 24), paint);
        nacelle.rotation.x = Math.PI / 2;

        // Chrome Intake Lip Ring
        const intakeRing = new T.Mesh(new T.TorusGeometry(0.36, 0.045, 14, 24), chrome);
        intakeRing.position.set(0, 0, -0.77);

        // Spinning Turbofan Rotor Hub + Blades inside intake
        const fanRotor = new T.Group();
        fanRotor.position.set(0, 0, -0.65);
        const spinner = new T.Mesh(new T.ConeGeometry(0.12, 0.28, 14), chrome);
        spinner.rotation.x = -Math.PI / 2;
        fanRotor.add(spinner);
        for (let b = 0; b < 6; b++) {
          const blade = new T.Mesh(new T.BoxGeometry(0.64, 0.08, 0.02), dark);
          blade.rotation.z = (b / 6) * Math.PI;
          fanRotor.add(blade);
        }
        rotors.push(fanRotor);

        // Exhaust Nozzle Cone
        const nozzle = new T.Mesh(new T.CylinderGeometry(0.31, 0.24, 0.42, 20), carbon);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(0, 0, 0.92);

        // Variable Jet Afterburner Plume
        const cone = new T.Mesh(new T.ConeGeometry(0.28, 2.4, 16), nitroMat.clone());
        cone.rotation.x = Math.PI / 2;
        cone.position.set(0, 0, 2.15);
        nitroCones.push(cone);

        engGroup.add(pylon, nacelle, intakeRing, fanRotor, nozzle, cone);
        g.add(engGroup);
      });

      // 4. Swept Vertical Tail Stabilizer (Fin & Rudder) + Horizontal Stabilizers (Elevators)
      const finShape = new T.Shape();
      finShape.moveTo(0, 0);
      finShape.lineTo(1.45, 0);
      finShape.lineTo(2.15, 2.05);
      finShape.lineTo(1.35, 2.05);
      finShape.closePath();
      const finGeo = new T.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 });
      finGeo.rotateY(Math.PI / 2);
      const tailFin = new T.Mesh(finGeo, paint);
      tailFin.position.set(-0.05, 1.85, 2.85);

      const tailBeacon = new T.Mesh(new T.SphereGeometry(0.08, 10, 10), new T.MeshBasicMaterial({ color: 0xffffff }));
      tailBeacon.position.set(0, 3.92, 4.65);

      [-1, 1].forEach((side) => {
        const hShape = new T.Shape();
        hShape.moveTo(0, -0.45);
        hShape.lineTo(1.85 * side, 0.35);
        hShape.lineTo(1.85 * side, 0.78);
        hShape.lineTo(0, 0.48);
        hShape.closePath();
        const hGeo = new T.ExtrudeGeometry(hShape, { depth: 0.07, bevelEnabled: false });
        hGeo.rotateX(Math.PI / 2);
        const hStab = new T.Mesh(hGeo, dark);
        hStab.position.set(0, 1.62, 4.15);
        g.add(hStab);
      });

      // 5. Detailed Tricycle Landing Gear (Nose Strut + Twin Main Bogies)
      const noseStrut = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.85, 10), chrome);
      noseStrut.position.set(0, 0.65, -2.85);
      const gearWheelGeo = new T.CylinderGeometry(0.22, 0.22, 0.14, 16);
      gearWheelGeo.rotateZ(Math.PI / 2);
      [-0.12, 0.12].forEach((wx) => {
        const nw = new T.Mesh(gearWheelGeo, dark);
        nw.position.set(wx, 0.22, -2.85);
        g.add(nw);
      });
      [-0.95, 0.95].forEach((gx) => {
        const mStrut = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.88, 10), chrome);
        mStrut.position.set(gx, 0.65, 0.35);
        const mw1 = new T.Mesh(gearWheelGeo, dark);
        mw1.position.set(gx - 0.14, 0.22, 0.35);
        const mw2 = new T.Mesh(gearWheelGeo, dark);
        mw2.position.set(gx + 0.14, 0.22, 0.35);
        g.add(mStrut, mw1, mw2);
      });

      g.add(fuseBody, bellyStripe, noseCone, radomeTip, cockpitVisor, tailCone, apuNozzle, tailFin, tailBeacon, noseStrut);
    } else if (type === 'heli') {
      // STREAMLINED AERODYNAMIC SAR RESCUE HELICOPTER
      // Sculpted Teardrop Fuselage + Bubble Glass Cockpit
      const fuselage = new T.Mesh(new T.SphereGeometry(1.18, 24, 20), paint);
      fuselage.scale.set(0.95, 0.82, 2.15);
      fuselage.position.set(0, 1.55, -0.2);

      const cockpitBubble = new T.Mesh(new T.SphereGeometry(1.08, 24, 18), glass);
      cockpitBubble.scale.set(0.92, 0.76, 1.35);
      cockpitBubble.position.set(0, 1.52, -1.25);

      const engineDeck = new T.Mesh(new T.CylinderGeometry(0.52, 0.62, 2.2, 18), carbon);
      engineDeck.rotation.x = Math.PI / 2;
      engineDeck.position.set(0, 2.32, 0.1);

      // Tapered Cylindrical Tail Boom + Swept Vertical Fin + Anti-Torque Tail Rotor
      const tailBoom = new T.Mesh(new T.CylinderGeometry(0.18, 0.38, 4.1, 18), paint);
      tailBoom.rotation.x = Math.PI / 2;
      tailBoom.position.set(0, 1.72, 3.45);

      const vFin = new T.Mesh(new T.BoxGeometry(0.12, 1.35, 0.72), paint);
      vFin.position.set(0, 2.15, 5.25);
      vFin.rotation.x = -0.25;

      const tailRotor = new T.Group();
      tailRotor.position.set(0.22, 2.35, 5.35);
      const trBlade1 = new T.Mesh(new T.BoxGeometry(0.05, 1.35, 0.14), chrome);
      const trBlade2 = new T.Mesh(new T.BoxGeometry(0.05, 0.14, 1.35), chrome);
      tailRotor.add(trBlade1, trBlade2);

      // 4-Blade Main Rotor Assembly with Swashplate Hub
      const mainRotor = new T.Group();
      mainRotor.position.set(0, 2.78, -0.1);
      const rotorMast = new T.Mesh(new T.CylinderGeometry(0.14, 0.18, 0.45, 16), chrome);
      rotorMast.position.y = -0.15;
      const rotorHub = new T.Mesh(new T.CylinderGeometry(0.32, 0.28, 0.16, 18), dark);
      const blade1 = new T.Mesh(new T.BoxGeometry(8.4, 0.05, 0.34), carbon);
      const blade2 = new T.Mesh(new T.BoxGeometry(0.34, 0.05, 8.4), carbon);
      mainRotor.add(rotorMast, rotorHub, blade1, blade2);
      rotors.push(mainRotor, tailRotor);

      // Tubular Landing Skids + Cross Struts
      [-1.08, 1.08].forEach((sx) => {
        const skid = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 4.3, 12), chrome);
        skid.rotation.x = Math.PI / 2;
        skid.position.set(sx, 0.22, -0.2);
        const strutF = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.95, 10), dark);
        strutF.position.set(sx * 0.82, 0.65, -1.1);
        strutF.rotation.z = sx > 0 ? 0.32 : -0.32;
        const strutR = strutF.clone();
        strutR.position.z = 0.85;
        g.add(skid, strutF, strutR);
      });

      g.add(fuselage, cockpitBubble, engineDeck, tailBoom, vFin, tailRotor, mainRotor);
    } else if (type === 'boat') {
      // DEEP-V LUXURY OFFSHORE HYDRO-JET SPEEDBOAT
      const hullShape = new T.Shape();
      hullShape.moveTo(0, -3.8);
      hullShape.quadraticCurveTo(1.38, -1.8, 1.32, 2.8);
      hullShape.lineTo(-1.32, 2.8);
      hullShape.quadraticCurveTo(-1.38, -1.8, 0, -3.8);
      const hullGeo = new T.ExtrudeGeometry(hullShape, { depth: 0.72, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4 });
      hullGeo.rotateX(Math.PI / 2);
      const hull = new T.Mesh(hullGeo, paint);
      hull.position.y = 0.82;

      const deck = new T.Mesh(new T.CylinderGeometry(0.95, 1.15, 2.6, 18), whitePaint);
      deck.rotation.x = Math.PI / 2;
      deck.scale.set(1.1, 0.25, 1);
      deck.position.set(0, 0.92, -1.6);

      const windshield = new T.Mesh(new T.CylinderGeometry(1.02, 1.18, 0.58, 18, 1, true, -Math.PI * 0.65, Math.PI * 1.3), darkGlass);
      windshield.position.set(0, 1.22, -0.45);

      const radarArch = new T.Mesh(new T.TorusGeometry(1.12, 0.08, 10, 20, Math.PI), whitePaint);
      radarArch.position.set(0, 0.95, 1.15);

      // Twin Stern Outboard Motors
      [-0.52, 0.52].forEach((ox) => {
        const outboard = new T.Mesh(new T.BoxGeometry(0.36, 0.82, 0.52), carbon);
        outboard.position.set(ox, 0.78, 3.05);
        const cone = new T.Mesh(new T.ConeGeometry(0.28, 2.1, 12), nitroMat.clone());
        cone.rotation.x = Math.PI / 2;
        cone.position.set(ox, 0.45, 4.1);
        g.add(outboard, cone);
        nitroCones.push(cone);
      });

      g.add(hull, deck, windshield, radarArch);
    } else if (type === 'f1racer') {
      // FORMULA-X OPEN-WHEEL GRAND PRIX RACER
      // Needle-Nose Monocoque Tub
      const noseCone = new T.Mesh(new T.ConeGeometry(0.36, 2.6, 16), paint);
      noseCone.rotation.x = -Math.PI / 2;
      noseCone.position.set(0, 0.52, -1.85);

      const monocoque = new T.Mesh(new T.CylinderGeometry(0.46, 0.54, 2.8, 18), paint);
      monocoque.rotation.x = Math.PI / 2;
      monocoque.position.set(0, 0.58, 0.35);

      // Sculpted Aerodynamic Sidepods + Carbon Floor
      const floor = new T.Mesh(new T.BoxGeometry(2.05, 0.06, 4.2), carbon);
      floor.position.set(0, 0.24, 0.2);
      const sidepods = new T.Mesh(new T.BoxGeometry(1.88, 0.44, 2.35), paint);
      sidepods.position.set(0, 0.52, 0.35);

      // Multi-element Carbon Front Wing with Endplates
      const frontWing = new T.Mesh(new T.BoxGeometry(2.38, 0.08, 0.58), carbon);
      frontWing.position.set(0, 0.26, -2.85);
      [-1.18, 1.18].forEach((ex) => {
        const ep = new T.Mesh(new T.BoxGeometry(0.06, 0.28, 0.65), paint);
        ep.position.set(ex, 0.34, -2.82);
        g.add(ep);
      });

      // Driver Cockpit + Titanium Halo Bar + Driver Helmet + Airbox Sharkfin
      const halo = new T.Mesh(new T.TorusGeometry(0.42, 0.045, 10, 20, Math.PI), chrome);
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0, 0.92, -0.15);
      const helmet = new T.Mesh(new T.SphereGeometry(0.22, 16, 16), headGlow);
      helmet.position.set(0, 0.88, -0.05);
      const airbox = new T.Mesh(new T.ConeGeometry(0.32, 1.65, 14), paint);
      airbox.rotation.x = Math.PI / 2;
      airbox.position.set(0, 1.06, 0.95);

      // Dual-Element DRS Rear Wing + Rain Light
      const rearWing = new T.Mesh(new T.BoxGeometry(2.05, 0.12, 0.48), carbon);
      rearWing.position.set(0, 1.24, 2.58);
      [-1.02, 1.02].forEach((rx) => {
        const rep = new T.Mesh(new T.BoxGeometry(0.06, 0.72, 0.62), paint);
        rep.position.set(rx, 0.96, 2.55);
        g.add(rep);
      });
      const rainLight = new T.Mesh(new T.BoxGeometry(0.14, 0.22, 0.08), tailGlow);
      rainLight.position.set(0, 0.52, 2.72);

      g.add(noseCone, monocoque, floor, sidepods, frontWing, halo, helmet, airbox, rearWing, rainLight);
      addCarWheels(T, g, wheels, dark, chrome, caliperMat, 1.26, 0.48, 1.88);
      addNitroPair(T, g, nitroCones, nitroMat, 2.88);
    } else if (type === 'offroad') {
      // RUGGED 4x4 EXPEDITION OFF-ROAD SUV
      const chassis = new T.Mesh(new T.BoxGeometry(2.38, 0.85, 5.35), paint);
      chassis.position.set(0, 1.08, 0);

      // Sculpted Upper Cabin with Sloped Windshield & Windows
      const cabin = new T.Mesh(new T.BoxGeometry(2.16, 0.82, 3.15), paint);
      cabin.position.set(0, 1.82, 0.35);
      const glassBand = new T.Mesh(new T.BoxGeometry(2.20, 0.56, 2.85), darkGlass);
      glassBand.position.set(0, 1.84, 0.32);

      // Flared Off-Road Wheel Arches & Rock Sliders
      const stepBar = new T.Mesh(new T.BoxGeometry(2.58, 0.14, 3.2), carbon);
      stepBar.position.set(0, 0.68, 0);

      // Heavy-Duty Tubular Bullbar + Winch + Twin Round LED Headlamps
      const bullbar = new T.Mesh(new T.BoxGeometry(2.28, 0.58, 0.28), carbon);
      bullbar.position.set(0, 1.02, -2.76);
      [-0.78, 0.78].forEach((hx) => {
        const lamp = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.12, 16), headGlow);
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set(hx, 1.18, -2.68);
        g.add(lamp);
      });

      // Roof Expedition Rack + LED Lightbar + Emergency Strobe Bar
      const roofRack = new T.Mesh(new T.BoxGeometry(2.02, 0.12, 2.65), carbon);
      roofRack.position.set(0, 2.28, 0.4);
      sirenBar = new T.Mesh(new T.BoxGeometry(1.65, 0.18, 0.32), new T.MeshBasicMaterial({ color: 0xff2a2a }));
      sirenBar.position.set(0, 2.42, -0.65);

      // Tailgate-Mounted Full-Size Spare Tire + LED Taillights
      const spareTire = new T.Mesh(new T.CylinderGeometry(0.56, 0.56, 0.34, 20), dark);
      spareTire.rotation.x = Math.PI / 2;
      spareTire.position.set(0, 1.38, 2.82);
      const tailStrip = new T.Mesh(new T.BoxGeometry(2.22, 0.22, 0.1), tailGlow);
      tailStrip.position.set(0, 1.12, 2.69);

      g.add(chassis, cabin, glassBand, stepBar, bullbar, roofRack, sirenBar, spareTire, tailStrip);
      addCarWheels(T, g, wheels, dark, chrome, caliperMat, 1.34, 0.64, 1.82);
      addNitroPair(T, g, nitroCones, nitroMat, 2.98);
    } else {
      // DEFAULT: SCULPTED AERODYNAMIC APEX GT SUPERCAR
      // 1. Low-Slung Multi-Contour Lower Body + Carbon Front Splitter & Side Skirts
      const undertray = new T.Mesh(new T.BoxGeometry(2.46, 0.12, 5.48), carbon);
      undertray.position.set(0, 0.34, 0);

      const mainBody = new T.Mesh(new T.BoxGeometry(2.38, 0.56, 5.25), paint);
      mainBody.position.set(0, 0.66, 0.05);

      // Sloped Aerodynamic Front Hood / Nose Wedge
      const frontHood = new T.Mesh(new T.BoxGeometry(2.26, 0.42, 1.65), paint);
      frontHood.rotation.x = 0.16;
      frontHood.position.set(0, 0.62, -1.95);

      // Sculpted Muscular Wheel-Arch Fenders (Front & Rear Haunches)
      [
        [-1.12, 0.72, -1.68, 1.25],
        [1.12, 0.72, -1.68, 1.25],
        [-1.15, 0.78, 1.65, 1.45],
        [1.15, 0.78, 1.65, 1.45],
      ].forEach(([fx, fy, fz, fLen]) => {
        const fender = new T.Mesh(new T.CylinderGeometry(0.52, 0.52, fLen, 18), paint);
        fender.rotation.x = Math.PI / 2;
        fender.scale.set(0.52, 0.68, 1);
        fender.position.set(fx, fy, fz);
        g.add(fender);
      });

      // 2. Tear-Drop Fastback Glass Canopy + Sloped Windshield + Side Mirrors
      const canopy = new T.Mesh(new T.SphereGeometry(1.06, 24, 18), darkGlass);
      canopy.scale.set(0.92, 0.54, 1.68);
      canopy.position.set(0, 1.06, -0.05);

      const roofCap = new T.Mesh(new T.SphereGeometry(0.98, 20, 14), paint);
      roofCap.scale.set(0.86, 0.22, 1.15);
      roofCap.position.set(0, 1.32, 0.05);

      [-1.24, 1.24].forEach((mx) => {
        const mirror = new T.Mesh(new T.BoxGeometry(0.24, 0.1, 0.16), paint);
        mirror.position.set(mx, 1.04, -0.82);
        g.add(mirror);
      });

      // 3. Swan-Neck GT Carbon Rear Wing + Rear Diffuser + Quad Chrome Exhausts
      [-0.68, 0.68].forEach((px) => {
        const pylon = new T.Mesh(new T.BoxGeometry(0.08, 0.42, 0.36), carbon);
        pylon.rotation.x = -0.25;
        pylon.position.set(px, 1.12, 2.38);
        g.add(pylon);
      });
      const gtWing = new T.Mesh(new T.BoxGeometry(2.38, 0.08, 0.48), carbon);
      gtWing.rotation.x = 0.12;
      gtWing.position.set(0, 1.34, 2.48);
      [-1.18, 1.18].forEach((wx) => {
        const endplate = new T.Mesh(new T.BoxGeometry(0.06, 0.32, 0.56), paint);
        endplate.position.set(wx, 1.32, 2.48);
        g.add(endplate);
      });

      // 4. Aggressive Angled LED Headlights + Full-Width Cyberpunk LED Taillight Bar
      [-0.84, 0.84].forEach((lx) => {
        const headLight = new T.Mesh(new T.BoxGeometry(0.56, 0.11, 0.18), headGlow);
        headLight.rotation.y = lx > 0 ? -0.22 : 0.22;
        headLight.position.set(lx, 0.68, -2.66);
        g.add(headLight);
      });
      const tailBar = new T.Mesh(new T.BoxGeometry(2.26, 0.14, 0.12), tailGlow);
      tailBar.position.set(0, 0.82, 2.68);

      // Quad Chrome Exhaust Pipes
      [-0.58, -0.38, 0.38, 0.58].forEach((ex) => {
        const pipe = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.28, 14), chrome);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(ex, 0.44, 2.72);
        g.add(pipe);
      });

      g.add(undertray, mainBody, frontHood, canopy, roofCap, gtWing, tailBar);
      addCarWheels(T, g, wheels, dark, chrome, caliperMat, 1.22, 0.47, 1.76);
      addNitroPair(T, g, nitroCones, nitroMat, 2.98);
    }

    g.userData = { wheels, rotors, nitroCones, sirenBar };
    return g;
  }

  function addCarWheels(T, g, wheels, tireMat, rimMat, caliperMat, xOff, radius, zOff) {
    const tireGeo = new T.CylinderGeometry(radius, radius, 0.38, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new T.CylinderGeometry(radius * 0.66, radius * 0.66, 0.40, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const hubGeo = new T.CylinderGeometry(radius * 0.22, radius * 0.22, 0.43, 12);
    hubGeo.rotateZ(Math.PI / 2);
    const spokeGeo = new T.BoxGeometry(0.41, radius * 1.25, 0.07);
    const caliperGeo = new T.BoxGeometry(0.39, radius * 0.45, radius * 0.35);

    [
      [-xOff, radius, -zOff],
      [xOff, radius, -zOff],
      [-xOff, radius, zOff],
      [xOff, radius, zOff],
    ].forEach(([x, y, z]) => {
      const wg = new T.Group();
      wg.position.set(x, y, z);
      wg.add(new T.Mesh(tireGeo, tireMat), new T.Mesh(rimGeo, tireMat), new T.Mesh(hubGeo, rimMat));
      for (let sIdx = 0; sIdx < 5; sIdx++) {
        const spoke = new T.Mesh(spokeGeo, rimMat);
        spoke.rotation.x = (sIdx / 5) * Math.PI;
        wg.add(spoke);
      }
      if (caliperMat) {
        const cal = new T.Mesh(caliperGeo, caliperMat);
        cal.position.set(0, radius * 0.25, -radius * 0.28);
        wg.add(cal);
      }
      g.add(wg);
      wheels.push(wg);
    });
  }

  function addNitroPair(T, g, nitroCones, nitroMat, zPos) {
    [-0.52, 0.52].forEach((x) => {
      const cone = new T.Mesh(new T.ConeGeometry(0.22, 1.85, 14), nitroMat.clone());
      cone.rotation.x = Math.PI / 2;
      cone.position.set(x, 0.46, zPos);
      g.add(cone);
      nitroCones.push(cone);
    });
  }

  // Create the Perspective 3D Renderer & World Scene
  function createVisualOverlay(host) {
    const T = s.three;
    host.querySelector('.play-vehicle-overlay')?.remove();
    const canvas = document.createElement('canvas');
    canvas.className = 'play-vehicle-overlay';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace;

    const scene = new T.Scene();
    const keyLight = new T.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(-8, 18, 12);
    const rimLight = new T.DirectionalLight(0x38bdf8, 1.35);
    rimLight.position.set(10, 8, -12);
    scene.add(keyLight, rimLight, new T.AmbientLight(0xe2f1ff, 1.35));

    const aspect = () => Math.max(0.5, (host.clientWidth || 800) / (host.clientHeight || 500));
    const camera = new T.PerspectiveCamera(58, aspect(), 0.4, 1200);

    // Player root group stays at origin (0, jumpAlt, 0); world objects move relative to player!
    const playerRoot = new T.Group();
    scene.add(playerRoot);

    const shadow = new T.Mesh(
      new T.CircleGeometry(2.2, 28),
      new T.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.42, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.04, 0);
    shadow.scale.set(1.0, 1.85, 1);
    scene.add(shadow);

    // Headlight beam cones on ground
    const beamMat = new T.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.16, depthWrite: false });
    const headBeam = new T.Mesh(new T.ConeGeometry(3.2, 14, 16, 1, true), beamMat);
    headBeam.rotation.x = Math.PI / 2;
    headBeam.position.set(0, 0.15, -9.5);
    playerRoot.add(headBeam);

    // World root holds checkpoints, boost pads, stunt ramps, 3D disasters, AI rivals & multiplayer friends
    const worldRoot = new T.Group();
    scene.add(worldRoot);

    // Drift smoke & volcano lava particle pool
    const particleGroup = new T.Group();
    scene.add(particleGroup);
    const smokePool = [];
    const smokeGeo = new T.SphereGeometry(0.42, 8, 8);
    for (let i = 0; i < 36; i++) {
      const m = new T.Mesh(smokeGeo, new T.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0 }));
      m.visible = false;
      m.userData = { life: 0, maxLife: 24, vx: 0, vy: 0, vz: 0 };
      particleGroup.add(m);
      smokePool.push(m);
    }

    let vehicleMesh = null;
    const checkpointMeshes = [];
    const boostPadMeshes = [];
    const rampMeshes = [];
    const hazardMeshes = [];
    const rivalMeshes = new Map();

    const setVehicle = (type, color = s.paintColor) => {
      if (vehicleMesh) {
        playerRoot.remove(vehicleMesh);
      }
      vehicleMesh = buildVehicleMesh(T, type, color);
      playerRoot.add(vehicleMesh);
    };

    const rebuildWorldObjects = () => {
      while (worldRoot.children.length > 0) worldRoot.remove(worldRoot.children[0]);
      checkpointMeshes.length = 0;
      boostPadMeshes.length = 0;
      rampMeshes.length = 0;
      hazardMeshes.length = 0;
      rivalMeshes.clear();

      // 1. Checkpoints (Neon glowing gates)
      const torusGeo = new T.TorusGeometry(5.2, 0.32, 12, 32);
      s.checkpoints.forEach((cp, idx) => {
        const g = new T.Group();
        const mat = new T.MeshBasicMaterial({ color: idx === 0 ? 0x22c55e : 0x38bdf8, transparent: true, opacity: 0.85 });
        const ring = new T.Mesh(torusGeo, mat);
        ring.position.y = 4.2;
        g.add(ring);
        g.userData = { cp, ring, mat };
        worldRoot.add(g);
        checkpointMeshes.push(g);
      });

      // 2. Speed Boost Pads (Glowing cyan chevrons on road)
      const padGeo = new T.PlaneGeometry(4.2, 7.5);
      padGeo.rotateX(-Math.PI / 2);
      s.boostPads.forEach((bp) => {
        const mesh = new T.Mesh(padGeo, new T.MeshBasicMaterial({ color: 0x00f5d4, transparent: true, opacity: 0.68, side: T.DoubleSide }));
        mesh.position.y = 0.08;
        mesh.userData = { bp };
        worldRoot.add(mesh);
        boostPadMeshes.push(mesh);
      });

      // 3. Stunt Ramps (3D inclined launch wedges)
      const rampGeo = new T.BoxGeometry(4.8, 1.8, 7.0);
      s.stuntRamps.forEach((rm) => {
        const mesh = new T.Mesh(rampGeo, new T.MeshStandardMaterial({ color: 0xf97316, metalness: 0.3, roughness: 0.4 }));
        mesh.rotation.x = 0.24;
        mesh.position.y = 0.7;
        mesh.userData = { rm };
        worldRoot.add(mesh);
        rampMeshes.push(mesh);
      });

      // 4. 3D Volumetric Disasters (3D Volcano Cone + Lava Plume & 3D Flood Wave Basin)
      s.hazards3D.forEach((hz) => {
        const hg = new T.Group();
        if (hz.type === 'volcano') {
          const cone = new T.Mesh(
            new T.ConeGeometry(28, 34, 24, 1, true),
            new T.MeshStandardMaterial({ color: 0x27272a, roughness: 0.85, side: T.DoubleSide })
          );
          cone.position.y = 17;
          const lavaTop = new T.Mesh(
            new T.CircleGeometry(8.5, 20),
            new T.MeshBasicMaterial({ color: 0xff4500, side: T.DoubleSide })
          );
          lavaTop.rotation.x = -Math.PI / 2;
          lavaTop.position.y = 33.5;
          const plume = new T.Mesh(
            new T.ConeGeometry(12, 42, 16),
            new T.MeshBasicMaterial({ color: 0xff6b00, transparent: true, opacity: 0.48 })
          );
          plume.position.y = 52;
          hg.add(cone, lavaTop, plume);
          hg.userData = { hz, plume, lavaTop };
        } else if (hz.type === 'flood') {
          const water = new T.Mesh(
            new T.CircleGeometry(hz.radiusM || 65, 32),
            new T.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.46, side: T.DoubleSide })
          );
          water.rotation.x = -Math.PI / 2;
          water.position.y = 0.65;
          const ring = new T.Mesh(
            new T.RingGeometry((hz.radiusM || 65) * 0.6, (hz.radiusM || 65) * 0.66, 32),
            new T.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.75, side: T.DoubleSide })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.72;
          hg.add(water, ring);
          hg.userData = { hz, water, ring };
        }
        worldRoot.add(hg);
        hazardMeshes.push(hg);
      });
    };

    const spawnSmokePuff = (x, y, z, colorHex = 0xe2e8f0) => {
      const m = smokePool.find((p) => !p.visible);
      if (!m) return;
      m.visible = true;
      m.position.set(x, y, z);
      m.material.color.setHex(colorHex);
      m.material.opacity = 0.65;
      m.scale.setScalar(0.65);
      m.userData.life = 0;
      m.userData.maxLife = 18 + Math.floor(Math.random() * 12);
      m.userData.vx = (Math.random() - 0.5) * 0.14;
      m.userData.vy = 0.06 + Math.random() * 0.08;
      m.userData.vz = 0.18 + Math.random() * 0.15;
    };

    const updateAndRender = (now = performance.now(), boostActive = false, handbrakeActive = false, steering = 0) => {
      const t = now * 0.001;
      const spec = VEHICLE_SPECS[s.vehicle] || VEHICLE_SPECS.car;
      const absV = Math.abs(s.velocity);

      // Update camera position & FOV based on camMode
      if (s.viewMode === '2d' || s.camMode === 'topdown') {
        camera.fov = 45;
        camera.position.set(0, 46, 4);
        camera.lookAt(0, 0, -4);
      } else if (s.camMode === 'hood') {
        camera.fov = 68 + clamp(absV * 0.05, 0, 14);
        camera.position.set(0, 1.65 + s.jumpAlt, -0.6);
        camera.lookAt(steering * 2.2, 1.4 + s.jumpAlt, -24);
      } else if (s.camMode === 'drone') {
        camera.fov = 56;
        camera.position.set(Math.sin(t * 0.45) * 9, 13.5 + s.jumpAlt * 0.6, 18.5);
        camera.lookAt(0, 1.6 + s.jumpAlt * 0.4, -6);
      } else {
        // Default: GTA 5/6 Dynamic 3D Chase Camera
        camera.fov = 58 + clamp(absV * 0.06, 0, 16) + (boostActive ? 6 : 0);
        const camSwingX = clamp(-s.slipAngle * 0.11 - steering * 1.15, -3.5, 3.5);
        const camDistZ = spec.fly ? 14.5 : 11.2 - (boostActive ? 0.9 : 0);
        const camHeightY = (spec.fly ? 5.6 : 4.25) + s.jumpAlt * 0.45;
        camera.position.set(camSwingX, camHeightY, camDistZ);
        camera.lookAt(0, 1.35 + s.jumpAlt * 0.7, -9.5);
      }
      camera.updateProjectionMatrix();

      // Update player vehicle attitude (slip yaw, pitch on jump/flight, roll on cornering)
      playerRoot.position.y = s.jumpAlt;
      if (vehicleMesh) {
        const slipRad = (-s.slipAngle * Math.PI) / 180;
        vehicleMesh.rotation.y = slipRad;
        vehicleMesh.rotation.z = spec.fly
          ? clamp(-steering * 0.52, -0.6, 0.6)
          : clamp(steering * (absV / 180) * 0.11, -0.14, 0.14);
        vehicleMesh.rotation.x = spec.fly
          ? clamp((s.verticalVelocity || 0) * 0.012, -0.35, 0.35)
          : clamp((s.verticalVelocity || 0) * 0.018, -0.28, 0.28);

        // Spin wheels, helicopter rotors, nitro flames & siren strobe
        const ud = vehicleMesh.userData || {};
        (ud.wheels || []).forEach((w, idx) => {
          w.rotation.x -= (s.velocity / 3.6) * 0.055;
          if (idx < 2) w.rotation.y = -steering * 0.38;
        });
        (ud.rotors || []).forEach((r) => {
          r.rotation.y += 0.42;
        });
        (ud.nitroCones || []).forEach((c) => {
          c.material.opacity = boostActive && absV > 8 ? 0.72 + Math.sin(t * 40) * 0.2 : 0.0;
          c.scale.y = 0.85 + Math.sin(t * 35) * 0.28;
        });
        if (ud.sirenBar) {
          ud.sirenBar.material.color.setHex(
            s.sirenOn ? (Math.floor(t * 8) % 2 === 0 ? 0xff1e42 : 0x38bdf8) : 0x475569
          );
        }
      }

      // Spawn drift tire smoke or water spray
      if ((handbrakeActive || Math.abs(s.slipAngle) > 10) && absV > 25 && !spec.fly) {
        spawnSmokePuff(-0.95, 0.25, 2.1, s.surface === 'wet' ? 0xbae6fd : 0xe2e8f0);
        spawnSmokePuff(0.95, 0.25, 2.1, s.surface === 'wet' ? 0xbae6fd : 0xe2e8f0);
      }

      for (const m of smokePool) {
        if (!m.visible) continue;
        m.userData.life++;
        if (m.userData.life >= m.userData.maxLife) {
          m.visible = false;
          continue;
        }
        const prog = m.userData.life / m.userData.maxLife;
        m.position.x += m.userData.vx;
        m.position.y += m.userData.vy;
        m.position.z += m.userData.vz;
        m.scale.setScalar(0.65 + prog * 1.9);
        m.material.opacity = (1 - prog) * 0.55;
      }

      // Project all world objects relative to player position and heading!
      const hdgRad = (s.heading * Math.PI) / 180;
      const cosH = Math.cos(hdgRad);
      const sinH = Math.sin(hdgRad);
      const projectLocal = (lat, lon) => {
        const { east, north } = gpsToLocalMeters(lat, lon);
        // Rotate by player heading so ahead of player is -Z and right of player is +X
        const rx = east * cosH - north * sinH;
        const rz = -(east * sinH + north * cosH);
        return { x: rx, z: rz, dist: Math.hypot(east, north) };
      };

      // Update Checkpoints
      checkpointMeshes.forEach((g, idx) => {
        const p = projectLocal(g.userData.cp.lat, g.userData.cp.lon);
        g.visible = p.dist < 550 && s.gameMode !== 'freeroam';
        if (!g.visible) return;
        g.position.set(p.x, 0, p.z);
        g.rotation.y = t * 1.4;
        const isCurrent = idx === s.currentCheckpoint;
        g.userData.mat.color.setHex(isCurrent ? 0x00f5d4 : 0x64748b);
        g.userData.mat.opacity = isCurrent ? 0.92 : 0.35;
        g.scale.setScalar(isCurrent ? 1.12 + Math.sin(t * 6) * 0.08 : 0.82);
      });

      // Update Boost Pads & Stunt Ramps
      boostPadMeshes.forEach((m) => {
        const p = projectLocal(m.userData.bp.lat, m.userData.bp.lon);
        m.visible = p.dist < 420;
        if (m.visible) m.position.set(p.x, 0.08, p.z);
      });
      rampMeshes.forEach((m) => {
        const p = projectLocal(m.userData.rm.lat, m.userData.rm.lon);
        m.visible = p.dist < 420;
        if (m.visible) m.position.set(p.x, 0.7, p.z);
      });

      // Update 3D Volcano & Flood Hazards
      hazardMeshes.forEach((hg) => {
        const hz = hg.userData.hz;
        const p = projectLocal(hz.lat, hz.lon);
        hg.visible = p.dist < 750;
        if (!hg.visible) return;
        hg.position.set(p.x, 0, p.z);
        if (hg.userData.plume) {
          hg.userData.plume.scale.y = 0.9 + Math.sin(t * 5) * 0.18;
          hg.userData.plume.rotation.y = t * 0.8;
        }
        if (hg.userData.ring) {
          const wave = (t * 0.45) % 1;
          hg.userData.ring.scale.setScalar(0.5 + wave * 0.9);
          hg.userData.ring.material.opacity = (1 - wave) * 0.8;
        }
      });

      // Update 3D AI Rivals & Live Multiplayer Friends
      const activeRivals = [
        ...(s.aiEnabled ? s.aiRacers : []),
        ...Array.from(s.remotePlayers.values()),
      ];
      const seenIds = new Set();
      activeRivals.forEach((rv) => {
        const id = rv.id || rv.player_id;
        if (!id || id === s.playerId) return;
        seenIds.add(id);
        let mesh = rivalMeshes.get(id);
        if (!mesh) {
          mesh = buildVehicleMesh(T, rv.vehicle || 'car', rv.color || '#f43f5e');
          worldRoot.add(mesh);
          rivalMeshes.set(id, mesh);
        }
        const p = projectLocal(Number(rv.lat), Number(rv.lon));
        mesh.visible = p.dist < 600;
        if (mesh.visible) {
          mesh.position.set(p.x, Number(rv.alt || 0) * 0.1, p.z);
          const relHeading = ((Number(rv.heading || 0) - s.heading) * Math.PI) / 180;
          mesh.rotation.y = -relHeading;
        }
      });
      for (const [id, mesh] of rivalMeshes.entries()) {
        if (!seenIds.has(id)) {
          worldRoot.remove(mesh);
          rivalMeshes.delete(id);
        }
      }

      renderer.render(scene, camera);
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth || 800);
      const height = Math.max(1, host.clientHeight || 500);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      updateAndRender();
    };

    setVehicle(s.vehicle, s.paintColor);
    rebuildWorldObjects();
    resize();

    return {
      canvas,
      render: updateAndRender,
      resize,
      setVehicle,
      rebuildWorldObjects,
    };
  }

  // Web Audio Synthesizer for Engine Roar, Checkpoint Chime & Siren
  function ensureAudio() {
    if (!s.sfxEnabled) return;
    if (!s.audioCtx && typeof (window.AudioContext || window.webkitAudioContext) !== 'undefined') {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      s.audioCtx = new Ctx();
      s.engineOsc = s.audioCtx.createOscillator();
      s.engineGain = s.audioCtx.createGain();
      s.engineOsc.type = 'sawtooth';
      s.engineOsc.frequency.value = 55;
      s.engineGain.gain.value = 0.0;
      s.engineOsc.connect(s.engineGain);
      s.engineGain.connect(s.audioCtx.destination);
      s.engineOsc.start();
    }
    if (s.audioCtx && s.audioCtx.state === 'suspended') {
      s.audioCtx.resume().catch(() => {});
    }
  }

  function updateEngineAudio(absV, boost) {
    if (!s.sfxEnabled || !s.engineOsc || !s.engineGain || !s.audioCtx) return;
    const baseFreq = s.vehicle === 'f1racer' ? 95 : s.vehicle === 'plane' ? 110 : 52;
    s.engineOsc.frequency.setTargetAtTime(baseFreq + absV * 1.15 + (boost ? 45 : 0), s.audioCtx.currentTime, 0.06);
    s.engineGain.gain.setTargetAtTime(s.running ? clamp(0.015 + (absV / 300) * 0.045, 0.01, 0.065) : 0.0, s.audioCtx.currentTime, 0.08);
  }

  function playBeep(freq = 880, dur = 0.14) {
    if (!s.sfxEnabled || !s.audioCtx) return;
    try {
      const osc = s.audioCtx.createOscillator();
      const gain = s.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(s.audioCtx.destination);
      osc.start();
      osc.stop(s.audioCtx.currentTime + dur);
    } catch (_) {}
  }

  // Online Multiplayer Sync (BroadcastChannel + SQLite/MySQL API)
  async function syncMultiplayer(leave = false) {
    const payload = {
      room_code: s.roomCode,
      player_id: s.playerId,
      callsign: s.callsign,
      vehicle: s.vehicle,
      color: s.paintColor,
      lat: s.pos.lat,
      lon: s.pos.lon,
      alt: s.pos.alt + s.jumpAlt,
      heading: s.heading,
      pitch: 0,
      speed_kmh: Math.round(Math.abs(s.velocity)),
      drift: Math.abs(s.slipAngle) > 10,
      nitro: s.keys.has('boost') || s.keys.has('shift'),
      race_mode: s.gameMode,
      checkpoint_idx: s.currentCheckpoint,
      lap: s.lap,
      best_lap_ms: s.bestLapMs,
      leave,
    };

    try {
      s.bc?.postMessage(payload);
    } catch (_) {}

    try {
      const res = await fetch('api.php?action=multiplayer-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.players)) {
        const nowIds = new Set();
        data.players.forEach((p) => {
          if (p.player_id && p.player_id !== s.playerId) {
            nowIds.add(p.player_id);
            s.remotePlayers.set(p.player_id, p);
          }
        });
        for (const k of s.remotePlayers.keys()) {
          if (!nowIds.has(k) && !String(k).startsWith('bc_')) s.remotePlayers.delete(k);
        }
        updateMultiplayerUi();
      }
    } catch (_) {}
  }

  function updateMultiplayerUi() {
    const countEl = $('play-mp-online-count');
    const aiCount = s.aiEnabled ? s.aiRacers.length : 0;
    const humanCount = 1 + s.remotePlayers.size;
    if (countEl) {
      countEl.textContent = `${humanCount} LIVE · ${aiCount} AI`;
    }
  }

  async function loadLeaderboard() {
    try {
      const res = await fetch('api.php?action=race-leaderboard', { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.leaders)) {
        s.leaders = data.leaders;
        renderLeaderboard();
      }
    } catch (_) {}
  }

  async function submitRaceScore(timeMs) {
    try {
      await fetch('api.php?action=race-leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          track_id: s.gameMode === 'rescue' ? 'hazard-escape' : 'grand-prix',
          track_name: s.gameMode === 'rescue' ? 'Volcano & Flood Escape Sprint' : 'GodView Street Circuit (3 Laps)',
          player_name: s.callsign,
          vehicle: s.vehicle,
          time_ms: Math.round(timeMs),
          top_speed_kmh: Math.round(s.topSpeedRecorded),
          location_label: s.pos.name || 'Earth 3D',
        }),
      });
      await loadLeaderboard();
    } catch (_) {}
  }

  function renderLeaderboard() {
    const box = $('play-leaderboard-list');
    if (!box) return;
    if (!s.leaders.length) {
      box.innerHTML = '<div class="mp-empty">Finish a 3-Lap Race or Hazard Rescue to post your time!</div>';
      return;
    }
    box.innerHTML = s.leaders.slice(0, 6).map((row, idx) => {
      const sec = (Number(row.time_ms || 0) / 1000).toFixed(2);
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
      return `<div class="mp-leader-row">
        <span class="mp-rank">${medal}</span>
        <span class="mp-pilot"><b>${String(row.player_name || 'Pilot').replace(/[<>&]/g, '')}</b> <small>${String(row.vehicle || 'car').toUpperCase()} · ${String(row.location_label || '').replace(/[<>&]/g, '')}</small></span>
        <span class="mp-time">${sec}s</span>
      </div>`;
    }).join('');
  }

  function setStatus(text) {
    const el = $('play-state');
    if (el) el.textContent = text;
  }

  function updatePositionHud() {
    const c = $('play-coords');
    if (c) {
      c.textContent = `${Math.abs(s.pos.lat).toFixed(4)}° ${s.pos.lat >= 0 ? 'N' : 'S'} · ${Math.abs(s.pos.lon).toFixed(4)}° ${s.pos.lon >= 0 ? 'E' : 'W'}`;
    }
    const sp = $('play-speed');
    if (sp) sp.textContent = String(Math.round(Math.abs(s.velocity)));

    const raceHud = $('play-race-telemetry');
    if (raceHud) {
      if (s.gameMode === 'freeroam') {
        raceHud.textContent = `CAM: ${s.camMode.toUpperCase()} · ALT: ${Math.round(s.pos.alt + s.jumpAlt)}m · STUNT PTS: ${s.stuntScore}`;
      } else {
        const elapsed = s.raceStartTime ? ((performance.now() - s.raceStartTime) / 1000).toFixed(1) : '0.0';
        raceHud.textContent = `GATE ${s.currentCheckpoint + 1}/${s.checkpoints.length} · LAP ${s.lap}/${s.totalLaps} · TIME ${elapsed}s`;
      }
    }
  }

  function updateHud() {
    const spec = VEHICLE_SPECS[s.vehicle] || VEHICLE_SPECS.car;
    const vl = $('play-vehicle-label');
    if (vl) vl.textContent = spec.label;
    updatePositionHud();
    const sv = $('play-speed-value');
    if (sv) sv.textContent = `${s.speed} km/h`;
    const sb = $('play-start');
    if (sb) sb.textContent = s.running ? '⏸ Pause' : '▶ Start Driving';
    document.querySelectorAll('.vehicle-pick').forEach((b) => b.classList.toggle('active', b.dataset.vehicle === s.vehicle));
    document.querySelectorAll('[data-play-map-style]').forEach((b) => b.classList.toggle('active', b.dataset.playMapStyle === s.mapStyle));
    document.querySelectorAll('[data-play-view]').forEach((b) => b.classList.toggle('active', b.dataset.playView === s.viewMode));
  }

  async function initPlayMap() {
    const host = $('play-map');
    if (!host || !window.maplibregl) return;
    if (!s.map) {
      s.spawn = { ...currentPlace(), alt: 0 };
      s.pos = { ...s.spawn };
      s.map = new window.maplibregl.Map({
        container: host,
        style: buildStyle(s.mapStyle),
        ...playCameraOptions(s.pos, 0),
        attributionControl: false,
        maxZoom: 22,
        maxPitch: 85,
      });
      s.map.on('load', () => {
        enhanceMapWith3D(s.map);
      });
      s.map.on('style.load', () => {
        enhanceMapWith3D(s.map);
      });
      s.map.on('click', (e) => {
        s.pos.lat = e.lngLat.lat;
        s.pos.lon = e.lngLat.lng;
        s.spawn = { ...s.pos };
        generateWorldCourse(s.gameMode);
        updateHud();
        s.map.easeTo({ ...playCameraOptions(s.pos, s.heading), duration: 420 });
        setStatus('START POINT SET · PRESS W OR START');
      });
    }
    if (!s.visual) {
      s.visual = createVisualOverlay(host);
    }
    generateWorldCourse(s.gameMode);
    s.map.resize();
    s.visual?.resize();
    setStatus('3D WORLD READY · W/A/S/D OR JOYSTICK');
    updateHud();
  }

  function setMapStyle(mode) {
    if (!['satellite', 'hybrid', 'map'].includes(mode)) return;
    s.mapStyle = mode;
    if (s.map) s.map.setStyle(buildStyle(mode));
    updateHud();
  }

  function setViewMode(mode) {
    if (!['2d', '3d'].includes(mode)) return;
    s.viewMode = mode;
    updateHud();
    if (s.map) {
      enhanceMapWith3D(s.map);
      s.map.easeTo({ ...playCameraOptions(s.pos, s.heading), duration: 360 });
    }
    s.visual?.render();
  }

  function setVehicle(type) {
    if (!VEHICLE_SPECS[type]) return;
    s.vehicle = type;
    const spec = VEHICLE_SPECS[type];
    s.velocity = 0;
    s.pos.alt = spec.baseAlt;
    s.speed = Math.max(s.speed, spec.maxKmh);
    const range = $('play-speed-range');
    if (range) {
      range.max = String(spec.maxKmh);
      range.value = String(spec.maxKmh);
    }
    s.visual?.setVehicle(type, s.paintColor);
    updateHud();
  }

  function startMissionMode(mode) {
    s.gameMode = mode;
    s.currentCheckpoint = 0;
    s.lap = 1;
    s.totalLaps = mode === 'rescue' ? 1 : 3;
    s.raceStartTime = performance.now();
    s.lapStartTime = performance.now();
    s.topSpeedRecorded = 0;
    s.raceFinished = false;
    generateWorldCourse(mode);
    document.querySelectorAll('[data-play-mission]').forEach((b) => b.classList.toggle('active', b.dataset.playMission === mode));
    if (mode === 'freeroam') {
      setStatus('FREE ROAM SANDBOX · STUNT & EXPLORE');
    } else if (mode === 'race') {
      setStatus('🏁 3-LAP STREET RACE STARTED · HIT CYAN GATES!');
      playBeep(660, 0.15);
      if (!s.running) startOrPause();
    } else if (mode === 'rescue') {
      setStatus('⚡ 6-GATE TIME ATTACK SPRINT · HIT ALL 6 GATES!');
      playBeep(880, 0.2);
      if (!s.running) startOrPause();
    }
    updateHud();
  }

  function startOrPause() {
    s.running = !s.running;
    if (!s.running) s.velocity = 0;
    s.lastTime = performance.now();
    ensureAudio();
    setStatus(s.running ? 'DRIVING LIVE' : 'PAUSED');
    updateHud();
    if (s.running) requestFrame();
  }

  function requestFrame() {
    if (!s.raf) s.raf = requestAnimationFrame(tick);
  }

  function approach(current, target, amount) {
    if (current < target) return Math.min(target, current + amount);
    if (current > target) return Math.max(target, current - amount);
    return target;
  }

  function updateAiRacers(dt) {
    if (!s.aiEnabled || !s.checkpoints.length) return;
    const cosLat = Math.max(0.2, Math.cos((s.pos.lat * Math.PI) / 180));
    s.aiRacers.forEach((ai) => {
      const target = s.checkpoints[ai.targetGate % s.checkpoints.length];
      if (!target) return;
      const dNorth = (target.lat - ai.lat) * 111320;
      const dEast = (target.lon - ai.lon) * 111320 * cosLat;
      const dist = Math.hypot(dEast, dNorth);
      if (dist < 16) {
        ai.targetGate = (ai.targetGate + 1) % s.checkpoints.length;
      }
      const targetHdg = ((Math.atan2(dEast, dNorth) * 180) / Math.PI + 360) % 360;
      let diff = ((targetHdg - ai.heading + 540) % 360) - 180;
      ai.heading = (ai.heading + clamp(diff, -110 * dt, 110 * dt) + 360) % 360;
      const cruiseMs = (135 * ai.speedSkill) / 3.6;
      const rad = (ai.heading * Math.PI) / 180;
      ai.lat += (Math.cos(rad) * cruiseMs * dt) / 111320;
      ai.lon += (Math.sin(rad) * cruiseMs * dt) / (111320 * cosLat);
    });
  }

  function checkWorldInteractions(dt) {
    // 1. Boost pads
    for (const bp of s.boostPads) {
      const { east, north } = gpsToLocalMeters(bp.lat, bp.lon);
      if (Math.hypot(east, north) < 6.5 && Math.abs(s.velocity) > 5) {
        const spec = VEHICLE_SPECS[s.vehicle] || VEHICLE_SPECS.car;
        s.velocity = Math.min(spec.maxKmh * 1.45, Math.abs(s.velocity) + 65) * Math.sign(s.velocity || 1);
        s.stuntScore += 50;
        playBeep(1040, 0.1);
        setStatus('⚡ NITRO BOOST PAD HIT! +50 PTS');
      }
    }

    // 2. Stunt Ramps
    for (const rm of s.stuntRamps) {
      const { east, north } = gpsToLocalMeters(rm.lat, rm.lon);
      if (Math.hypot(east, north) < 6.2 && s.jumpAlt <= 0.2 && Math.abs(s.velocity) > 35) {
        s.verticalVelocity = Math.min(24, Math.abs(s.velocity) * 0.14);
        s.stuntScore += 150;
        playBeep(740, 0.16);
        setStatus('🚀 STUNT JUMP LAUNCH! +150 PTS');
      }
    }

    // Gravity on jump altitude
    if (s.jumpAlt > 0 || s.verticalVelocity !== 0) {
      s.jumpAlt += s.verticalVelocity * dt;
      s.verticalVelocity -= 28 * dt;
      if (s.jumpAlt <= 0) {
        s.jumpAlt = 0;
        s.verticalVelocity = 0;
      }
    }

    // 3. Race / Rescue Checkpoints
    if (s.gameMode !== 'freeroam' && !s.raceFinished && s.checkpoints.length > 0) {
      const cp = s.checkpoints[s.currentCheckpoint];
      if (cp) {
        const { east, north } = gpsToLocalMeters(cp.lat, cp.lon);
        if (Math.hypot(east, north) < 15.5) {
          playBeep(920, 0.12);
          s.stuntScore += 100;
          s.currentCheckpoint++;
          if (s.currentCheckpoint >= s.checkpoints.length) {
            s.currentCheckpoint = 0;
            const now = performance.now();
            const lapMs = now - s.lapStartTime;
            s.lapStartTime = now;
            if (!s.bestLapMs || lapMs < s.bestLapMs) s.bestLapMs = Math.round(lapMs);
            if (s.lap >= s.totalLaps) {
              const totalMs = now - s.raceStartTime;
              s.raceFinished = true;
              playBeep(1320, 0.35);
              setStatus(`🏆 FINISHED IN ${(totalMs / 1000).toFixed(2)}s! SAVED TO LEADERBOARD`);
              submitRaceScore(totalMs);
            } else {
              s.lap++;
              setStatus(`🏁 LAP ${s.lap}/${s.totalLaps} · BEST LAP ${(s.bestLapMs / 1000).toFixed(2)}s`);
            }
          }
        }
      }
    }
  }

  function tick(now) {
    s.raf = 0;
    if (!s.running) return;
    const dt = Math.min(0.05, Math.max(0, (now - (s.lastTime || now)) / 1000));
    s.lastTime = now;

    const spec = VEHICLE_SPECS[s.vehicle] || VEHICLE_SPECS.car;
    const key = (k) => s.keys.has(k);
    const left = key('a') || key('arrowleft') || key('left');
    const right = key('d') || key('arrowright') || key('right');
    const forward = key('w') || key('arrowup') || key('forward');
    const back = key('s') || key('arrowdown') || key('back');
    const joyX = s.joy.x || 0;
    const joyY = s.joy.y || 0;

    let gpX = 0, gpForward = 0, gpBack = 0, gpBoost = false, gpHandbrake = false;
    try {
      const pads = navigator.getGamepads?.() || [];
      const gp = Array.from(pads).find((x) => x && x.connected);
      if (gp) {
        gpX = Math.abs(gp.axes?.[0] || 0) > 0.12 ? gp.axes[0] : 0;
        gpForward = Math.max(gp.buttons?.[7]?.value || 0, gp.buttons?.[0]?.pressed ? 0.65 : 0);
        gpBack = Math.max(gp.buttons?.[6]?.value || 0, gp.buttons?.[1]?.pressed ? 0.65 : 0);
        gpBoost = !!gp.buttons?.[5]?.pressed;
        gpHandbrake = !!gp.buttons?.[4]?.pressed;
        s.gamepadName = gp.id || 'Connected gamepad';
      } else s.gamepadName = '';
    } catch (_) {
      s.gamepadName = '';
    }

    const handbrake = !spec.fly && (key('b') || gpHandbrake);
    const direction = clamp((forward ? 1 : 0) - (back ? 1 : 0) - joyY + gpForward - gpBack, -1, 1);
    const rising = spec.fly && (key('r') || key('q'));
    const falling = spec.fly && (key('f') || key('e'));
    const steering = clamp((right ? 1 : 0) - (left ? 1 : 0) + joyX + gpX, -1, 1);
    const boost = key('boost') || key('shift') || gpBoost;

    const limit = spec.maxKmh;
    const maxSpeed = Math.min(s.speed, limit) * (boost ? 1.38 : 1);
    const reverseLimit = spec.rev;

    let targetVelocity = 0;
    if (direction > 0.035) targetVelocity = maxSpeed * Math.min(1, direction);
    else if (direction < -0.035) {
      targetVelocity = s.velocity > 1.5 ? 0 : -reverseLimit * Math.min(1, Math.abs(direction));
    }

    const absV = Math.abs(s.velocity);
    if (absV > s.topSpeedRecorded) s.topSpeedRecorded = absV;

    const gripBase = SURFACE_GRIP[s.surface] || SURFACE_GRIP.dry;
    const effectiveGrip = gripBase * (handbrake ? 0.26 : 1);
    const accel = spec.accel * (boost ? 1.45 : 1) * (!spec.fly ? 0.72 + 0.28 * gripBase : 1);
    const brakes = spec.brake;

    if (Math.abs(direction) > 0.035) {
      const reverseWhileMoving = Math.abs(s.velocity) > 1.5 && targetVelocity !== 0 && Math.sign(targetVelocity) !== Math.sign(s.velocity);
      const rate = targetVelocity === 0 || reverseWhileMoving ? brakes : accel;
      s.velocity = approach(s.velocity, targetVelocity, rate * dt);
    } else {
      const drag = (spec.fly ? 2.2 : 4.2) + absV * 0.045;
      s.velocity = approach(s.velocity, 0, drag * dt);
    }

    if (handbrake) s.velocity = approach(s.velocity, 0, 16 * dt);
    s.velocity = clamp(s.velocity, -reverseLimit, limit * (boost ? 1.4 : 1));

    if (s.physicsMode === 'arcade' || spec.fly) {
      if (Math.abs(steering) > 0.04) s.heading += steering * 72 * dt * (s.velocity < 0 ? -1 : 1);
      s.slipAngle = approach(s.slipAngle, steering * (handbrake ? 26 : 6), 18 * dt);
    } else {
      const speedMS = Math.max(0.4, Math.abs(s.velocity) / 3.6);
      const wheelAngle = steering * 0.52;
      const wheelBase = 2.65;
      const idealYaw = (speedMS / wheelBase) * Math.tan(wheelAngle);
      const maxYaw = (effectiveGrip * 11.5) / Math.max(3.0, speedMS);
      const yawRate = clamp(idealYaw, -maxYaw, maxYaw) * (s.velocity < 0 ? -1 : 1);
      s.heading += ((yawRate * 180) / Math.PI) * dt;
      const slipTarget = steering * (handbrake ? 32 : Math.min(11, absV * 0.05)) * (s.velocity < 0 ? -1 : 1);
      s.slipAngle = approach(s.slipAngle, slipTarget, ((handbrake ? 2.8 : 6.0) * effectiveGrip + 1.2) * dt);
      s.slipAngle = clamp(s.slipAngle, -34, 34);
    }

    s.heading = ((s.heading % 360) + 360) % 360;
    if (rising) s.pos.alt = Math.min(1500, s.pos.alt + 65 * dt);
    if (falling) s.pos.alt = Math.max(spec.baseAlt, s.pos.alt - 55 * dt);

    if (Math.abs(s.velocity) > 0.08) {
      const ms = s.velocity / 3.6;
      const h = ((s.heading + s.slipAngle) * Math.PI) / 180;
      s.pos.lat += (Math.cos(h) * ms * dt) / 111320;
      s.pos.lon += (Math.sin(h) * ms * dt) / (111320 * Math.max(0.15, Math.cos((s.pos.lat * Math.PI) / 180)));
      s.pos.lat = clamp(s.pos.lat, -84, 84);
      s.pos.lon = ((s.pos.lon + 540) % 360) - 180;
    }

    updateAiRacers(dt);
    checkWorldInteractions(dt);
    updateEngineAudio(absV, boost);

    if (s.map && now - s.lastCenter >= 28) {
      s.map.jumpTo(playCameraOptions(s.pos, s.heading));
      s.lastCenter = now;
    }
    s.visual?.render(now, boost, handbrake, steering);

    if (now - s.lastHud >= 90) {
      updatePositionHud();
      s.lastHud = now;
    }

    requestFrame();
  }

  function reset() {
    s.running = false;
    s.velocity = 0;
    s.verticalVelocity = 0;
    s.jumpAlt = 0;
    s.keys.clear();
    s.joy.x = 0;
    s.joy.y = 0;
    s.wheel.active = false;
    const joyKnob = $('drive-joystick-knob');
    if (joyKnob) joyKnob.style.transform = 'translate(-50%, -50%)';
    const wheel = $('drive-steering-wheel');
    if (wheel) wheel.style.transform = 'rotate(0deg)';
    s.heading = 0;
    s.slipAngle = 0;
    s.pos = { ...s.spawn, alt: VEHICLE_SPECS[s.vehicle]?.baseAlt || 0 };
    updateEngineAudio(0, false);
    setStatus('PAUSED · RESET');
    updateHud();
    if (s.map) s.map.easeTo({ ...playCameraOptions(s.pos, 0), duration: 600 });
    s.visual?.render();
  }

  function setSpawnFromSelected() {
    const p = currentPlace();
    s.spawn = { ...p, alt: VEHICLE_SPECS[s.vehicle]?.baseAlt || 0 };
    s.pos = { ...s.spawn };
    s.heading = 0;
    s.slipAngle = 0;
    s.velocity = 0;
    generateWorldCourse(s.gameMode);
    updateHud();
    if (s.map) s.map.flyTo({ ...playCameraOptions(s.pos, 0), duration: 1000 });
    setStatus('SELECTED PLACE LOADED');
  }

  function teleportToHazard(hazard) {
    if (!hazard || !Number.isFinite(Number(hazard.lat)) || !Number.isFinite(Number(hazard.lon))) return;
    s.spawn = {
      name: hazard.title || 'Active Hazard Zone',
      lat: Number(hazard.lat),
      lon: Number(hazard.lon),
      alt: VEHICLE_SPECS[s.vehicle]?.baseAlt || 0,
    };
    s.pos = { ...s.spawn };
    window.EARTHSCOPE_FOCUS_HAZARD = hazard;
    initPlayMap().then(() => {
      startMissionMode('rescue');
      if (s.map) s.map.jumpTo(playCameraOptions(s.pos, s.heading));
    });
  }

  function injectMultiplayerAndRacingUI() {
    const controlCard = $('panel-play')?.querySelector('.play-control-card');
    const picker = controlCard?.querySelector('.vehicle-picker');
    if (picker && !picker.querySelector('[data-vehicle="f1racer"]')) {
      picker.innerHTML = `
        <button type="button" class="vehicle-pick active" data-vehicle="car"><span>🏎️</span><b>Hypercar</b><small>280 km/h Apex GT</small></button>
        <button type="button" class="vehicle-pick" data-vehicle="f1racer"><span>🏁</span><b>Formula-X</b><small>330 km/h Street F1</small></button>
        <button type="button" class="vehicle-pick" data-vehicle="offroad"><span>🚙</span><b>SAR 4x4</b><small>Flood & Volcano</small></button>
        <button type="button" class="vehicle-pick" data-vehicle="heli"><span>🚁</span><b>Rescue Heli</b><small>SAR VTOL Rotor</small></button>
        <button type="button" class="vehicle-pick" data-vehicle="plane"><span>✈️</span><b>Stealth Jet</b><small>480 km/h Mach</small></button>
        <button type="button" class="vehicle-pick" data-vehicle="boat"><span>🚤</span><b>Speedboat</b><small>Hydro-Jet Wake</small></button>
      `;
    }

    const hud = $('panel-play')?.querySelector('.play-map-hud');
    if (hud && !$('play-race-telemetry')) {
      const raceDiv = document.createElement('div');
      raceDiv.innerHTML = `<small>MISSION / TELEMETRY</small><b id="play-race-telemetry">CAM: CHASE · ALT: 0m · STUNT PTS: 0</b>`;
      hud.insertBefore(raceDiv, hud.lastElementChild);
    }

    const styleSwitch = $('panel-play')?.querySelector('.play-map-style-switch');
    if (styleSwitch && !$('play-cam-cycle')) {
      const camBtn = document.createElement('button');
      camBtn.type = 'button';
      camBtn.id = 'play-cam-cycle';
      camBtn.textContent = '🎥 CAM: CHASE [C]';
      camBtn.addEventListener('click', cycleCameraMode);
      styleSwitch.appendChild(camBtn);

      const sfxBtn = document.createElement('button');
      sfxBtn.type = 'button';
      sfxBtn.id = 'play-sfx-toggle';
      sfxBtn.textContent = '🔇 SFX OFF';
      sfxBtn.addEventListener('click', () => {
        s.sfxEnabled = !s.sfxEnabled;
        sfxBtn.textContent = s.sfxEnabled ? '🔊 SFX ON' : '🔇 SFX OFF';
        sfxBtn.classList.toggle('active', s.sfxEnabled);
        if (s.sfxEnabled) ensureAudio();
        else if (s.engineGain && s.audioCtx) s.engineGain.gain.setTargetAtTime(0, s.audioCtx.currentTime, 0.05);
      });
      styleSwitch.appendChild(sfxBtn);
    }

    if (controlCard && !$('play-mp-hub')) {
      const hub = document.createElement('div');
      hub.id = 'play-mp-hub';
      hub.className = 'play-mp-hub';
      hub.innerHTML = `
        <div class="mp-section-head">
          <b>🎮 GAME MODES & MISSIONS</b>
          <span class="mp-live-badge" id="play-mp-online-count">1 LIVE · 4 AI</span>
        </div>
        <div class="mp-mission-buttons">
          <button type="button" class="mp-mission-btn active" data-play-mission="freeroam">🌐 Free Roam & Stunts</button>
          <button type="button" class="mp-mission-btn" data-play-mission="race">🏁 3-Lap Street Race</button>
          <button type="button" class="mp-mission-btn" data-play-mission="rescue">⚡ 6-Gate Time Attack</button>
        </div>
        <div class="mp-section-head" style="margin-top:10px">
          <b>🌍 ONLINE MULTIPLAYER ROOM (WITH FRIENDS)</b>
        </div>
        <div class="mp-room-grid">
          <label>Callsign
            <input type="text" id="play-mp-callsign" maxlength="24" value="${s.callsign}">
          </label>
          <label>Room Code
            <input type="text" id="play-mp-room" maxlength="20" value="${s.roomCode}">
          </label>
          <label>Paint
            <input type="color" id="play-mp-color" value="${s.paintColor}">
          </label>
        </div>
        <div class="mp-room-actions">
          <button type="button" class="outline-button" id="play-mp-join">⇄ Sync Room</button>
          <button type="button" class="outline-button" id="play-mp-invite">🔗 Copy Friend Link</button>
          <label class="mp-ai-toggle"><input type="checkbox" id="play-ai-toggle" checked> AI Rivals</label>
        </div>
        <div class="mp-section-head" style="margin-top:10px">
          <b>🏆 GLOBAL RACE LEADERBOARD (DB)</b>
        </div>
        <div class="mp-leaderboard-list" id="play-leaderboard-list">
          <div class="mp-empty">Loading leaderboard…</div>
        </div>
      `;
      const speedControl = controlCard.querySelector('.play-speed-control');
      controlCard.insertBefore(hub, speedControl || controlCard.lastElementChild);

      hub.querySelectorAll('[data-play-mission]').forEach((btn) => {
        btn.addEventListener('click', () => startMissionMode(btn.dataset.playMission));
      });

      $('play-mp-callsign')?.addEventListener('change', (e) => {
        s.callsign = e.target.value.trim() || s.callsign;
        localStorage.setItem('es_callsign', s.callsign);
        syncMultiplayer();
      });

      $('play-mp-room')?.addEventListener('change', (e) => {
        s.roomCode = (e.target.value.trim() || 'NASA-GLOBAL').toUpperCase();
        s.remotePlayers.clear();
        syncMultiplayer();
        setStatus('JOINED ROOM: ' + s.roomCode);
      });

      $('play-mp-color')?.addEventListener('input', (e) => {
        s.paintColor = e.target.value || '#38bdf8';
        s.visual?.setVehicle(s.vehicle, s.paintColor);
      });

      $('play-mp-join')?.addEventListener('click', () => {
        const r = $('play-mp-room')?.value?.trim();
        if (r) s.roomCode = r.toUpperCase();
        syncMultiplayer();
        setStatus('SYNCED ROOM: ' + s.roomCode);
      });

      $('play-mp-invite')?.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('panel', 'play');
        url.searchParams.set('room', s.roomCode);
        navigator.clipboard?.writeText(url.toString()).catch(() => {});
        setStatus('INVITE LINK COPIED · ROOM ' + s.roomCode);
      });

      $('play-ai-toggle')?.addEventListener('change', (e) => {
        s.aiEnabled = !!e.target.checked;
        updateMultiplayerUi();
        s.visual?.render();
      });
    }
  }

  function cycleCameraMode() {
    const order = ['chase', 'hood', 'drone', 'topdown'];
    const nextIdx = (order.indexOf(s.camMode) + 1) % order.length;
    s.camMode = order[nextIdx];
    const btn = $('play-cam-cycle');
    if (btn) btn.textContent = `🎥 CAM: ${s.camMode.toUpperCase()} [C]`;
    if (s.map) s.map.easeTo({ ...playCameraOptions(s.pos, s.heading), duration: 280 });
    s.visual?.render();
    updatePositionHud();
  }

  function setControllerMode(mode) {
    if (!['joystick', 'wheel'].includes(mode)) return;
    s.controllerMode = mode;
    const joystick = $('drive-joystick');
    const wheel = $('mobile-wheel-controller');
    const consoleEl = $('panel-play')?.querySelector('.mobile-driving-console');
    if (joystick) joystick.hidden = mode !== 'joystick';
    if (wheel) wheel.hidden = mode !== 'wheel';
    if (consoleEl) consoleEl.dataset.mode = mode;
    document.querySelectorAll('[data-controller-mode]').forEach((b) => b.classList.toggle('active', b.dataset.controllerMode === mode));
  }

  function bind() {
    injectMultiplayerAndRacingUI();
    loadLeaderboard();

    if (s.bc) {
      s.bc.onmessage = (ev) => {
        const d = ev.data;
        if (!d || d.room_code !== s.roomCode || d.player_id === s.playerId) return;
        if (d.leave) s.remotePlayers.delete(d.player_id);
        else s.remotePlayers.set(d.player_id, d);
        updateMultiplayerUi();
        if (s.active && !s.running) s.visual?.render();
      };
    }

    setInterval(() => {
      if (s.active) syncMultiplayer(false);
    }, 1500);

    $('play-start')?.addEventListener('click', startOrPause);
    $('play-reset')?.addEventListener('click', reset);
    $('play-use-place')?.addEventListener('click', setSpawnFromSelected);

    const physics = $('play-physics-mode');
    if (physics) {
      s.physicsMode = physics.value || 'realistic';
      physics.addEventListener('change', () => {
        s.physicsMode = physics.value === 'arcade' ? 'arcade' : 'realistic';
        setStatus('PHYSICS · ' + s.physicsMode.toUpperCase());
      });
    }
    const surface = $('play-surface-mode');
    if (surface) {
      s.surface = surface.value || 'dry';
      surface.addEventListener('change', () => {
        s.surface = surface.value || 'dry';
        setStatus('SURFACE · ' + s.surface.toUpperCase());
        updateHud();
      });
    }

    const fsButton = $('play-fullscreen');
    const playPage = $('panel-play')?.querySelector('.play-lab-page');
    const updateFullscreenButton = () => {
      if (!fsButton) return;
      const on = !!(document.fullscreenElement === playPage || playPage?.classList.contains('play-fullscreen-active'));
      fsButton.textContent = on ? '⤢ EXIT FULLSCREEN' : '⛶ FULLSCREEN';
      fsButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    fsButton?.addEventListener('click', async () => {
      if (!playPage) return;
      const native = document.fullscreenElement === playPage;
      if (native) {
        try { await document.exitFullscreen(); } catch (_) {}
        playPage.classList.remove('play-fullscreen-active');
      } else {
        playPage.classList.add('play-fullscreen-active');
        try { if (playPage.requestFullscreen) await playPage.requestFullscreen(); } catch (_) {}
      }
      updateFullscreenButton();
      setTimeout(() => { s.map?.resize(); s.visual?.resize(); }, 160);
    });

    document.querySelectorAll('[data-play-map-style]').forEach((b) => b.addEventListener('click', () => setMapStyle(b.dataset.playMapStyle)));
    document.querySelectorAll('[data-play-view]').forEach((b) => b.addEventListener('click', () => setViewMode(b.dataset.playView)));
    document.querySelectorAll('[data-controller-mode]').forEach((b) => b.addEventListener('click', () => setControllerMode(b.dataset.controllerMode)));
    setControllerMode('joystick');

    const speedRange = $('play-speed-range');
    if (speedRange) {
      speedRange.max = '340';
      speedRange.value = '220';
      speedRange.addEventListener('input', (e) => {
        s.speed = Number(e.target.value) || 180;
        updateHud();
      });
    }

    document.querySelectorAll('.vehicle-pick').forEach((b) => b.addEventListener('click', () => setVehicle(b.dataset.vehicle)));
    document.querySelectorAll('[data-drive]').forEach((b) => {
      const code = b.dataset.drive;
      const on = (e) => {
        e.preventDefault();
        s.keys.add(code);
        if (s.active && !s.running) startOrPause();
        else requestFrame();
      };
      const off = (e) => {
        e.preventDefault();
        s.keys.delete(code);
      };
      b.addEventListener('pointerdown', on);
      ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, off));
    });

    const joystick = $('drive-joystick');
    const knob = $('drive-joystick-knob');
    if (joystick && knob) {
      const resetJoy = () => {
        s.joy.x = 0;
        s.joy.y = 0;
        s.joy.active = false;
        knob.style.transform = 'translate(-50%, -50%)';
      };
      const moveJoy = (e) => {
        const r = joystick.querySelector('.joystick-ring').getBoundingClientRect();
        const maxX = Math.max(1, r.width / 2 - knob.offsetWidth / 2 - 5);
        const maxY = Math.max(1, r.height / 2 - knob.offsetHeight / 2 - 5);
        s.joy.x = clamp((e.clientX - (r.left + r.width / 2)) / maxX, -1, 1);
        s.joy.y = clamp((e.clientY - (r.top + r.height / 2)) / maxY, -1, 1);
        knob.style.transform = `translate(calc(-50% + ${s.joy.x * maxX}px), calc(-50% + ${s.joy.y * maxY}px))`;
        if (!s.running && s.active) startOrPause();
        else requestFrame();
      };
      joystick.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        s.joy.active = true;
        try { joystick.setPointerCapture(e.pointerId); } catch (_) {}
        moveJoy(e);
      });
      joystick.addEventListener('pointermove', (e) => {
        if (!s.joy.active) return;
        e.preventDefault();
        moveJoy(e);
      });
      ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach((ev) =>
        joystick.addEventListener(ev, () => {
          if (!s.joy.active) return;
          resetJoy();
        })
      );
    }

    const wheel = $('drive-steering-wheel');
    if (wheel) {
      const setWheelFromPointer = (e) => {
        const rect = wheel.getBoundingClientRect();
        const radius = Math.max(40, rect.width * 0.47);
        s.joy.x = clamp((e.clientX - (rect.left + rect.width / 2)) / radius, -1, 1);
        wheel.style.transform = `rotate(${s.joy.x * 145}deg)`;
        if (!s.running && s.active) startOrPause();
        else requestFrame();
      };
      wheel.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        s.wheel.active = true;
        try { wheel.setPointerCapture(e.pointerId); } catch (_) {}
        setWheelFromPointer(e);
      });
      wheel.addEventListener('pointermove', (e) => {
        if (!s.wheel.active) return;
        e.preventDefault();
        setWheelFromPointer(e);
      });
      const endWheel = () => {
        s.wheel.active = false;
        s.joy.x = 0;
        wheel.style.transform = 'rotate(0deg)';
      };
      ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach((ev) => wheel.addEventListener(ev, endWheel));
    }

    window.addEventListener('keydown', (e) => {
      if (!s.active) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'r', 'f', 'q', 'e', 'shift', 'b', 'c', 'h', ' '].includes(k)) {
        e.preventDefault();
      }
      if (k === 'c' && !e.repeat) {
        cycleCameraMode();
        return;
      }
      if (k === 'h' && !e.repeat) {
        s.sirenOn = !s.sirenOn;
        setStatus(s.sirenOn ? '🚨 EMERGENCY SIREN ACTIVE' : 'SIREN OFF');
        return;
      }
      if (k === ' ') {
        if (!e.repeat) startOrPause();
        return;
      }
      if (k === 'escape') {
        s.keys.clear();
        s.joy.x = 0;
        s.joy.y = 0;
        s.velocity = 0;
        s.running = false;
        updateEngineAudio(0, false);
        setStatus('PAUSED');
        updateHud();
        return;
      }
      s.keys.add(k);
      if (!s.running && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'r', 'f', 'shift', 'b'].includes(k)) {
        startOrPause();
      } else {
        requestFrame();
      }
    });

    window.addEventListener('keyup', (e) => s.keys.delete(e.key.toLowerCase()));
    window.addEventListener('earthscope:panelchange', (e) => {
      s.active = e.detail?.panel === 'play';
      if (s.active) {
        initPlayMap().then(() => {
          syncMultiplayer(false);
          loadLeaderboard();
          setTimeout(() => { s.map?.resize(); s.visual?.resize(); }, 100);
        }).catch(() => {});
      } else {
        s.keys.clear();
        if (s.running) {
          s.running = false;
          updateEngineAudio(0, false);
          setStatus('PAUSED · LEFT LAB');
          updateHud();
        }
      }
    });

    window.addEventListener('earthscope:placechange', (e) => {
      const p = e.detail;
      if (!p || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lon))) return;
      s.spawn = { name: p.name || 'Selected place', lat: Number(p.lat), lon: Number(p.lon), alt: VEHICLE_SPECS[s.vehicle]?.baseAlt || 0 };
      if (!s.running) {
        s.pos = { ...s.spawn };
        generateWorldCourse(s.gameMode);
        updateHud();
        if (s.map && s.active) s.map.flyTo({ ...playCameraOptions(s.pos, 0), duration: 700 });
      }
    });

    // Auto-open 3D Expedition Lab if ?panel=play or ?room=... is in the URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('panel') === 'play' || urlParams.get('room')) {
      setTimeout(() => {
        document.querySelector('.nav-item[data-panel="play"]')?.click();
      }, 350);
    }
  }

  window.EARTHSCOPE_PLAYLAB = {
    teleportToHazard,
    startMissionMode,
    cycleCameraMode,
  };

  window.addEventListener('resize', () => {
    if (s.active) {
      s.map?.resize();
      s.visual?.resize();
    }
  }, { passive: true });

  bind();
})();
