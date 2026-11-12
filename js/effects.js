/* effects.js — parallax starfield + pooled particle system, rings, score pop-ups,
 * screen shake and screen flash. Pools are pre-allocated: nothing is created mid-game. */
(function (H) {
  'use strict';
  var C = H.CONFIG, W = C.W, HH = C.H;

  /* ---------- Starfield ---------- */
  var Stars = H.Stars = {
    s: [],
    init: function () {
      this.s.length = 0;
      for (var l = 0; l < C.stars.length; l++) {
        var L = C.stars[l];
        for (var i = 0; i < L.count; i++) {
          this.s.push({
            x: (Math.random() * W) | 0, y: Math.random() * HH, l: l,
            ph: Math.random() * 6.28, c: L.colors[(Math.random() * L.colors.length) | 0]
          });
        }
      }
    },
    update: function (dt, boost) {
      for (var i = 0; i < this.s.length; i++) {
        var s = this.s[i];
        s.y += C.stars[s.l].speed * dt * boost;
        if (s.y >= HH) { s.y -= HH; s.x = (Math.random() * W) | 0; }
      }
    },
    draw: function (ctx, t, boost) {
      for (var i = 0; i < this.s.length; i++) {
        var s = this.s[i];
        if (s.l > 0 && Math.sin(t * 2.5 + s.ph) < -0.8) continue;   // twinkle
        ctx.fillStyle = s.c;
        ctx.fillRect(s.x, s.y | 0, 1, boost > 1.5 ? 1 + ((boost * (s.l + 1) * 0.6) | 0) : 1);
      }
    }
  };

  /* ---------- Particles / rings / pop-ups ---------- */
  var MAXP = 420, MAXR = 16, MAXT = 12;

  var FX = H.FX = {
    p: [], n: 0, rings: [], rn: 0, pops: [], tn: 0,
    shakeT: 0, shakeDur: 1, shakeMag: 0, flashA: 0, flashC: '#ffffff',

    init: function () {
      var i;
      for (i = 0; i < MAXP; i++) this.p.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '#fff', g: 0, s: 1 });
      for (i = 0; i < MAXR; i++) this.rings.push({ x: 0, y: 0, life: 0, max: 1, r: 1, c: '#fff' });
      for (i = 0; i < MAXT; i++) this.pops.push({ x: 0, y: 0, life: 0, text: '', c: '#fff' });
    },
    clear: function () { this.n = 0; this.rn = 0; this.tn = 0; this.shakeT = 0; this.flashA = 0; },

    burst: function (x, y, colors, count, speed, life, grav) {
      for (var i = 0; i < count && this.n < MAXP; i++) {
        var q = this.p[this.n++], a = Math.random() * 6.283, v = speed * (0.25 + Math.random() * 0.75);
        q.x = x; q.y = y;
        q.vx = Math.cos(a) * v; q.vy = Math.sin(a) * v;
        q.max = q.life = life * (0.5 + Math.random() * 0.5);
        q.c = colors[(Math.random() * colors.length) | 0];
        q.g = grav || 0;
        q.s = Math.random() < 0.3 ? 2 : 1;
      }
    },
    ring: function (x, y, c, r, life) {
      if (this.rn >= MAXR) return;
      var q = this.rings[this.rn++];
      q.x = x; q.y = y; q.c = c; q.r = r; q.max = q.life = life;
    },
    pop: function (text, x, y, c) {
      if (this.tn >= MAXT) return;
      var q = this.pops[this.tn++];
      q.text = text; q.x = x; q.y = y; q.c = c || '#ffffff'; q.life = 1;
    },
    shake: function (mag, dur) { this.shakeMag = mag; this.shakeT = this.shakeDur = dur; },
    flash: function (a, c) { this.flashA = a; this.flashC = c || '#ffffff'; },

    update: function (dt) {
      var i, q, tmp;
      for (i = this.n - 1; i >= 0; i--) {
        q = this.p[i];
        q.life -= dt;
        if (q.life <= 0) { tmp = this.p[--this.n]; this.p[this.n] = q; this.p[i] = tmp; continue; }
        q.vy += q.g * dt;
        q.vx *= 1 - 1.6 * dt; q.vy *= 1 - 1.6 * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
      }
      for (i = this.rn - 1; i >= 0; i--) {
        q = this.rings[i];
        q.life -= dt;
        if (q.life <= 0) { tmp = this.rings[--this.rn]; this.rings[this.rn] = q; this.rings[i] = tmp; }
      }
      for (i = this.tn - 1; i >= 0; i--) {
        q = this.pops[i];
        q.life -= dt; q.y -= 14 * dt;
        if (q.life <= 0) { tmp = this.pops[--this.tn]; this.pops[this.tn] = q; this.pops[i] = tmp; }
      }
      if (this.shakeT > 0) this.shakeT -= dt;
      if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 2.2);
    },

    applyShake: function (ctx) {
      if (this.shakeT <= 0) return;
      var m = this.shakeMag * (this.shakeT / this.shakeDur);
      ctx.translate(Math.round((Math.random() * 2 - 1) * m), Math.round((Math.random() * 2 - 1) * m));
    },

    draw: function (ctx) {
      var i, q;
      for (i = 0; i < this.rn; i++) {           // pixel rings
        q = this.rings[i];
        var u = 1 - q.life / q.max, r = 2 + q.r * u, dots = 18;
        ctx.fillStyle = q.c;
        ctx.globalAlpha = 1 - u;
        for (var k = 0; k < dots; k++) {
          var a = k / dots * 6.283;
          ctx.fillRect((q.x + Math.cos(a) * r) | 0, (q.y + Math.sin(a) * r) | 0, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
      for (i = 0; i < this.n; i++) {
        q = this.p[i];
        if (q.life / q.max < 0.3 && ((q.life * 40) | 0) & 1) continue;   // flicker out
        ctx.fillStyle = q.c;
        ctx.fillRect(q.x | 0, q.y | 0, q.s, q.s);
      }
    },
    drawPops: function (ctx) {
      for (var i = 0; i < this.tn; i++) {
        var q = this.pops[i];
        if (q.life < 0.25 && ((q.life * 30) | 0) & 1) continue;
        H.Font.draw(ctx, q.text, H.clamp(q.x, 30, W - 30), q.y, q.c, 1, 'center');
      }
    },
    drawFlash: function (ctx) {
      if (this.flashA <= 0) return;
      ctx.globalAlpha = Math.min(1, this.flashA);
      ctx.fillStyle = this.flashC;
      ctx.fillRect(0, 0, W, HH);
      ctx.globalAlpha = 1;
    }
  };
})(window.HI3 = window.HI3 || {});
