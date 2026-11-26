// Sky Courier — a small deterministic-friendly flight game.
// Canvas 2D, no external assets. Supports staged screenshot scenes via
// ?shot=start|play|end&seed=N which set window.__shotReady when rendered.

const W = 960, H = 540;
const GROUND = H - 64;
const FUEL_DRAIN = { cruise: 1.9, boost: 3.4 }; // fuel units per second

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seedParam = Number(params.get('seed') || 7);

// --- deterministic RNG (mulberry32) ---------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(seedParam * 1000 + 17);
const rand = (a, b) => a + rng() * (b - a);

// --- input ------------------------------------------------------------------
const keys = new Set();
let pointerY = null, pointerActive = false;
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key === 'Enter' && state !== 'play') startGame();
  if ((e.key === 'r' || e.key === 'R') && state === 'over') startGame();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  pointerY = (e.clientY - r.top) * (H / r.height);
  pointerActive = true;
});
canvas.addEventListener('pointerdown', () => { if (state !== 'play') startGame(); });
canvas.addEventListener('pointerleave', () => { pointerActive = false; });

// --- game state ---------------------------------------------------------------
let state = 'start'; // start | play | over
let t = 0, distance = 0, score = 0, parcels = 0;
let fuel = 100, hearts = 3, invincibleUntil = -1, propAngle = 0;
let speed = 265, shake = 0, overReason = '';
const plane = { x: 190, y: H * 0.44, vy: 0, r: 17 };
let obstacles = [], pickups = [], cloudsFar = [], cloudsNear = [], stars = [];
let spawnTimer = 0, pickupTimer = 1.2;

function makeScenery() {
  stars = []; cloudsFar = []; cloudsNear = [];
  for (let i = 0; i < 70; i++) stars.push({ x: rng() * W, y: rng() * H * 0.5, s: rng() * 1.6 + 0.4 });
  for (let i = 0; i < 7; i++) cloudsFar.push({ x: rng() * W, y: rand(30, 190), s: rand(0.6, 1.1) });
  for (let i = 0; i < 5; i++) cloudsNear.push({ x: rng() * W, y: rand(60, 300), s: rand(1.1, 1.7) });
}
makeScenery();

function startGame() {
  rng = mulberry32((Date.now() % 100000) + 11);
  state = 'play'; t = 0; distance = 0; score = 0; parcels = 0;
  fuel = 100; hearts = 3; invincibleUntil = -1; speed = 265; shake = 0;
  plane.y = H * 0.44; plane.vy = 0;
  obstacles = []; pickups = []; spawnTimer = 0.9; pickupTimer = 1.4;
  makeScenery();
}

function spawnObstacle() {
  const kind = rng();
  if (kind < 0.42) {
    const h = rand(90, 250);
    obstacles.push({ type: 'building', x: W + 60, w: rand(52, 84), h, hue: rand(210, 250) });
  } else if (kind < 0.74) {
    obstacles.push({ type: 'bird', x: W + 40, y: rand(70, GROUND - 130), ph: rand(0, 6.28), r: 13 });
  } else {
    obstacles.push({ type: 'storm', x: W + 70, y: rand(60, 240), r: rand(38, 58) });
  }
}
function spawnPickup() {
  if (rng() < 0.55) pickups.push({ type: 'parcel', x: W + 30, y: rand(80, GROUND - 90), r: 12 });
  else pickups.push({ type: 'fuel', x: W + 30, y: rand(80, GROUND - 90), r: 12 });
}

function hitCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}

function damage(reason) {
  if (t < invincibleUntil) return;
  hearts -= 1; shake = 9; invincibleUntil = t + 1.4;
  if (hearts <= 0) { state = 'over'; overReason = reason; }
}

function update(dt) {
  t += dt; propAngle += dt * (state === 'play' ? 42 : 6);
  // scenery always drifts a little, even on menu screens
  const drift = state === 'play' ? speed : 26;
  for (const c of cloudsFar) { c.x -= drift * 0.18 * dt; if (c.x < -120) { c.x = W + 120; c.y = rand(30, 190); } }
  for (const c of cloudsNear) { c.x -= drift * 0.45 * dt; if (c.x < -160) { c.x = W + 160; c.y = rand(60, 300); } }
  if (state !== 'play') return;

  speed = 265 + Math.min(120, distance / 90);
  const boost = keys.has(' ') ? 1.45 : 1;
  distance += speed * boost * dt / 9;
  score += speed * boost * dt / 9;

  // plane vertical control
  const ACC = 1500, MAXV = 330;
  if (keys.has('arrowup') || keys.has('w')) plane.vy -= ACC * dt;
  if (keys.has('arrowdown') || keys.has('s')) plane.vy += ACC * dt;
  if (pointerActive && pointerY !== null) {
    const target = (pointerY - plane.y) * 6;
    plane.vy += (target - plane.vy) * Math.min(1, dt * 7);
  }
  if (!keys.has('arrowup') && !keys.has('arrowdown') && !keys.has('w') && !keys.has('s') && !pointerActive) {
    plane.vy *= Math.pow(0.0018, dt); // settle
    plane.vy += Math.sin(t * 2.1) * 14 * dt; // gentle bob
  }
  plane.vy = Math.max(-MAXV, Math.min(MAXV, plane.vy));
  plane.y += plane.vy * dt;
  if (plane.y < 30) { plane.y = 30; plane.vy = Math.max(plane.vy, 0); }
  if (plane.y > GROUND - 16) { plane.y = GROUND - 16; damage('You clipped the rooftops.'); plane.vy = -140; }

  fuel -= dt * (boost > 1 ? FUEL_DRAIN.boost : FUEL_DRAIN.cruise);
  if (fuel <= 0) { fuel = 0; state = 'over'; overReason = 'Out of fuel over the city.'; }

  spawnTimer -= dt;
  if (spawnTimer <= 0) { spawnObstacle(); spawnTimer = rand(0.75, 1.35) * (265 / speed); }
  pickupTimer -= dt;
  if (pickupTimer <= 0) { spawnPickup(); pickupTimer = rand(1.6, 3.1); }

  const vx = speed * boost;
  for (const o of obstacles) {
    o.x -= vx * dt;
    if (o.type === 'bird') o.y += Math.sin(t * 6 + o.ph) * 26 * dt;
    if (o.type === 'building') {
      if (plane.x + plane.r > o.x + 4 && plane.x - plane.r < o.x + o.w - 4 && plane.y + plane.r > GROUND - o.h) damage('You clipped a rooftop crane.');
    } else if (hitCircle(plane.x, plane.y, plane.r - 3, o.x, o.y, o.r)) {
      damage(o.type === 'bird' ? 'A very surprised goose.' : 'You flew through a thunderhead.');
    }
  }
  obstacles = obstacles.filter((o) => o.x > -120);
  for (const p of pickups) {
    p.x -= vx * dt;
    if (!p.taken && hitCircle(plane.x, plane.y, plane.r + 4, p.x, p.y, p.r)) {
      p.taken = true;
      if (p.type === 'parcel') { parcels += 1; score += 150; }
      else fuel = Math.min(100, fuel + 34);
    }
  }
  pickups = pickups.filter((p) => p.x > -40 && !p.taken);
  if (shake > 0) shake = Math.max(0, shake - dt * 16);
}

// --- drawing ------------------------------------------------------------------
function sky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2f6db3'); g.addColorStop(0.55, '#79b5e8'); g.addColorStop(1, '#cfe8ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const s of stars) { ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2 + s.x); ctx.fillRect(s.x, s.y, s.s, s.s); }
  ctx.globalAlpha = 1;
  // sun
  const sg = ctx.createRadialGradient(830, 84, 6, 830, 84, 90);
  sg.addColorStop(0, 'rgba(255,244,190,.95)'); sg.addColorStop(1, 'rgba(255,244,190,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(830, 84, 90, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffedb0'; ctx.beginPath(); ctx.arc(830, 84, 30, 0, 7); ctx.fill();
}
function cloud(x, y, s, dark) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = dark ? 'rgba(74,88,116,.92)' : 'rgba(255,255,255,.92)';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, 7); ctx.arc(24, -7, 27, 0, 7); ctx.arc(52, 0, 21, 0, 7); ctx.arc(26, 8, 24, 0, 7);
  ctx.fill(); ctx.restore();
}
function drawBuilding(o) {
  const top = GROUND - o.h;
  ctx.fillStyle = `hsl(${o.hue} 32% 30%)`;
  ctx.fillRect(o.x, top, o.w, o.h);
  ctx.fillStyle = `hsl(${o.hue} 36% 22%)`;
  ctx.fillRect(o.x, top, o.w, 8);
  // crane on some rooftops
  if (o.h > 170) {
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(o.x + o.w / 2, top); ctx.lineTo(o.x + o.w / 2, top - 26);
    ctx.lineTo(o.x + o.w + 16, top - 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(o.x + o.w + 10, top - 26); ctx.lineTo(o.x + o.w + 10, top - 8); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,222,120,.9)';
  const cols = Math.floor(o.w / 16), rows = Math.floor(o.h / 24);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if ((i * 7 + j * 13 + Math.floor(o.x)) % 3 !== 0) ctx.fillRect(o.x + 6 + i * 16, top + 14 + j * 24, 7, 10);
  }
}
function drawBird(o) {
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.strokeStyle = '#33415e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const f = Math.sin(t * 10 + o.ph) * 6;
  ctx.beginPath(); ctx.moveTo(-13, -2 - f); ctx.quadraticCurveTo(-5, 3, 0, 0); ctx.quadraticCurveTo(5, 3, 13, -2 - f); ctx.stroke();
  ctx.fillStyle = '#f4f7ff'; ctx.beginPath(); ctx.ellipse(0, 1, 7, 4.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(12, 2); ctx.lineTo(6, 4); ctx.fill();
  ctx.restore();
}
function drawStorm(o) {
  cloud(o.x, o.y, o.r / 30, true);
  ctx.save(); ctx.translate(o.x + 18, o.y + 16);
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-7, 16); ctx.lineTo(-1, 16); ctx.lineTo(-5, 30); ctx.lineTo(8, 12); ctx.lineTo(2, 12); ctx.fill();
  ctx.restore();
}
function drawPickup(p) {
  ctx.save(); ctx.translate(p.x, p.y + Math.sin(t * 3 + p.x) * 3);
  if (p.type === 'parcel') {
    ctx.fillStyle = '#c98d4b'; ctx.fillRect(-11, -9, 22, 18);
    ctx.strokeStyle = '#8a5a24'; ctx.lineWidth = 2; ctx.strokeRect(-11, -9, 22, 18);
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.stroke();
  } else {
    ctx.fillStyle = '#e63946'; ctx.fillRect(-8, -11, 16, 22);
    ctx.fillStyle = '#fff'; ctx.fillRect(-8, -3, 16, 6);
    ctx.fillStyle = '#e63946'; ctx.fillRect(2, -15, 5, 5);
  }
  ctx.restore();
}
function drawPlane() {
  const blink = t < invincibleUntil && Math.floor(t * 14) % 2 === 0;
  ctx.save(); ctx.translate(plane.x, plane.y);
  ctx.rotate(Math.max(-0.32, Math.min(0.32, plane.vy / 900)));
  ctx.scale(1.22, 1.22);
  ctx.globalAlpha = blink ? 0.35 : 1;
  // tail + wing behind body
  ctx.fillStyle = '#d6455a';
  ctx.beginPath(); ctx.moveTo(-20, -2); ctx.lineTo(-32, -14); ctx.lineTo(-24, 0); ctx.lineTo(-32, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b6cb0';
  ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(-14, 20); ctx.lineTo(2, 20); ctx.lineTo(12, 4); ctx.closePath(); ctx.fill();
  // fuselage
  const g = ctx.createLinearGradient(0, -12, 0, 12);
  g.addColorStop(0, '#ffe9a8'); g.addColorStop(0.5, '#ffb703'); g.addColorStop(1, '#f08c00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 30, 11, 0, 0, 7); ctx.fill();
  // courier box marking
  ctx.fillStyle = '#8a5a24'; ctx.fillRect(-12, -5, 13, 10);
  ctx.strokeStyle = '#6d4517'; ctx.lineWidth = 1.4; ctx.strokeRect(-12, -5, 13, 10);
  // cockpit
  ctx.fillStyle = '#bfe6ff'; ctx.beginPath(); ctx.ellipse(12, -6, 9, 6, -0.2, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(30,60,90,.5)'; ctx.stroke();
  // propeller
  ctx.strokeStyle = 'rgba(40,40,50,.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const pa = propAngle;
  ctx.beginPath();
  ctx.moveTo(31, Math.sin(pa) * -11); ctx.lineTo(31, Math.sin(pa + Math.PI) * -11);
  ctx.stroke();
  ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(30, 0, 3.4, 0, 7); ctx.fill();
  ctx.restore();
}
function drawGround() {
  ctx.fillStyle = '#3d5a45'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#2c4433'; ctx.fillRect(0, GROUND, W, 6);
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  const off = (distance * 9) % 46;
  for (let x = -off; x < W; x += 46) ctx.fillRect(x, GROUND + 34, 26, 5);
}
function hud() {
  ctx.fillStyle = 'rgba(10,20,40,.55)';
  ctx.beginPath(); ctx.roundRect(14, 12, 300, 40, 10); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 19px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`Score ${Math.floor(score)}`, 26, 39);
  ctx.font = '14px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#cfe2ff';
  ctx.fillText(`📦 ${parcels}   ${Math.floor(distance)} m`, 168, 39);
  // fuel
  ctx.fillStyle = 'rgba(10,20,40,.55)'; ctx.beginPath(); ctx.roundRect(W - 214, 12, 200, 40, 10); ctx.fill();
  ctx.fillStyle = fuel < 25 ? '#ff5d5d' : '#ffd34d';
  ctx.beginPath(); ctx.roundRect(W - 202, 30, Math.max(0, 118 * fuel / 100), 10, 5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('FUEL', W - 202, 25);
  ctx.font = '15px sans-serif';
  ctx.fillText('❤'.repeat(Math.max(0, hearts)) + '🖤'.repeat(Math.max(0, 3 - hearts)), W - 70, 42);
}
function panel(title, lines, foot) {
  ctx.fillStyle = 'rgba(8,16,36,.48)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(13,26,54,.92)';
  ctx.beginPath(); ctx.roundRect(W / 2 - 265, 120, 530, 300, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(140,180,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.font = 'bold 46px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(title, W / 2, 196);
  ctx.font = '17px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#cfe2ff';
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, 244 + i * 27));
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#ffd34d';
  ctx.fillText(foot, W / 2, 384);
}
function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.4, rand(-shake, shake) * 0.4);
  sky();
  for (const c of cloudsFar) cloud(c.x, c.y, c.s, false);
  for (const o of obstacles) {
    if (o.type === 'building') drawBuilding(o);
    else if (o.type === 'bird') drawBird(o);
    else drawStorm(o);
  }
  for (const p of pickups) drawPickup(p);
  for (const c of cloudsNear) { ctx.globalAlpha = 0.75; cloud(c.x, c.y, c.s, false); ctx.globalAlpha = 1; }
  drawPlane();
  drawGround();
  ctx.restore();
  if (state === 'play') hud();
  if (state === 'start') panel('SKY COURIER', [
    'Thread your little mail plane through the skyline.',
    'Grab 📦 parcels for +150, red cans refill your fuel.',
    'Dodge rooftops, geese and thunderheads.',
    'Three hits — or an empty tank — ends the run.',
  ], 'Press ENTER or click to take off');
  if (state === 'over') panel('DELIVERY FAILED', [
    overReason,
    `Final score ${Math.floor(score)} · ${Math.floor(distance)} m · 📦 ${parcels} delivered`,
  ], 'Press R or click to fly again');
}

// --- staged scenes for screenshots --------------------------------------------
function stageShot() {
  document.body.classList.add('shot');
  rng = mulberry32(seedParam * 1000 + 17);
  makeScenery();
  if (shotMode === 'start') { state = 'start'; render(); }
  else if (shotMode === 'play') {
    state = 'play';
    // simulate ~4.5 s of autopilot flight with the seeded RNG
    for (let i = 0; i < 270; i++) {
      plane.vy = Math.sin(i / 22) * 130;
      const keepHearts = hearts, keepState = state;
      update(1 / 60);
      hearts = keepHearts; state = keepState === 'over' ? 'play' : state;
      if (fuel < 55) fuel = 55;
    }
    score = Math.max(score, 640); distance = Math.max(distance, 780);
    render();
  } else if (shotMode === 'end') {
    state = 'play';
    for (let i = 0; i < 330; i++) { plane.vy = Math.sin(i / 19) * 150; update(1 / 60); if (fuel < 40) fuel = 40; }
    state = 'over'; overReason = 'A very surprised goose.';
    score = Math.max(score, 1240); distance = Math.max(distance, 1390); parcels = Math.max(parcels, 4);
    render();
  }
  window.__shotReady = true;
}

if (shotMode) stageShot();
else {
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    update(dt); render();
    requestAnimationFrame(loop);
  })(last);
}
