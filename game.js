/* ============================================================
   game.js  –  Game loop, input, camera, HUD & minimap
   ============================================================ */

// ── Canvas setup ──────────────────────────────────────────────────────
const canvas     = document.getElementById('gameCanvas');
const ctx        = canvas.getContext('2d');
const mmCanvas   = document.getElementById('minimap');
const mmCtx      = mmCanvas.getContext('2d');

// ── Game objects ──────────────────────────────────────────────────────
let city;
let car;
let lastTime = 0;

// ── Camera ────────────────────────────────────────────────────────────
const camera = { x: 0, y: 0, shake: 0 };

// ── Input state ───────────────────────────────────────────────────────
const input = { up: false, down: false, left: false, right: false };

// ── HUD element refs ──────────────────────────────────────────────────
const speedNumEl  = document.getElementById('speedNum');
const surfaceEl   = document.getElementById('surfaceTag');
const gearEl      = document.getElementById('gearTag');
const arcFillEl   = document.getElementById('arcFill');
const hornPopEl   = document.getElementById('hornPop');
const loadFillEl  = document.getElementById('loadFill');
const loadingEl   = document.getElementById('loading');

// Arc path total dash length (half-circle r=55, but arc spans ~180° approx 172px)
const ARC_LEN = 173;

// ── Key listeners ─────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  switch (e.code) {
    case 'ArrowUp':    case 'KeyW': input.up    = true;  e.preventDefault(); break;
    case 'ArrowDown':  case 'KeyS': input.down  = true;  e.preventDefault(); break;
    case 'ArrowLeft':  case 'KeyA': input.left  = true;  e.preventDefault(); break;
    case 'ArrowRight': case 'KeyD': input.right = true;  e.preventDefault(); break;
    case 'Space':                   honk();               e.preventDefault(); break;
  }
});
window.addEventListener('keyup', e => {
  switch (e.code) {
    case 'ArrowUp':    case 'KeyW': input.up    = false; break;
    case 'ArrowDown':  case 'KeyS': input.down  = false; break;
    case 'ArrowLeft':  case 'KeyA': input.left  = false; break;
    case 'ArrowRight': case 'KeyD': input.right = false; break;
  }
});

// ── Horn ──────────────────────────────────────────────────────────────
function honk() {
  hornPopEl.classList.remove('honk');
  void hornPopEl.offsetWidth;  // reflow trick to restart animation
  hornPopEl.classList.add('honk');
}

// ── Resize ────────────────────────────────────────────────────────────
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);

// ── Initialisation ────────────────────────────────────────────────────
function init() {
  resize();

  // Animated loading bar
  let pct = 0;
  const loadInterval = setInterval(() => {
    pct = Math.min(pct + Math.random() * 8 + 2, 100);
    loadFillEl.style.width = pct + '%';
    if (pct >= 100) clearInterval(loadInterval);
  }, 40);

  // Generate city (takes a tick)
  setTimeout(() => {
    city = new City();

    // Spawn car on road — intersection area of row 2, col 3
    const spawnX = CELL_SZ * 3 + ROAD_W / 2;
    const spawnY = CELL_SZ * 2 + ROAD_W / 2;
    car = new Car(spawnX, spawnY, 0);   // red car

    // Fade out loading screen after city is ready
    setTimeout(() => {
      loadingEl.classList.add('fade-out');
      setTimeout(() => { loadingEl.style.display = 'none'; }, 700);
      requestAnimationFrame(gameLoop);
    }, 400);
  }, 100);
}

// ── Game loop ─────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);  // cap at 50ms
  lastTime = timestamp;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

// ── Update ────────────────────────────────────────────────────────────
function update(dt) {
  car.update(dt, input, city);

  // Camera target: center on car
  const targetX = car.x - canvas.width  / 2;
  const targetY = car.y - canvas.height / 2;

  // Smooth camera lerp
  camera.x += (targetX - camera.x) * Math.min(8 * dt, 1);
  camera.y += (targetY - camera.y) * Math.min(8 * dt, 1);

  // Camera shake on off-road
  const onRoad = city.isOnRoad(car.x, car.y);
  const spd    = car.getSpeedKmh();
  camera.shake = onRoad ? 0 : Math.min(spd / 40, 2.5);

  // ── HUD updates ─────────────────────────────────────────────────────
  const kmh = spd;
  speedNumEl.textContent = kmh;

  // Speed color
  speedNumEl.className =
    kmh < 40 ? 'spd-slow' :
    kmh < 75 ? 'spd-mid'  :
    kmh < 100 ? 'spd-fast' : 'spd-red';

  // Arc fill (0 → ARC_LEN based on speed ratio)
  const ratio    = Math.min(kmh / 120, 1);
  const dashFill = ratio * ARC_LEN;
  arcFillEl.style.strokeDasharray = `${dashFill} ${ARC_LEN}`;
  arcFillEl.style.stroke =
    kmh < 40 ? '#2ecc71' :
    kmh < 75 ? '#f1c40f' :
    kmh < 100 ? '#e67e22' : '#e74c3c';

  // Surface tag
  if (onRoad) {
    surfaceEl.textContent = 'ROAD';
    surfaceEl.classList.remove('off-road');
  } else {
    surfaceEl.textContent = 'OFF-ROAD';
    surfaceEl.classList.add('off-road');
  }

  // Gear tag
  if (car.isReversing()) {
    gearEl.textContent = '▼ REVERSE';
    gearEl.className   = 'reverse';
  } else if (Math.abs(car.speed) < 2) {
    gearEl.textContent = '■ IDLE';
    gearEl.className   = 'idle';
  } else {
    gearEl.textContent = '▲ DRIVE';
    gearEl.className   = '';
  }
}

// ── Render ────────────────────────────────────────────────────────────
function render() {
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Apply camera shake
  const sx = camera.shake > 0 ? (Math.random() - .5) * camera.shake * 2 : 0;
  const sy = camera.shake > 0 ? (Math.random() - .5) * camera.shake * 2 : 0;

  ctx.save();
  ctx.translate(Math.round(-camera.x + sx), Math.round(-camera.y + sy));

  city.draw(ctx);
  car.draw(ctx);

  ctx.restore();

  // Subtle vignette
  _drawVignette(W, H);

  // Minimap
  _drawMinimap();
}

function _drawVignette(W, H) {
  const grad = ctx.createRadialGradient(W/2, H/2, H*.25, W/2, H/2, H*.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// ── Minimap ───────────────────────────────────────────────────────────
const MM_W    = 160;
const MM_H    = 160;
const MM_SCALE = MM_W / WORLD_W;    // world → minimap

// Pre-bake minimap background (city layout)
let mmBg = null;

function _buildMinimapBg() {
  const bg     = document.createElement('canvas');
  bg.width     = MM_W;
  bg.height    = MM_H;
  const bgCtx  = bg.getContext('2d');

  // Road base
  bgCtx.fillStyle = '#0d0d0d';
  bgCtx.fillRect(0, 0, MM_W, MM_H);

  // Roads as thin bright lines
  bgCtx.fillStyle = '#2a2a2a';
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const rx = c * CELL_SZ * MM_SCALE;
      const ry = r * CELL_SZ * MM_SCALE;
      const rw = ROAD_W  * MM_SCALE;
      const cs = CELL_SZ * MM_SCALE;
      bgCtx.fillRect(rx, ry, rw, cs);   // vertical road strip
      bgCtx.fillRect(rx, ry, cs, rw);   // horizontal road strip
    }
  }

  // Block fill
  for (const block of city.blocks) {
    const bx = (block.c * CELL_SZ + ROAD_W) * MM_SCALE;
    const by = (block.r * CELL_SZ + ROAD_W) * MM_SCALE;
    const bw = BLOCK_SZ * MM_SCALE;
    const bh = BLOCK_SZ * MM_SCALE;
    bgCtx.fillStyle = block.type === 'park' ? '#1a4a1a' : '#3a3a3a';
    bgCtx.fillRect(bx, by, bw, bh);
  }

  return bg;
}

function _drawMinimap() {
  if (!mmBg) mmBg = _buildMinimapBg();

  mmCtx.clearRect(0, 0, MM_W, MM_H);
  mmCtx.drawImage(mmBg, 0, 0);

  // Car dot
  const cx = car.x * MM_SCALE;
  const cy = car.y * MM_SCALE;

  // Direction line
  mmCtx.strokeStyle = '#f39c12';
  mmCtx.lineWidth   = 1.5;
  mmCtx.beginPath();
  mmCtx.moveTo(cx, cy);
  mmCtx.lineTo(
    cx + Math.cos(car.angle) * 9,
    cy + Math.sin(car.angle) * 9
  );
  mmCtx.stroke();

  // Dot
  mmCtx.fillStyle = '#f39c12';
  mmCtx.beginPath();
  mmCtx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  mmCtx.fill();

  // Outer ring glow
  mmCtx.strokeStyle = 'rgba(243,156,18,.4)';
  mmCtx.lineWidth   = 1;
  mmCtx.beginPath();
  mmCtx.arc(cx, cy, 6, 0, Math.PI * 2);
  mmCtx.stroke();

  // View-area indicator (dashed rect showing current viewport)
  const vx = camera.x * MM_SCALE;
  const vy = camera.y * MM_SCALE;
  const vw = canvas.width  * MM_SCALE;
  const vh = canvas.height * MM_SCALE;
  mmCtx.strokeStyle = 'rgba(255,255,255,.18)';
  mmCtx.lineWidth   = 0.8;
  mmCtx.setLineDash([3, 3]);
  mmCtx.strokeRect(vx, vy, vw, vh);
  mmCtx.setLineDash([]);
}

// ── Boot ──────────────────────────────────────────────────────────────
window.addEventListener('load', init);
