/* player.js — Player controller: movement, firing, capture, death and respawn. */
(function (H) {
  'use strict';
  var C = H.CONFIG, W = C.W, PC = C.player;
  var I = H.Input, B = H.Bullets, A = H.Audio;

  var P = H.Player = {
    x: W / 2, y: PC.y, baseY: PC.y,
    state: 'alive',        // alive | captured | dead
    inv: 0, cd: 0, respawnT: 0, muzzle: 0, jam: 0, captor: null,

    reset: function () {
      this.x = W / 2; this.y = this.baseY;
      this.state = 'alive'; this.inv = 1.5; this.cd = 0; this.muzzle = 0; this.jam = 0; this.captor = null;
    },
    respawn: function () {
      this.reset();
      this.inv = PC.invuln;
    },
    capture: function (e) {
      this.state = 'captured'; this.captor = e; this.jam = C.capture.jam;
      B.clearEnemy();
      A.sfx.capture();
    },
    release: function () {
      this.state = 'alive'; this.captor = null; this.inv = 2;
    },

    tryFire: function (G) {
      if (this.cd > 0 || B.pn >= PC.maxShots) return;
      if (B.firePlayer(this.x, this.y - 12)) {
        this.cd = PC.fireCooldown;
        this.muzzle = 0.07;
        G.stats.shots++;
        A.sfx.laser();
      }
    },

    update: function (dt, G) {
      if (this.cd > 0) this.cd -= dt;
      if (this.muzzle > 0) this.muzzle -= dt;
      if (this.inv > 0) this.inv -= dt;

      if (this.state === 'alive') {
        var dir = (I.right ? 1 : 0) - (I.left ? 1 : 0), fire = I.fire;
        if (dir) this.x += dir * PC.speed * dt;
        else if (I.pointer.active) {              // drag / hold on the playfield: steer + auto-fire
          var dx = I.pointer.x - this.x, m = PC.speed * 1.3 * dt;
          if (Math.abs(dx) > 1) this.x += dx > m ? m : dx < -m ? -m : dx;
          fire = true;
        }
        this.x = H.clamp(this.x, 9, W - 9);
        if (this.y < this.baseY) this.y = Math.min(this.baseY, this.y + 130 * dt);   // drop back after a rescue
        if (fire) this.tryFire(G);
      } else if (this.state === 'captured') {
        var e = this.captor;
        if (!e || !e.alive) { this.release(); return; }
        this.x += (e.x - this.x) * Math.min(1, dt * 6);
        this.y -= C.capture.pullSpeed * dt;
        if (this.jam > 0) this.jam -= dt;
        else if (I.fire || I.pointer.active) this.tryFire(G);
        if (this.y <= e.y + 17) G.playerDied(true);
      } else if (this.state === 'dead') {
        this.respawnT -= dt;
        if (this.respawnT <= 0 && G.lives > 0 && H.Level.phase !== 'over') this.respawn();
      }
    },

    /* shared by the title screen */
    drawShip: function (ctx, x, y, t, flash) {
      var S = H.Sprites, sx = Math.round(x) - 7, sy = Math.round(y) - 6;
      ctx.drawImage(flash ? S.shipFlash : S.ship, sx, sy);
      // animated twin thrusters
      var f = ((t * 24) | 0) % 3;
      ctx.fillStyle = '#ff9a1f';
      ctx.fillRect(sx + 3, sy + 13, 3, 1 + f); ctx.fillRect(sx + 9, sy + 13, 3, 1 + f);
      ctx.fillStyle = '#ffe93c';
      ctx.fillRect(sx + 4, sy + 13, 1, 2 + f); ctx.fillRect(sx + 10, sy + 13, 1, 2 + f);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + 4, sy + 13, 1, 1); ctx.fillRect(sx + 10, sy + 13, 1, 1);
    },

    draw: function (ctx, t) {
      if (this.state === 'dead') return;
      if (this.inv > 0 && this.state === 'alive' && ((t * 14) | 0) & 1) return;   // respawn blink
      var x = this.x, y = this.y;
      if (this.state === 'captured') x += Math.sin(t * 22) * 1.5;
      if (this.muzzle > 0) y += 1;                                                 // recoil
      var S = H.Sprites;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(S.glow('#1f6bff'), (x - 14) | 0, (y - 10) | 0, 28, 28);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this.drawShip(ctx, x, y, t, this.state === 'captured' && this.jam > 0 && ((t * 20) | 0) & 1);
      if (this.muzzle > 0) {
        var mx = Math.round(x), my = Math.round(y) - 9;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(mx - 4, my, 3, 2); ctx.fillRect(mx + 2, my, 3, 2);
        ctx.fillStyle = '#7df9ff';
        ctx.fillRect(mx - 3, my - 2, 1, 2); ctx.fillRect(mx + 3, my - 2, 1, 2);
      }
    }
  };
})(window.HI3 = window.HI3 || {});
