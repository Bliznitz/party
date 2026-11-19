/* TUNGA Arena: a small side-on fighting game. Practice against the computer, or live against your party member. */
(function () {
  'use strict';
  const W = 176, H = 132, GROUND = 108, GRAV = 430;
  const CLASSES = {
    wizard: { name: 'Wizard', h: 22, w: 10, spd: 1.0, cd: 2.4, sp: 'fireball', spName: 'FIREBALL' },
    witch: { name: 'Witch', h: 22, w: 10, spd: 1.05, cd: 2.6, sp: 'hex', spName: 'HEX BOLT' },
    sage: { name: 'Sage', h: 22, w: 10, spd: 0.95, cd: 3.0, sp: 'aura', spName: 'SPIRIT WAVE' },
    dwarf: { name: 'Dwarf', h: 16, w: 11, spd: 0.9, cd: 2.6, sp: 'axe', spName: 'AXE THROW' },
    elf: { name: 'Elf', h: 23, w: 9, spd: 1.2, cd: 2.0, sp: 'arrow', spName: 'ARROW' },
    giant: { name: 'Giant', h: 29, w: 14, spd: 0.75, cd: 3.0, sp: 'stomp', spName: 'STOMP' },
    knight: { name: 'Knight', h: 23, w: 10, spd: 0.95, cd: 2.4, sp: 'lunge', spName: 'LUNGE' },
    rogue: { name: 'Rogue', h: 21, w: 9, spd: 1.25, cd: 1.8, sp: 'dagger', spName: 'LOW DAGGER' },
  };
  const ITEMS = { heart: { name: 'HEART' }, bomb: { name: 'BOMB', kind: 'bomb', ammo: 3 }, bow: { name: 'CROSSBOW', kind: 'bolt', ammo: 4 }, zap: { name: 'LIGHTNING', kind: 'zap', ammo: 2 } };
  const ITEM_KEYS = Object.keys(ITEMS);
  const SCENES = ['NIGHT HILLS', 'DUSK FOREST', 'CASTLE WALLS', 'SUNSET BEACH', 'SNOW PEAKS'];
  const dropFirst = () => window.__arenaDrop || (5 + Math.random() * 4), dropNext = () => window.__arenaDrop || (7 + Math.random() * 6);
  const HAT = { wizard: 7, witch: 6, knight: 4, dwarf: 3 };
  const topOf = (f) => f.y - (f.st === 'duck' ? Math.round(f.c.h * 0.6) : f.c.h) - (HAT[f.key] || 1);
  const classKey = (c) => { const k = String(c || '').trim().toLowerCase(); return CLASSES[k] ? k : 'wizard'; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const stat = (s, k) => clamp(Math.round(Number(s && s[k]) || 0), 0, 10);
  const mul = (v) => 0.75 + 0.04 * v;
  /* Your real bars shape your fighter: 0 gives 0.75x, 10 gives 1.15x. */
  function mods(stats) {
    return { speed: mul(stat(stats, 'energy')), punch: mul(stat(stats, 'food')), jump: mul(stat(stats, 'water')),
      special: mul(stat(stats, 'stamina')), guard: mul(stat(stats, 'mood')), magic: mul(stat(stats, 'social')) };
  }
  function modLines(stats) {
    const m = mods(stats), pc = (v) => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
    return [['ENERGY', 'speed', m.speed], ['FOOD', 'punch rate', m.punch], ['WATER', 'jump', m.jump], ['STAMINA', 'special recharge', m.special],
      ['MOOD', 'recovery', m.guard], ['SOCIAL', 'special speed', m.magic]].map(([a, b, v]) => `${a}: ${b} ${pc(v)}`);
  }

  /* ---------------- sound: everything is synthesised, nothing is downloaded ---------------- */
  let AC = null, musicOn = true, musicTimer = null, nextT = 0, stepN = 0, noiseBuf = null;
  try { musicOn = localStorage.getItem('tunga-sound') !== 'off'; } catch (e) {}
  function ac() {
    if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { AC = new C(); } catch (e) { return null; } }
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  }
  function tone(freq, dur, type, vol, when, slideTo) {
    const a = AC; if (!a || !musicOn) return;
    const t = when || a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, when) {
    const a = AC; if (!a || !musicOn) return;
    if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = when || a.currentTime, s = a.createBufferSource(), g = a.createGain();
    s.buffer = noiseBuf; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(g); g.connect(a.destination); s.start(t); s.stop(t + dur + 0.02);
  }
  const SFX = {
    punch: () => { noise(0.05, 0.12); tone(180, 0.07, 'square', 0.06, 0, 90); },
    hit: () => { noise(0.12, 0.2); tone(220, 0.16, 'sawtooth', 0.1, 0, 60); },
    block: () => { tone(900, 0.05, 'square', 0.06); tone(600, 0.06, 'square', 0.05); },
    brk: () => { noise(0.25, 0.2); tone(300, 0.3, 'square', 0.08, 0, 70); },
    jump: () => tone(300, 0.12, 'square', 0.05, 0, 620),
    special: () => { tone(500, 0.2, 'square', 0.07, 0, 1100); },
    ko: () => { tone(400, 0.6, 'sawtooth', 0.12, 0, 50); noise(0.5, 0.15); },
    go: () => tone(880, 0.3, 'square', 0.08),
    tick: () => tone(440, 0.1, 'square', 0.06),
    pickup: () => { tone(660, 0.08, 'square', 0.07); tone(990, 0.12, 'square', 0.07, AC.currentTime + 0.07); },
    boom: () => { noise(0.4, 0.28); tone(140, 0.4, 'sawtooth', 0.1, 0, 40); },
    zap: () => { noise(0.18, 0.18); tone(1400, 0.2, 'square', 0.06, 0, 200); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.08, AC.currentTime + i * 0.13)),
  };
  function sfx(n) { if (AC && musicOn && SFX[n]) { try { SFX[n](); } catch (e) {} } }
  /* Original 4-bar loop in A minor: bass, arpeggio, lead and drums on a 16-step grid. */
  const N = { A2: 110, F2: 87.31, C3: 130.81, G2: 98, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99 };
  const BARS = [
    { bass: N.A2, arp: [N.A4, N.C5, N.E5, N.C5], lead: [[0, N.E5, 2], [4, N.D5, 1], [6, N.C5, 2], [10, N.A4, 2], [14, N.C5, 1]] },
    { bass: N.F2, arp: [N.F4, N.A4, N.C5, N.A4], lead: [[0, N.A4, 3], [6, N.C5, 2], [8, N.D5, 2], [12, N.C5, 2]] },
    { bass: N.C3, arp: [N.G4, N.C5, N.E5, N.C5], lead: [[0, N.E5, 2], [3, N.G5, 2], [6, N.E5, 2], [10, N.D5, 1], [12, N.C5, 3]] },
    { bass: N.G2, arp: [N.G4, N.B4, N.D5, N.B4], lead: [[0, N.D5, 3], [4, N.B4, 2], [8, N.D5, 1], [10, N.E5, 1], [12, N.D5, 2], [14, N.B4, 1]] },
  ];
  function schedule() {
    const a = AC; if (!a) return; const S16 = 60 / 132 / 4;
    if (nextT < a.currentTime) nextT = a.currentTime + 0.05;
    while (nextT < a.currentTime + 0.25) {
      const bar = BARS[Math.floor(stepN / 16) % 4], s = stepN % 16;
      if ([0, 3, 6, 8, 11, 14].includes(s)) tone(bar.bass, S16 * 1.6, 'triangle', 0.16, nextT);
      if (s % 2 === 0) tone(bar.arp[(s / 2) % 4], S16 * 0.9, 'square', 0.018, nextT);
      for (const [at, f, len] of bar.lead) if (at === s) tone(f, S16 * len * 0.95, 'square', 0.04, nextT);
      if (s === 0 || s === 8) tone(120, 0.1, 'sine', 0.22, nextT, 42);
      if (s === 4 || s === 12) noise(0.07, 0.07, nextT);
      if (s % 2 === 1) noise(0.02, 0.025, nextT);
      nextT += S16; stepN++;
    }
  }
  function musicStart() { if (!ac() || musicTimer) return; stepN = 0; nextT = 0; musicTimer = setInterval(schedule, 50); }
  function musicStop() { clearInterval(musicTimer); musicTimer = null; }

  /* ---------------- fighters ---------------- */
  let seq = 0;
  function mkFighter(info, side) {
    const key = classKey(info.cls);
    return { id: info.id, name: String(info.name || 'Player').slice(0, 12), key, c: CLASSES[key], col: /^#[0-9a-f]{6}$/i.test(info.colour || '') ? info.colour : '#41a6f6',
      m: mods(info.stats), side, x: side < 0 ? 42 : W - 42, y: GROUND, vx: 0, vy: 0, face: side < 0 ? 1 : -1, st: 'idle', stT: 0, hp: 10, guard: 3, guardT: 0,
      atkCD: 0, spCD: 0, wCD: 0, weap: null, crown: !!info.crown, stun: 0, inv: 0, kbx: 0, walkT: 0, flash: 0, prev: {}, tx: 0, ty: GROUND, tvx: 0, tvy: 0, ai: { t: 0.6, inp: {} } };
  }
  const setSt = (f, s) => { f.st = s; f.stT = 0; };
  const busy = (f) => (f.st === 'punch' && f.stT < 0.26) || (f.st === 'special' && f.stT < 0.36);

  function step(f, opp, dt, inp, G) {
    f.stT += dt; f.atkCD -= dt; f.spCD -= dt; f.wCD -= dt; f.inv -= dt; f.flash -= dt;
    if (f.guard < 3) { f.guardT += dt; if (f.guardT > 1.5) { f.guard++; f.guardT = 0; } }
    if (f.st === 'ko') { f.vy += GRAV * dt; f.x += f.vx * dt; f.y = Math.min(GROUND, f.y + f.vy * dt); if (f.y >= GROUND) f.vx *= 0.85; f.x = clamp(f.x, 8, W - 8); return; }
    const grounded = f.y >= GROUND, pressed = (k) => inp[k] && !f.prev[k];
    if (f.stun > 0) {
      f.stun -= dt; f.vx = f.kbx; f.kbx *= Math.pow(0.004, dt); if (f.stun <= 0) { setSt(f, 'idle'); f.vx = 0; }
    } else if (busy(f)) {
      if (f.st === 'special' && f.c.sp === 'lunge') f.vx = f.stT < 0.22 ? f.face * 175 : 0;
      else if (grounded) f.vx = 0;
    } else {
      if (grounded && Math.abs(opp.x - f.x) > 2) f.face = opp.x > f.x ? 1 : -1;
      if (inp.block && grounded) { if (f.st !== 'block') setSt(f, 'block'); f.vx = 0; }
      else if (pressed('punch') && f.atkCD <= 0) { setSt(f, 'punch'); f.atkCD = 0.42 / f.m.punch; if (grounded) f.vx = 0; G.attack(f, 'punch'); }
      else if (pressed('special') && f.weap && f.wCD <= 0) { setSt(f, 'special'); f.wCD = 0.45; if (grounded) f.vx = 0; G.attack(f, ITEMS[f.weap.type].kind); if (--f.weap.ammo <= 0) f.weap = null; }
      else if (pressed('special') && f.spCD <= 0) { setSt(f, 'special'); f.spCD = f.c.cd / f.m.special; if (grounded) f.vx = 0; G.attack(f, f.c.sp); }
      else if (inp.d && grounded) { if (f.st !== 'duck') setSt(f, 'duck'); f.vx = 0; }
      else {
        const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
        f.vx = dir * 62 * f.c.spd * f.m.speed;
        if (pressed('u') && grounded) { f.vy = -150 * Math.sqrt(f.m.jump); if (G.me === f) sfx('jump'); }
        const ns = (f.y < GROUND || f.vy < 0) ? 'jump' : dir ? 'walk' : 'idle';
        if (f.st !== ns) setSt(f, ns);
      }
    }
    f.vy += GRAV * dt; f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.y >= GROUND) { f.y = GROUND; f.vy = 0; }
    const minD = (f.c.w + opp.c.w) / 2 + 1, dx = f.x - opp.x;
    if (opp.st !== 'ko' && Math.abs(f.y - opp.y) < 8 && Math.abs(dx) < minD) {      // fighters are solid: no walking through each other
      const sgn = dx < 0 || (dx === 0 && f.side < 0) ? -1 : 1;
      if (f.vx * sgn < 0) f.x = opp.x + sgn * minD; else f.x += sgn * 30 * dt;
    }
    f.x = clamp(f.x, 8, W - 8); f.walkT += Math.abs(f.vx) * dt; f.prev = { l: inp.l, r: inp.r, u: inp.u, d: inp.d, punch: inp.punch, special: inp.special, block: inp.block };
  }
  /* A fighter controlled from the other phone: glide towards where they last said they were. */
  function stepRemote(f, dt) {
    f.stT += dt; f.flash -= dt; f.inv -= dt;
    f.tx = clamp(f.tx + f.tvx * dt, 8, W - 8); f.tvy += GRAV * dt; f.ty = Math.min(GROUND, f.ty + f.tvy * dt); if (f.ty >= GROUND) f.tvy = 0;
    f.x += (f.tx - f.x) * Math.min(1, dt * 14); f.y += (f.ty - f.y) * Math.min(1, dt * 20); f.walkT += Math.abs(f.tvx) * dt;
  }

  /* ---------------- attacks ---------------- */
  function mkAttack(owner, kind, id, o) {
    o = o || { x: owner.x, y: owner.y, face: owner.face, mg: owner.m.magic };
    const a = { id, owner, kind, t: 0, face: o.face, hit: false, dead: false, proj: false, px: o.x + o.face * 8, py: o.y, vx: 0, vy: 0, g: 0, r: 3, x0: o.x }, h = owner.c.h, sp = o.mg || 1;
    if (kind === 'fireball') Object.assign(a, { proj: true, py: o.y - h * 0.42, vx: o.face * 112 * sp, r: 3 });
    else if (kind === 'hex') Object.assign(a, { proj: true, py: o.y - h * 0.5, vx: o.face * 82 * sp, r: 3, wavy: o.y - h * 0.5 });
    else if (kind === 'arrow') Object.assign(a, { proj: true, py: o.y - 15, vx: o.face * 195 * sp, r: 2 });
    else if (kind === 'dagger') Object.assign(a, { proj: true, py: o.y - 5, vx: o.face * 172 * sp, r: 2, low: true });
    else if (kind === 'axe') Object.assign(a, { proj: true, py: o.y - h * 0.8, vx: o.face * 96 * sp, vy: -128, g: 300, r: 3 });
    else if (kind === 'bomb') Object.assign(a, { proj: true, py: o.y - h * 0.7, vx: o.face * 88, vy: -150, g: 330, r: 3, bomb: true });
    else if (kind === 'bolt') Object.assign(a, { proj: true, py: o.y - h * 0.55, vx: o.face * 235, r: 2 });
    else if (kind === 'zap') Object.assign(a, { proj: true, px: clamp(o.tx == null ? o.x + o.face * 40 : o.tx, 8, W - 8), py: GROUND, vx: 0, r: 5, delay: 0.5, life: 0.78, zap: true, unblock: true });
    else if (kind === 'stomp') Object.assign(a, { proj: true, px: o.x, py: GROUND - 3, vx: 105 * sp, r: 3, low: true, delay: 0.18, range: 72, both: true });
    return a;
  }
  function hurtBox(v) { const hh = v.st === 'duck' ? v.c.h * 0.55 : v.c.h; return { l: v.x - v.c.w / 2, r: v.x + v.c.w / 2, t: v.y - hh, b: v.y }; }
  function attackHits(a, v) {
    const o = a.owner, hb = hurtBox(v);
    if (a.kind === 'punch' || a.kind === 'lunge') {
      const on = a.kind === 'punch' ? (a.t > 0.07 && a.t < 0.2) : (a.t > 0.05 && a.t < 0.26); if (!on) return false;
      const reach = o.c.w / 2 + (a.kind === 'punch' ? 11 : 13), l = Math.min(o.x, o.x + o.face * reach), r = Math.max(o.x, o.x + o.face * reach);
      return r > hb.l && l < hb.r && (o.y - o.c.h * 0.38) > hb.t && (o.y - o.c.h * 0.8) < hb.b;
    }
    if (a.kind === 'aura') return a.t > 0.15 && a.t < 0.32 && Math.abs(v.x - o.x) < 32 + v.c.w / 2 && Math.abs(v.y - o.y) < 26;
    if (a.zap) return a.t > a.delay && a.t < a.delay + 0.2 && a.px + 5 > hb.l && a.px - 5 < hb.r;
    if (a.boom) return a.bt < 0.25 && Math.abs(v.x - a.px) < 15 + v.c.w / 2 && v.y > GROUND - 18;
    if (a.delay && a.t < a.delay) return false;
    const xs = a.both ? [a.x0 + (a.t - a.delay) * a.vx, a.x0 - (a.t - a.delay) * a.vx] : [a.px];
    return xs.some((x) => x + a.r > hb.l && x - a.r < hb.r && a.py + a.r > hb.t && a.py - a.r < hb.b);
  }
  function stepAttack(a, dt) {
    a.t += dt;
    if (a.life && a.t > a.life) { a.dead = true; return; }
    if (!a.proj) { if (a.t > 0.45) a.dead = true; return; }
    if (a.boom) { a.bt += dt; if (a.bt > 0.32) a.dead = true; return; }
    if (a.delay && a.t < a.delay) return;
    if (a.both) { if ((a.t - a.delay) * Math.abs(a.vx) > a.range) a.dead = true; return; }
    a.px += a.vx * dt; a.vy += a.g * dt; a.py += a.vy * dt;
    if (a.wavy != null) a.py = a.wavy + Math.sin(a.t * 9) * 6;
    if (a.bomb && a.py >= GROUND - 3) { a.boom = true; a.bt = 0; a.vx = a.vy = a.g = 0; a.py = GROUND - 4; sfx('boom'); return; }
    if (a.px < -10 || a.px > W + 10 || a.py > GROUND + 2) a.dead = true;
  }
  /* The phone of whoever is being hit decides the outcome. */
  function applyHit(v, a) {
    if (v.st === 'ko' || v.inv > 0) return null;
    const srcX = a.proj && !a.both ? a.px - a.vx * 0.05 : a.owner.x, dir = v.x >= srcX ? 1 : -1;
    if (!a.unblock && v.st === 'block' && (srcX - v.x) * v.face > 0) {
      v.guard--; v.guardT = 0;
      if (v.guard <= 0) { v.guard = 3; v.stun = 0.7; v.kbx = dir * 50; setSt(v, 'hit'); return 'brk'; }
      v.kbx = dir * 30; v.x = clamp(v.x + dir * 2, 8, W - 8); return 'blk';
    }
    v.hp = Math.max(0, v.hp - 1); v.inv = 0.6; v.flash = 0.12; v.stun = 0.32 / v.m.guard; v.kbx = dir * (a.kind === 'aura' ? 175 : 95); setSt(v, 'hit');
    if (v.hp <= 0) { setSt(v, 'ko'); v.stun = 0; v.vy = -130; v.vx = dir * 60; return 'ko'; }
    return 'hit';
  }

  /* ---------------- computer opponent ---------------- */
  function aiInput(f, opp, G, dt) {
    const a = f.ai; a.t -= dt;
    if (a.t > 0) { a.inp.punch = false; a.inp.special = false; a.inp.u = false; return a.inp; }
    a.t = 0.14 + Math.random() * 0.2;
    const dx = opp.x - f.x, ad = Math.abs(dx), r = Math.random(), inp = {};
    const threat = G.attacks.find((k) => k.owner === opp && !k.dead && !k.hit && (k.proj ? (Math.abs((k.both ? k.x0 : k.px) - f.x) < 50) : ad < 36 && k.t < 0.2));
    const c = G.crate;
    if (!threat && c && c.landed && r < 0.55) { inp[c.x > f.x ? 'r' : 'l'] = true; a.inp = inp; return inp; }
    if (f.weap && f.wCD <= 0 && ad > 24 && r < 0.45) { inp.special = true; a.inp = inp; return inp; }
    if (threat && r < 0.55) { if (threat.low && r < 0.3) inp.u = true; else inp.block = true; }
    else if (ad > 68 && f.spCD <= 0 && r < 0.5) inp.special = true;
    else if (ad > (f.c.w + opp.c.w) / 2 + 9) { inp[dx > 0 ? 'r' : 'l'] = true; if (r < 0.07) inp.u = true; }
    else if (r < 0.6) inp.punch = true; else if (r < 0.78) inp.block = true; else inp[dx > 0 ? 'l' : 'r'] = true;
    a.inp = inp; return inp;
  }

  /* ---------------- drawing ---------------- */
  const sceneCache = {};
  function scene(n) {
    if (sceneCache[n]) return sceneCache[n];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), HZ = GROUND - 14;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const sky = (bands) => { let y = 0; bands.forEach(([c, h]) => { R(0, y, W, h, c); y += h; }); R(0, y, W, HZ - y, bands[bands.length - 1][0]); };
    const hill = (x0, w, h, c, base = HZ) => { for (let i = 0; i < w; i += 4) { const k = 1 - Math.abs(i + 2 - w / 2) / (w / 2), hh = Math.round(k * h / 4) * 4; R(x0 + i, base - hh, 4, hh, c); } };
    const peak = (x0, w, h, c, cap) => { for (let i = 0; i < w; i += 2) { const k = 1 - Math.abs(i + 1 - w / 2) / (w / 2), hh = Math.round(k * h / 2) * 2; R(x0 + i, HZ - hh, 2, hh, c); if (cap && hh > h * 0.62) R(x0 + i, HZ - hh, 2, Math.round((hh - h * 0.62) / 2) * 2 + 2, cap); } };
    const pine = (x, h, c) => { for (let k = 0; k < h; k += 3) { const w = Math.max(2, Math.round((k / h) * 12)); R(x - w / 2, HZ - h + k, w, 3, c); } };
    const floor = (top, fill, dash) => { R(0, GROUND, W, H - GROUND, fill); R(0, GROUND, W, 2, top); for (let x = 4; x < W; x += 20) R(x, GROUND + 7, 9, 2, dash); for (let x = 14; x < W; x += 20) R(x, GROUND + 14, 9, 2, dash); };
    const dots = (pts, c) => pts.forEach(([x, y]) => R(x, y, 1, 1, c));
    if (n === 1) {
      sky([['#5d275d', 26], ['#b13e53', 22], ['#ef7d57', 20], ['#ffcd75', 30]]);
      for (let x = -4; x < W; x += 13) pine(x, 34 + ((x * 7) % 11), '#257179');
      for (let x = 3; x < W; x += 19) pine(x, 22 + ((x * 5) % 9), '#29366f');
      R(0, HZ, W, GROUND - HZ, '#38b764'); R(0, HZ, W, 2, '#a7f070'); floor('#ef7d57', '#5d275d', '#b13e53');
    } else if (n === 2) {
      sky([['#566c86', 34], ['#94b0c2', 40]]);
      R(0, 52, W, HZ - 52, '#333c57'); for (let x = 0; x < W; x += 10) R(x, 46, 6, 6, '#333c57');
      [[14, 30], [W - 34, 30]].forEach(([x, w]) => { R(x, 30, w, HZ - 30, '#29366f'); for (let k = 0; k < w; k += 8) R(x + k, 24, 5, 6, '#29366f'); R(x + w / 2 - 1, 44, 2, 6, '#1a1c2c'); R(x + w / 2 - 4, 12, 1, 12, '#94b0c2'); R(x + w / 2 - 3, 12, 7, 5, '#e43b44'); });
      for (let x = 56; x < W - 50; x += 16) R(x, 64, 2, 6, '#1a1c2c');
      R(W / 2 - 9, HZ - 22, 18, 22, '#1a1c2c'); R(W / 2 - 7, HZ - 24, 14, 2, '#1a1c2c');
      R(0, HZ, W, GROUND - HZ, '#566c86'); R(0, HZ, W, 2, '#94b0c2'); floor('#94b0c2', '#566c86', '#333c57');
    } else if (n === 3) {
      sky([['#5d275d', 18], ['#b13e53', 22], ['#ef7d57', 36]]);
      for (let y = 0; y < 16; y += 2) { const w = Math.round(Math.sqrt(256 - (16 - y) * (16 - y)) * 2); R(W / 2 - w / 2, 60 + y, w, 2, '#ffcd75'); if (y > 4) R(W / 2 - w / 4, 60 + y, Math.round(w / 2), 2, '#f4f4f4'); }
      R(0, 76, W, HZ - 76, '#3b5dc9'); for (let y = 80; y < HZ; y += 5) for (let x = (y * 3) % 17; x < W; x += 24) R(x, y, 8, 1, '#41a6f6');
      R(W / 2 - 8, 78, 16, 1, '#ffcd75'); R(W / 2 - 5, 82, 10, 1, '#ffcd75');
      R(0, HZ, W, GROUND - HZ, '#ffcd75'); R(0, HZ, W, 2, '#f4f4f4'); floor('#ffcd75', '#ef7d57', '#b13e53');
      R(20, HZ - 28, 2, 28, '#5d275d'); [[-8, 0], [2, -2], [-6, 4], [4, 3]].forEach(([dx, dy]) => R(21 + dx, HZ - 30 + dy, 8, 2, '#257179'));
    } else if (n === 4) {
      sky([['#3b5dc9', 30], ['#41a6f6', 30], ['#73eff7', 30]]);
      peak(-20, 90, 56, '#566c86', '#f4f4f4'); peak(50, 110, 74, '#566c86', '#f4f4f4'); peak(120, 80, 50, '#566c86', '#f4f4f4');
      dots([[10, 8], [36, 22], [62, 12], [88, 30], [120, 6], [150, 18], [168, 40], [24, 44], [140, 52], [72, 50]], '#f4f4f4');
      R(0, HZ, W, GROUND - HZ, '#f4f4f4'); R(0, HZ, W, 2, '#ffffff'); floor('#f4f4f4', '#94b0c2', '#73eff7');
    } else {
      sky([['#29366f', 30], ['#3b5dc9', 26], ['#41a6f6', 20], ['#73eff7', 30]]);
      R(W - 44, 12, 10, 10, '#ffcd75'); R(W - 46, 14, 14, 6, '#ffcd75'); R(W - 42, 10, 6, 14, '#ffcd75');
      dots([[14, 9], [42, 20], [78, 6], [104, 24], [160, 34], [58, 32]], '#f4f4f4');
      hill(-16, 92, 34, '#257179'); hill(60, 104, 48, '#257179'); hill(132, 76, 30, '#257179'); hill(18, 64, 18, '#38b764'); hill(104, 70, 16, '#38b764');
      R(0, HZ, W, GROUND - HZ, '#38b764'); R(0, HZ, W, 2, '#a7f070'); floor('#94b0c2', '#566c86', '#333c57');
    }
    return (sceneCache[n] = cv);
  }
  function drawItem(g, type, x, y) {
    const R = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x + dx), Math.round(y + dy), w, h); };
    if (type === 'heart') HEART.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch === 'X') R(xx, yy, 1, 1, '#e43b44'); }));
    else if (type === 'bomb') { R(1, 2, 5, 5, '#1a1c2c'); R(0, 3, 7, 3, '#1a1c2c'); R(2, 3, 1, 1, '#94b0c2'); R(4, 1, 1, 1, '#b13e53'); R(5, 0, 1, 1, '#ffcd75'); }
    else if (type === 'bow') { R(0, 3, 7, 1, '#b13e53'); R(5, 0, 1, 7, '#94b0c2'); R(1, 2, 1, 3, '#5d275d'); R(6, 3, 1, 1, '#f4f4f4'); }
    else if (type === 'zap') { R(3, 0, 3, 1, '#ffcd75'); R(2, 1, 3, 1, '#ffcd75'); R(1, 2, 5, 1, '#ffcd75'); R(3, 3, 2, 1, '#ffcd75'); R(2, 4, 2, 1, '#ffcd75'); R(1, 5, 2, 1, '#ffcd75'); R(1, 6, 1, 1, '#ffcd75'); }
  }
  function drawCrate(g, c, now) {
    if (c.landed && c.lt > 6.5 && Math.floor(now * 8) % 2) return;
    const x = Math.round(c.x), y = Math.round(c.y), P = (dx, dy, w, h, k) => { g.fillStyle = k; g.fillRect(x + dx, y + dy, w, h); };
    if (!c.landed) {
      P(-8, -22, 17, 2, '#f4f4f4'); P(-7, -24, 15, 2, '#f4f4f4'); P(-5, -25, 11, 1, '#f4f4f4'); P(-3, -24, 2, 4, '#e43b44'); P(2, -24, 2, 4, '#e43b44');
      for (let k = 0; k < 9; k++) { P(-7 + Math.round(k * 0.2), -20 + k, 1, 1, '#94b0c2'); P(7 - Math.round(k * 0.2), -20 + k, 1, 1, '#94b0c2'); }
    }
    P(-5, -11, 11, 11, '#5d275d'); P(-4, -10, 9, 9, '#ef7d57'); drawItem(g, c.type, x - 3, y - 9);
  }
  function drawFighter(g, f, now) {
    if (f.inv > 0 && f.st !== 'ko' && Math.floor(now * 20) % 2) return;
    const c = f.c, white = f.flash > 0, col = (k) => (white ? '#f4f4f4' : k);
    g.save(); g.translate(Math.round(f.x), Math.round(f.y));
    if (f.st === 'ko') { g.translate(0, -3); g.rotate(-Math.PI / 2 * f.face); }       // whole right angles only, so pixels stay crisp
    else if (f.st === 'hit') g.translate(-2 * f.face, -1);
    g.scale(f.face, 1);
    const R = (x, y, w, h, k) => { g.fillStyle = col(k); g.fillRect(Math.round(x), Math.round(y), w, h); };
    const duck = f.st === 'duck', Hh = Math.round(duck ? c.h * 0.6 : c.h), robe = f.key === 'wizard' || f.key === 'witch' || f.key === 'sage';
    const headH = f.key === 'giant' ? 8 : f.key === 'dwarf' ? 5 : 6, headW = f.key === 'giant' ? 8 : 6, bw = c.w - 2;
    const legH = robe ? 0 : Math.max(2, Math.round((duck ? 0.18 : 0.3) * c.h)), torsoTop = -(Hh - headH), sh = torsoTop + 2;
    const skin = { witch: '#a7f070', dwarf: '#ef7d57', giant: '#94b0c2' }[f.key] || '#ffcd75', dark = '#1a1c2c';
    const lift = f.st === 'walk' ? (Math.floor(f.walkT / 5) % 2) : 0, air = f.st === 'jump';
    if (!robe) {
      const lc = f.key === 'knight' ? '#566c86' : '#333c57';
      R(-bw / 2, -legH - (air ? 1 : lift), 3, legH, lc); R(bw / 2 - 3, -legH - (air ? 2 : 1 - lift), 3, legH, lc);
      R(-bw / 2, torsoTop, bw, -torsoTop - legH + 1, f.key === 'knight' ? '#94b0c2' : f.key === 'rogue' ? '#333c57' : f.col);
      if (f.key === 'knight' || f.key === 'rogue') R(-bw / 2, torsoTop + 3, bw, 2, f.col);
      if (f.key === 'giant') R(-bw / 2, -legH - 3, bw, 3, '#5d275d');
    } else { R(-bw / 2, torsoTop, bw, -torsoTop, f.col); R(-bw / 2 - 1, -3, bw + 2, 3, f.col); R(-bw / 2, torsoTop + 5, bw, 1, '#f4f4f4'); }
    const hy = -Hh, hx = -headW / 2 + 1;
    R(hx, hy, headW, headH, skin); R(hx + headW - 2, hy + Math.floor(headH / 2) - 1, 1, 2, dark);
    if (f.key === 'wizard') { R(hx - 1, hy, headW + 2, 1, '#3b5dc9'); R(hx, hy - 2, headW, 2, '#3b5dc9'); R(hx + 1, hy - 4, 4, 2, '#3b5dc9'); R(hx + 2, hy - 6, 2, 2, '#3b5dc9'); R(hx + 3, hy - 7, 1, 1, '#ffcd75'); R(hx + headW - 3, hy + headH - 2, 3, 4, '#f4f4f4'); }
    if (f.key === 'witch') { R(hx - 2, hy, headW + 4, 1, '#5d275d'); R(hx, hy - 2, headW, 2, '#5d275d'); R(hx + 1, hy - 4, 4, 2, '#5d275d'); R(hx, hy - 6, 3, 2, '#5d275d'); R(hx - 1, hy + 1, 2, headH + 2, '#b13e53'); }
    if (f.key === 'sage') { R(hx, hy + 1, headW, 1, '#e43b44'); R(hx + headW - 3, hy + headH - 2, 3, 6, '#f4f4f4'); R(hx - 1, hy + 2, 1, 4, '#f4f4f4'); }
    if (f.key === 'dwarf') { R(hx - 1, hy - 1, headW + 2, 2, '#94b0c2'); R(hx - 2, hy - 3, 1, 3, '#f4f4f4'); R(hx + headW + 1, hy - 3, 1, 3, '#f4f4f4'); R(hx + 1, hy + headH - 2, headW, 5, '#b13e53'); }
    if (f.key === 'elf') { R(hx - 1, hy - 1, headW, 2, '#38b764'); R(hx - 1, hy, 2, headH, '#38b764'); R(hx - 2, hy + 2, 1, 2, skin); }
    if (f.key === 'giant') { R(hx, hy + 2, headW, 1, dark); R(hx + 2, hy + headH - 2, 4, 1, dark); }
    if (f.key === 'knight') { R(hx - 1, hy - 1, headW + 2, headH + 1, '#94b0c2'); R(hx + 2, hy + 2, headW - 1, 1, dark); R(hx + 1, hy - 4, 2, 3, '#e43b44'); }
    if (f.key === 'rogue') { R(hx - 1, hy - 1, headW + 1, 2, '#333c57'); R(hx - 1, hy, 2, headH, '#333c57'); R(hx + 1, hy + headH - 2, headW - 1, 2, '#333c57'); }
    if (f.crown && f.st !== 'ko') { const cy = hy - (HAT[f.key] || 1) - 5, cx = hx - 1; R(cx, cy + 2, 8, 3, '#ffcd75'); R(cx, cy, 2, 2, '#ffcd75'); R(cx + 3, cy - 1, 2, 3, '#ffcd75'); R(cx + 6, cy, 2, 2, '#ffcd75'); R(cx + 1, cy + 3, 1, 1, '#e43b44'); R(cx + 3, cy + 3, 2, 1, '#41a6f6'); R(cx + 6, cy + 3, 1, 1, '#e43b44'); }
    const punching = f.st === 'punch' && f.stT < 0.2, casting = f.st === 'special' && f.stT < 0.34, arm = f.key === 'knight' ? '#94b0c2' : skin;
    const orb = { wizard: '#ef7d57', witch: '#a7f070', sage: '#73eff7' }[f.key];
    if (punching) { R(1, sh, bw / 2 + 9, 2, arm); R(bw / 2 + 8, sh - 1, 3, 4, arm); }
    else if (f.st === 'block') { R(1, sh, bw / 2 + 2, 2, arm); R(bw / 2 + 2, sh - 4, 2, 10, f.key === 'knight' ? '#f4f4f4' : '#94b0c2'); R(bw / 2 + 4, sh - 3, 1, 8, '#566c86'); }
    else if (casting) {
      R(1, sh - 1, bw / 2 + 4, 2, arm);
      if (orb) { R(bw / 2 + 3, sh - 1, 8, 1, '#b13e53'); R(bw / 2 + 10, sh - 2, 3, 3, orb); }
      if (f.key === 'knight') { R(bw / 2 + 3, sh - 1, 12, 2, '#f4f4f4'); R(bw / 2 + 2, sh - 3, 1, 6, '#ffcd75'); }
      if (f.key === 'elf') { R(bw / 2 + 5, sh - 5, 1, 10, '#b13e53'); R(bw / 2 + 4, sh - 6, 1, 2, '#b13e53'); R(bw / 2 + 4, sh + 4, 1, 2, '#b13e53'); }
      if (f.key === 'giant') R(-bw / 2 - 1, -2, bw + 2, 2, '#f4f4f4');
    } else {
      R(1, sh, 2, 6, arm);
      if (orb) { R(bw / 2 + 1, -Hh + 3, 1, Hh - 3, '#b13e53'); R(bw / 2, -Hh + 1, 3, 3, orb); }
      if (f.key === 'dwarf') { R(bw / 2 + 1, sh - 4, 1, 9, '#b13e53'); R(bw / 2, sh - 5, 4, 4, '#94b0c2'); }
      if (f.key === 'elf') { R(-bw / 2 - 2, sh - 3, 1, 9, '#b13e53'); }
      if (f.key === 'giant') { R(bw / 2 + 1, sh - 2, 3, 10, '#b13e53'); R(bw / 2, sh - 5, 5, 4, '#b13e53'); }
      if (f.key === 'knight') { R(bw / 2 + 1, sh - 7, 1, 10, '#f4f4f4'); R(bw / 2, sh + 2, 3, 1, '#ffcd75'); }
      if (f.key === 'rogue') { R(bw / 2 + 1, sh + 3, 1, 4, '#f4f4f4'); }
    }
    g.restore();
  }
  function drawAttack(g, a, now) {
    if (a.dead) return; const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    if (a.kind === 'aura') { if (a.t < 0.12 || a.t > 0.36) return; const r = 8 + (a.t - 0.12) * 110, o = a.owner; for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2; P(o.x + Math.cos(an) * r - 1, o.y - 11 + Math.sin(an) * r * 0.6 - 1, 2, 2, i % 2 ? '#73eff7' : '#f4f4f4'); } return; }
    if (a.zap) {
      if (a.t < a.delay) { if (Math.floor(a.t * 12) % 2) { P(a.px - 5, GROUND - 1, 11, 1, '#ffcd75'); P(a.px - 1, GROUND - 3, 3, 2, '#ffcd75'); } return; }
      let x = a.px; for (let y = 0; y < GROUND; y += 6) { const nx = a.px + ((y / 6) % 2 ? 3 : -3); P(Math.min(x, nx), y, Math.abs(nx - x) + 2, 2, '#ffcd75'); P(nx, y + 2, 2, 4, '#f4f4f4'); x = nx; }
      P(a.px - 6, GROUND - 2, 13, 2, '#f4f4f4'); return;
    }
    if (a.boom) { const r = 4 + a.bt * 40; for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; P(a.px + Math.cos(an) * r - 1, a.py + Math.sin(an) * r * 0.7 - 1, 3, 3, i % 3 ? '#ef7d57' : '#ffcd75'); } P(a.px - 3, a.py - 3, 6, 6, '#f4f4f4'); return; }
    if (!a.proj || (a.delay && a.t < a.delay)) return;
    const x = a.px, y = a.py, d = a.vx >= 0 ? 1 : -1;
    if (a.kind === 'fireball') { P(x - 3, y - 2, 6, 4, '#ef7d57'); P(x - 2, y - 3, 4, 6, '#ef7d57'); P(x - 1, y - 1, 2, 2, '#ffcd75'); P(x - d * 6, y - 1, 2, 2, '#b13e53'); P(x - d * 9, y, 1, 1, '#b13e53'); }
    else if (a.kind === 'hex') { P(x - 1, y - 3, 2, 6, '#a7f070'); P(x - 3, y - 1, 6, 2, '#a7f070'); P(x - 1, y - 1, 2, 2, '#f4f4f4'); P(x - d * 6, y, 1, 1, '#38b764'); }
    else if (a.kind === 'arrow') { P(x - 4, y, 8, 1, '#f4f4f4'); P(x + d * 4 - (d < 0 ? 1 : 0), y - 1, 1, 3, '#94b0c2'); P(x - d * 4, y - 1, 1, 3, '#e43b44'); }
    else if (a.kind === 'dagger') { P(x - 2, y, 5, 1, '#f4f4f4'); P(x - d * 3, y - 1, 1, 3, '#ffcd75'); }
    else if (a.kind === 'axe') { const k = Math.floor(now * 14) % 4; P(x - 2, y - 2, 4, 4, '#94b0c2'); if (k % 2) P(x - 1, y - 5, 1, 10, '#b13e53'); else P(x - 5, y - 1, 10, 1, '#b13e53'); }
    else if (a.kind === 'bomb') { P(x - 2, y - 2, 5, 5, '#1a1c2c'); P(x - 1, y - 1, 1, 1, '#94b0c2'); if (Math.floor(now * 16) % 2) P(x + 1, y - 4, 1, 2, '#ffcd75'); }
    else if (a.kind === 'bolt') { P(x - 5, y, 10, 1, '#94b0c2'); P(x + d * 5 - (d < 0 ? 1 : 0), y - 1, 1, 3, '#f4f4f4'); P(x - d * 5, y - 1, 1, 3, '#5d275d'); }
    else if (a.kind === 'stomp') { const dx = (a.t - a.delay) * a.vx; [a.x0 + dx, a.x0 - dx].forEach((sx) => { P(sx - 2, GROUND - 5, 4, 5, '#f4f4f4'); P(sx - 3, GROUND - 2, 6, 2, '#ffcd75'); P(sx - 1, GROUND - 8, 2, 2, '#94b0c2'); }); }
  }
  const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  function heartsHTML(hp) {
    let out = '';
    for (let i = 0; i < 5; i++) {
      const kind = hp >= (i + 1) * 2 ? 2 : hp >= i * 2 + 1 ? 1 : 0; let r = '';
      HEART.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${kind === 2 || (kind === 1 && x < 4) ? '#e43b44' : '#333c57'}"/>`; }));
      out += `<svg viewBox="0 0 7 6" style="width:14px;height:12px;margin:0 1px;shape-rendering:crispEdges">${r}</svg>`;
    }
    return out;
  }

  /* ---------------- the arena screen ---------------- */
  const CSS = `#arena{position:fixed;inset:0;z-index:30;background:#1a1c2c;display:flex;flex-direction:column;padding:calc(8px + env(safe-area-inset-top)) 8px calc(10px + env(safe-area-inset-bottom));touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;font-family:'Press Start 2P',ui-monospace,monospace;color:#f4f4f4}
#arena .atop{display:flex;justify-content:space-between;align-items:center;margin:0 auto 8px;width:100%;max-width:640px}
#arena .abtn{font:inherit;font-size:9px;color:#f4f4f4;background:#333c57;border:3px solid #f4f4f4;box-shadow:3px 3px 0 #000;display:grid;place-items:center;padding:8px;line-height:1.3;text-align:center}
#arena .abtn.on{background:#566c86;transform:translate(2px,2px);box-shadow:1px 1px 0 #000}
#arena .abtn.cool{opacity:.45}
#arena .hud{display:flex;justify-content:space-between;font-size:8px;margin:0 auto 5px;width:100%;max-width:640px}
#arena .hud .r{text-align:right}
#arena .hud .nm{margin-bottom:4px;white-space:nowrap}
#arena .pips{margin-top:3px;height:5px}
#arena .pips i{display:inline-block;width:8px;height:4px;margin:0 1px;background:#73eff7}
#arena .pips i.off{background:#333c57}
#arena .stage{position:relative;width:100%;max-width:640px;margin:0 auto}
#arena canvas{width:100%;display:block;image-rendering:pixelated;image-rendering:crisp-edges;border:3px solid #f4f4f4;background:#000}
#arena .over{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#ffcd75;text-shadow:2px 2px 0 #000;padding:8px}
#arena .over.dim{background:rgba(10,10,20,.72)}
#arena .over .big{font-size:20px;line-height:1.4}
#arena .over .small{font-size:8px;line-height:1.9;margin-top:8px;color:#f4f4f4}
#arena .over .rowb{display:flex;gap:10px;margin-top:12px}
#arena .pad{flex:1;display:flex;justify-content:space-between;align-items:center;gap:8px;max-width:640px;width:100%;margin:8px auto 0;min-height:190px}
#arena .dpad{display:grid;grid-template-columns:repeat(3,54px);grid-template-rows:repeat(3,54px);gap:4px}
#arena .dpad .abtn{font-size:14px;padding:0}
#arena .acts{display:grid;grid-template-columns:repeat(2,76px);grid-template-rows:54px 70px;gap:6px}
#arena .acts .wide{grid-column:1/3}
#arena .acts .p{background:#b13e53} #arena .acts .s{background:#3b5dc9;font-size:7px}
#arena .buffs{font-size:6px;line-height:1.9;color:#94b0c2;max-width:640px;margin:6px auto 0;width:100%}`;
  let G = null;
  function loadScript(src) { return new Promise((res, rej) => { if (window.supabase) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); }); }

  function open(opts) {
    if (G) close();
    if (!document.getElementById('arenaCss')) { const st = document.createElement('style'); st.id = 'arenaCss'; st.textContent = CSS; document.head.appendChild(st); }
    const el = document.createElement('div'); el.id = 'arena';
    el.innerHTML = `<div class="atop"><button class="abtn" data-act="exit">&lt; EXIT</button><span id="aMode" style="font-size:7px;color:#94b0c2"></span><button class="abtn" data-act="mute"></button></div>
      <div class="hud"><div class="l"><div class="nm" id="aN0"></div><div id="aH0"></div><div class="pips" id="aP0"></div></div><div class="r"><div class="nm" id="aN1"></div><div id="aH1"></div><div class="pips" id="aP1"></div></div></div>
      <div class="stage"><canvas width="${W}" height="${H}"></canvas><div class="over" id="aOver"></div></div>
      <div class="pad"><div class="dpad"><span></span><button class="abtn" data-k="u">^</button><span></span><button class="abtn" data-k="l">&lt;</button><span></span><button class="abtn" data-k="r">&gt;</button><span></span><button class="abtn" data-k="d">v</button><span></span></div>
        <div class="acts"><button class="abtn wide" data-k="block">BLOCK</button><button class="abtn p" data-k="punch">PUNCH</button><button class="abtn s" data-k="special" id="aSp"></button></div></div>
      <div class="buffs" id="aBuffs"></div>`;
    document.body.appendChild(el);
    const cv = el.querySelector('canvas'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    G = { opts, el, g, mode: opts.mode, phase: 'lobby', t: 0, last: performance.now(), inp: {}, latch: {}, attacks: [], fx: [], me: null, opp: null, raf: 0, hud: '', over: '',
      netStatus: '', peer: null, peerAt: 0, lastRx: 0, lastTx: 0, lastSt: '', hiT: 0, reported: false, net: null, result: null, count: 0, lastTick: 4,
      bgIdx: Math.floor(Math.random() * SCENES.length), bgc: null, crate: null, dropT: 0, t0: 0, lobbyT: 30, note: '', spLabel: '' };
    G.bgc = scene(G.bgIdx);
    G.attack = (f, kind) => {
      const local = f === G.me || G.mode === 'cpu'; if (!local) return;
      const tgt = f === G.me ? G.opp : G.me, o = { x: f.x, y: f.y, face: f.face, mg: f.m.magic, tx: tgt ? tgt.x : null };
      const a = mkAttack(f, kind, f.id.slice(0, 6) + (++seq), o); G.attacks.push(a);
      if (f === G.me) { sfx(kind === 'punch' ? 'punch' : kind === 'zap' ? 'zap' : 'special'); if (G.net) G.net.send({ k: 'a', id: a.id, kind, x: +f.x.toFixed(1), y: +f.y.toFixed(1), f: f.face, mg: f.m.magic, tx: o.tx == null ? null : Math.round(o.tx) }); }
    };
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.querySelectorAll('[data-k]').forEach((b) => {
      const k = b.dataset.k, set = (v) => { if (G) { G.inp[k] = v; if (v) G.latch[k] = true; } b.classList.toggle('on', v); };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); ac(); try { b.setPointerCapture(e.pointerId); } catch (x) {} set(true); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, () => set(false)));
    });
    el.addEventListener('click', (e) => { const a = e.target.closest('[data-act]'); if (!a) return; const act = a.dataset.act;
      if (act === 'exit') close(); else if (act === 'mute') { musicOn = !musicOn; try { localStorage.setItem('tunga-sound', musicOn ? 'on' : 'off'); } catch (x) {} if (musicOn) musicStart(); else musicStop(); paintMute(); }
      else if (act === 'rematch') lobby(); else if (act === 'wait' && G) { G.lobbyT = 30; } });
    G.onKey = (e) => { const m = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', z: 'punch', x: 'special', c: 'block' }[e.key]; if (m && G) { G.inp[m] = e.type === 'keydown'; if (e.type === 'keydown' && !e.repeat) G.latch[m] = true; e.preventDefault(); } };
    window.addEventListener('keydown', G.onKey); window.addEventListener('keyup', G.onKey);
    paintMute(); ac(); if (musicOn) musicStart();
    el.querySelector('#aMode').textContent = G.mode === 'net' ? 'LIVE FIGHT' : 'PRACTICE';
    el.querySelector('#aBuffs').innerHTML = 'YOUR BARS TODAY: ' + modLines(opts.me.stats).join(' · ');
    if (G.mode === 'net') netOpen();
    lobby();
    G.raf = requestAnimationFrame(frame);
  }
  function paintMute() { const b = G && G.el.querySelector('[data-act=mute]'); if (b) b.textContent = musicOn ? 'SOUND ON' : 'SOUND OFF'; }
  function close() {
    if (!G) return; cancelAnimationFrame(G.raf); musicStop();
    window.removeEventListener('keydown', G.onKey); window.removeEventListener('keyup', G.onKey);
    if (G.net) G.net.close(); G.el.remove(); const o = G.opts; G = null; if (o.onClose) try { o.onClose(); } catch (e) {}
  }
  function setOver(html, dim) { if (G.over === html) return; G.over = html; const o = G.el.querySelector('#aOver'); o.innerHTML = html; o.classList.toggle('dim', !!dim && !!html); o.style.pointerEvents = html.includes('<button') ? 'auto' : 'none'; }

  function lobby() {
    G.phase = 'lobby'; G.attacks = []; G.fx = []; G.result = null; G.reported = false; G.peer = null; G.peerAt = 0; G.me = null; G.opp = null; G.hud = '';
    G.t0 = Date.now(); G.lobbyT = 30; G.crate = null; G.note = ''; G.spLabel = '';
    if (G.mode === 'cpu') startCount(G.opts.me, G.opts.opp, -1, Math.floor(Math.random() * SCENES.length));
  }
  function startCount(meInfo, oppInfo, mySide, bgIdx) {
    G.me = mkFighter(meInfo, mySide); G.opp = mkFighter(oppInfo, -mySide); G.opp.tx = G.opp.x;
    G.phase = 'count'; G.count = 3.2; G.lastTick = 4; G.attacks = []; G.lastRx = performance.now();
    G.bgIdx = Number.isInteger(bgIdx) && bgIdx >= 0 && bgIdx < SCENES.length ? bgIdx : 0; G.bgc = scene(G.bgIdx);
    G.crate = null; G.dropT = dropFirst(); G.spLabel = '';
  }
  /* The phone that opened the lobby first (the challenger) is the host: it picks the arena and runs the crate drops. */
  const amHost = (p) => G.t0 < p.t0 || (G.t0 === p.t0 && G.opts.me.id < p.id);
  const isHost = () => G.mode === 'cpu' || (G.me && G.me.side < 0);
  function touching(f, c) { return f.st !== 'ko' && Math.abs(f.x - c.x) < f.c.w / 2 + 6 && c.y > f.y - f.c.h - 2 && c.y - 11 < f.y; }
  function giveItem(f, type) {
    const local = f === G.me || G.mode === 'cpu';
    if (type === 'heart') { if (local) f.hp = Math.min(10, f.hp + 1); }
    else if (local) f.weap = { type, ammo: ITEMS[type].ammo };
    if (f === G.me) sfx('pickup');
  }
  function spawnDrop() {
    const c = { id: 'c' + (++seq) + Math.floor(Math.random() * 1e4), type: ITEM_KEYS[Math.floor(Math.random() * ITEM_KEYS.length)], x: Math.round(24 + Math.random() * (W - 48)), y: -4, landed: false, lt: 0 };
    G.crate = c; if (G.net) G.net.send({ k: 'd', id: c.id, type: c.type, x: c.x });
  }
  function award(c, f) {
    if (G.crate !== c) return; G.crate = null; G.dropT = dropNext(); giveItem(f, c.type);
    if (G.net) G.net.send({ k: 'got', id: c.id, who: f.id, type: c.type });
  }
  function stepCrate(dt, fighting) {
    const c = G.crate;
    if (!c) { if (fighting && isHost()) { G.dropT -= dt; if (G.dropT <= 0) spawnDrop(); } return; }
    if (!c.landed) { c.y += 22 * dt; if (c.y >= GROUND) { c.y = GROUND; c.landed = true; } } else { c.lt += dt; if (c.lt > 9) { G.crate = null; G.dropT = dropNext(); return; } }
    if (!fighting) return;
    if (isHost()) {
      if (touching(G.me, c)) award(c, G.me);
      else if (G.mode === 'cpu' && touching(G.opp, c)) award(c, G.opp);
    } else if (touching(G.me, c) && (!c.reqAt || performance.now() - c.reqAt > 600)) { c.reqAt = performance.now(); G.net.send({ k: 'g', id: c.id }); }
  }

  /* ---------------- live play over Supabase Realtime ---------------- */
  async function netOpen() {
    const cfg = G.opts.net, mine = G;
    try {
      await loadScript('supabase.js'); if (G !== mine) return;
      const cl = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 40 } } });
      const ch = cl.channel(cfg.room, { config: { broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: 'g' }, (m) => { if (G === mine) onNet(m.payload || {}); });
      ch.subscribe((status) => { if (G === mine) G.netStatus = status; });
      G.net = { send: (p) => { if (G === mine && G.netStatus === 'SUBSCRIBED') { try { const r = ch.send({ type: 'broadcast', event: 'g', payload: p }); if (r && r.catch) r.catch(() => {}); } catch (e) {} } },
        close: () => { try { cl.removeChannel(ch); } catch (e) {} try { cl.realtime.disconnect(); } catch (e) {} } };
    } catch (e) { if (G === mine) G.netStatus = 'FAILED'; }
  }
  function hiMsg() { const m = G.opts.me; return { k: 'hi', id: m.id, name: m.name, cls: m.cls, colour: m.colour, stats: m.stats, crown: !!m.crown, t0: G.t0 }; }
  function onNet(p) {
    const now = performance.now();
    if (p.k === 'hi') { if (p.id && p.id !== G.opts.me.id) { G.peer = p; G.peerAt = now; } return; }
    if (p.k === 'go') { if (G.phase === 'lobby' && p.to === G.opts.me.id && p.from && p.from.id) { G.peer = p.from; startCount(G.opts.me, G.peer, 1, p.bg); } return; }
    if (!G.opp || G.phase === 'lobby') return;
    G.lastRx = now; const o = G.opp;
    if (p.k === 's') { o.tx = p.x; o.ty = p.y; o.tvx = p.vx; o.tvy = p.vy; o.face = p.f; if (o.st !== p.st) { o.st = p.st; o.stT = 0; } o.hp = p.hp; o.guard = p.g; if (p.st === 'ko') o.hp = 0; o.weap = ITEMS[p.w] && p.w !== 'heart' ? { type: p.w, ammo: p.am } : null; }
    else if (p.k === 'd') { if (!isHost()) G.crate = { id: p.id, type: ITEMS[p.type] ? p.type : 'heart', x: clamp(+p.x || W / 2, 8, W - 8), y: -4, landed: false, lt: 0 }; }
    else if (p.k === 'g') { if (isHost() && G.crate && G.crate.id === p.id) award(G.crate, o); }
    else if (p.k === 'got') { if (G.crate && G.crate.id === p.id) G.crate = null; if (ITEMS[p.type]) giveItem(p.who === G.me.id ? G.me : o, p.type); }
    else if (p.k === 'a') { G.attacks.push(mkAttack(o, p.kind, p.id, { x: p.x, y: p.y, face: p.f, mg: p.mg, tx: p.tx })); if (o.st !== 'ko') { o.st = p.kind === 'punch' ? 'punch' : 'special'; o.stT = 0; } }
    else if (p.k === 'h') {
      const a = G.attacks.find((k) => k.id === p.id); if (a) { a.hit = true; if (a.proj) a.dead = true; }
      o.hp = p.hp; spark(p.x, p.y, p.res);
      if (p.res === 'hit' || p.res === 'ko') { o.flash = 0.12; o.inv = 0.6; }
    }
  }
  function sendState(force) {
    const f = G.me, now = performance.now(), changed = f.st !== G.lastSt;
    if (!(force || now - G.lastTx > 120 || (changed && now - G.lastTx > 45))) return;
    G.lastTx = now; G.lastSt = f.st;
    G.net.send({ k: 's', x: +f.x.toFixed(1), y: +f.y.toFixed(1), vx: Math.round(f.vx), vy: Math.round(f.vy), f: f.face, st: f.st, hp: f.hp, g: f.guard, w: f.weap ? f.weap.type : '', am: f.weap ? f.weap.ammo : 0 });
  }
  function spark(x, y, res) { G.fx.push({ x, y, t: 0, res }); sfx(res === 'blk' ? 'block' : res === 'brk' ? 'brk' : res === 'ko' ? 'ko' : 'hit'); }

  /* ---------------- main loop ---------------- */
  function frame(nowMs) {
    if (!G) return; G.raf = requestAnimationFrame(frame);
    const dt = clamp((nowMs - G.last) / 1000, 0, 0.05); G.last = nowMs; G.t += dt; const now = G.t;
    if (G.phase === 'lobby') {
      G.hiT -= dt;
      if (G.net && G.netStatus === 'SUBSCRIBED' && G.hiT <= 0) { G.hiT = 0.5; G.net.send(hiMsg()); }
      const fresh = G.peer && performance.now() - G.peerAt < 1600;
      if (fresh && amHost(G.peer)) { const b = Math.floor(Math.random() * SCENES.length); G.net.send({ k: 'go', to: G.peer.id, from: hiMsg(), bg: b }); startCount(G.opts.me, G.peer, -1, b); }
      const who = esc((G.opts.opp && G.opts.opp.name) || 'Player 2');
      if (G.phase === 'lobby') {
        if (G.netStatus === 'SUBSCRIBED') G.lobbyT -= dt;
        setOver(G.netStatus === 'FAILED' || G.netStatus === 'CHANNEL_ERROR' || G.netStatus === 'TIMED_OUT'
          ? `<div class="big">NO LINK</div><div class="small">Couldn't reach the fight server.<br>Check your signal and try again.</div>`
          : G.netStatus !== 'SUBSCRIBED' ? `<div class="big">WAITING</div><div class="small">Connecting...</div>`
          : G.lobbyT > 0 ? `<div class="big">WAITING</div><div class="small">Waiting for ${who} to join.<br>They've been sent a notification.<br><br>${Math.ceil(G.lobbyT)}</div>`
          : `<div class="big">NOT YET</div><div class="small">${who} hasn't joined yet.<br>The challenge stays open for 10 minutes.<br>You'll get a notification when they tap Fight.</div><div class="rowb"><button class="abtn" data-act="wait">WAIT 30S MORE</button><button class="abtn" data-act="exit">EXIT</button></div>`, true);
      }
    } else if (G.phase === 'count') {
      G.count -= dt; const n = Math.ceil(G.count - 0.2);
      if (n < G.lastTick) { G.lastTick = n; sfx(n <= 0 ? 'go' : 'tick'); }
      if (G.net && G.me.side < 0 && G.count > 2.2) { G.hiT -= dt; if (G.hiT <= 0) { G.hiT = 0.3; G.net.send({ k: 'go', to: G.opp.id, from: hiMsg(), bg: G.bgIdx }); } }
      setOver(`<div class="big">${n > 0 ? n : 'FIGHT!'}</div><div class="small">${SCENES[G.bgIdx]}</div>`);
      if (G.count <= 0) { G.phase = 'fight'; G.lastRx = performance.now(); setOver(''); }
      if (G.net) sendState();
    } else if (G.phase === 'fight' || G.phase === 'over') {
      const me = G.me, opp = G.opp, fighting = G.phase === 'fight';
      const inp = Object.assign({}, G.inp, G.latch); G.latch = {};
      step(me, opp, dt, fighting ? inp : {}, G);
      if (G.mode === 'cpu') step(opp, me, dt, fighting ? aiInput(opp, me, G, dt) : {}, G); else stepRemote(opp, dt);
      stepCrate(dt, fighting);
      for (const a of G.attacks) {
        stepAttack(a, dt); if (a.dead || a.hit) continue;
        const victim = a.owner === me ? opp : me, mineToJudge = victim === me || G.mode === 'cpu';
        if (!mineToJudge || !attackHits(a, victim)) continue;
        const res = applyHit(victim, a); if (!res) { if (!a.proj) a.hit = true; continue; }
        a.hit = true; if (a.proj) a.dead = true;
        const fxX = victim.x, fxY = victim.y - victim.c.h * 0.55; spark(fxX, fxY, res);
        if (G.net && victim === me) { G.net.send({ k: 'h', id: a.id, res, hp: me.hp, x: Math.round(fxX), y: Math.round(fxY) }); sendState(true); }
      }
      G.attacks = G.attacks.filter((a) => !a.dead);
      if (G.net) sendState();
      if (fighting) {
        if (me.hp <= 0 || opp.hp <= 0 || opp.st === 'ko') finish(me.hp > 0 ? 'win' : 'lose');
        else if (G.net && performance.now() - G.lastRx > 6000) finish('lost');
      } else { G.overT += dt; if (G.overT > 1.3) showResult(); }
    }
    draw(now); hud();
  }
  function finish(res) {
    G.phase = 'over'; G.overT = 0; G.result = res;
    if (res === 'win') setTimeout(() => sfx('win'), 500);
    if (res !== 'lost' && G.mode === 'net' && !G.reported) { G.reported = true; try { const r = G.opts.onResult && G.opts.onResult(res === 'win'); if (typeof r === 'string') G.note = r; } catch (e) {} }
  }
  function showResult() {
    const r = G.result, title = r === 'win' ? 'YOU WIN' : r === 'lose' ? 'YOU LOSE' : 'LINK LOST';
    const sub = r === 'lost' ? 'The other phone stopped answering.<br>No result recorded.' : G.mode === 'net' ? 'Result added to your records.' + (G.note ? '<br>' + esc(G.note) : '') : 'Practice only. Nothing recorded.';
    setOver(`<div class="big">${title}</div><div class="small">${sub}</div><div class="rowb"><button class="abtn" data-act="rematch">REMATCH</button><button class="abtn" data-act="exit">EXIT</button></div>`, true);
  }
  function draw(now) {
    const g = G.g; g.drawImage(G.bgc, 0, 0);
    if (!G.me) return;
    if (G.crate) drawCrate(g, G.crate, now);
    const order = G.me.st === 'ko' ? [G.me, G.opp] : [G.opp, G.me];
    order.forEach((f) => {
      g.fillStyle = 'rgba(26,28,44,.35)'; g.fillRect(Math.round(f.x - f.c.w / 2), GROUND, f.c.w, 2); drawFighter(g, f, now);
      if (f.weap && f.st !== 'ko') { const y = Math.round(topOf(f) - (f.crown ? 7 : 1) - 11); drawItem(g, f.weap.type, Math.round(f.x) - 3, y); g.fillStyle = '#f4f4f4'; for (let i = 0; i < f.weap.ammo; i++) g.fillRect(Math.round(f.x) - 3 + i * 2, y + 8, 1, 1); }
    });
    G.attacks.forEach((a) => drawAttack(g, a, now));
    G.fx = G.fx.filter((s) => (s.t += 1 / 60) < 0.22);
    G.fx.forEach((s) => { const r = 2 + s.t * 30, c = s.res === 'blk' ? '#73eff7' : s.res === 'brk' ? '#ffcd75' : '#f4f4f4';
      g.fillStyle = c; [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]].forEach(([dx, dy]) => g.fillRect(Math.round(s.x + dx * r), Math.round(s.y + dy * r), 2, 2)); });
  }
  function hud() {
    if (!G.me) return; const L = G.me.side < 0 ? G.me : G.opp, Rr = G.me.side < 0 ? G.opp : G.me;
    const key = [L.hp, Rr.hp, L.guard, Rr.guard, L.name, Rr.name].join('|');
    if (key !== G.hud) {
      G.hud = key; const q = (s) => G.el.querySelector(s), pips = (n) => [0, 1, 2].map((i) => `<i class="${i < n ? '' : 'off'}"></i>`).join('');
      q('#aN0').textContent = L.name.toUpperCase() + (L === G.me ? ' (YOU)' : ''); q('#aN1').textContent = Rr.name.toUpperCase() + (Rr === G.me ? ' (YOU)' : '');
      q('#aH0').innerHTML = heartsHTML(L.hp); q('#aH1').innerHTML = heartsHTML(Rr.hp); q('#aP0').innerHTML = pips(L.guard); q('#aP1').innerHTML = pips(Rr.guard);
    }
    const w = G.me.weap, lab = w ? ITEMS[w.type].name + ' x' + w.ammo : G.me.c.spName, sp = G.el.querySelector('#aSp');
    if (lab !== G.spLabel) { G.spLabel = lab; sp.textContent = lab; sp.style.background = w ? '#5d275d' : ''; }
    sp.classList.toggle('cool', w ? G.me.wCD > 0 : G.me.spCD > 0);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.Arena = { open, close, isOpen: () => !!G, CLASSES, classKey, ITEMS, SCENES, _state: () => G, _scene: scene };
})();
