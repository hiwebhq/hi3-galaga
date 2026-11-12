/* projectiles.js — Projectile manager (pooled player lasers and enemy shots). */
(function (H) {
  'use strict';
  var C = H.CONFIG, W = C.W, HH = C.H;
  var MAXP = 12, MAXE = 40;

  /* enemy shot kinds: 0 bolt, 1 aimed orb, 2 zig-zag, 3 commander shard */
  var KIND = [
    { c: '#ff4040', tip: '#ffe93c', w: 2, h: 5 },
    { c: '#ffe93c', tip: '#ffffff', w: 3, h: 3 },
    { c: '#ff4fd8', tip: '#ffffff', w: 3, h: 4 },
    { c: '#3cff5a', tip: '#ffffff', w: 3, h: 5 }
  ];

  var B = H.Bullets = {
    ps: [], pn: 0, es: [], en: 0,

    init: function () {
      var i;
      for (i = 0; i < MAXP; i++) this.ps.push({ x: 0, y: 0 });
      for (i = 0; i < MAXE; i++) this.es.push({ x: 0, y: 0, bx: 0, vx: 0, vy: 0, kind: 0, t: 0 });
    },
    clear: function () { this.pn = 0; this.en = 0; },
    clearEnemy: function () { this.en = 0; },

    firePlayer: function (x, y) {
      if (this.pn >= MAXP) return false;
      var s = this.ps[this.pn++];
      s.x = x; s.y = y;
      return true;
    },
    killPlayer: function (i) {
      var s = this.ps[i], last = this.ps[--this.pn];
      this.ps[i] = last; this.ps[this.pn] = s;
    },
    fireEnemy: function (x, y, vx, vy, kind) {
      if (this.en >= MAXE) return false;
      var s = this.es[this.en++];
      s.x = s.bx = x; s.y = y; s.vx = vx; s.vy = vy; s.kind = kind; s.t = 0;
      return true;
    },
    killEnemy: function (i) {
      var s = this.es[i], last = this.es[--this.en];
      this.es[i] = last; this.es[this.en] = s;
    },

    update: function (dt) {
      var i, s;
      for (i = this.pn - 1; i >= 0; i--) {
        s = this.ps[i];
        s.y -= C.player.shotSpeed * dt;
        if (s.y < -8) this.killPlayer(i);
      }
      for (i = this.en - 1; i >= 0; i--) {
        s = this.es[i];
        s.t += dt;
        s.bx += s.vx * dt;
        s.y += s.vy * dt;
        s.x = s.kind === 2 ? s.bx + Math.sin(s.t * 13) * 6 : s.bx;
        if (s.y > HH + 6 || s.x < -6 || s.x > W + 6) this.killEnemy(i);
      }
    },

    draw: function (ctx, t) {
      var i, s, S = H.Sprites;
      // neon glow pass (additive)
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      var gp = S.glow('#3cf0ff');
      for (i = 0; i < this.pn; i++) { s = this.ps[i]; ctx.drawImage(gp, (s.x - 8) | 0, (s.y - 5) | 0, 16, 16); }
      for (i = 0; i < this.en; i++) {
        s = this.es[i];
        ctx.drawImage(S.glow(KIND[s.kind].c), (s.x - 7) | 0, (s.y - 6) | 0, 14, 14);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // player twin laser bolts
      for (i = 0; i < this.pn; i++) {
        s = this.ps[i];
        var x = s.x | 0, y = s.y | 0;
        ctx.fillStyle = '#7df9ff';
        ctx.fillRect(x - 3, y, 1, 6); ctx.fillRect(x + 3, y, 1, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 3, y, 1, 2); ctx.fillRect(x + 3, y, 1, 2);
      }
      // enemy shots
      var blink = ((t * 14) | 0) & 1;
      for (i = 0; i < this.en; i++) {
        s = this.es[i];
        var k = KIND[s.kind], ex = (s.x - k.w / 2) | 0, ey = (s.y - k.h / 2) | 0;
        ctx.fillStyle = k.c;
        ctx.fillRect(ex, ey, k.w, k.h);
        ctx.fillStyle = k.tip;
        if (s.kind === 1) { if (blink) ctx.fillRect(ex + 1, ey + 1, 1, 1); }
        else ctx.fillRect(ex, ey + k.h - 2, k.w, 1 + blink);
      }
    }
  };
})(window.HI3 = window.HI3 || {});
