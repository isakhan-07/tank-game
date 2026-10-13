// ============================================================
// ИНИЦИАЛИЗАЦИЯ THREE.JS
// ============================================================
const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 160);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

// Освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
sunLight.position.set(30, 60, 20);
sunLight.castShadow = true;
sunLight.shadow.camera.left = -80;
sunLight.shadow.camera.right = 80;
sunLight.shadow.camera.top = 80;
sunLight.shadow.camera.bottom = -80;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 200;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

// ============================================================
// UI-ЭЛЕМЕНТЫ
// ============================================================
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const livesEl = document.getElementById('lives');
const healthBarEl = document.getElementById('health-bar');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const finalHighScoreEl = document.getElementById('final-high-score');
const restartBtn = document.getElementById('restart-btn');
const soundToggle = document.getElementById('sound-toggle');
const soundIcon = document.getElementById('sound-icon');

// ============================================================
// ЗВУК
// ============================================================
const Sound = {
    ctx: null,
    masterGain: null,
    muted: localStorage.getItem('tankMuted') === 'true',
    engineOsc: null, engineGain: null, engineFilter: null,
    initialized: false,

    init() {
        if (this.initialized) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.muted ? 0 : 0.5;
            this.masterGain.connect(this.ctx.destination);
            this.initialized = true;
            this.startEngine();
        } catch (e) { console.warn('Аудио не поддерживается'); }
    },
    startEngine() {
        if (!this.ctx || this.engineOsc) return;
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 45;
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 200;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineOsc.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.masterGain);
        this.engineOsc.start();
    },
    setEngineIntensity(i) {
        if (!this.engineGain || !this.ctx) return;
        const t = Math.max(0, Math.min(1, i)) * 0.08;
        this.engineGain.gain.linearRampToValueAtTime(t, this.ctx.currentTime + 0.1);
        if (this.engineOsc) {
            this.engineOsc.frequency.linearRampToValueAtTime(40 + i * 25, this.ctx.currentTime + 0.1);
        }
    },
    playTone(freq, dur, type = 'square', vol = 0.3, slideTo = null) {
        if (!this.ctx || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(this.ctx.currentTime + dur);
    },
    playNoise(dur, vol = 0.3, filterFreq = 1000) {
        if (!this.ctx || this.muted) return;
        const bufSize = this.ctx.sampleRate * dur;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buf;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + dur);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        noise.start(); noise.stop(this.ctx.currentTime + dur);
    },
    shootPlayer() { if (this.muted) return; this.playTone(880, 0.08, 'square', 0.2, 220); this.playNoise(0.06, 0.15, 2000); },
    shootEnemy() { if (this.muted) return; this.playTone(220, 0.1, 'sawtooth', 0.12, 80); this.playNoise(0.08, 0.1, 800); },
    explosion() { if (this.muted) return; this.playNoise(0.4, 0.35, 1500); this.playTone(120, 0.4, 'sawtooth', 0.2, 30); },
    playerHit() { if (this.muted) return; this.playTone(300, 0.15, 'square', 0.25, 150); this.playNoise(0.2, 0.2, 600); },
    lifeLost() { if (this.muted) return; this.playTone(200, 0.3, 'triangle', 0.3, 80); setTimeout(() => this.playTone(150, 0.3, 'triangle', 0.3, 60), 150); },
    gameOver() {
        if (this.muted) return;
        [440, 370, 311, 233].forEach((f, i) => setTimeout(() => this.playTone(f, 0.4, 'triangle', 0.3, f * 0.5), i * 200));
    },
    gameStart() {
        if (this.muted) return;
        this.playTone(262, 0.1, 'square', 0.2);
        setTimeout(() => this.playTone(330, 0.1, 'square', 0.2), 100);
        setTimeout(() => this.playTone(392, 0.15, 'square', 0.2), 200);
        setTimeout(() => this.playTone(523, 0.2, 'square', 0.25), 300);
    },
    bulletHitWall() { if (this.muted) return; this.playNoise(0.08, 0.15, 3000); this.playTone(150, 0.06, 'square', 0.1, 50); },
    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('tankMuted', this.muted);
        if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : 0.5;
        soundIcon.innerText = this.muted ? '🔇' : '🔊';
        soundToggle.classList.toggle('muted', this.muted);
    }
};

soundIcon.innerText = Sound.muted ? '🔇' : '🔊';
soundToggle.classList.toggle('muted', Sound.muted);
soundToggle.addEventListener('click', (e) => { e.stopPropagation(); Sound.init(); Sound.toggleMute(); });

function initSoundOnFirstInteraction() {
    Sound.init();
    if (Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume();
    window.removeEventListener('click', initSoundOnFirstInteraction);
    window.removeEventListener('keydown', initSoundOnFirstInteraction);
}
window.addEventListener('click', initSoundOnFirstInteraction);
window.addEventListener('keydown', initSoundOnFirstInteraction);

// ============================================================
// СОСТОЯНИЕ ИГРЫ
// ============================================================
const gameState = {
    score: 0,
    highScore: parseInt(localStorage.getItem('tankHighScore')) || 0,
    lives: 3,
    health: 100,
    isGameOver: false,
    frameCount: 0,
    spawnRate: 120,
    worldSize: 120 // Карта 120x120 юнитов (от -60 до +60)
};

highScoreEl.innerText = gameState.highScore;

// ============================================================
// МИР: ЗЕМЛЯ И ОБЪЕКТЫ
// ============================================================
let obstacles = []; // {x, z, radius, type, mesh}
let ground = null;

function clearWorld() {
    // Удаляем все объекты кроме света
    const toRemove = [];
    scene.children.forEach(child => {
        if (child === ambientLight || child === sunLight) return;
        toRemove.push(child);
    });
    toRemove.forEach(obj => scene.remove(obj));
    
    // Удаляем всех детей (меши)
    obstacles = [];
    enemies = [];
    bullets = [];
    particles = [];
    player = null;
}

function createGround() {
    const size = gameState.worldSize;
    
    // Трава
    const groundGeo = new THREE.PlaneGeometry(size * 2, size * 2, 40, 40);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a7a3a });
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Немного варьируем высоту, чтобы земля не была идеально плоской
    const positions = groundGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        if (x * x + y * y > 10) {
            positions.setZ(i, Math.sin(x * 0.15) * Math.cos(y * 0.15) * 0.15);
        }
    }
    groundGeo.computeVertexNormals();
}

// ============================================================
// ФАБРИКИ ОБЪЕКТОВ
// ============================================================
function createTankMesh(bodyColor, turretColor) {
    const group = new THREE.Group();
    
    // Корпус
    const hullGeo = new THREE.BoxGeometry(2.2, 0.9, 3.2);
    const hullMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.6;
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);
    
    // Гусеницы
    const trackGeo = new THREE.BoxGeometry(0.5, 0.75, 3.4);
    const trackMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    
    const leftTrack = new THREE.Mesh(trackGeo, trackMat);
    leftTrack.position.set(-1.2, 0.4, 0);
    leftTrack.castShadow = true;
    group.add(leftTrack);
    
    const rightTrack = new THREE.Mesh(trackGeo, trackMat);
    rightTrack.position.set(1.2, 0.4, 0);
    rightTrack.castShadow = true;
    group.add(rightTrack);
    
    // Верхняя надстройка
    const topGeo = new THREE.BoxGeometry(1.6, 0.35, 2.6);
    const topMat = new THREE.MeshLambertMaterial({ color: turretColor });
    const topBox = new THREE.Mesh(topGeo, topMat);
    topBox.position.y = 1.15;
    topBox.castShadow = true;
    group.add(topBox);
    
    // Башня (вращается)
    const turret = new THREE.Group();
    turret.position.y = 1.4;
    
    const turretGeo = new THREE.CylinderGeometry(0.85, 1.0, 0.7, 8);
    const turretMat = new THREE.MeshLambertMaterial({ color: turretColor });
    const turretBody = new THREE.Mesh(turretGeo, turretMat);
    turretBody.castShadow = true;
    turret.add(turretBody);
    
    // Ствол
    const barrelGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8);
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(1.4, 0.15, 0);
    barrel.castShadow = true;
    turret.add(barrel);
    
    group.add(turret);
    group.userData.turret = turret;
    group.userData.barrel = barrel;
    
    return group;
}

function addRock(x, z) {
    const r = 1.2 + Math.random() * 0.7;
    const geo = new THREE.DodecahedronGeometry(r, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x777777 });
    const rock = new THREE.Mesh(geo, mat);
    rock.position.set(x, r * 0.7, z);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    obstacles.push({ x, z, radius: r, type: 'rock', mesh: rock, blocksBullets: true });
}

function addBarrel(x, z) {
    const group = new THREE.Group();
    
    const bodyGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.6, 12);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);
    
    // Жёлтая полоса
    const stripeGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.2, 12);
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xffdd00 });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.8;
    group.add(stripe);
    
    group.position.set(x, 0, z);
    scene.add(group);
    obstacles.push({ x, z, radius: 0.9, type: 'barrel', mesh: group, blocksBullets: true, explosive: true });
}

function addSandbag(x, z) {
    const group = new THREE.Group();
    const bagMat = new THREE.MeshLambertMaterial({ color: 0xa08858 });
    
    // 2 ряда по 3 мешка
    for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 3; i++) {
            const bagGeo = new THREE.BoxGeometry(0.7, 0.4, 0.55);
            const bag = new THREE.Mesh(bagGeo, bagMat);
            bag.position.set(-0.8 + i * 0.8 + row * 0.4, 0.2 + row * 0.4, 0);
            bag.rotation.y = (Math.random() - 0.5) * 0.15;
            bag.castShadow = true;
            bag.receiveShadow = true;
            group.add(bag);
        }
    }
    
    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(group);
    obstacles.push({ x, z, radius: 1.1, type: 'sandbag', mesh: group, blocksBullets: true });
}

function addBush(x, z) {
    const group = new THREE.Group();
    const colors = [0x2a5a1a, 0x3a7a2a, 0x4a8a3a];
    
    for (let i = 0; i < 5; i++) {
        const r = 0.6 + Math.random() * 0.5;
        const geo = new THREE.SphereGeometry(r, 8, 6);
        const mat = new THREE.MeshLambertMaterial({ color: colors[i % 3] });
        const bush = new THREE.Mesh(geo, mat);
        bush.position.set(
            (Math.random() - 0.5) * 1.4,
            r * 0.9,
            (Math.random() - 0.5) * 1.4
        );
        bush.castShadow = true;
        group.add(bush);
    }
    
    group.position.set(x, 0, z);
    scene.add(group);
    obstacles.push({ x, z, radius: 0.9, type: 'bush', mesh: group, blocksBullets: false });
}

function addWater(x, z, radius) {
    const geo = new THREE.CircleGeometry(radius, 24);
    const mat = new THREE.MeshLambertMaterial({
        color: 0x2a5a8a,
        transparent: true,
        opacity: 0.85
    });
    const water = new THREE.Mesh(geo, mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, 0.06, z);
    water.receiveShadow = true;
    scene.add(water);
    // Вода не блокирует, но замедляет — реализуем через speedModifier
    obstacles.push({ x, z, radius: radius, type: 'water', mesh: water, blocksBullets: false, slows: 0.55 });
}

function addRoad(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const width = 5;
    
    const geo = new THREE.PlaneGeometry(length, width);
    const mat = new THREE.MeshLambertMaterial({ color: 0x5a5a5a });
    const road = new THREE.Mesh(geo, mat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -Math.atan2(dz, dx);
    road.position.set((x1 + x2) / 2, 0.04, (z1 + z2) / 2);
    road.receiveShadow = true;
    scene.add(road);
}

// ============================================================
// ГЕНЕРАЦИЯ КАРТЫ
// ============================================================
function generateMap() {
    const size = gameState.worldSize;
    const half = size / 2;
    
    createGround();
    
    // Дороги крест-накрест
    addRoad(-half, 0, half, 0);
    addRoad(0, -half, 0, half);
    
    // Вода
    const waterCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < waterCount; i++) {
        const wx = (Math.random() - 0.5) * size * 0.7;
        const wz = (Math.random() - 0.5) * size * 0.7;
        if (Math.abs(wx) < 10 || Math.abs(wz) < 10) continue;
        addWater(wx, wz, 3 + Math.random() * 2);
    }
    
    // Камни
    for (let i = 0; i < 22; i++) {
        const x = (Math.random() - 0.5) * size * 0.9;
        const z = (Math.random() - 0.5) * size * 0.9;
        if (Math.hypot(x, z) < 8) continue;
        if (isOverlappingObstacle(x, z, 2)) continue;
        addRock(x, z);
    }
    
    // Бочки
    for (let i = 0; i < 18; i++) {
        const x = (Math.random() - 0.5) * size * 0.9;
        const z = (Math.random() - 0.5) * size * 0.9;
        if (Math.hypot(x, z) < 8) continue;
        if (isOverlappingObstacle(x, z, 1.5)) continue;
        addBarrel(x, z);
    }
    
    // Мешки с песком
    for (let i = 0; i < 15; i++) {
        const x = (Math.random() - 0.5) * size * 0.9;
        const z = (Math.random() - 0.5) * size * 0.9;
        if (Math.hypot(x, z) < 8) continue;
        if (isOverlappingObstacle(x, z, 1.8)) continue;
        addSandbag(x, z);
    }
    
    // Кусты
    for (let i = 0; i < 30; i++) {
        const x = (Math.random() - 0.5) * size * 0.9;
        const z = (Math.random() - 0.5) * size * 0.9;
        if (Math.hypot(x, z) < 8) continue;
        if (isOverlappingObstacle(x, z, 1)) continue;
        addBush(x, z);
    }
}

function isOverlappingObstacle(x, z, radius) {
    for (const o of obstacles) {
        if (Math.hypot(o.x - x, o.z - z) < o.radius + radius) return true;
    }
    return false;
}

// ============================================================
// ТАНКИ
// ============================================================
let player = null;
let enemies = [];
let bullets = [];
let particles = [];

function createPlayerTank() {
    const mesh = createTankMesh(0x3a5a2a, 0x2a4a1a);
    mesh.position.set(0, 0, 0);
    scene.add(mesh);
    
    return {
        mesh,
        x: 0,
        z: 0,
        bodyAngle: 0,
        turretAngle: 0,
        speed: 10,
        radius: 2,
        cooldown: 0,
        maxCooldown: 0.28,
        isPlayer: true
    };
}

function createEnemyTank(x, z) {
    const mesh = createTankMesh(0x5a5a5a, 0x3a3a3a);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    
    return {
        mesh,
        x, z,
        bodyAngle: 0,
        turretAngle: 0,
        speed: 3.5,
        radius: 2,
        cooldown: 0,
        maxCooldown: 1.8,
        isPlayer: false
    };
}

function spawnEnemy() {
    if (gameState.isGameOver) return;
    if (enemies.length >= 15) return;
    
    const half = gameState.worldSize / 2 - 5;
    let x, z, attempts = 0;
    do {
        const side = Math.floor(Math.random() * 4);
        switch (side) {
            case 0: x = (Math.random() - 0.5) * gameState.worldSize; z = -half; break;
            case 1: x = half; z = (Math.random() - 0.5) * gameState.worldSize; break;
            case 2: x = (Math.random() - 0.5) * gameState.worldSize; z = half; break;
            case 3: x = -half; z = (Math.random() - 0.5) * gameState.worldSize; break;
        }
        attempts++;
    } while (isOverlappingObstacle(x, z, 2.5) && attempts < 20);
    
    // Не даём спавниться рядом с игроком
    if (player && Math.hypot(x - player.x, z - player.z) < 25) {
        x = -half;
        z = -half;
    }
    
    enemies.push(createEnemyTank(x, z));
}

// ============================================================
// ПУЛИ И ЧАСТИЦЫ
// ============================================================
function createBullet(x, z, angle, isPlayer) {
    const color = isPlayer ? 0xffd700 : 0xff4400;
    const geo = new THREE.SphereGeometry(0.25, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1.4, z);
    scene.add(mesh);
    
    const speed = isPlayer ? 45 : 30;
    bullets.push({
        mesh, x, z,
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed,
        isPlayer,
        life: 3
    });
}

function createParticle(x, y, z, color, size = 0.3) {
    const geo = new THREE.SphereGeometry(size, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    
    particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * 8 + 3,
        vz: (Math.random() - 0.5) * 8,
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.2
    });
}

function createExplosion(x, z, scale = 1) {
    const count = Math.floor(20 * scale);
    for (let i = 0; i < count; i++) {
        const colors = [0xff8800, 0xff4400, 0xffdd00];
        createParticle(x + (Math.random() - 0.5) * 1.5, 1.2, z + (Math.random() - 0.5) * 1.5,
            colors[Math.floor(Math.random() * colors.length)], 0.2 + Math.random() * 0.3);
    }
}

// ============================================================
// УПРАВЛЕНИЕ
// ============================================================
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, space: false };
let isMouseDown = false;

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    if (e.code === 'Space') { e.preventDefault(); keys.space = true; }
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
    if (e.code === 'Space') keys.space = false;
});
window.addEventListener('blur', () => {
    for (let k in keys) keys[k] = false;
    isMouseDown = false;
});
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) isMouseDown = true; });
canvas.addEventListener('mouseup', (e) => { if (e.button === 0) isMouseDown = false; });
canvas.addEventListener('mouseleave', () => { isMouseDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function resizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight - 70;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeCanvas);

// ============================================================
// УТИЛИТЫ
// ============================================================
function lerpAngle(cur, target, t) {
    let diff = target - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return cur + diff * t;
}

function findNearestEnemy(x, z) {
    let nearest = null, minDist = Infinity;
    for (const e of enemies) {
        const d = Math.hypot(e.x - x, e.z - z);
        if (d < minDist) { minDist = d; nearest = e; }
    }
    return nearest;
}

function getSpeedModifier(x, z) {
    for (const o of obstacles) {
        if (o.slows && Math.hypot(o.x - x, o.z - z) < o.radius) {
            return o.slows;
        }
    }
    return 1;
}

function collideWithObstacles(x, z, radius) {
    for (const o of obstacles) {
        if (!o.blocksBullets) continue; // вода и кусты не блокируют
        const d = Math.hypot(o.x - x, o.z - z);
        if (d < o.radius + radius * 0.5) return true;
    }
    return false;
}

function checkBulletHitsObstacles(x, z, r) {
    for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (!o.blocksBullets) continue;
        if (Math.hypot(o.x - x, o.z - z) < o.radius + r) return o;
    }
    return null;
}

// ============================================================
// ОБНОВЛЕНИЕ ИГРЫ
// ============================================================
function updatePlayer(dt) {
    if (!player || gameState.isGameOver) return;
    
    let moveX = 0, moveZ = 0;
    if (keys.w || keys.ArrowUp) moveZ -= 1;
    if (keys.s || keys.ArrowDown) moveZ += 1;
    if (keys.a || keys.ArrowLeft) moveX -= 1;
    if (keys.d || keys.ArrowRight) moveX += 1;
    
    if (moveX !== 0 || moveZ !== 0) {
        const len = Math.hypot(moveX, moveZ);
        moveX /= len; moveZ /= len;
        
        const targetAngle = Math.atan2(moveZ, moveX);
        player.bodyAngle = lerpAngle(player.bodyAngle, targetAngle, 0.25);
        
        const speedMod = getSpeedModifier(player.x, player.z);
        const speed = player.speed * speedMod * dt;
        
        const newX = player.x + moveX * speed;
        const newZ = player.z + moveZ * speed;
        
        // Отдельно по осям для скольжения вдоль стен
        if (!collideWithObstacles(newX, player.z, player.radius)) player.x = newX;
        if (!collideWithObstacles(player.x, newZ, player.radius)) player.z = newZ;
        
        // Границы
        const half = gameState.worldSize / 2 - 2;
        player.x = Math.max(-half, Math.min(half, player.x));
        player.z = Math.max(-half, Math.min(half, player.z));
        
        Sound.setEngineIntensity(1);
    } else {
        Sound.setEngineIntensity(0.3);
    }
    
    // Прицеливание
    const target = findNearestEnemy(player.x, player.z);
    if (target) {
        const aimAngle = Math.atan2(target.z - player.z, target.x - player.x);
        player.turretAngle = lerpAngle(player.turretAngle, aimAngle, 0.15);
    } else {
        player.turretAngle = lerpAngle(player.turretAngle, player.bodyAngle, 0.1);
    }
    
    // Стрельба
    player.cooldown -= dt;
    if ((keys.space || isMouseDown) && player.cooldown <= 0) {
        shootTank(player);
        player.cooldown = player.maxCooldown;
    }
    
    // Обновляем позицию и поворот меша
    player.mesh.position.x = player.x;
    player.mesh.position.z = player.z;
    player.mesh.rotation.y = -player.bodyAngle;
    
    // Локальный поворот башни относительно корпуса
    const turretLocalAngle = -(player.turretAngle - player.bodyAngle);
    player.mesh.userData.turret.rotation.y = turretLocalAngle;
}

function updateEnemy(e, dt) {
    if (!player) return;
    
    const dx = player.x - e.x;
    const dz = player.z - e.z;
    const targetAngle = Math.atan2(dz, dx);
    
    e.bodyAngle = lerpAngle(e.bodyAngle, targetAngle, 0.06);
    e.turretAngle = lerpAngle(e.turretAngle, targetAngle, 0.12);
    
    const speedMod = getSpeedModifier(e.x, e.z);
    const speed = e.speed * speedMod * dt;
    const newX = e.x + Math.cos(e.bodyAngle) * speed;
    const newZ = e.z + Math.sin(e.bodyAngle) * speed;
    
    if (!collideWithObstacles(newX, e.z, e.radius)) e.x = newX;
    if (!collideWithObstacles(e.x, newZ, e.radius)) e.z = newZ;
    
    // Ограничение
    const half = gameState.worldSize / 2 - 2;
    e.x = Math.max(-half, Math.min(half, e.x));
    e.z = Math.max(-half, Math.min(half, e.z));
    
    // Стрельба, если игрок в зоне видимости
    e.cooldown -= dt;
    const distToPlayer = Math.hypot(dx, dz);
    const angleDiff = Math.abs(Math.atan2(Math.sin(targetAngle - e.turretAngle), Math.cos(targetAngle - e.turretAngle)));
    
    if (e.cooldown <= 0 && distToPlayer < 40 && angleDiff < 0.25) {
        shootTank(e);
        e.cooldown = e.maxCooldown;
    }
    
    e.mesh.position.x = e.x;
    e.mesh.position.z = e.z;
    e.mesh.rotation.y = -e.bodyAngle;
    e.mesh.userData.turret.rotation.y = -(e.turretAngle - e.bodyAngle);
}

function shootTank(tank) {
    const barrelLength = 3.2;
    const bx = tank.x + Math.cos(tank.turretAngle) * barrelLength;
    const bz = tank.z + Math.sin(tank.turretAngle) * barrelLength;
    
    createBullet(bx, bz, tank.turretAngle, tank.isPlayer);
    
    if (tank.isPlayer) Sound.shootPlayer();
    else Sound.shootEnemy();
}

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.life -= dt;
        
        b.mesh.position.x = b.x;
        b.mesh.position.z = b.z;
        
        let remove = false;
        
        // Столкновение с препятствием
        const hitObs = checkBulletHitsObstacles(b.x, b.z, 0.3);
        if (hitObs) {
            if (hitObs.explosive) {
                explodeBarrel(hitObs);
                remove = true;
            } else {
                createExplosion(b.x, b.z, 0.3);
                Sound.bulletHitWall();
                remove = true;
            }
        }
        
        // Границы
        const half = gameState.worldSize / 2 + 5;
        if (Math.abs(b.x) > half || Math.abs(b.z) > half) remove = true;
        if (b.life <= 0) remove = true;
        
        // Столкновение с танками
        if (!remove) {
            if (b.isPlayer) {
                for (let j = enemies.length - 1; j >= 0; j--) {
                    const e = enemies[j];
                    if (Math.hypot(b.x - e.x, b.z - e.z) < e.radius + 0.3) {
                        createExplosion(e.x, e.z, 1);
                        scene.remove(e.mesh);
                        enemies.splice(j, 1);
                        gameState.score += 100;
                        gameState.enemiesKilled = (gameState.enemiesKilled || 0) + 1;
                        Sound.explosion();
                        updateUI();
                        remove = true;
                        break;
                    }
                }
            } else if (player) {
                if (Math.hypot(b.x - player.x, b.z - player.z) < player.radius + 0.3) {
                    createExplosion(player.x, player.z, 0.6);
                    gameState.health -= 20;
                    Sound.playerHit();
                    if (gameState.health <= 0) {
                        gameState.lives--;
                        gameState.health = 100;
                        Sound.lifeLost();
                        if (gameState.lives <= 0) gameOver();
                    }
                    updateUI();
                    remove = true;
                }
            }
        }
        
        if (remove) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
        }
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 20 * dt; // гравитация
        p.life -= dt;
        
        if (p.mesh.position.y < 0) {
            p.mesh.position.y = 0;
            p.vy *= -0.3;
        }
        
        const scale = Math.max(0.01, p.life / p.maxLife);
        p.mesh.scale.set(scale, scale, scale);
        
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
}

function explodeBarrel(barrel) {
    // Удаляем из массива
    const idx = obstacles.indexOf(barrel);
    if (idx !== -1) obstacles.splice(idx, 1);
    scene.remove(barrel.mesh);
    
    createExplosion(barrel.x, barrel.z, 1.5);
    Sound.explosion();
    
    const blastRadius = 10;
    
    // Урон игроку
    if (player) {
        const d = Math.hypot(player.x - barrel.x, player.z - barrel.z);
        if (d < blastRadius) {
            gameState.health -= 40 * (1 - d / blastRadius);
            if (gameState.health <= 0) {
                gameState.lives--;
                gameState.health = 100;
                Sound.lifeLost();
                if (gameState.lives <= 0) gameOver();
            }
            updateUI();
        }
    }
    
    // Урон врагам
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const d = Math.hypot(e.x - barrel.x, e.z - barrel.z);
        if (d < blastRadius) {
            createExplosion(e.x, e.z, 0.8);
            scene.remove(e.mesh);
            enemies.splice(i, 1);
            gameState.score += 100;
        }
    }
    
    // Цепная реакция
    setTimeout(() => {
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const o = obstacles[i];
            if (o.explosive && Math.hypot(o.x - barrel.x, o.z - barrel.z) < 6) {
                explodeBarrel(o);
            }
        }
    }, 100);
}

// ============================================================
// КАМЕРА
// ============================================================
function updateCamera() {
    if (!player) return;
    const targetX = player.x;
    const targetZ = player.z;
    
    const desiredPos = new THREE.Vector3(targetX, 24, targetZ + 18);
    camera.position.lerp(desiredPos, 0.12);
    camera.lookAt(targetX, 0, targetZ);
}

// ============================================================
// UI
// ============================================================
function updateUI() {
    scoreEl.innerText = gameState.score;
    livesEl.innerText = gameState.lives;
    healthBarEl.style.width = Math.max(0, gameState.health) + '%';
    if (gameState.health > 60) healthBarEl.style.background = 'linear-gradient(to right, #0f0, #8f0)';
    else if (gameState.health > 30) healthBarEl.style.background = 'linear-gradient(to right, #ff0, #f80)';
    else healthBarEl.style.background = 'linear-gradient(to right, #f00, #f00)';
}

function gameOver() {
    gameState.isGameOver = true;
    Sound.setEngineIntensity(0);
    Sound.gameOver();
    if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        localStorage.setItem('tankHighScore', gameState.highScore);
    }
    finalScoreEl.innerText = gameState.score;
    finalHighScoreEl.innerText = gameState.highScore;
    gameOverScreen.classList.remove('hidden');
}

// ============================================================
// РЕСТАРТ И ИНИЦИАЛИЗАЦИЯ
// ============================================================
function restartGame() {
    // Очищаем сцену
    clearWorld();
    
    gameState.score = 0;
    gameState.lives = 3;
    gameState.health = 100;
    gameState.isGameOver = false;
    gameState.frameCount = 0;
    gameState.spawnRate = 120;
    gameState.enemiesKilled = 0;
    
    generateMap();
    
    player = createPlayerTank();
    
    // Начальная позиция камеры
    camera.position.set(0, 24, 18);
    camera.lookAt(0, 0, 0);
    
    gameOverScreen.classList.add('hidden');
    updateUI();
    highScoreEl.innerText = gameState.highScore;
    Sound.gameStart();
}

// ============================================================
// ИГРОВОЙ ЦИКЛ
// ============================================================
let lastTime = performance.now();

function gameLoop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    
    if (!gameState.isGameOver && player) {
        gameState.frameCount++;
        if (gameState.frameCount % gameState.spawnRate === 0) spawnEnemy();
        if (gameState.frameCount % 900 === 0 && gameState.spawnRate > 40) gameState.spawnRate -= 10;
        
        updatePlayer(dt);
        for (const e of enemies) updateEnemy(e, dt);
        updateBullets(dt);
        updateParticles(dt);
    }
    
    updateCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

// ============================================================
// ЗАПУСК
// ============================================================
restartBtn.addEventListener('click', restartGame);

resizeCanvas();
restartGame();
requestAnimationFrame(gameLoop);