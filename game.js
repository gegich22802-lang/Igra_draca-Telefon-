(() => {
'use strict';

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const W = 1280, H = 720;
canvas.width = W; canvas.height = H;

const GROUND  = H - 90;
const GRAVITY = 1.15;
const WALL_L  = 24, WALL_R = W - 24;

const MAX_ROUNDS  = 3;
const WINS_TO_WIN = 2;

/* ==========================================================
   КАРТЫ
   ========================================================== */
const MAPS = [
  { id: 'neon', name: 'NEON CITY',
    thumb: 'linear-gradient(135deg, #08101d 0%, #16243c 55%, #3aa8ff 100%)',
    sky: ['#08101d', '#16243c', '#0a1120'], glow: 'rgba(70,150,255,0.22)',
    building: 'rgba(15,28,48,0.85)', window: 'rgba(90,170,255,0.18)',
    ground: '#070c14', groundLine: '#172a45', grid: 'rgba(80,160,255,0.14)',
    decor: 'none' },
  { id: 'desert', name: 'SUNSET DESERT',
    thumb: 'linear-gradient(135deg, #2a0e04 0%, #7a2a12 55%, #f0a050 100%)',
    sky: ['#2a0e04', '#7a2a12', '#f0a050'], glow: 'rgba(255,160,60,0.28)',
    building: 'rgba(70,30,15,0.88)', window: 'rgba(255,200,120,0.22)',
    ground: '#1a0804', groundLine: '#5a2010', grid: 'rgba(255,160,80,0.16)',
    decor: 'none' },
  { id: 'ice', name: 'ARCTIC BASE',
    thumb: 'linear-gradient(135deg, #0a1828 0%, #1e4a6e 55%, #a8d8f0 100%)',
    sky: ['#0a1828', '#1e4a6e', '#a8d8f0'], glow: 'rgba(160,220,255,0.28)',
    building: 'rgba(30,60,90,0.88)', window: 'rgba(200,240,255,0.22)',
    ground: '#0a1420', groundLine: '#2a5070', grid: 'rgba(140,200,255,0.18)',
    decor: 'none' },
  { id: 'volcano', name: 'VOLCANO CORE',
    thumb: 'linear-gradient(135deg, #1a0404 0%, #4a0808 55%, #ff6020 100%)',
    sky: ['#1a0404', '#4a0808', '#c03010'], glow: 'rgba(255,80,40,0.32)',
    building: 'rgba(50,10,10,0.9)', window: 'rgba(255,120,60,0.22)',
    ground: '#0a0202', groundLine: '#4a1008', grid: 'rgba(255,100,50,0.18)',
    decor: 'embers' },
  { id: 'space', name: 'ORBITAL STATION',
    thumb: 'linear-gradient(135deg, #000005 0%, #0a0525 55%, #a070ff 100%)',
    sky: ['#000005', '#0a0525', '#1a0a3a'], glow: 'rgba(180,120,255,0.28)',
    building: 'rgba(20,15,45,0.9)', window: 'rgba(200,160,255,0.22)',
    ground: '#05020f', groundLine: '#2a1545', grid: 'rgba(180,140,255,0.18)',
    decor: 'stars' },
];
let currentMap = 0;

/* ---------- Декор ---------- */
const stars = [];
for (let i = 0; i < 130; i++) stars.push({
  x: Math.random() * W, y: Math.random() * GROUND * 0.75,
  size: 0.4 + Math.random() * 1.8,
  phase: Math.random() * Math.PI * 2,
  speed: 0.4 + Math.random() * 1.6,
});
const embers = [];
for (let i = 0; i < 50; i++) embers.push({
  x: Math.random() * W, y: GROUND - Math.random() * 350,
  vy: -0.3 - Math.random() * 1.0,
  size: 0.8 + Math.random() * 2.2,
  phase: Math.random() * Math.PI * 2,
});

/* ==========================================================
   ВВОД (клавиатура + тач)
   ========================================================== */
const keys = {};
function keyOn(e)  {
  if (e.code) keys[e.code] = true;
  const k = (e.key || '').toLowerCase(); if (k) keys[k] = true;
}
function keyOff(e) {
  if (e.code) keys[e.code] = false;
  const k = (e.key || '').toLowerCase(); if (k) keys[k] = false;
}

/* Действия (удар/пинок/прыжок) — вызываются из keyboard И touch */
function fireAction(code) {
  if (gameState !== 'playing' || roundState !== 'fight') return;
  for (const f of fighters) {
    if (f.hitStun > 0 || f.ko) continue;
    if (code === f.controls.punch && !f.attack && f.cooldown <= 0) {
      f.startAttack('punch');
    } else if (code === f.controls.kick && !f.attack && f.cooldown <= 0) {
      f.startAttack('kick');
    } else if (code === f.controls.up && f.grounded && !f.attack) {
      f.vy = -17;
      f.grounded = false;
      for (const limb of [...f.arms, ...f.legs])
        for (const p of limb.pts) p.py += 4;
    }
  }
}

window.addEventListener('keydown', e => {
  if (e.code === 'Space' || (e.code || '').startsWith('Arrow') ||
      e.key === ' ' || (e.key || '').startsWith('Arrow')) e.preventDefault();

  if (e.repeat) { keyOn(e); return; }
  keyOn(e);

  if (e.code === 'Escape') {
    if (gameState === 'playing') showMenu();
    return;
  }
  if (gameState === 'menu') {
    if (e.code === 'Enter' || e.code === 'Space') startMatch();
    return;
  }
  if (gameState === 'matchOver') {
    if (e.code === 'KeyR' || e.code === 'Enter') startMatch();
    return;
  }
  fireAction(e.code);
});
window.addEventListener('keyup', keyOff);
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* ---------- ТАЧ-КОНТРОЛИ ---------- */
const touchControlsEl = document.getElementById('touchControls');
const isTouchDevice = (
  navigator.maxTouchPoints > 0 ||
  matchMedia('(pointer: coarse)').matches ||
  matchMedia('(hover: none)').matches ||
  location.search.includes('touch=1')
);
if (isTouchDevice) document.body.classList.add('touch-mode');

function setTouchVisible(v) {
  if (!isTouchDevice) return;
  touchControlsEl.classList.toggle('hidden', !v);
  if (!v) {
    // если скрываем — снимаем все нажатия
    for (const btn of touchControlsEl.querySelectorAll('.tc-btn')) {
      keys[btn.dataset.code] = false;
      btn.classList.remove('pressed');
    }
  }
}

function setupTouchControls() {
  if (!isTouchDevice) return;

  for (const btn of touchControlsEl.querySelectorAll('.tc-btn')) {
    const code = btn.dataset.code;
    let pressedByPointer = null;

    const press = (e) => {
      e.preventDefault();
      if (pressedByPointer !== null) return;
      pressedByPointer = e.pointerId;
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      keys[code] = true;
      btn.classList.add('pressed');
      fireAction(code);
    };
    const release = (e) => {
      if (pressedByPointer !== null && e.pointerId !== pressedByPointer) return;
      pressedByPointer = null;
      keys[code] = false;
      btn.classList.remove('pressed');
    };

    btn.addEventListener('pointerdown',   press,   { passive: false });
    btn.addEventListener('pointerup',     release, { passive: false });
    btn.addEventListener('pointercancel', release, { passive: false });
    // на случай если pointerup где-то "потерялся" — сброс при потере захвата
    btn.addEventListener('lostpointercapture', release);
  }
}
setupTouchControls();

/* ---------- Утилиты ---------- */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else         { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Частицы / тряска ---------- */
const particles = [];
function spawnHitParticles(x, y, color, count = 20) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 8;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3,
      life: 1, decay: 0.02 + Math.random() * 0.03,
      color, size: 2 + Math.random() * 4,
    });
  }
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.35; p.vx *= 0.96;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
let shakeAmount = 0;
const shake = v => { shakeAmount = Math.max(shakeAmount, v); };

/* ==========================================================
   FIGHTER
   ========================================================== */
class Fighter {
  constructor(cfg) {
    this.name = cfg.name; this.spawnX = cfg.x;
    this.x = cfg.x; this.y = GROUND - 92;
    this.vx = 0; this.vy = 0;
    this.w = 56; this.h = 64; this.footLen = 60;
    this.angle = 0; this.angVel = 0;
    this.facing = cfg.facing;
    this.color = cfg.color; this.accent = cfg.accent; this.dark = cfg.dark;
    this.controls = cfg.controls;

    this.health = 100; this.maxHealth = 100;
    this.grounded = true;
    this.hitStun = 0; this.ragdoll = 0;
    this.attack = null; this.cooldown = 0; this.flash = 0;
    this.wins = 0; this.ko = false;

    this.arms = [
      this.makeLimb({ x: -26, y: -20 }, [28, 28], 9,  this.accent),
      this.makeLimb({ x:  26, y: -20 }, [28, 28], 9,  this.accent),
    ];
    this.legs = [
      this.makeLimb({ x: -12, y:  32 }, [30, 30], 11, this.dark),
      this.makeLimb({ x:  12, y:  32 }, [30, 30], 11, this.dark),
    ];
  }
  makeLimb(anchor, lengths, width, color) {
    const pts = [];
    let px = this.x + anchor.x, py = this.y + anchor.y;
    for (const L of lengths) { py += L; pts.push({ x: px, y: py, px, py }); }
    return { anchor, lengths, width, color, pts };
  }
  worldAnchor(a) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return { x: this.x + a.x * c - a.y * s, y: this.y + a.x * s + a.y * c };
  }

  update(canInput) {
    const c = this.controls;
    if (this.cooldown > 0) this.cooldown--;
    if (this.flash    > 0) this.flash--;
    if (this.hitStun  > 0) this.hitStun--;
    if (this.ragdoll  > 0) this.ragdoll--;

    if (this.attack) {
      this.attack.timer++;
      if (this.attack.timer >= this.attack.duration) {
        this.attack = null; this.cooldown = 5;
      }
    }

    let moveDir = 0;
    if (canInput && this.hitStun <= 0 && !this.ko) {
      if (keys[c.left])  moveDir -= 1;
      if (keys[c.right]) moveDir += 1;
    }

    const accel = this.grounded ? 1.6 : 0.7;
    if (moveDir !== 0 && this.hitStun <= 0 && !this.ko) {
      this.vx += moveDir * accel;
      if (!this.attack) this.facing = moveDir;
    }
    this.vx *= this.grounded ? 0.82 : 0.965;
    this.vx = clamp(this.vx, -8, 8);

    this.vy += GRAVITY;
    this.x  += this.vx;
    this.y  += this.vy;

    const floor = GROUND - this.h / 2 - this.footLen;
    if (this.y >= floor) {
      if (this.vy > 9) {
        for (const limb of [...this.arms, ...this.legs])
          for (const p of limb.pts) { p.py -= this.vy * 0.25; p.px += (Math.random() - 0.5) * 3; }
      }
      this.y = floor; this.vy = 0; this.grounded = true;
    } else this.grounded = false;

    const halfW = this.w / 2;
    if (this.x - halfW < WALL_L) { this.x = WALL_L + halfW; this.vx = Math.abs(this.vx) * 0.35; }
    if (this.x + halfW > WALL_R) { this.x = WALL_R - halfW; this.vx = -Math.abs(this.vx) * 0.35; }

    this.angle += this.angVel;
    this.angVel *= 0.90;
    if (this.ragdoll <= 0) {
      this.angle *= 0.80;
      if (Math.abs(this.angle) < 0.005) this.angle = 0;
    }
    this.updateLimbs();
  }

  startAttack(type) {
    const frontArm = this.arms[this.facing > 0 ? 1 : 0];
    const frontLeg = this.legs[this.facing > 0 ? 1 : 0];
    this.vx += this.facing * 2.5;
    if (type === 'punch') {
      this.attack = { type: 'punch', limb: frontArm,
        timer: 0, duration: 20, hitStart: 6, hitEnd: 13,
        hitDone: false, damage: 7, knockback: 7 };
    } else {
      this.attack = { type: 'kick', limb: frontLeg,
        timer: 0, duration: 30, hitStart: 10, hitEnd: 20,
        hitDone: false, damage: 13, knockback: 12 };
    }
  }

  solveChain(limb, anchor, withGround = true) {
    let prev = anchor, prevFixed = true;
    for (let i = 0; i < limb.pts.length; i++) {
      const p = limb.pts[i];
      const dx = p.x - prev.x, dy = p.y - prev.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const diff = (d - limb.lengths[i]) / d;
      if (prevFixed) { p.x -= dx * diff; p.y -= dy * diff; }
      else {
        const ox = dx * diff * 0.5, oy = dy * diff * 0.5;
        p.x -= ox; p.y -= oy; prev.x += ox; prev.y += oy;
      }
      prev = p; prevFixed = false;
    }
    if (withGround) for (const p of limb.pts) {
      if (p.y > GROUND) {
        p.y = GROUND;
        const vx = p.x - p.px;
        p.px = p.x - vx * 0.4;
        p.py = p.y;
      }
    }
  }

  updateLimbs() {
    let attackLimb = null, attackTarget = null, attackPull = 0;
    if (this.attack) {
      const a = this.attack;
      const prog = a.timer / a.duration;
      const ext  = Math.sin(clamp(prog, 0, 1) * Math.PI);
      attackPull = 0.55 * ext;
      attackLimb = a.limb;
      attackTarget = {
        x: this.x + this.facing * (this.w / 2 + (a.type === 'punch' ? 55 : 65) * ext),
        y: this.y + (a.type === 'punch' ? -22 : 20),
      };
    }
    for (const limb of [...this.arms, ...this.legs]) {
      const anchor = this.worldAnchor(limb.anchor);
      for (const p of limb.pts) {
        const vx = (p.x - p.px) * 0.94, vy = (p.y - p.py) * 0.94;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + GRAVITY;
      }
      for (let i = 0; i < 4; i++) this.solveChain(limb, anchor);
      if (limb === attackLimb && attackPull > 0) {
        const end = limb.pts[limb.pts.length - 1];
        end.x += (attackTarget.x - end.x) * attackPull;
        end.y += (attackTarget.y - end.y) * attackPull;
        this.solveChain(limb, anchor);
      }
    }
  }

  takeHit(damage, dir, power) {
    this.health = Math.max(0, this.health - damage);
    this.hitStun = 22; this.ragdoll = 45; this.attack = null;
    this.vx += dir * power;
    this.vy -= power * 0.55;
    this.angVel += dir * power * 0.018;
    this.flash = 8;
    for (const limb of [...this.arms, ...this.legs])
      for (const p of limb.pts) {
        p.px -= dir * power * (0.4 + Math.random() * 0.5);
        p.py += (Math.random() - 0.5) * power * 0.8;
      }
  }

  draw() {
    const distance = GROUND - (this.y + this.h / 2);
    const sc = clamp(1 - distance / 500, 0.25, 1);
    ctx.save();
    ctx.globalAlpha = 0.28 * sc;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(this.x, GROUND, 46 * sc, 10 * sc, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();

    const front = this.facing > 0 ? 1 : 0, back = 1 - front;
    this.drawLimb(this.arms[back],  true);
    this.drawLimb(this.legs[back],  true);
    this.drawBody();
    this.drawLimb(this.legs[front], false);
    this.drawLimb(this.arms[front], false);
  }

  drawLimb(limb, isBack) {
    const anchor = this.worldAnchor(limb.anchor);
    const pts = [anchor, ...limb.pts];
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = limb.width + 6;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.strokeStyle = isBack ? shade(limb.color, -0.32) : limb.color;
    ctx.lineWidth = limb.width;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    for (let i = 1; i < pts.length; i++) {
      ctx.fillStyle = isBack ? shade(limb.color, -0.45) : shade(limb.color, -0.18);
      ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, limb.width / 2 + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawBody() {
    const w = this.w, h = this.h;
    const flash = this.flash > 0 ? this.flash / 8 : 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = '#0a0d14';
    roundRect(ctx, -w/2 - 3, -h/2 - 3, w + 6, h + 6, 12); ctx.fill();

    if (flash > 0) ctx.fillStyle = `rgba(255,255,255,${flash})`;
    else {
      const g = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
      g.addColorStop(0, shade(this.color,  0.28));
      g.addColorStop(1, shade(this.color, -0.28));
      ctx.fillStyle = g;
    }
    roundRect(ctx, -w/2, -h/2, w, h, 10); ctx.fill();

    ctx.fillStyle = this.accent; ctx.beginPath(); ctx.arc(0, -4, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';      ctx.beginPath(); ctx.arc(0, -4, 4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = shade(this.color, 0.12);
    roundRect(ctx, -17, -h/2 - 24, 34, 26, 7); ctx.fill();

    ctx.fillStyle = this.facing > 0 ? this.accent : shade(this.accent, -0.35);
    roundRect(ctx, this.facing > 0 ? -6 : -12, -h/2 - 18, 18, 9, 3); ctx.fill();

    ctx.fillStyle = shade(this.color, -0.12);
    roundRect(ctx, -w/2 - 10, -h/2 + 6, 14, 22, 5); ctx.fill();
    roundRect(ctx,  w/2 -  4, -h/2 + 6, 14, 22, 5); ctx.fill();
    ctx.restore();
  }

  resetForRound(dropIn = true) {
    this.health = this.maxHealth; this.ko = false;
    this.hitStun = 0; this.ragdoll = 0;
    this.attack = null; this.cooldown = 0; this.flash = 0;
    this.vx = 0; this.vy = 0;
    this.angle = 0; this.angVel = 0;
    this.x = this.spawnX;
    this.y = GROUND - this.h / 2 - this.footLen - (dropIn ? 60 : 0);
    for (const limb of [...this.arms, ...this.legs]) {
      const a = this.worldAnchor(limb.anchor);
      let px = a.x, py = a.y;
      for (let i = 0; i < limb.pts.length; i++) {
        py += limb.lengths[i];
        const p = limb.pts[i];
        p.x = px; p.y = py; p.px = px; p.py = py;
      }
    }
  }
}

const fighters = [
  new Fighter({
    name: 'IRON WOLF', x: W * 0.30, facing: 1,
    color: '#2f6fb5', accent: '#7de3ff', dark: '#1c3d63',
    controls: { left: 'KeyA', right: 'KeyD', up: 'KeyW', punch: 'KeyF', kick: 'KeyG' },
  }),
  new Fighter({
    name: 'CRIMSON FANG', x: W * 0.70, facing: -1,
    color: '#a83048', accent: '#ffb86b', dark: '#5a1828',
    controls: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', punch: 'KeyK', kick: 'KeyL' },
  }),
];

function checkHit(attacker, defender) {
  if (!attacker.attack || attacker.attack.hitDone || defender.ko) return;
  const a = attacker.attack;
  if (a.timer < a.hitStart || a.timer > a.hitEnd) return;
  const hw = defender.w / 2 + 22, hh = defender.h / 2 + 22;
  for (const p of a.limb.pts) {
    if (Math.abs(p.x - defender.x) < hw && Math.abs(p.y - defender.y) < hh) {
      a.hitDone = true;
      const dir = Math.sign(defender.x - attacker.x) || attacker.facing;
      defender.takeHit(a.damage, dir, a.knockback);
      attacker.vx -= dir * 2.5;
      spawnHitParticles((p.x + defender.x)/2, (p.y + defender.y)/2, attacker.accent);
      shake(a.type === 'kick' ? 14 : 8);
      return;
    }
  }
}

/* ==========================================================
   СОСТОЯНИЕ
   ========================================================== */
let roundNum = 1;
let roundState = 'intro';
let roundTimer = 0;
let gameState = 'menu';

const bannerEl     = document.getElementById('banner');
const menuEl       = document.getElementById('menu');
const matchEndEl   = document.getElementById('matchEnd');
const controlsEl   = document.getElementById('controls');
const winnerNameEl = document.getElementById('winnerName');
const finalScoreEl = document.getElementById('finalScore');
const roundBadgeEl = document.getElementById('roundBadge');

const setBanner  = t => { bannerEl.textContent = t; bannerEl.classList.add('show'); };
const hideBanner = () => bannerEl.classList.remove('show');

const updateRoundBadge = () =>
  roundBadgeEl.textContent = `ROUND ${roundNum} / ${MAX_ROUNDS}`;

function startMatch() {
  gameState = 'playing';
  roundNum = 1;
  for (const f of fighters) { f.wins = 0; f.resetForRound(true); }
  roundState = 'intro'; roundTimer = 0;
  particles.length = 0;
  hideBanner();
  menuEl.classList.add('hidden');
  matchEndEl.classList.add('hidden');
  controlsEl.classList.remove('hidden');
  roundBadgeEl.classList.remove('hidden');
  updateRoundBadge();
  updateHUD();
  setTouchVisible(true);
}

function showMenu() {
  gameState = 'menu';
  roundNum = 1;
  roundState = 'intro'; roundTimer = 0;
  particles.length = 0;
  hideBanner();
  for (const f of fighters) { f.wins = 0; f.resetForRound(false); }
  for (const k in keys) keys[k] = false;
  updateHUD();
  menuEl.classList.remove('hidden');
  matchEndEl.classList.add('hidden');
  controlsEl.classList.add('hidden');
  roundBadgeEl.classList.add('hidden');
  setTouchVisible(false);
}

function showMatchEnd(champ) {
  gameState = 'matchOver';
  winnerNameEl.textContent = champ.name;
  winnerNameEl.style.color = champ.accent;
  const loser = fighters.find(f => f !== champ);
  finalScoreEl.textContent = `${champ.wins} — ${loser.wins}`;
  menuEl.classList.add('hidden');
  matchEndEl.classList.remove('hidden');
  controlsEl.classList.add('hidden');
  roundBadgeEl.classList.add('hidden');
  setTouchVisible(false);
}

/* ---------- Кнопки ---------- */
document.getElementById('playBtn').addEventListener('click', startMatch);
document.getElementById('rematchBtn').addEventListener('click', startMatch);
document.getElementById('menuBtn').addEventListener('click', showMenu);

/* ---------- Выбор карты ---------- */
const mapSelectEl = document.getElementById('mapSelect');
function buildMapSelector() {
  mapSelectEl.innerHTML = '';
  MAPS.forEach((map, i) => {
    const btn = document.createElement('button');
    btn.className = 'map-thumb' + (i === currentMap ? ' active' : '');
    btn.style.background = map.thumb;
    btn.textContent = map.name;
    btn.title = map.name;
    btn.addEventListener('click', () => {
      currentMap = i;
      [...mapSelectEl.children].forEach((b, j) =>
        b.classList.toggle('active', j === i));
    });
    mapSelectEl.appendChild(btn);
  });
}
buildMapSelector();

/* ---------- HUD ---------- */
const hpEls   = [document.getElementById('hp1'),   document.getElementById('hp2')];
const pipsEls = [document.getElementById('pips1'), document.getElementById('pips2')];
for (const el of pipsEls) el.innerHTML = '<i></i><i></i>';

function updateHUD() {
  for (let i = 0; i < 2; i++) {
    const f = fighters[i];
    hpEls[i].style.width = (f.health / f.maxHealth * 100) + '%';
    const pips = pipsEls[i].children;
    for (let k = 0; k < pips.length; k++) pips[k].classList.toggle('on', k < f.wins);
  }
}

/* ---------- ФОН ---------- */
const buildings = [];
for (let i = 0; i < 18; i++) buildings.push({
  x: (i * 95) + Math.random() * 30,
  w: 40 + Math.random() * 60,
  h: 80 + Math.random() * 240,
  lit: Math.random() > 0.5,
});

let decorTime = 0;
function updateDecor() {
  decorTime += 0.016;
  if (MAPS[currentMap].decor === 'embers') {
    for (const e of embers) {
      e.y += e.vy;
      if (e.y < -10) { e.y = GROUND + 10; e.x = Math.random() * W; }
    }
  }
}

function drawBackground() {
  const map = MAPS[currentMap];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, map.sky[0]); g.addColorStop(0.55, map.sky[1]); g.addColorStop(1, map.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  if (map.decor === 'stars') {
    for (const s of stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(decorTime * s.speed + s.phase));
      ctx.fillStyle = `rgba(220,210,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
    }
  }

  const rg = ctx.createRadialGradient(W/2, GROUND, 40, W/2, GROUND, 760);
  rg.addColorStop(0, map.glow); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

  for (const b of buildings) {
    ctx.fillStyle = map.building;
    ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
    if (b.lit) {
      ctx.fillStyle = map.window;
      for (let y = GROUND - b.h + 10; y < GROUND - 10; y += 14)
        for (let x = b.x + 6; x < b.x + b.w - 6; x += 12)
          if (Math.random() > 0.55) ctx.fillRect(x, y, 5, 6);
    }
  }

  ctx.fillStyle = map.ground; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = map.groundLine; ctx.fillRect(0, GROUND, W, 5);

  ctx.strokeStyle = map.grid; ctx.lineWidth = 2;
  for (let x = -40; x < W + 40; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, GROUND + 5); ctx.lineTo(x + 40, H); ctx.stroke();
  }

  if (map.decor === 'embers') {
    for (const e of embers) {
      const a = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(decorTime * 4 + e.phase));
      ctx.fillStyle = `rgba(255,160,60,${a})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ---------- Отладочный оверлей ---------- */
function drawKeyDebug() {
  const pressed = [];
  for (const code of [
    'KeyW','KeyA','KeyS','KeyD','KeyF','KeyG',
    'ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyK','KeyL',
  ]) if (keys[code]) pressed.push(code);
  if (!pressed.length) return;
  ctx.save();
  ctx.font = '12px monospace';
  const text = pressed.join(' ');
  const w = ctx.measureText(text).width + 24;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 16, 16, w, 26, 8); ctx.fill();
  ctx.fillStyle = '#7de3ff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 28, 16 + 13);
  ctx.restore();
}

/* ==========================================================
   UPDATE / RENDER / LOOP
   ========================================================== */
let lastTime = performance.now(), acc = 0;
const STEP = 1000 / 60;

function update() {
  updateDecor();

  if (gameState === 'menu' || gameState === 'matchOver') {
    updateParticles();
    if (shakeAmount > 0) shakeAmount *= 0.85;
    if (shakeAmount < 0.4) shakeAmount = 0;
    updateHUD();
    return;
  }

  if (roundState === 'intro') {
    roundTimer++;
    if (roundTimer === 1)  setBanner(`ROUND ${roundNum} / ${MAX_ROUNDS}`);
    if (roundTimer === 45) setBanner('FIGHT!');
    if (roundTimer >= 70) { roundState = 'fight'; roundTimer = 0; hideBanner(); }
  } else if (roundState === 'fight') {
    for (const f of fighters) {
      if (f.health <= 0 && !f.ko) {
        f.ko = true;
        const winner = fighters.find(o => o !== f);
        winner.wins++;
        roundState = 'roundOver'; roundTimer = 0;
        setBanner('K.O.'); shake(22);
        spawnHitParticles(f.x, f.y, '#ffd166', 40);
      }
    }
  } else if (roundState === 'roundOver') {
    roundTimer++;
    if (roundTimer === 120) hideBanner();
    if (roundTimer >= 150) {
      const champ = fighters.find(f => f.wins >= WINS_TO_WIN);
      if (champ) showMatchEnd(champ);
      else if (roundNum < MAX_ROUNDS) {
        roundNum++;
        for (const f of fighters) f.resetForRound(true);
        roundState = 'intro'; roundTimer = 0;
        particles.length = 0;
        updateRoundBadge();
      } else {
        const fallback = fighters.slice().sort((a, b) => b.wins - a.wins)[0];
        showMatchEnd(fallback);
      }
    }
  }

  const canInput = roundState === 'fight';
  for (const f of fighters) f.update(canInput);

  const [f1, f2] = fighters;
  if (!f1.ko && !f2.ko) {
    const dx = f2.x - f1.x;
    const minDist = (f1.w + f2.w) / 2 - 8;
    if (Math.abs(dx) < minDist && Math.abs(f1.y - f2.y) < 70) {
      const push = ((minDist - Math.abs(dx)) / 2) * Math.sign(dx || 1);
      f1.x -= push; f2.x += push;
    }
  }
  if (roundState === 'fight') { checkHit(f1, f2); checkHit(f2, f1); }

  updateParticles();
  if (shakeAmount > 0) shakeAmount *= 0.85;
  if (shakeAmount < 0.4) shakeAmount = 0;
  updateHUD();
}

function render() {
  ctx.save();
  if (shakeAmount > 0)
    ctx.translate((Math.random() - 0.5) * shakeAmount, (Math.random() - 0.5) * shakeAmount);

  drawBackground();
  for (const f of fighters) f.draw();
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (gameState === 'playing') drawKeyDebug();
}

function loop(now) {
  const dt = Math.min(100, now - lastTime);
  lastTime = now;
  acc += dt;
  while (acc >= STEP) { update(); acc -= STEP; }
  render();
  requestAnimationFrame(loop);
}

showMenu();
requestAnimationFrame(loop);

})();