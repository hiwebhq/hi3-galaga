/* enemies.js — Enemy manager + formation manager: entry flights, formation sway,
 * dive attack patterns, commander squads, the capture beam and bonus-stage flight paths. */
(function (H) {
  'use strict';
  var C = H.CONFIG, W = C.W, HH = C.H;
  var P = H.Player, B = H.Bullets, FX = H.FX, A = H.Audio;
  var COLS = 10, CELL_X = 18, CELL_Y = 15, TOP = 46;
  var out = { x: 0, y: 0 };

  function bez(p, u, o) {
    var v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    o.x = a * p[0] + b * p[2] + c * p[4] + d * p[6];
    o.y = a * p[1] + b * p[3] + c * p[5] + d * p[7];
  }

  /* Bonus-stage choreography: parametric paths, u in 0..1, never reaching the player. */
  function bonusPath(pat, u, mir, o) {
    var x, y, a, r;
    switch (pat) {
      case 0: x = -16 + 272 * u; y = 95 + Math.sin(u * Math.PI * 4) * 45; break;                 // sine sweep
      case 1: x = -16 + 272 * u - Math.sin(u * Math.PI * 6) * 34;                                 // loop-the-loops
        y = 130 - Math.cos(u * Math.PI * 6) * 40; break;
      case 2: x = 30 + 180 * u; y = -16 + Math.sin(u * Math.PI) * 235; break;                     // deep U-dive
      case 3: x = 120 + Math.sin(u * Math.PI * 3) * 95; y = -16 + Math.sin(u * Math.PI) * 215; break; // weave
      default: a = -Math.PI / 2 + u * Math.PI * 4; r = 150 - 65 * Math.sin(u * Math.PI);          // double spiral
        x = 120 + Math.cos(a) * r * 0.8; y = 130 + Math.sin(a) * r; break;
    }
    o.x = mir < 0 ? W - x : x;
    o.y = y;
  }

  function make(type, variant, col, row) {
    return {
      type: type, variant: variant, col: col, row: row, hp: C.enemy[type].hp, alive: true,
      state: 'wait', t: 0, x: -50, y: -50, p: [0, 0, 0, 0, 0, 0, 0, 0], dur: 1,
      kind: '', side: 1, sx: 0, sy: 0, vx: 0, vy: 0, drift: 0, shots: 0, fireT: 0, flash: 0,
      squad: null, offX: 0, offY: 0, phase: 0, hx: 0, hy: 0, pat: 0, mir: 1, sndT: 0
    };
  }

  var E = H.Enemies = {
    list: [], tmp: [],
    alive: 0, entering: 0, divers: 0,
    form: { off: 0, dir: 1 },
    beamOwner: null, beamCooldown: 0,

    reset: function () {
      this.list.length = 0;
      this.alive = this.entering = this.divers = 0;
      this.form.off = 0; this.form.dir = 1;
      this.beamOwner = null; this.beamCooldown = 4;
    },
    slotX: function (e) { return W / 2 + (e.col - (COLS - 1) / 2) * CELL_X + this.form.off; },
    slotY: function (e) { return TOP + e.row * CELL_Y; },

    /* ---------- spawning ---------- */
    spawnStage: function (G) {
      var rows = H.Levels.layout(G.stage), variant = ((G.stage - 1) >> 1) & 1, d = G.diff;
      var nrows = rows.length, wave = 0;
      for (var r = nrows - 1; r >= 0; r--, wave++) {            // bottom rows fly in first
        var li = 0, ri = 0;
        for (var c = 0; c < COLS; c++) {
          var ch = rows[r][c];
          if (ch === '.') continue;
          var e = make(ch, ch === 'D' ? 0 : variant, c, r);
          var left = c < COLS / 2, idx = left ? li++ : ri++;
          var swirl = wave & 1;
          // entry flight path (cubic bezier from above the screen), mirrored for the right half
          var p = swirl ? [110, -14, -40, 60, 30, 220, 105, 140] : [50, -14, 20, 160, 190, 240, 100, 125];
          for (var k = 0; k < 8; k++) e.p[k] = (k % 2 === 0 && !left) ? W - p[k] : p[k];
          e.dur = 1.9 / d.speed;
          e.t = wave * d.entryGap + idx * 0.12;                 // delay before entering
          this.list.push(e);
        }
      }
      this.recount();
    },

    spawnBonusWave: function (w, bonusIdx) {
      var n = C.bonus.perWave, flip = bonusIdx % 2 ? -1 : 1;
      var dur = Math.max(3.4, 4.4 - bonusIdx * 0.2);
      for (var i = 0; i < n; i++) {
        var e = make(w.type, w.variant, 0, 0);
        e.hp = 1;
        e.state = 'bonus'; e.pat = w.pat; e.dur = dur;
        if (w.split) { e.mir = (i < n / 2 ? 1 : -1) * flip; e.t = -(i % (n / 2)) * 0.2; }
        else { e.mir = flip; e.t = -i * 0.2; }
        this.list.push(e);
      }
      this.recount();
    },

    recount: function () {
      var a = 0, en = 0, dv = 0;
      for (var i = 0; i < this.list.length; i++) {
        var e = this.list[i];
        if (!e.alive) continue;
        a++;
        if (e.state === 'wait' || e.state === 'enter') en++;
        else if (e.state === 'dive' || e.state === 'beam') dv++;
      }
      this.alive = a; this.entering = en; this.divers = dv;
    },

    /* ---------- attack launching ---------- */
    launch: function (G) {
      var d = G.diff, formed = this.tmp, i, e;
      formed.length = 0;
      for (i = 0; i < this.list.length; i++) {
        e = this.list[i];
        if (e.alive && e.state === 'form') formed.push(e);
      }
      if (!formed.length) return;
      e = formed[(Math.random() * formed.length) | 0];

      if (e.type === 'D') {
        if (d.beamChance && !this.beamOwner && this.beamCooldown <= 0 && P.state === 'alive' &&
          Math.random() < d.beamChance) { this.startBeam(e); return; }
        this.startLead(e, formed, G);
        return;
      }
      var room = d.maxDivers - this.divers, n = 1;
      if (Math.random() < d.multiDive) n = 2 + (Math.random() < 0.35 ? 1 : 0);
      if (n > room) n = Math.max(1, room);
      var kind = this.pickKind(e.type, G.stage), side = Math.random() < 0.5 ? -1 : 1;
      this.startDive(e, kind, 0, side, G);
      // wing-mates of the same kind from the same row join a multi-dive
      for (i = 0; i < formed.length && n > 1; i++) {
        var o = formed[i];
        if (o !== e && o.state === 'form' && o.type === e.type && o.row === e.row && Math.abs(o.col - e.col) <= 2) {
          this.startDive(o, kind, (--n) * 0.22, side, G);
        }
      }
      A.sfx.dive();
    },

    pickKind: function (type, stage) {
      var r = Math.random();
      if (type === 'A') return stage < 2 ? 'swoop' : (r < 0.55 ? 'swoop' : 'S');
      if (type === 'B') return stage < 3 ? (r < 0.5 ? 'S' : 'swoop') : (r < 0.4 ? 'S' : 'diag');
      return r < 0.5 ? 'swoop' : 'S';
    },

    startDive: function (e, kind, delay, side, G) {
      e.state = 'dive'; e.kind = kind; e.t = -delay; e.side = side;
      e.squad = null; e.offX = 0; e.offY = 0;
      e.shots = G.diff.shotsPerDive;
      e.fireT = 0.45 + Math.random() * 0.4;
      if (delay <= 0) this.initDive(e, G);
    },

    initDive: function (e, G) {
      var d = G.diff, px = P.state === 'dead' ? W / 2 : P.x;
      e.t = 0; e.sx = e.x; e.sy = e.y;
      if (e.kind === 'swoop' || e.kind === 'lead') {
        var tx = H.clamp(px + Math.random() * 40 - 20, 14, W - 14), p = e.p;
        p[0] = e.x; p[1] = e.y;
        p[2] = e.x - e.side * 40; p[3] = e.y - 30;              // small loop out of formation
        p[4] = tx + e.side * 70; p[5] = 170;
        p[6] = tx; p[7] = HH + 16;
        e.dur = 2.4 / d.speed;
      } else if (e.kind === 'S') {
        e.vy = 92 * d.speed;
        e.drift = H.clamp(px - e.x, -70, 70);
      } else {                                                   // fast diagonal
        var dx = px - e.x, dy = P.baseY - e.y, sp = 185 * d.speed;
        dx = H.clamp(dx, -dy * 0.8, dy * 0.8);
        var m = Math.sqrt(dx * dx + dy * dy) || 1;
        e.vx = dx / m * sp; e.vy = dy / m * sp;
      }
    },

    /* commander-led squad: commander plus up to two escorts in a V */
    startLead: function (e, formed, G) {
      var side = Math.random() < 0.5 ? -1 : 1, squad = { n: 1, k: 0 };
      this.startDive(e, 'lead', 0, side, G);
      e.squad = squad;
      var want = Math.min(2, G.diff.maxDivers - this.divers - 1), got = 0;
      for (var pass = 1; pass <= 3 && got < want; pass++) {      // nearest escorts first
        for (var i = 0; i < formed.length && got < want; i++) {
          var o = formed[i];
          if (o === e || o.state !== 'form' || o.type === 'D') continue;
          if (o.row - e.row !== 1 && pass < 3) continue;
          if (Math.abs(o.col - e.col) > pass) continue;
          o.state = 'dive'; o.kind = 'lead'; o.t = 0; o.side = side;
          o.sx = o.x; o.sy = o.y;
          for (var k = 0; k < 8; k++) o.p[k] = e.p[k];
          o.dur = e.dur;
          o.offX = got === 0 ? -13 : 13; o.offY = -10;
          o.shots = G.diff.shotsPerDive; o.fireT = 0.6 + Math.random() * 0.4;
          o.squad = squad; squad.n++; got++;
        }
      }
      A.sfx.dive();
    },

    /* capture beam */
    startBeam: function (e) {
      e.state = 'beam'; e.phase = 0; e.t = 0; e.sndT = 0;
      e.sx = e.x; e.sy = e.y;
      e.hx = H.clamp(P.x, 36, W - 36); e.hy = 150;
      e.squad = null;
      this.beamOwner = e;
      A.sfx.dive();
    },
    endBeam: function (e) {
      if (this.beamOwner === e) { this.beamOwner = null; this.beamCooldown = C.capture.cooldown; }
      if (e.alive && e.state === 'beam') e.state = 'settle';
    },
    beamHalfWidth: function (e, y) {
      var top = e.y + 7, bot = P.baseY + 8;
      return 4 + H.clamp((y - top) / (bot - top), 0, 1) * 18;
    },

    /* ---------- shooting ---------- */
    fire: function (e, G) {
      var d = G.diff, bs = d.bulletSpeed, y = e.y + 6;
      if (B.en >= d.maxBullets) return false;
      var dy = Math.max(40, P.y - e.y), ratio = H.clamp((P.x - e.x) / dy, -0.45, 0.45);
      if (e.type === 'A') B.fireEnemy(e.x, y, 0, bs, 0);
      else if (e.type === 'B') B.fireEnemy(e.x, y, ratio * bs, bs * 1.05, 1);
      else if (e.type === 'C') B.fireEnemy(e.x, y, ratio * bs * 0.5, bs * 0.9, 2);
      else {
        B.fireEnemy(e.x, y, ratio * bs, bs * 1.1, 3);
        if (G.stage >= 7) {
          B.fireEnemy(e.x, y, (ratio - 0.3) * bs, bs * 1.1, 3);
          B.fireEnemy(e.x, y, (ratio + 0.3) * bs, bs * 1.1, 3);
        }
      }
      A.sfx.eshot();
      return true;
    },
    formationFire: function (G) {
      var best = null, n = 0;
      for (var i = 0; i < this.list.length; i++) {
        var e = this.list[i];
        if (!e.alive || e.state !== 'form' || Math.abs(e.x - P.x) > 70) continue;
        if (Math.random() < 1 / (++n)) best = e;                // reservoir pick
      }
      if (best && B.en < G.diff.maxBullets - 1) {
        if (B.fireEnemy(best.x, best.y + 6, 0, G.diff.bulletSpeed, 0)) A.sfx.eshot();
      }
    },

    /* ---------- damage ---------- */
    hit: function (e, G) {
      e.hp--;
      e.flash = 0.09;
      if (e.hp > 0) {
        if (e.type === 'D') e.variant = 1;
        A.sfx.hit();
        return false;
      }
      this.kill(e, G);
      return true;
    },

    kill: function (e, G) {
      if (!e.alive) return;
      e.alive = false;
      var T = C.enemy[e.type], cols = H.Sprites.colors(e.type, e.variant), big = e.type === 'D' || e.type === 'C';
      FX.burst(e.x, e.y, cols, e.type === 'D' ? 26 : big ? 18 : 12, big ? 95 : 70, big ? 0.7 : 0.5);
      FX.ring(e.x, e.y, cols[1], big ? 16 : 10, 0.3);

      if (e.state === 'bonus') {
        G.addScore(C.score.bonusKill);
        G.stats.bonusHits++;
      } else {
        G.addScore(T.score);
        if (T.score >= 150) FX.pop(String(T.score), e.x, e.y - 4, '#ffffff');
        if (e.squad && e.state === 'dive') {
          e.squad.k++;
          if (e.squad.k === e.squad.n && e.squad.n > 1) {
            G.addScore(C.score.squadBonus);
            FX.pop('SQUAD +' + C.score.squadBonus, e.x, e.y - 14, H.COL.yellow);
            A.sfx.rescue();
          }
        }
        if (e.state === 'beam') {
          var wasCaptor = P.state === 'captured' && P.captor === e, active = e.phase >= 1;
          this.endBeam(e);
          if (wasCaptor) {
            P.release();
            G.addScore(C.score.rescue);
            FX.pop('RESCUE +' + C.score.rescue, e.x, e.y - 14, H.COL.cyan);
            FX.flash(0.5, '#3cf0ff');
            A.sfx.rescue();
          } else if (active) {
            G.addScore(C.score.beamBreak);
            FX.pop('BEAM BREAK +' + C.score.beamBreak, e.x, e.y - 14, H.COL.cyan);
          }
        }
      }
      if (e.type === 'D') { FX.shake(4, 0.35); FX.flash(0.25, '#ffffff'); A.sfx.bigBoom(); }
      else A.sfx.boom();
    },

    /* ---------- per-frame update ---------- */
    update: function (dt, G) {
      var d = G.diff, list = this.list, i, e, u;
      if (this.beamCooldown > 0) this.beamCooldown -= dt;

      // formation sway: reverse at the playfield boundaries
      var minB = 1e9, maxB = -1e9;
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive || e.state === 'bonus') continue;
        var bx = W / 2 + (e.col - (COLS - 1) / 2) * CELL_X;
        if (bx < minB) minB = bx;
        if (bx > maxB) maxB = bx;
      }
      if (maxB >= minB) {
        this.form.off += this.form.dir * d.formationSpeed * dt;
        if (maxB + this.form.off > W - 14) this.form.dir = -1;
        else if (minB + this.form.off < 14) this.form.dir = 1;
      }

      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        if (e.flash > 0) e.flash -= dt;
        switch (e.state) {
          case 'wait':
            e.t -= dt;
            if (e.t <= 0) { e.state = 'enter'; e.t = 0; }
            break;
          case 'enter':
            e.t += dt;
            u = e.t / e.dur;
            if (u >= 1) { u = 1; e.state = 'settle'; }
            bez(e.p, u, e);
            break;
          case 'return':                                        // re-enter from the top
            if (e.squad) { e.squad.n = 99; e.squad = null; }
            e.x = this.slotX(e); e.y = -14;
            e.state = 'settle';
            break;
          case 'settle': {
            var tx = this.slotX(e), ty = this.slotY(e), dx = tx - e.x, dy = ty - e.y;
            var dist = Math.sqrt(dx * dx + dy * dy), step = 150 * d.speed * dt;
            if (dist <= step + 0.5) { e.x = tx; e.y = ty; e.state = 'form'; }
            else { e.x += dx / dist * step; e.y += dy / dist * step; }
            break;
          }
          case 'form':
            e.x = this.slotX(e); e.y = this.slotY(e);
            break;
          case 'dive':
            this.updateDive(e, dt, G);
            break;
          case 'beam':
            this.updateBeam(e, dt);
            break;
          case 'bonus':
            e.t += dt;
            if (e.t < 0) break;
            u = e.t / e.dur;
            if (u >= 1) { e.alive = false; break; }             // escaped
            bonusPath(e.pat, u, e.mir, e);
            break;
        }
      }

      // compact the list (dead enemies are released here)
      var w = 0;
      for (i = 0; i < list.length; i++) if (list[i].alive) list[w++] = list[i];
      list.length = w;
      this.recount();
    },

    updateDive: function (e, dt, G) {
      if (e.t < 0) {                                            // delayed wing-mate still in formation
        e.t += dt;
        e.x = this.slotX(e); e.y = this.slotY(e);
        if (e.t >= 0) this.initDive(e, G);
        return;
      }
      e.t += dt;
      if (e.kind === 'swoop' || e.kind === 'lead') {
        var u = e.t / e.dur;
        if (u >= 1) { e.state = 'return'; return; }
        bez(e.p, u, out);
        if (e.offX) {                                           // escorts ease into the V behind the leader
          var b = Math.min(e.t / 0.45, 1);
          e.x = e.sx + (out.x + e.offX - e.sx) * b;
          e.y = e.sy + (out.y + e.offY - e.sy) * b;
        } else { e.x = out.x; e.y = out.y; }
      } else if (e.kind === 'S') {
        e.y = e.sy + e.vy * e.t;
        e.x = H.clamp(e.sx + Math.sin(e.t * 3.4) * 42 * e.side + e.drift * Math.min(e.t / 2, 1), 8, W - 8);
        if (e.y > HH + 14) { e.state = 'return'; return; }
      } else {
        if (e.t < 0.4) {                                        // wind-up shudder telegraphs the charge
          e.y = e.sy - Math.sin(e.t / 0.4 * Math.PI) * 5;
          e.x = e.sx + (((e.t * 40) | 0) & 1 ? 1 : -1);
        } else {
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (e.y > HH + 14 || e.x < -20 || e.x > W + 20) { e.state = 'return'; return; }
        }
      }
      // fire while diving (never from point-blank range)
      if (e.shots > 0 && e.y > 60 && e.y < 200 && P.state === 'alive') {
        e.fireT -= dt;
        if (e.fireT <= 0) {
          if (this.fire(e, G)) e.shots--;
          e.fireT = 0.45 + Math.random() * 0.3;
        }
      }
    },

    updateBeam: function (e, dt) {
      var CP = C.capture;
      e.t += dt;
      if (e.phase === 0) {                                      // fly down to hover position
        var u = Math.min(e.t / 1.1, 1), s = u * u * (3 - 2 * u);
        e.x = e.sx + (e.hx - e.sx) * s;
        e.y = e.sy + (e.hy - e.sy) * s - Math.sin(u * Math.PI) * 10;
        if (u >= 1) { e.phase = 1; e.t = 0; }
        return;
      }
      e.sndT -= dt;
      if (e.sndT <= 0) { A.sfx.beam(); e.sndT = 0.28; }
      if (e.phase === 1) {                                      // charging: harmless telegraph
        if (e.t >= CP.charge) { e.phase = 2; e.t = 0; }
      } else if (e.phase === 2) {                               // beam live
        if (P.state === 'alive' && P.inv <= 0 && Math.abs(P.x - e.x) < this.beamHalfWidth(e, P.y) - 2) {
          P.capture(e);
          e.phase = 3;
        } else if (e.t >= CP.duration) this.endBeam(e);
      } else if (P.state !== 'captured' || P.captor !== e) {    // phase 3: pulling the ship in
        this.endBeam(e);
      }
    },

    /* ---------- drawing ---------- */
    drawBeam: function (ctx, t) {
      var e = this.beamOwner;
      if (!e || !e.alive || e.state !== 'beam' || e.phase < 1) return;
      var top = (e.y + 7) | 0, bot = P.baseY + 8, charge = e.phase === 1;
      for (var y = top; y < bot; y += 2) {
        var hw = this.beamHalfWidth(e, y);
        if (charge) {
          if (((t * 18) | 0) & 1) {
            ctx.fillStyle = '#3cf0ff';
            ctx.fillRect((e.x - hw) | 0, y, 1, 1); ctx.fillRect((e.x + hw) | 0, y, 1, 1);
          }
        } else {
          var band = (((y + t * 80) / 6) | 0) % 3;
          ctx.globalAlpha = band === 0 ? 0.8 : band === 1 ? 0.5 : 0.28;
          ctx.fillStyle = band === 0 ? '#ffffff' : band === 1 ? '#3cf0ff' : '#b04cff';
          ctx.fillRect((e.x - hw) | 0, y, (hw * 2) | 0, 2);
        }
      }
      ctx.globalAlpha = 1;
    },

    draw: function (ctx, t) {
      var S = H.Sprites, slow = ((t * 2.2) | 0) & 1, fast = ((t * 7) | 0) & 1;
      for (var i = 0; i < this.list.length; i++) {
        var e = this.list[i];
        if (!e.alive || e.y < -20) continue;
        var img = S.enemy(e.type, e.flash > 0 ? 2 : e.variant, e.state === 'form' ? slow : fast);
        ctx.drawImage(img, Math.round(e.x - img.width / 2), Math.round(e.y - img.height / 2));
      }
    }
  };
})(window.HI3 = window.HI3 || {});
