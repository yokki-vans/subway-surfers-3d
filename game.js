// ============================
// SUBWAY SURFERS 3D - Main Game
// ============================

import * as THREE from 'three';

// ================= CONFIGURATION =================
const CFG = {
    // Track
    LANE_WIDTH: 2.4,
    LANES: [-1, 0, 1],
    PATH_LENGTH: 12,
    SEGMENTS_AHEAD: 75,
    WALL_DISTANCE: 7.0,
    WALL_HEIGHT: 8.0,
    WALL_THICKNESS: 0.5,
    
    // Curve (radial X curve + subtle Y wave)
    CURVE_FREQ: 0.025,
    CURVE_AMP: 4.0,
    CURVE_Y_FREQ: 0.015,
    CURVE_Y_AMP: 0.5,
    
    // Player
    PLAYER_SPEED_BASE: 16,
    PLAYER_SPEED_MAX: 42,
    SPEED_RAMP_TIME: 120,
    GRAVITY: 28,
    JUMP_VELOCITY: 11.5,
    ROLL_DURATION: 0.6,
    LANE_SWITCH_TIME: 0.18,
    
    // Camera
    CAMERA_HEIGHT: 3.5,
    CAMERA_DISTANCE: 5.0,
    CAM_LERP_SPEED: 12,
    
    // Gameplay
    OBSTACLE_SPAWN_CHANCE: 0.35,
    COIN_SPAWN_CHANCE: 0.5,
    POWERUP_SPAWN_CHANCE: 0.08,
    MIN_GAP_BETWEEN_OBSTACLES: 24,
    COIN_VALUE: 10,
    SCORE_PER_METER: 1,
    
    // Biomes (dynamic weather, day/night)
    BIOME_LENGTH: 2000,
    
    // Colors (warm Subway Surfers palette)
    COLORS: {
        SKY_DAY: 0x5b9ee0,
        SKY_NIGHT: 0x1a2a4a,
        SKY_SUNSET: 0xff6b35,
        WALL: 0xd94f2a,
        WALL_TOP: 0xc04428,
        HEDGE: 0x4abf6c,
        HEDGE_DARK: 0x3aab5c,
        ROAD: 0xbabb8a,
        ROAD_EDGE: 0x9a8a60,
        RAIL: 0xaaaaaa,
        SLEEPER: 0x664411,
        GROUND: 0x7ec860,
        COIN: 0xffdd44,
        COIN_EMISSIVE: 0xffcc00,
        OBSTACLE: 0xff5533,
        PLAYER_BODY: 0x3388ee,
        PLAYER_ACCENT: 0xffdd44,
        POWERUP_MAGNET: 0x66ddff,
        POWERUP_JETPACK: 0xff8844,
        POWERUP_BOOST: 0x44ff88,
        BUILDING_1: 0x9a8a7a,
        BUILDING_2: 0xaa9a8a,
        BUILDING_3: 0x8a7a6a,
    },
    
    // Particle
    MAX_PARTICLES: 200,
};

// ================= GLOBAL STATE =================
let scene, camera, renderer;
let playerGroup, playerVisual;
let playerZ = 0;
let playerX = 0;
let targetLane = 1;
let playerY = 0;
let playerVY = 0;
let isJumping = false;
let isRolling = false;
let rollTimer = 0;
let laneSwitchProgress = 0;
let speed = CFG.PLAYER_SPEED_BASE;
let score = 0;
let coins = 0;
let distance = 0;
let multiplier = 1;
let multiplierTimer = 0;
let highScore = parseInt(localStorage.getItem('subway3d_highscore') || '0');
let totalCoins = parseInt(localStorage.getItem('subway3d_totalcoins') || '0');

let segments = [];
let obstacles = [];
let coins3d = [];
let powerups = [];
let particles = [];
let buildings = [];

let keys = { left: false, right: false, up: false, down: false };
let keyQueue = [];
let gameState = 'loading'; // loading, menu, playing, paused, gameover
let lastTime = 0;
let biomeIndex = 0;
let biomeProgress = 0;
let weatherIntensity = 0; // 0-1
let timeOfDay = 0.3; // 0=night, 0.25=morning, 0.3=bright morning, 0.5=day
let audioContext = null;
let isMuted = false;
let isPaused = false;
let shakeIntensity = 0;

// Curve functions
function trackCurve(z) {
    const x = Math.sin(z * CFG.CURVE_FREQ) * CFG.CURVE_AMP
            + Math.sin(z * CFG.CURVE_FREQ * 0.6) * 0.8;
    const y = Math.sin(z * CFG.CURVE_Y_FREQ) * CFG.CURVE_Y_AMP;
    const angle = Math.atan2(
        Math.sin((z+2)*CFG.CURVE_FREQ)*CFG.CURVE_AMP - Math.sin((z-2)*CFG.CURVE_FREQ)*CFG.CURVE_AMP,
        4
    ) * 0.4;
    return { x, y, angle };
}

function getLaneLocalX(lane) {
    return (lane - 1) * CFG.LANE_WIDTH;
}

// ================= INITIALIZATION =================
async function init() {
    const loadingText = document.getElementById('loading-text');
    const loadingScreen = document.getElementById('loading-screen');
    
    // Setup scene
    scene = new THREE.Scene();
    
    // Renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 2.2;  // Even brighter
    document.getElementById('canvas-wrap').appendChild(renderer.domElement);
    
    // Camera
    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, CFG.CAMERA_HEIGHT, -CFG.CAMERA_DISTANCE);
    camera.lookAt(0, 0.8, 12);
    
    // Initial biome colors
    updateBiomeColors();
    
    // Lights
        setupLights();
        updateLights();  // Apply initial lighting based on timeOfDay

        // Build environment (buildings, etc)
    buildEnvironment();
    
    // Player
    createPlayer();
    
    // Initial track segments
    for (let i = 0; i < CFG.SEGMENTS_AHEAD; i++) {
        generateSegment(i * CFG.PATH_LENGTH);
    }
    
    // Input
    setupInput();
    setupTapZones();
    setupButtons();
    
    // Resize
    window.addEventListener('resize', onResize);
    
    // Start game loop
    loadingScreen.classList.add('hidden');
    showMenu();
    
    requestAnimationFrame(animate);
    
    loadingText.textContent = 'Ready!';
}

// ================= LIGHTS =================
const lights = {};
function setupLights() {
    // Hemisphere - sky/ground blend
    lights.hemi = new THREE.HemisphereLight(0xfff0dd, 0xaa8866, 1.0);
    scene.add(lights.hemi);
    
    // Directional - warm sun (will follow player)
    lights.dir = new THREE.DirectionalLight(0xffffee, 1.6);
    lights.dir.position.set(0, 20, 10);
    lights.dir.target.position.set(0, 0, 0);
    lights.dir.castShadow = true;
    lights.dir.shadow.mapSize.set(1024, 1024);
    lights.dir.shadow.camera.near = 5;
    lights.dir.shadow.camera.far = 80;
    lights.dir.shadow.camera.left = -30;
    lights.dir.shadow.camera.right = 30;
    lights.dir.shadow.camera.top = 30;
    lights.dir.shadow.camera.bottom = -30;
    lights.dir.shadow.bias = -0.0005;
    scene.add(lights.dir);
    scene.add(lights.dir.target);
    
    // Ambient fill
    lights.ambient = new THREE.AmbientLight(0xffead0, 0.7);
    scene.add(lights.ambient);
}

function updateLights() {
    // Day/night cycle
    const dayFactor = Math.sin(timeOfDay * Math.PI);
    const isDay = dayFactor > 0;
    
    lights.hemi.intensity = Math.max(0.8, 0.4 + dayFactor * 0.4);
    lights.hemi.color.setHex(isDay ? 0xfff0dd : 0x555566);
    lights.hemi.groundColor.setHex(isDay ? 0xaa8866 : 0x222233);
    
    lights.dir.intensity = Math.max(1.0, 0.5 + Math.max(0, dayFactor) * 0.8);
    lights.dir.color.setHex(isDay ? 0xffffee : 0x665544);
    
    // Follow player
    if (playerGroup) {
        lights.dir.target.position.set(playerGroup.position.x, 0, playerZ + 20);
    }
    
    lights.ambient.intensity = Math.max(0.5, 0.2 + dayFactor * 0.3);
}

// ================= ENVIRONMENT (Buildings) =================
function buildEnvironment() {
    const buildingColors = [
        CFG.COLORS.BUILDING_1,
        CFG.COLORS.BUILDING_2,
        CFG.COLORS.BUILDING_3,
    ];
    
    // Create buildings once - far behind walls
    for (let side = -1; side <= 1; side += 2) {
        const numBuildings = 8;
        for (let i = 0; i < numBuildings; i++) {
            const bHeight = 6 + Math.random() * 12;
            const bWidth = 3 + Math.random() * 5;
            const bDepth = CFG.PATH_LENGTH * 2 + 8;
            
            const geo = new THREE.BoxGeometry(bWidth, bHeight, bDepth);
            const mat = new THREE.MeshStandardMaterial({
                color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
                roughness: 0.75,
                metalness: 0.08,
            });
            
            const building = new THREE.Mesh(geo, mat);
            building.position.set(
                side * (CFG.WALL_DISTANCE + bWidth / 2 + 1 + Math.random() * 4),
                bHeight / 2,
                (Math.random() - 0.5) * CFG.PATH_LENGTH * CFG.SEGMENTS_AHEAD
            );
            building.castShadow = true;
            building.receiveShadow = true;
            scene.add(building);
            buildings.push(building);
            
            // Windows
            addWindows(building, bWidth, bHeight, bDepth, side);
        }
    }
}

function addWindows(building, width, height, depth, side) {
    const winGeo = new THREE.BoxGeometry(0.7, 1.1, 0.08);
    for (let wy = 1; wy < height - 1; wy += 2) {
        for (let wx = -width / 2 + 0.8; wx <= width / 2 - 0.5; wx += 1.6) {
            const emissive = Math.random() < 0.3 ? 0x445577 : 0x000000;
            const winMat = new THREE.MeshStandardMaterial({
                color: 0xccddff,
                emissive: emissive,
                emissiveIntensity: emissive ? 0.3 : 0,
            });
            const win = new THREE.Mesh(winGeo, winMat);
            win.position.set(
                building.position.x - side * (width / 2 + 0.45),
                wy - height / 2 + building.position.y,
                building.position.z
            );
            scene.add(win);
        }
    }
}

// ================= TRACK SEGMENTS =================
function generateSegment(z) {
    const group = new THREE.Group();
    const curve = trackCurve(z);
    
    group.position.set(curve.x, curve.y, z);
    group.rotation.y = curve.angle;
    
    const corridorW = CFG.LANE_WIDTH * 3 + 2.4;
    const wallH = CFG.WALL_HEIGHT;
    const segLen = CFG.PATH_LENGTH;
    const overlap = 3;
    const wallLen = segLen + overlap * 2;
    
    // Ground
    const groundMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.GROUND,
        roughness: 0.9,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(corridorW + 4, segLen), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    group.add(ground);
    
    // Road surface
    const roadMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.ROAD, 
        roughness: 0.8 
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(corridorW * 0.7, segLen), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.02;
    road.receiveShadow = true;
    group.add(road);
    
    // Road edge strips
    const edgeMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.ROAD_EDGE, 
        roughness: 0.9 
    });
    for (let side = -1; side <= 1; side += 2) {
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.2, segLen), edgeMat);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(side * corridorW * 0.35, 0.03, 0);
        group.add(edge);
    }
    
    // Lanes lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    for (let lane = 0; lane < 2; lane++) {
        const lineX = (lane - 0.5) * CFG.LANE_WIDTH;
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, segLen), lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(lineX, 0.04, 0);
        group.add(line);
    }
    
    // Rails (3 lanes, 2 rails each)
    const railMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.RAIL, 
        metalness: 0.6, 
        roughness: 0.4 
    });
    for (let lane = -1; lane <= 1; lane++) {
        const railX = lane * CFG.LANE_WIDTH;
        for (let side = -1; side <= 1; side += 2) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, segLen), railMat);
            rail.position.set(railX + side * 0.3, 0.04, 0);
            rail.castShadow = true;
            group.add(rail);
        }
    }
    
    // Sleepers
    const sleeperMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.SLEEPER,
        roughness: 0.9,
    });
    const sleeperCount = Math.floor(segLen / 2.5);
    for (let i = 0; i < sleeperCount; i++) {
        const sz = -segLen / 2 + (i + 0.5) * (segLen / sleeperCount);
        const sleeper = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.3), sleeperMat);
        sleeper.position.set(0, 0.05, sz);
        sleeper.castShadow = true;
        group.add(sleeper);
    }
    
    // Walls (longer for overlap)
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.WALL, 
        roughness: 0.6 
    });
    const halfW = corridorW / 2 + 0.3;
    
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(CFG.WALL_THICKNESS, wallH, wallLen), wallMat);
    leftWall.position.set(-halfW, wallH / 2, 0);
    leftWall.rotation.z = 0.05; // inward lean
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    group.add(leftWall);
    
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(CFG.WALL_THICKNESS, wallH, wallLen), wallMat);
    rightWall.position.set(halfW, wallH / 2, 0);
    rightWall.rotation.z = -0.05;
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    group.add(rightWall);
    
    // Wall top band
    const wallTopMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.WALL_TOP, 
        roughness: 0.6 
    });
    for (let side = -1; side <= 1; side += 2) {
        const top = new THREE.Mesh(new THREE.BoxGeometry(CFG.WALL_THICKNESS, 0.8, wallLen), wallTopMat);
        top.position.set(side * halfW, wallH - 0.4, 0);
        top.rotation.z = side * 0.05;
        group.add(top);
    }
    
    // Hedge on top of walls
    const hedgeMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.HEDGE, 
        roughness: 0.8 
    });
    const hedgeDarkMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.HEDGE_DARK, 
        roughness: 0.8 
    });
    for (let side = -1; side <= 1; side += 2) {
        const hedgeCount = Math.floor(wallLen / 1.5);
        for (let h = 0; h < hedgeCount; h++) {
            const hz = -wallLen / 2 + (h + 0.5) * (wallLen / hedgeCount);
            const bushGeo = new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.3, 0);
            const bush = new THREE.Mesh(bushGeo, Math.random() < 0.5 ? hedgeMat : hedgeDarkMat);
            bush.position.set(
                side * halfW + side * Math.random() * 0.4,
                wallH - 0.2 + Math.random() * 0.5,
                hz
            );
            bush.scale.setScalar(0.7 + Math.random() * 0.5);
            bush.castShadow = true;
            group.add(bush);
            
            // Companion bush
            const bush2Geo = new THREE.IcosahedronGeometry(0.4 + Math.random() * 0.2, 0);
            const bush2 = new THREE.Mesh(bush2Geo, Math.random() < 0.5 ? hedgeMat : hedgeDarkMat);
            bush2.position.set(
                side * halfW + side * 0.6,
                wallH - 0.5,
                hz + 0.3
            );
            bush2.scale.setScalar(0.6 + Math.random() * 0.4);
            bush2.castShadow = true;
            group.add(bush2);
        }
    }
    
    // Overhead frames every ~8 units
    const frameMat = new THREE.MeshStandardMaterial({ 
        color: 0x6a4e3c, 
        roughness: 0.5, 
        metalness: 0.35 
    });
    const frameSpacing = 8;
    for (let zOff = -segLen/2 + 2; zOff < segLen/2; zOff += frameSpacing) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(corridorW + 1, 0.08, 0.1), frameMat);
        frame.position.set(0, wallH + 0.5, zOff);
        frame.castShadow = true;
        group.add(frame);
        
        // Vertical poles
        for (let side = -1; side <= 1; side += 2) {
            const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, wallH + 1, 6);
            const poleMat = new THREE.MeshStandardMaterial({ 
                color: 0x5a4a3c, 
                roughness: 0.5, 
                metalness: 0.3 
            });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(side * halfW * 0.9, (wallH + 0.5) / 2, zOff);
            pole.castShadow = true;
            group.add(pole);
        }
    }
    
    // Hanging wires (CatmullRom sag)
    for (let side = -1; side <= 1; side += 2) {
        const wireCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * halfW * 0.9, wallH + 0.6, -segLen/2),
            new THREE.Vector3(0, wallH - 0.3, 0),
            new THREE.Vector3(-side * halfW * 0.9, wallH + 0.6, segLen/2),
        ]);
        const wireGeo = new THREE.TubeGeometry(wireCurve, 12, 0.03, 4, false);
        const wireMat = new THREE.MeshStandardMaterial({ 
            color: 0x8a8a8a, 
            metalness: 0.6,
            roughness: 0.4 
        });
        const wire = new THREE.Mesh(wireGeo, wireMat);
        group.add(wire);
    }
    
    // Store segment
    segments.push({ group, z });
    scene.add(group);
}

// Cleanup old segments
function cleanupSegments() {
    while (segments.length > 0 && segments[0].z < playerZ - 30) {
        const seg = segments.shift();
        scene.remove(seg.group);
        seg.group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }
}

// ================= PLAYER =================
function createPlayer() {
    playerGroup = new THREE.Group();
    playerVisual = new THREE.Group();
    playerGroup.add(playerVisual);
    scene.add(playerGroup);
    
    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.PLAYER_BODY,
        roughness: 0.3,
        metalness: 0.2,
    });
    const accentMat = new THREE.MeshStandardMaterial({ 
        color: CFG.COLORS.PLAYER_ACCENT,
        roughness: 0.2,
        metalness: 0.8,
    });
    const skinMat = new THREE.MeshStandardMaterial({ 
        color: 0xffdbac,
        roughness: 0.7,
    });
    const hairMat = new THREE.MeshStandardMaterial({ 
        color: 0x2a1a0a,
        roughness: 0.6,
    });
    const shoeMat = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a2e,
        roughness: 0.5,
        metalness: 0.3,
    });
    
    // Body (torso)
    const torsoGeo = new THREE.CapsuleGeometry(0.45, 0.7, 4, 8);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    playerVisual.add(torso);
    
    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.75;
    head.castShadow = true;
    playerVisual.add(head);
    
    // Hair
    const hairGeo = new THREE.SphereGeometry(0.37, 16, 16);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 1.78;
    hair.scale.y = 0.6;
    playerVisual.add(hair);
    
    // Cap (accent color)
    const capGeo = new THREE.CylinderGeometry(0.38, 0.35, 0.15, 16);
    const cap = new THREE.Mesh(capGeo, accentMat);
    cap.position.y = 1.95;
    playerVisual.add(cap);
    
    // Cap brim
    const brimGeo = new THREE.CylinderGeometry(0.48, 0.42, 0.05, 16);
    const brim = new THREE.Mesh(brimGeo, accentMat);
    brim.position.y = 1.88;
    playerVisual.add(brim);
    
    // Arms (pivot-based)
    const arms = [];
    for (let side = -1; side <= 1; side += 2) {
        const armPivot = new THREE.Group();
        armPivot.position.set(side * 0.55, 1.3, 0.05); // shoulder
        
        const armGeo = new THREE.CapsuleGeometry(0.12, 0.5, 4, 8);
        const arm = new THREE.Mesh(armGeo, bodyMat);
        arm.position.set(0, -0.25, 0);
        armPivot.add(arm);
        
        // Hand
        const handGeo = new THREE.SphereGeometry(0.13, 8, 8);
        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.position.set(0, -0.55, 0.05);
        armPivot.add(hand);
        
        playerVisual.add(armPivot);
        arms.push({ pivot: armPivot, side });
    }
    
    // Legs (pivot-based)
    const legs = [];
    for (let side = -1; side <= 1; side += 2) {
        const legPivot = new THREE.Group();
        legPivot.position.set(side * 0.2, 0.82, 0.02); // hip
        
        const legGeo = new THREE.CapsuleGeometry(0.14, 0.56, 4, 8);
        const leg = new THREE.Mesh(legGeo, bodyMat);
        leg.position.set(0, -0.28, 0);
        legPivot.add(leg);
        
        // Shoe
        const shoeGeo = new THREE.BoxGeometry(0.18, 0.1, 0.3);
        const shoe = new THREE.Mesh(shoeGeo, shoeMat);
        shoe.position.set(0, -0.58, 0.16);
        legPivot.add(shoe);
        
        playerVisual.add(legPivot);
        legs.push({ pivot: legPivot, shoe, side });
    }
    
    // Backpack (visual flair)
    const packGeo = new THREE.BoxGeometry(0.3, 0.4, 0.15);
    const pack = new THREE.Mesh(packGeo, accentMat);
    pack.position.set(0, 1.1, -0.45);
    playerVisual.add(pack);
    
    // Store references for animation
    playerVisual.userData = { arms, legs, torso, head, hair, cap };
    
    // Initial position
    playerGroup.position.set(0, 0, 0);
    playerZ = 0;
    playerX = getLaneLocalX(targetLane);
}

function updatePlayer(dt) {
    const data = playerVisual.userData;
    
    // Forward movement
    playerZ += speed * dt;
    playerGroup.position.z = playerZ;
    
    // Lane switching (smooth)
    const targetX = getLaneLocalX(targetLane);
    const curve = trackCurve(playerZ);
    const curveX = curve.x;
    
    playerX += (targetX - playerX) * Math.min(dt * (1 / CFG.LANE_SWITCH_TIME), 1);
    playerGroup.position.x = curveX + playerX;
    playerGroup.position.y = curve.y; // vertical track wave
    
    // Vertical motion (jump/roll)
    if (isJumping) {
        playerVY -= CFG.GRAVITY * dt;
        playerY += playerVY * dt;
        
        if (playerY <= 0) {
            playerY = 0;
            playerVY = 0;
            isJumping = false;
            playSound('land');
        }
    }
    
    if (isRolling) {
        rollTimer -= dt;
        if (rollTimer <= 0) {
            isRolling = false;
        }
    }
    
    // Apply vertical position
    const visualY = isRolling ? 0.3 : playerY;
    playerVisual.position.y = visualY;
    
    // Lane lean (visual only)
    const laneError = targetX - playerX;
    const leanTarget = THREE.MathUtils.clamp(-laneError * 0.025, -0.035, 0.035);
    const yawTarget = THREE.MathUtils.clamp(laneError * 0.018, -0.035, 0.035);
    
    playerVisual.rotation.z = THREE.MathUtils.lerp(playerVisual.rotation.z, leanTarget, Math.min(dt * 14, 1));
    playerVisual.rotation.y = THREE.MathUtils.lerp(playerVisual.rotation.y, yawTarget, Math.min(dt * 10, 1));
    playerGroup.rotation.set(0, 0, 0);
    
    // Run animation
    const speedRatio = THREE.MathUtils.clamp(speed / CFG.PLAYER_SPEED_BASE, 0.8, 2.2);
    const runSpeed = 8.5 + speedRatio * 2.8;
    let runCycle = (playerVisual.userData.runCycle || 0) + dt * runSpeed;
    playerVisual.userData.runCycle = runCycle;
    
    // Animate legs
    data.legs.forEach(leg => {
        const phase = runCycle + (leg.side > 0 ? 0 : Math.PI);
        const swing = Math.sin(phase);
        const footLift = Math.max(0, -Math.cos(phase)) * 0.06;
        
        if (!isJumping && !isRolling) {
            leg.pivot.rotation.x = swing * 0.62;
            leg.pivot.rotation.z = leg.side * Math.cos(phase) * 0.025;
            leg.pivot.position.y = 0.82 + footLift;
            leg.shoe.rotation.x = -swing * 0.28;
        } else if (isJumping) {
            leg.pivot.rotation.x = -0.3;
            leg.shoe.rotation.x = 0.2;
        } else if (isRolling) {
            leg.pivot.rotation.x = -0.8;
            leg.shoe.rotation.x = 0.4;
        }
    });
    
    // Animate arms
    data.arms.forEach(arm => {
        const phase = runCycle + (arm.side > 0 ? Math.PI : 0);
        const swing = Math.sin(phase);
        
        if (!isRolling) {
            arm.pivot.rotation.x = swing * 0.5;
            arm.pivot.rotation.z = arm.side * 0.1;
        } else {
            arm.pivot.rotation.x = 1.2;
            arm.pivot.rotation.z = arm.side * 0.3;
        }
    });
    
    // Body bob
    if (!isJumping && !isRolling) {
        data.torso.position.y = 1.0 + Math.sin(runCycle * 2) * 0.03 * speedRatio;
        data.head.position.y = 1.75 + Math.sin(runCycle * 2) * 0.02 * speedRatio;
        data.hair.position.y = 1.78 + Math.sin(runCycle * 2) * 0.02 * speedRatio;
        data.cap.position.y = 1.95 + Math.sin(runCycle * 2) * 0.02 * speedRatio;
    }
    
    // Speed ramp
    const rampProgress = Math.min(distance / CFG.SPEED_RAMP_TIME, 1);
    speed = THREE.MathUtils.lerp(CFG.PLAYER_SPEED_BASE, CFG.PLAYER_SPEED_MAX, rampProgress * rampProgress);
    
    // Update multiplier
    if (multiplierTimer > 0) {
        multiplierTimer -= dt;
        if (multiplierTimer <= 0) {
            multiplier = 1;
            document.getElementById('multiplier').classList.add('hidden');
        }
    }
}
// ================= OBSTACLES =================
const OBSTACLE_TYPES = {
    barrier: {
        height: 0.52,
        depth: 1.2,
        width: 2.0,
        clearance: 1.0,
        action: 'jump',
        color: 0xff5533,
        glowColor: 0xff4400,
        build: (group, mats) => {
            // Main bar
            const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.2), mats.body);
            bar.position.set(0, 0.75, 0);
            bar.castShadow = true;
            group.add(bar);
            
            // Supports
            for (let x = -0.9; x <= 0.9; x += 1.8) {
                const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6), mats.support);
                sup.position.set(x, 0.75, 0);
                sup.castShadow = true;
                group.add(sup);
            }
            
            // Warning stripes
            const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
            for (let i = 0; i < 4; i++) {
                const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.12), stripeMat);
                stripe.position.set(0, 0.5 + i * 0.15, 0.61);
                stripe.rotation.x = -Math.PI / 2 * 0.1;
                group.add(stripe);
            }
        }
    },
    train: {
        height: 2.8,
        depth: 6,
        width: 2.2,
        clearance: Infinity,
        action: 'switch',
        color: 0x222233,
        glowColor: 0xff0000,
        build: (group, mats) => {
            // Main body
            const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 6), mats.body);
            body.position.set(0, 1.3, 0);
            body.castShadow = true;
            group.add(body);
            
            // Windows
            const winMat = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.6 });
            for (let i = 0; i < 5; i++) {
                const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), winMat);
                win.position.set(-0.9, 1.5, -2 + i * 1.2 + 0.01);
                group.add(win);
                const win2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), winMat);
                win2.position.set(0.9, 1.5, -2 + i * 1.2 + 0.01);
                win2.rotation.y = Math.PI;
                group.add(win2);
            }
            
            // Red X on front/back
            const xMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const xGeo = new THREE.PlaneGeometry(1.2, 1.2);
            const x1 = new THREE.Mesh(xGeo, xMat);
            x1.position.set(0, 1.3, -3.01);
            group.add(x1);
            const x2 = new THREE.Mesh(xGeo, xMat);
            x2.position.set(0, 1.3, 3.01);
            x2.rotation.y = Math.PI;
            group.add(x2);
            
            // Flashing lights on top corners
            for (let x = -1.1; x <= 1.1; x += 2.2) {
                for (let z = -2.8; z <= 2.8; z += 5.6) {
                    const light = new THREE.Mesh(
                        new THREE.SphereGeometry(0.12, 8, 8),
                        new THREE.MeshBasicMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 })
                    );
                    light.position.set(x, 2.7, z);
                    light.userData = { isFlasher: true, offset: Math.random() * Math.PI * 2 };
                    group.add(light);
                }
            }
        }
    },
    low_barrier: {
        height: 0.8,
        depth: 0.8,
        width: 2.4,
        clearance: 1.2,
        action: 'jump',
        color: 0xff8833,
        glowColor: 0xff6600,
        build: (group, mats) => {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.8), mats.body);
            bar.position.set(0, 0.4, 0);
            bar.castShadow = true;
            group.add(bar);
            
            // Rounded top
            const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 8), mats.body);
            top.position.set(0, 0.9, 0);
            top.rotation.x = Math.PI / 2;
            group.add(top);
        }
    }
};

function createObstacle(typeName, lane, z) {
    const type = OBSTACLE_TYPES[typeName];
    const group = new THREE.Group();
    
    const mats = {
        body: new THREE.MeshStandardMaterial({ 
            color: type.color,
            roughness: 0.45,
            metalness: 0.2,
        }),
        support: new THREE.MeshStandardMaterial({ 
            color: 0x444444,
            roughness: 0.5,
            metalness: 0.6,
        }),
    };
    
    type.build(group, mats);
    
    // Glow outline
    const glowGeo = new THREE.BoxGeometry(type.width + 0.1, type.height + 0.1, type.depth + 0.1);
    const glowMat = new THREE.MeshBasicMaterial({ 
        color: type.glowColor, 
        transparent: true, 
        opacity: 0,
        side: THREE.BackSide 
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = type.height / 2;
    group.add(glow);
    group.userData.glow = glow;
    
    // Position
    const curve = trackCurve(z);
    const localX = getLaneLocalX(lane);
    group.position.set(curve.x + localX, type.height / 2 + curve.y, z);
    group.rotation.y = curve.angle;
    
    // Store data
    group.userData = {
        type: typeName,
        lane,
        z,
        height: type.height,
        depth: type.depth,
        width: type.width,
        clearance: type.clearance,
        action: type.action,
        clearedByJump: false,
    };
    
    obstacles.push({ group, z, ...group.userData });
    scene.add(group);
}

function updateObstacles(dt) {
    // Move obstacles (they're stationary in world, player moves forward)
    // Cleanup behind player
    while (obstacles.length > 0 && obstacles[0].z < playerZ - 20) {
        const obs = obstacles.shift();
        scene.remove(obs.group);
        obs.group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }
    
    // Animate flashers
    obstacles.forEach(obs => {
        obs.group.traverse(obj => {
            if (obj.userData.isFlasher) {
                const t = performance.now() * 0.005 + obj.userData.offset;
                obj.material.opacity = 0.3 + Math.sin(t * 8) * 0.3;
                obj.material.emissiveIntensity = 1 + Math.sin(t * 8) * 1;
            }
            if (obj.userData.glow) {
                // Glow pulses when player approaches
                const dx = Math.abs(playerGroup.position.x - obs.group.position.x);
                const dz = obs.group.position.z - playerZ;
                if (dz > 0 && dz < 15 && dx < 3) {
                    obj.userData.glow.material.opacity = 0.15 + Math.sin(performance.now() * 0.01) * 0.1;
                } else {
                    obj.userData.glow.material.opacity = 0;
                }
            }
        });
    });
}

// ================= COINS =================
function createCoin(lane, z, heightOffset = 0) {
    const group = new THREE.Group();
    
    const coinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 16);
    const coinMat = new THREE.MeshStandardMaterial({
        color: CFG.COLORS.COIN,
        emissive: CFG.COLORS.COIN_EMISSIVE,
        emissiveIntensity: 1.2,
        metalness: 0.85,
        roughness: 0.1,
    });
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    group.add(coin);
    
    // Glow ring
    const glowGeo = new THREE.RingGeometry(0.35, 0.6, 16);
    const glowMat = new THREE.MeshBasicMaterial({ 
        color: 0xffaa44, 
        transparent: true, 
        opacity: 0.35, 
        side: THREE.DoubleSide 
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.z = -0.04;
    group.add(glow);
    
    // "$" text (simple geometry)
    const signGeo = new THREE.PlaneGeometry(0.3, 0.3);
    const signMat = new THREE.MeshBasicMaterial({ 
        color: 0xffcc00, 
        transparent: true, 
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    // Use a simple mesh as placeholder for the symbol
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.rotation.x = -Math.PI / 2;
    sign.position.z = 0.04;
    group.add(sign);
    
    // Position
    const curve = trackCurve(z);
    const localX = getLaneLocalX(lane);
    const yBase = 1.2 + heightOffset + Math.sin(z * 0.4) * 0.6;
    group.position.set(curve.x + localX, curve.y + yBase, z);
    group.rotation.y = curve.angle;
    
    group.userData = {
        lane,
        z,
        collected: false,
        bobOffset: Math.random() * Math.PI * 2,
        spinSpeed: 1.5 + Math.random() * 1,
    };
    
    coins3d.push({ group, z, ...group.userData });
    scene.add(group);
}

function updateCoins(dt) {
    while (coins3d.length > 0 && coins3d[0].z < playerZ - 20) {
        const coin = coins3d.shift();
        scene.remove(coin.group);
        coin.group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }
    
    coins3d.forEach(coin => {
        // Spin
        coin.group.rotation.y += dt * coin.group.userData.spinSpeed;
        
        // Bob
        const bob = Math.sin(performance.now() * 0.003 + coin.group.userData.bobOffset) * 0.15;
        coin.group.position.y += bob * dt * 10;
        coin.group.position.y -= bob * dt * 10; // reset handled by position set
        
        // Actually set position with bob
        const curve = trackCurve(coin.z);
        const localX = getLaneLocalX(coin.lane);
        coin.group.position.x = curve.x + localX;
        coin.group.position.y = curve.y + 1.2 + Math.sin(coin.z * 0.4) * 0.6 + Math.sin(performance.now() * 0.003 + coin.group.userData.bobOffset) * 0.15;
        coin.group.rotation.y = curve.angle + performance.now() * 0.001 * coin.group.userData.spinSpeed;
    });
}

// ================= POWER-UPS =================
const POWERUP_TYPES = {
    magnet: {
        color: CFG.COLORS.POWERUP_MAGNET,
        symbol: 'M',
        duration: 8,
        build: (group, mat) => {
            const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
            const mesh = new THREE.Mesh(geo, mat);
            group.add(mesh);
            
            // U-shape magnet
            const uGeo = new THREE.TorusGeometry(0.25, 0.06, 8, 16, Math.PI);
            const uMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            for (let i = 0; i < 2; i++) {
                const u = new THREE.Mesh(uGeo, uMat);
                u.rotation.x = Math.PI / 2;
                u.position.set(i === 0 ? -0.15 : 0.15, 0, 0.2);
                u.rotation.z = i === 0 ? 0 : Math.PI;
                group.add(u);
            }
        }
    },
    jetpack: {
        color: CFG.COLORS.POWERUP_JETPACK,
        symbol: 'J',
        duration: 6,
        build: (group, mat) => {
            const bodyGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.7, 8);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.35;
            group.add(body);
            
            // Exhaust
            const exhGeo = new THREE.ConeGeometry(0.1, 0.3, 8);
            const exh = new THREE.Mesh(exhGeo, new THREE.MeshBasicMaterial({ color: 0xff4400, emissive: 0xff4400 }));
            exh.rotation.x = Math.PI;
            exh.position.y = -0.05;
            group.add(exh);
        }
    },
    boost: {
        color: CFG.COLORS.POWERUP_BOOST,
        symbol: 'B',
        duration: 5,
        build: (group, mat) => {
            const geo = new THREE.OctahedronGeometry(0.35, 0);
            const mesh = new THREE.Mesh(geo, mat);
            group.add(mesh);
        }
    }
};

function createPowerup(typeName, lane, z) {
    const type = POWERUP_TYPES[typeName];
    const group = new THREE.Group();
    
    const mat = new THREE.MeshStandardMaterial({
        color: type.color,
        emissive: type.color,
        emissiveIntensity: 0.8,
        metalness: 0.7,
        roughness: 0.2,
    });
    
    type.build(group, mat);
    
    // Glow aura
        const auraGeo = new THREE.SphereGeometry(0.6, 16, 16);
        const auraMat = new THREE.MeshBasicMaterial({
            color: type.color,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide,
        });
        const aura = new THREE.Mesh(auraGeo, auraMat);
        group.add(aura);

        const curve = trackCurve(z);
        const localX = getLaneLocalX(lane);
        group.position.set(curve.x + localX, curve.y + 1.8, z);
        group.rotation.y = curve.angle;

        group.userData = {
            type: typeName,
            lane,
            z,
            collected: false,
            duration: type.duration,
            spinOffset: Math.random() * Math.PI * 2,
            aura: aura,
        };
    
    powerups.push({ group, z, ...group.userData });
    scene.add(group);
}

function updatePowerups(dt) {
    while (powerups.length > 0 && powerups[0].z < playerZ - 20) {
        const p = powerups.shift();
        scene.remove(p.group);
        p.group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }
    
    powerups.forEach(p => {
        // Spin and hover
        p.group.rotation.y += dt * 2;
        p.group.position.y += Math.sin(performance.now() * 0.003 + p.spinOffset) * 0.01;
        if (p.group.userData.aura) {
            p.group.userData.aura.scale.setScalar(1 + Math.sin(performance.now() * 0.005) * 0.1);
        }
    });
}
// ================= COLLISION DETECTION =================
function checkCollisions() {
    const py = playerY + trackCurve(playerZ).y; // world feet Y including track wave
    const px = playerGroup.position.x; // world X including curve
    const pz = playerZ;
    
    // Player footprint
    const pHalfW = 0.35;
    const pHalfD = isRolling ? 0.6 : 0.4;
    const pHeight = isRolling ? 0.6 : (isJumping ? 1.8 : 2.0);
    
    // Check obstacles
    for (const obs of obstacles) {
        const ox = obs.group.position.x;
        const oz = obs.z;
        const oh = obs.height;
        const od = obs.depth;
        const ow = obs.width;
        
        // X overlap
        const xOverlap = Math.abs(px - ox) < (pHalfW + ow / 2 + 0.1);
        // Z overlap
        const zOverlap = pz + pHalfD > oz - od / 2 && pz - pHalfD < oz + od / 2;
        
        if (xOverlap && zOverlap) {
            const frontDist = (oz - od / 2) - (pz + pHalfD); // distance to front face
            const backDist = (pz - pHalfD) - (oz + od / 2); // distance to back face
            
            if (obs.action === 'jump') {
                // Can jump over if feet above clearance
                const clearance = obs.clearance;
                const feetY = py + (isRolling ? 0.6 : 0); // rolling lowers hitbox
                
                // Grace window: if just before obstacle and jumping
                if (frontDist > -0.5 && frontDist < 2.5 && playerVY > 0) {
                    // Rising toward obstacle - allow
                    continue;
                }
                
                // Check if cleared by jump
                if (feetY > clearance && !obs.clearedByJump) {
                    obs.clearedByJump = true;
                    // Add score bonus
                    addScore(50 * multiplier);
                    createParticles(ox, py + 1, oz, 0xffdd44, 8);
                    continue;
                }
                
                // If we're above obstacle height, we're clearing it
                if (py > clearance && !isRolling) {
                    continue;
                }
                
                // Collision!
                if (!obs.clearedByJump || py <= clearance) {
                    gameOver();
                    return true;
                }
            } 
            else if (obs.action === 'switch') {
                // Tall obstacle - must switch lanes
                // Cannot jump over (clearance = Infinity)
                // Only safe if NOT in same lane (handled by xOverlap already)
                // But also check if player is above it (not possible for train)
                
                // If player is on platform (not implemented for trains)
                // For now, always collision if same lane
                gameOver();
                return true;
            }
            else if (obs.action === 'walk') {
                // Platform - can walk on top
                const platformTop = oh;
                if (py + 0.8 >= platformTop - 0.15) {
                    // Landed on top - safe for duration
                    // (Would need platform length tracking)
                    continue;
                }
                // Under platform - collision
                gameOver();
                return true;
            }
        }
    }
    
    // Check coins
    for (let i = coins3d.length - 1; i >= 0; i--) {
        const coin = coins3d[i];
        if (coin.collected) continue;
        
        const cx = coin.group.position.x;
        const cy = coin.group.position.y;
        const cz = coin.z;
        
        const dx = Math.abs(px - cx);
        const dy = Math.abs(py + 1 - cy); // player center-ish Y
        const dz = Math.abs(pz - cz);
        
        if (dx < 0.8 && dy < 1.0 && dz < pHalfD + 0.5) {
            collectCoin(i);
        }
    }
    
    // Check powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        if (p.collected) continue;
        
        const px2 = p.group.position.x;
        const py2 = p.group.position.y;
        const pz2 = p.z;
        
        const dx = Math.abs(playerGroup.position.x - px2);
        const dy = Math.abs(py + 1 - py2);
        const dz = Math.abs(playerZ - pz2);
        
        if (dx < 1.0 && dy < 1.5 && dz < pHalfD + 0.8) {
            collectPowerup(i);
        }
    }
    
    return false;
}

function collectCoin(index) {
    const coin = coins3d[index];
    coin.collected = true;
    coins += CFG.COIN_VALUE * multiplier;
    totalCoins += CFG.COIN_VALUE * multiplier;
    addScore(50 * multiplier);
    
    // Visual feedback
    createParticles(coin.group.position.x, coin.group.position.y, coin.z, 0xffdd44, 12);
    playSound('coin');
    
    // Animate collection
    coin.group.scale.set(0.01, 0.01, 0.01);
    
    // Update HUD
    updateHUD();
    
    // Remove after animation
    setTimeout(() => {
        scene.remove(coin.group);
        coin.group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
        coins3d.splice(index, 1);
    }, 200);
}

function collectPowerup(index) {
    const p = powerups[index];
    p.collected = true;
    
    createParticles(p.group.position.x, p.group.position.y, p.z, POWERUP_TYPES[p.type].color, 15);
    playSound('powerup');
    
    // Activate powerup
    activatePowerup(p.type, p.duration);
    
    // Animate
    p.group.scale.set(0.01, 0.01, 0.01);
    
    setTimeout(() => {
        scene.remove(p.group);
        p.group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
        powerups.splice(index, 1);
    }, 200);
}

// ================= POWERUP EFFECTS =================
let activePowerups = {};
let magnetActive = false;
let jetpackActive = false;
let boostActive = false;

function activatePowerup(type, duration) {
    activePowerups[type] = duration;
    
    if (type === 'magnet') {
        magnetActive = true;
        showPowerupIndicator('MAGNET', CFG.COLORS.POWERUP_MAGNET, duration);
    } else if (type === 'jetpack') {
        jetpackActive = true;
        playerY = 3;
        playerVY = 0;
        isJumping = false;
        showPowerupIndicator('JETPACK', CFG.COLORS.POWERUP_JETPACK, duration);
    } else if (type === 'boost') {
        boostActive = true;
        speed = CFG.PLAYER_SPEED_MAX * 1.3;
        showPowerupIndicator('BOOST', CFG.COLORS.POWERUP_BOOST, duration);
    }
    
    setTimeout(() => {
        deactivatePowerup(type);
    }, duration * 1000);
}

function deactivatePowerup(type) {
    delete activePowerups[type];
    
    if (type === 'magnet') magnetActive = false;
    else if (type === 'jetpack') jetpackActive = false;
    else if (type === 'boost') {
        boostActive = false;
        // Speed will naturally ramp back
    }
}

function showPowerupIndicator(name, color, duration) {
    const hud = document.getElementById('hud');
    const indicator = document.createElement('div');
    indicator.className = 'powerup-indicator';
    indicator.style.cssText = `
        position: absolute;
        top: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: ${color};
        color: #1a2a3a;
        padding: 8px 20px;
        border-radius: 20px;
        font-weight: 800;
        font-size: 14px;
        z-index: 100;
        animation: popIn 0.3s ease, fadeOut 0.5s ease ${duration - 0.5}s forwards;
    `;
    indicator.textContent = name;
    hud.appendChild(indicator);
    
    setTimeout(() => indicator.remove(), duration * 1000);
}

// ================= PROCEDURAL GENERATION =================
let nextObstacleZ = 30;
let nextCoinZ = 10;
let nextPowerupZ = 50;
let lastObstacleLane = -1;

function generateAhead() {
    const generateUntil = playerZ + CFG.SEGMENTS_AHEAD * CFG.PATH_LENGTH;
    
    // Generate track segments
    while (segments.length < CFG.SEGMENTS_AHEAD) {
        const lastZ = segments.length > 0 ? segments[segments.length - 1].z : -CFG.PATH_LENGTH;
        generateSegment(lastZ + CFG.PATH_LENGTH);
    }
    
    // Generate obstacles
    while (nextObstacleZ < generateUntil) {
        // Ensure minimum gap
        if (nextObstacleZ - playerZ < CFG.MIN_GAP_BETWEEN_OBSTACLES) {
            nextObstacleZ += CFG.MIN_GAP_BETWEEN_OBSTACLES;
            continue;
        }
        
        if (Math.random() < CFG.OBSTACLE_SPAWN_CHANCE) {
            // Pick lane different from last
            let lane;
            const availableLanes = CFG.LANES.filter(l => l !== lastObstacleLane);
            lane = availableLanes[Math.floor(Math.random() * availableLanes.length)];
            lastObstacleLane = lane;
            
            // Pick type
            const types = ['barrier', 'train', 'low_barrier'];
            const weights = [0.5, 0.3, 0.2];
            let r = Math.random(), sum = 0;
            let type = types[0];
            for (let i = 0; i < types.length; i++) {
                sum += weights[i];
                if (r < sum) { type = types[i]; break; }
            }
            
            createObstacle(type, lane, nextObstacleZ);
        }
        
        nextObstacleZ += CFG.PATH_LENGTH * (1.5 + Math.random() * 2);
    }
    
    // Generate coins
    while (nextCoinZ < generateUntil) {
        if (Math.random() < CFG.COIN_SPAWN_CHANCE) {
            const lane = CFG.LANES[Math.floor(Math.random() * CFG.LANES.length)];
            // Coins often in patterns
            const pattern = Math.random();
            if (pattern < 0.3) {
                // Single
                createCoin(lane, nextCoinZ);
            } else if (pattern < 0.6) {
                // Row of 3
                for (let i = -1; i <= 1; i++) {
                    createCoin(i, nextCoinZ + i * 4);
                }
            } else {
                // Arc
                for (let i = 0; i < 5; i++) {
                    const arcLane = Math.floor(i / 2) * (i % 2 === 0 ? 1 : -1);
                    createCoin(arcLane, nextCoinZ + i * 3, Math.sin(i * 0.8) * 0.5);
                }
            }
        }
        nextCoinZ += CFG.PATH_LENGTH * (1 + Math.random() * 1.5);
    }
    
    // Generate powerups
    while (nextPowerupZ < generateUntil) {
        if (Math.random() < CFG.POWERUP_SPAWN_CHANCE) {
            const lane = CFG.LANES[Math.floor(Math.random() * CFG.LANES.length)];
            const types = ['magnet', 'jetpack', 'boost'];
            const type = types[Math.floor(Math.random() * types.length)];
            createPowerup(type, lane, nextPowerupZ);
        }
        nextPowerupZ += CFG.PATH_LENGTH * (5 + Math.random() * 10);
    }
}

// ================= PARTICLES =================
function createParticles(x, y, z, color, count) {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    
    for (let i = 0; i < count; i++) {
        const p = new THREE.Mesh(geo, mat.clone());
        p.position.set(x, y, z);
        p.userData = {
            vx: (Math.random() - 0.5) * 8,
            vy: Math.random() * 5 + 2,
            vz: (Math.random() - 0.5) * 4,
            life: 1.0,
            maxLife: 0.8 + Math.random() * 0.5,
        };
        scene.add(p);
        particles.push(p);
        
        if (particles.length > CFG.MAX_PARTICLES) {
            const old = particles.shift();
            scene.remove(old);
            old.geometry.dispose();
            old.material.dispose();
        }
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.userData.life -= dt;
        if (p.userData.life <= 0) {
            scene.remove(p);
            p.geometry.dispose();
            p.material.dispose();
            particles.splice(i, 1);
            continue;
        }
        
        p.userData.vy -= CFG.GRAVITY * dt * 0.5;
        p.position.x += p.userData.vx * dt;
        p.position.y += p.userData.vy * dt;
        p.position.z += p.userData.vz * dt;
        p.material.opacity = p.userData.life / p.userData.maxLife;
        p.rotation.x += dt * 10;
        p.rotation.y += dt * 8;
    }
}

// ================= CAMERA =================
function updateCamera(dt) {
    const camTrackZ = playerZ - CFG.CAMERA_DISTANCE;
    const curve = trackCurve(camTrackZ);
    const targetX = curve.x + playerX * 0.3; // slight lateral follow
    const targetY = CFG.CAMERA_HEIGHT + curve.y;
    
    // Look ahead point
    const lookZ = playerZ + 14;
    const lookCurve = trackCurve(lookZ);
    const lookX = lookCurve.x + playerX * 0.3;
    const lookY = 0.5 + lookCurve.y;
    
    // Smooth follow
    camera.position.lerp(
        new THREE.Vector3(targetX, targetY, camTrackZ),
        Math.min(dt * CFG.CAM_LERP_SPEED, 1)
    );
    
    // Look at with screen shake
    const shakeX = (Math.random() - 0.5) * shakeIntensity;
    const shakeY = (Math.random() - 0.5) * shakeIntensity;
    camera.lookAt(lookX + shakeX, lookY + shakeY, lookZ);
    
    if (shakeIntensity > 0) {
        shakeIntensity = THREE.MathUtils.lerp(shakeIntensity, 0, dt * 15);
    }
}

// ================= BIOMES & WEATHER =================
const BIOMES = [
    { name: 'URBAN_DAY', skyColor: 0x6ec6ff, fogColor: 0x88c0ff, groundColor: 0x7ec860, weather: 'none' },
    { name: 'URBAN_SUNSET', skyColor: 0xff8850, fogColor: 0xff9960, groundColor: 0xa87040, weather: 'none' },
    { name: 'URBAN_NIGHT', skyColor: 0x2a3a5a, fogColor: 0x3a4a6a, groundColor: 0x3a4a5a, weather: 'none' },
    { name: 'RAINY', skyColor: 0x6a7a8a, fogColor: 0x7a8a9a, groundColor: 0x6a6a6a, weather: 'rain' },
    { name: 'STORM', skyColor: 0x3a3a4a, fogColor: 0x4a4a5a, groundColor: 0x4a4a4a, weather: 'storm' },
    { name: 'SNOW', skyColor: 0xbbddff, fogColor: 0x99bbdd, groundColor: 0xffffff, weather: 'snow' },
];

function updateBiomeColors() {
    const biome = BIOMES[biomeIndex % BIOMES.length];
    const nextBiome = BIOMES[(biomeIndex + 1) % BIOMES.length];
    const t = biomeProgress / CFG.BIOME_LENGTH;
    
    // Lerp colors
    const skyColor = lerpColor(biome.skyColor, nextBiome.skyColor, t);
    const fogColor = lerpColor(biome.fogColor, nextBiome.fogColor, t);
    const groundColor = lerpColor(biome.groundColor, nextBiome.groundColor, t);
    
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.Fog(fogColor, 250, 600);  // Fog starts very far
    renderer.setClearColor(skyColor);
    
    // Update ground color (would need to re-create or use material reference)
    // For performance, we'll update on segment regeneration
    
    // Weather
    if (biome.weather === 'rain' || nextBiome.weather === 'rain') {
        weatherIntensity = Math.max(weatherIntensity, t);
    } else if (biome.weather === 'storm') {
        weatherIntensity = Math.max(weatherIntensity, t * 1.5);
    } else {
        weatherIntensity *= 0.98;
    }
    
    // Day/night cycle (only during gameplay)
    if (gameState === 'playing') {
        timeOfDay = (biomeIndex * 0.25 + t * 0.25) % 1;
    }
}

function lerpColor(a, b, t) {
    const ca = new THREE.Color(a);
    const cb = new THREE.Color(b);
    return ca.lerp(cb, t).getHex();
}

// ================= SCORING & HUD =================
function addScore(points) {
    score += Math.floor(points);
    updateHUD();
}

function updateHUD() {
    document.getElementById('score').textContent = score.toLocaleString();
    document.getElementById('coins').textContent = coins.toLocaleString();
    document.getElementById('distance').textContent = Math.floor(distance) + 'm';
    
    if (multiplier > 1) {
        document.getElementById('mult-value').textContent = multiplier;
        document.getElementById('multiplier').classList.remove('hidden');
    }
}

function updateHighScorePreview() {
    document.getElementById('high-score-preview').textContent = highScore.toLocaleString();
    document.getElementById('total-coins-preview').textContent = totalCoins.toLocaleString();
}
// ================= AUDIO (Web Audio API) =================
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function playTone(freq, dur, type = 'square', vol = 0.1) {
    if (isMuted || !audioContext) return;
    try {
        const o = audioContext.createOscillator();
        const g = audioContext.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, audioContext.currentTime);
        g.gain.setValueAtTime(vol, audioContext.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + dur);
        o.connect(g);
        g.connect(audioContext.destination);
        o.start();
        o.stop(audioContext.currentTime + dur);
    } catch (e) {}
}

function playSound(name) {
    initAudio();
    switch (name) {
        case 'coin':
            playTone(880, 0.06, 'square', 0.12);
            setTimeout(() => playTone(1320, 0.1, 'square', 0.08), 40);
            break;
        case 'jump':
            playTone(300, 0.12, 'sine', 0.1);
            setTimeout(() => playTone(500, 0.08, 'sine', 0.06), 60);
            break;
        case 'land':
            playTone(150, 0.08, 'triangle', 0.08);
            break;
        case 'roll':
            playTone(200, 0.15, 'sawtooth', 0.06);
            break;
        case 'lane':
            playTone(400, 0.05, 'square', 0.07);
            break;
        case 'powerup':
            playTone(600, 0.1, 'sine', 0.12);
            setTimeout(() => playTone(900, 0.1, 'sine', 0.1), 100);
            setTimeout(() => playTone(1200, 0.15, 'sine', 0.08), 200);
            break;
        case 'gameover':
            playTone(400, 0.15, 'sawtooth', 0.12);
            setTimeout(() => playTone(300, 0.15, 'sawtooth', 0.1), 150);
            setTimeout(() => playTone(200, 0.3, 'sawtooth', 0.08), 300);
            break;
        case 'start':
            playTone(523, 0.1, 'sine', 0.1);
            setTimeout(() => playTone(659, 0.1, 'sine', 0.1), 100);
            setTimeout(() => playTone(784, 0.2, 'sine', 0.12), 200);
            break;
        case 'menu':
            playTone(400, 0.08, 'square', 0.08);
            break;
    }
}

// ================= INPUT HANDLING =================
function setupInput() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        switch (e.code) {
            case 'ArrowLeft': keyQueue.push('left'); break;
            case 'ArrowRight': keyQueue.push('right'); break;
            case 'ArrowUp': case 'Space': keyQueue.push('jump'); break;
            case 'ArrowDown': keyQueue.push('roll'); break;
            case 'Escape': togglePause(); break;
            case 'KeyM': toggleMute(); break;
        }
    });
    
    // Prevent arrow scroll
    window.addEventListener('keydown', (e) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
            e.preventDefault();
        }
    }, { passive: false });
}

function setupTapZones() {
    function bindTap(el, action) {
        if (!el) return;
        let lastTap = 0;
        const handler = (e) => {
            const now = performance.now();
            if (now - lastTap < 120) return;
            lastTap = now;
            e.preventDefault();
            e.stopPropagation();
            keyQueue.push(action);
        };
        el.addEventListener('touchstart', handler, { passive: false });
        el.addEventListener('pointerdown', handler, { passive: false });
        el.addEventListener('mousedown', handler);
    }
    
    bindTap(document.getElementById('zone-left'), 'left');
    bindTap(document.getElementById('zone-jump'), 'jump');
    bindTap(document.getElementById('zone-right'), 'right');
}

function setupButtons() {
    document.getElementById('start-btn').addEventListener('click', () => {
        initAudio();
        playSound('start');
        startGame();
    });
    
    document.getElementById('play-again-btn').addEventListener('click', () => {
        initAudio();
        playSound('start');
        startGame();
    });
    
    document.getElementById('main-menu-btn').addEventListener('click', () => {
        playSound('menu');
        showMenu();
    });
    
    document.getElementById('resume-btn').addEventListener('click', () => {
        playSound('menu');
        togglePause();
    });
    
    document.getElementById('restart-btn').addEventListener('click', () => {
        playSound('start');
        startGame();
    });
    
    document.getElementById('menu-btn').addEventListener('click', () => {
        playSound('menu');
        showMenu();
    });
    
    document.getElementById('pause-btn').addEventListener('click', () => {
        togglePause();
    });
    
    document.getElementById('mute-btn').addEventListener('click', () => {
        toggleMute();
    });
}

function processInput() {
    while (keyQueue.length > 0) {
        const action = keyQueue.shift();
        
        if (gameState !== 'playing') continue;
        
        switch (action) {
            case 'left':
                if (targetLane < 2) {
                    targetLane++;
                    playSound('lane');
                }
                break;
            case 'right':
                if (targetLane > 0) {
                    targetLane--;
                    playSound('lane');
                }
                break;
            case 'jump':
                if (!isJumping && !isRolling && playerY <= 0.1) {
                    isJumping = true;
                    playerVY = CFG.JUMP_VELOCITY;
                    playSound('jump');
                }
                break;
            case 'roll':
                if (!isRolling && !isJumping && playerY <= 0.1) {
                    isRolling = true;
                    rollTimer = CFG.ROLL_DURATION;
                    playSound('roll');
                }
                break;
        }
    }
}

function togglePause() {
    if (gameState !== 'playing' && gameState !== 'paused') return;
    
    isPaused = !isPaused;
    if (isPaused) {
        gameState = 'paused';
        document.getElementById('pause-menu').classList.remove('hidden');
    } else {
        gameState = 'playing';
        document.getElementById('pause-menu').classList.add('hidden');
        lastTime = performance.now(); // avoid dt spike
    }
}

function toggleMute() {
    isMuted = !isMuted;
    const btn = document.getElementById('mute-btn');
    btn.textContent = isMuted ? '🔇' : '🔊';
    if (audioContext) {
        if (isMuted) audioContext.suspend();
        else audioContext.resume();
    }
}

// ================= GAME STATE =================
function showMenu() {
    gameState = 'menu';
    isPaused = false;
    
    // Reset visual
    playerGroup.position.set(0, 0, 0);
    playerVisual.position.set(0, 0, 0);
    playerVisual.rotation.set(0, 0, 0);
    playerGroup.rotation.set(0, 0, 0);
    playerZ = 0;
    playerX = 0;
    targetLane = 1;
    
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    updateHighScorePreview();
    
    // Reset camera
    camera.position.set(0, CFG.CAMERA_HEIGHT, -CFG.CAMERA_DISTANCE);
    camera.lookAt(0, 0.8, 12);
}

function startGame() {
    gameState = 'playing';
    isPaused = false;
    
    // Reset all state
    playerZ = 0;
    playerX = 0;
    targetLane = 1;
    playerY = 0;
    playerVY = 0;
    isJumping = false;
    isRolling = false;
    rollTimer = 0;
    speed = CFG.PLAYER_SPEED_BASE;
    score = 0;
    coins = 0;
    distance = 0;
    multiplier = 1;
    multiplierTimer = 0;
    biomeIndex = 0;
    biomeProgress = 0;
    weatherIntensity = 0;
    timeOfDay = 0.5;
    shakeIntensity = 0;
    activePowerups = {};
    magnetActive = jetpackActive = boostActive = false;
    lastObstacleLane = -1;
    keyQueue = [];
    
    // Reset player
    playerGroup.position.set(0, 0, 0);
    playerVisual.position.set(0, 0, 0);
    playerVisual.rotation.set(0, 0, 0);
    playerVisual.userData.runCycle = 0;
    playerGroup.rotation.set(0, 0, 0);
    
    // Clear obstacles, coins, powerups, particles
    [...obstacles, ...coins3d, ...powerups, ...particles].forEach(item => {
        scene.remove(item.group || item);
        (item.group || item).traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    });
    obstacles = [];
    coins3d = [];
    powerups = [];
    particles = [];
    
    // Clear segments and regenerate
    segments.forEach(seg => {
        scene.remove(seg.group);
        seg.group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    });
    segments = [];
    nextObstacleZ = 30;
    nextCoinZ = 10;
    nextPowerupZ = 50;
    
    for (let i = 0; i < CFG.SEGMENTS_AHEAD; i++) {
        generateSegment(i * CFG.PATH_LENGTH);
    }
    
    // Reset camera
    camera.position.set(0, CFG.CAMERA_HEIGHT, -CFG.CAMERA_DISTANCE);
    camera.lookAt(0, 0.8, 12);
    
    // UI
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('multiplier').classList.add('hidden');
    updateHUD();
    
    lastTime = performance.now();
}

function gameOver() {
    if (gameState !== 'playing') return;
    gameState = 'gameover';
    
    playSound('gameover');
    shakeIntensity = 0.5;
    
    // Update high score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('subway3d_highscore', highScore.toString());
    }
    localStorage.setItem('subway3d_totalcoins', totalCoins.toString());
    
    // Show screen after brief delay
    setTimeout(() => {
        document.getElementById('final-score').textContent = score.toLocaleString();
        document.getElementById('final-distance').textContent = Math.floor(distance) + 'm';
        document.getElementById('final-coins').textContent = coins.toLocaleString();
        document.getElementById('gameover-screen').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
    }, 500);
}

// ================= MAIN GAME LOOP =================
function animate(time) {
    requestAnimationFrame(animate);
    
    if (gameState !== 'playing' || isPaused) {
        // Still render for menu/pause
        renderer.render(scene, camera);
        return;
    }
    
    const dt = Math.min((time - lastTime) / 1000, 0.05); // cap dt
    lastTime = time;
    
    // Process input
    processInput();
    
    // Update game
    updatePlayer(dt);
    updateObstacles(dt);
    updateCoins(dt);
    updatePowerups(dt);
    updateParticles(dt);
    generateAhead();
    cleanupSegments();
    checkCollisions();
    updateCamera(dt);
    updateBiomeColors();
    updateLights();
    
    // Update distance & score
    distance += speed * dt;
    score += speed * dt * CFG.SCORE_PER_METER * multiplier;
    
    // Magnet effect - attract nearby coins
    if (magnetActive) {
        coins3d.forEach(coin => {
            if (coin.collected) return;
            const dx = playerGroup.position.x - coin.group.position.x;
            const dz = playerZ - coin.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 8) {
                const force = (1 - dist / 8) * 30 * dt;
                coin.z += force * (dz / dist);
                // x attraction handled by position update in updateCoins
            }
        });
    }
    
    // Jetpack - maintain height
    if (jetpackActive) {
        playerY = 3;
        playerVY = 0;
        isJumping = false;
    }
    
    updateHUD();
    
    // Render
    renderer.render(scene, camera);
    
    // FPS counter (debug)
    if (document.getElementById('fps-counter').classList.contains('hidden') === false) {
        document.getElementById('fps-counter').textContent = 'FPS: ' + Math.round(1 / dt);
    }
}

// ================= RESIZE =================
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// ================= ENTRY POINT =================
init();