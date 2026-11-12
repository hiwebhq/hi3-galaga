/* ui.js — UI manager: HUD, in-game messages, canvas menus and every screen. */
(function (H) {
  'use strict';
  var C = H.CONFIG, W = C.W, COL = H.COL, RB = H.RAINBOW;
  var F = H.Font, A = H.Audio, P = H.Player, E = H.Enemies;
  var SL_X = 132;      // slider bar origin in wide (settings) menus

  function ease(u) { u = H.clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function bounce(u) {
    u = H.clamp(u, 0, 1);
    if (u < 1 / 2.75) return 7.5625 * u * u;
    if (u < 2 / 2.75) { u -= 1.5 / 2.75; return 7.5625 * u * u + 0.75; }
    if (u < 2.5 / 2.75) { u -= 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
    u -= 2.625 / 2.75; return 7.5625 * u * u + 0.984375;
  }
  function rainbowText(ctx, text, cx, y, scale, t, wave) {
    var w = F.width(text, scale), x0 = cx - w / 2;
    for (var i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue;
      F.draw(ctx, text[i], x0 + i * 6 * scale, y + (wave ? Math.sin(t * 8 + i * 0.6) * wave : 0),
        RB[(i + ((t * 8) | 0)) % RB.length], scale);
    }
  }

  /* ---------- generic canvas menu (keyboard, mouse and touch) ---------- */
  function Menu(items, y, gap, wide) {
    this.items = items; this.sel = 0; this.y = y; this.gap = gap || 15; this.wide = !!wide;
  }
  Menu.prototype = {
    key: function (k) {
      var it = this.items[this.sel], n = this.items.length;
      if (k === 'up') { this.sel = (this.sel + n - 1) % n; A.sfx.blip(); }
      else if (k === 'down') { this.sel = (this.sel + 1) % n; A.sfx.blip(); }
      else if (k === 'left' || k === 'right') {
        if (it.type === 'slider') it.set(H.clamp(it.get() + (k === 'left' ? -1 : 1), 0, 10));
        else if (it.type === 'toggle') it.set(!it.get());
      } else if (k === 'enter' || k === 'fire') {
        if (it.type === 'toggle') it.set(!it.get());
        else if (it.type !== 'slider') { A.sfx.select(); it.action(); }
      }
    },
    pointer: function (kind, x, y, dragging) {
      var i = Math.floor((y - (this.y - 4)) / this.gap);
      if (i < 0 || i >= this.items.length || x < 10 || x > W - 10) return;
      var it = this.items[i];
      if (kind === 'move' && !dragging) { this.sel = i; return; }
      this.sel = i;
      if (it.type === 'slider') {
        if (x >= SL_X - 8) {
          var v = H.clamp(Math.ceil((x - SL_X) / 7), 0, 10);
          if (v !== it.get()) it.set(v);
        }
      } else if (kind === 'down') {
        if (it.type === 'toggle') it.set(!it.get());
        else { A.sfx.select(); it.action(); }
      }
    },
    draw: function (ctx, t) {
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i], y = this.y + i * this.gap, sel = i === this.sel;
        var col = sel ? COL.yellow : COL.cyan, label = typeof it.label === 'function' ? it.label() : it.label;
        if (this.wide && it.type) {
          if (sel && ((t * 4) | 0) & 1) F.draw(ctx, '>', 14, y, COL.yellow);
          F.draw(ctx, label, 24, y, col);
          if (it.type === 'slider') {
            var v = it.get();
            for (var k = 0; k < 10; k++) {
              ctx.fillStyle = k < v ? (sel ? COL.yellow : COL.cyan) : '#262a55';
              ctx.fillRect(SL_X + k * 7, y, 5, 7);
            }
            F.draw(ctx, String(v), W - 14, y, col, 1, 'right');
          } else {
            var on = it.get();
            F.draw(ctx, on ? 'ON' : 'OFF', W - 14, y, on ? COL.green : COL.red, 1, 'right');
          }
        } else {
          F.draw(ctx, label, W / 2, y, col, 1, 'center');
          if (sel && ((t * 4) | 0) & 1) {
            var hw = F.width(label, 1) / 2;
            F.draw(ctx, '>', W / 2 - hw - 12, y, COL.yellow);
            F.draw(ctx, '<', W / 2 + hw + 7, y, COL.yellow);
          }
        }
      }
    }
  };

  var UI = H.UI = {
    Menu: Menu,

    /* ---------- menu factories ---------- */
    titleMenu: function (G) {
      return new Menu([
        { label: 'START GAME', action: function () { G.newGame(); } },
        { label: 'HOW TO PLAY', action: function () { G.open('howto'); } },
        { label: 'SOUND SETTINGS', action: function () { G.open('settings'); } },
        { label: 'HIGH SCORES', action: function () { G.open('scores'); } }
      ], 214, 15);
    },
    pauseMenu: function (G) {
      return new Menu([
        { label: 'RESUME', action: function () { G.resume(); } },
        { label: 'RESTART', action: function () { G.newGame(); } },
        { label: 'SOUND SETTINGS', action: function () { G.open('settings'); } },
        { label: 'RETURN TO TITLE', action: function () { G.setState('title'); } }
      ], 150, 16);
    },
    overMenu: function (G) {
      return new Menu([
        { label: 'PLAY AGAIN', action: function () { G.newGame(); } },
        { label: 'RETURN TO TITLE', action: function () { G.setState('title'); } },
        { label: 'VIEW HIGH SCORES', action: function () { G.open('scores'); } }
      ], 200, 16);
    },
    backMenu: function (G, y) {
      return new Menu([{ label: 'BACK', action: function () { G.back(); } }], y, 15);
    },
    settingsMenu: function (G) {
      var S = H.Store.data.settings;
      function slider(label, key) {
        return {
          label: label, type: 'slider',
          get: function () { return S[key]; },
          set: function (v) { S[key] = v; G.applySettings(); A.sfx.blip(); }
        };
      }
      function toggle(label, key) {
        return {
          label: label, type: 'toggle',
          get: function () { return S[key]; },
          set: function (v) { S[key] = v; G.applySettings(); A.sfx.blip(); }
        };
      }
      return new Menu([
        slider('MASTER VOLUME', 'master'), slider('MUSIC VOLUME', 'music'), slider('SFX VOLUME', 'sfx'),
        toggle('MUTE ALL SOUND', 'muted'), toggle('CRT EFFECT', 'crt'),
        { label: 'BACK', action: function () { G.back(); } }
      ], 96, 20, true);
    },

    /* ---------- HUD ---------- */
    drawHUD: function (ctx, G) {
      F.draw(ctx, 'SCORE', 6, 3, COL.red);
      F.draw(ctx, G.shown < 10 ? '0' + G.shown : G.shown, 6, 12, COL.white);
      F.draw(ctx, 'HIGH SCORE', W / 2, 3, COL.red, 1, 'center');
      F.draw(ctx, G.hi(), W / 2, 12, COL.white, 1, 'center');
      F.draw(ctx, 'STAGE', W - 6, 3, COL.red, 1, 'right');
      F.draw(ctx, G.stage, W - 6, 12, COL.white, 1, 'right');
      var mini = H.Sprites.mini;
      for (var i = 0; i < G.lives - 1; i++) ctx.drawImage(mini, 6 + i * 10, 309);
    },

    /* ---------- in-game messages ---------- */
    drawMessages: function (ctx, G) {
      var L = H.Level, t = L.t, pt = G.pt, cx = W / 2, r;
      switch (L.phase) {
        case 'intro':
          if (t < 1.15) F.draw(ctx, 'STAGE ' + G.stage, cx + (1 - ease(t / 0.35)) * 170, 140, COL.cyan, 2, 'center');
          else if (((t * 7) | 0) & 1) F.draw(ctx, 'READY!', cx, 140, COL.yellow, 2, 'center');
          break;
        case 'clear':
          rainbowText(ctx, 'STAGE CLEAR', cx, 140, 2, t, 3);
          break;
        case 'bonusIntro':
          if (((t * 5) | 0) % 4 !== 3) rainbowText(ctx, 'BONUS STAGE', cx, 128, 3, t, 0);
          if (t > 0.8) F.draw(ctx, 'THEY WILL NOT FIRE BACK', cx, 168, COL.white, 1, 'center');
          if (t > 1.3) F.draw(ctx, 'DESTROY THEM ALL FOR A PERFECT!', cx, 182, COL.yellow, 1, 'center');
          break;
        case 'bonus': {
          var sec = Math.ceil(L.timeLeft), low = sec <= 5;
          if (!low || ((pt * 6) | 0) & 1) F.draw(ctx, 'TIME ' + (sec < 10 ? '0' + sec : sec), cx, 24, low ? COL.red : COL.yellow, 1, 'center');
          F.draw(ctx, 'HITS ' + G.stats.bonusHits, W - 6, 24, COL.green, 1, 'right');
          break;
        }
        case 'bonusResult':
          r = L.result;
          F.draw(ctx, 'BONUS RESULTS', cx, 100, COL.cyan, 2, 'center');
          if (t > 0.6) F.draw(ctx, 'HITS  ' + r.hits + ' / ' + H.Levels.bonusTotal, cx, 134, COL.white, 1, 'center');
          if (t > 1.2) F.draw(ctx, 'ACCURACY  ' + Math.round(r.acc * 100) + '%   +' + r.accBonus, cx, 150, COL.green, 1, 'center');
          if (t > 1.8) {
            if (r.perfect) rainbowText(ctx, 'PERFECT!  +' + C.score.perfect, cx, 172, 2, t, 2);
            else F.draw(ctx, 'ESCAPED  ' + (H.Levels.bonusTotal - r.hits), cx, 166, COL.orange, 1, 'center');
          }
          break;
        case 'over':
          if (t > 0.9 && ((t * 10) | 0) % 5 !== 0) F.draw(ctx, 'GAME OVER', cx, 140, COL.red, 2, 'center');
          break;
      }
      if (P.state === 'captured' && ((pt * 6) | 0) & 1) {
        F.draw(ctx, 'CAPTURED!', cx, 196, COL.red, 2, 'center');
        F.draw(ctx, 'SHOOT THE COMMANDER!', cx, 216, COL.yellow, 1, 'center');
      }
      if (G.bannerT > 0) rainbowText(ctx, G.banner, cx, 108, 2, pt, 2);
    },

    /* ---------- screens ---------- */
    drawTitle: function (ctx, G) {
      var t = G.time, S = H.Sprites, i, img;
      F.draw(ctx, 'HIGH SCORE  ' + G.hi(), W / 2, 6, COL.red, 1, 'center');

      // marching mini-formation
      for (i = 0; i < 8; i++) {
        img = S.enemy(i & 1 ? 'B' : 'A', (i >> 1) & 1, ((t * 2.2) | 0) & 1);
        ctx.drawImage(img, Math.round(W / 2 + (i - 3.5) * 20 + Math.sin(t * 0.8) * 26 - img.width / 2),
          Math.round(27 + Math.sin(t * 2 + i * 0.7) * 2 - img.height / 2));
      }

      // neon logo
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.28 + Math.sin(t * 3) * 0.07;
      ctx.drawImage(S.glow('#1f6bff'), 20, 22, 200, 90);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      var flick = Math.sin(t * 37) > 0.96;
      F.draw(ctx, C.TITLE, W / 2 + 3, 47, '#b04cff', 6, 'center');
      F.draw(ctx, C.TITLE, W / 2 + 1, 45, '#1f6bff', 6, 'center');
      F.draw(ctx, C.TITLE, W / 2, 44, flick ? '#ffffff' : '#3cf0ff', 6, 'center');
      ctx.fillStyle = COL.pink;
      ctx.fillRect(56, 91, 128, 1);
      F.draw(ctx, C.SUBTITLE, W / 2, 96, COL.pink, 1, 'center');

      // score table
      var rows = [['A', '50'], ['B', '80'], ['C', '150'], ['D', '400']];
      for (i = 0; i < 4; i++) {
        img = S.enemy(rows[i][0], 0, ((t * 3 + i) | 0) & 1);
        var y = 117 + i * 13;
        ctx.drawImage(img, Math.round(88 - img.width / 2), Math.round(y + 3 - img.height / 2));
        F.draw(ctx, '=  ' + rows[i][1] + ' PTS', 104, y, i === 3 ? COL.yellow : COL.white);
      }

      // cruising ship
      P.drawShip(ctx, W / 2 + Math.sin(t * 0.9) * 72, 180, t, false);

      if (((t * 2.5) | 0) & 1) {
        F.draw(ctx, H.Input.touch ? 'TAP START GAME TO PLAY' : 'PRESS ENTER TO START', W / 2, 198, COL.yellow, 1, 'center');
      }
      F.draw(ctx, 'FREE PLAY - NO COINS NEEDED', W / 2, 294, COL.dim, 1, 'center');
      F.draw(ctx, 'HTTP://GALAGA.HI3.CC', W / 2, 308, COL.cyan, 1, 'center');
    },

    drawHowTo: function (ctx) {
      F.draw(ctx, 'HOW TO PLAY', W / 2, 24, COL.cyan, 2, 'center');
      var lines = [
        ['MOVE   LEFT / RIGHT  OR  A / D', COL.white],
        ['FIRE   SPACE', COL.white],
        ['PAUSE  ESC', COL.white],
        ['TOUCH  BUTTONS, OR DRAG ON SCREEN', COL.white],
        ['', ''],
        ['DESTROY EVERY ALIEN TO CLEAR', COL.yellow],
        ['THE STAGE. DODGE DIVE ATTACKS.', COL.yellow],
        ['', ''],
        ['WIPE OUT A COMMANDER\'S WHOLE', COL.green],
        ['ATTACK SQUAD MID-DIVE: +500', COL.green],
        ['', ''],
        ['BEWARE THE CAPTURE BEAM! IF YOU', COL.pink],
        ['ARE CAUGHT, SHOOT THE COMMANDER', COL.pink],
        ['BEFORE IT REELS YOU IN: +1000', COL.pink],
        ['', ''],
        ['BONUS STAGES: ALIENS DO NOT FIRE.', COL.orange],
        ['HIT THEM ALL FOR A PERFECT +1000', COL.orange],
        ['', ''],
        ['EXTRA SHIP AT ' + C.extraLife.first + ', THEN', COL.cyan],
        ['EVERY ' + C.extraLife.every + ' POINTS', COL.cyan]
      ];
      for (var i = 0; i < lines.length; i++) if (lines[i][0]) F.draw(ctx, lines[i][0], 20, 50 + i * 11, lines[i][1]);
    },

    drawSettings: function (ctx) {
      F.draw(ctx, 'SOUND SETTINGS', W / 2, 40, COL.cyan, 2, 'center');
      F.draw(ctx, 'LEFT / RIGHT OR TAP TO ADJUST', W / 2, 66, COL.dim, 1, 'center');
      F.draw(ctx, 'M KEY MUTES AT ANY TIME', W / 2, 240, COL.dim, 1, 'center');
    },

    drawScores: function (ctx, G) {
      var t = G.time, list = H.Store.data.scores;
      rainbowText(ctx, 'HIGH SCORES', W / 2, 40, 2, t, 0);
      F.draw(ctx, 'RANK  NAME    SCORE  STAGE', W / 2, 80, COL.red, 1, 'center');
      for (var i = 0; i < 5; i++) {
        var s = list[i], y = 100 + i * 18, mine = i === G.lastRank;
        var col = mine ? (((t * 5) | 0) & 1 ? COL.yellow : COL.white) : RB[(i + 2) % RB.length];
        F.draw(ctx, (i + 1) + '.', 42, y, col);
        F.draw(ctx, s ? s.name : '---', 78, y, col);
        F.draw(ctx, s ? s.score : 0, 156, y, col, 1, 'right');
        F.draw(ctx, s ? s.stage : '-', 196, y, col, 1, 'right');
      }
    },

    drawPause: function (ctx, G) {
      ctx.fillStyle = 'rgba(0,0,10,0.72)';
      ctx.fillRect(0, 0, W, C.H);
      F.draw(ctx, 'GAME PAUSED', W / 2, 100, ((G.time * 2) | 0) & 1 ? COL.yellow : COL.cyan, 2, 'center');
    },

    drawGameOver: function (ctx, G) {
      var t = G.stateT, text = 'GAME OVER', scale = 3, x0 = W / 2 - F.width(text, scale) / 2, f = G.final;
      // red pulse behind the falling letters
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16 + Math.sin(G.time * 4) * 0.05;
      ctx.drawImage(H.Sprites.glow('#ff3b3b'), 10, 30, 220, 90);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      for (var i = 0; i < text.length; i++) {
        if (text[i] === ' ') continue;
        var u = (t - i * 0.09) / 0.55;
        if (u <= 0) continue;
        var y = -24 + (62 + 24) * bounce(u);
        F.draw(ctx, text[i], x0 + i * 6 * scale + 2, y + 2, '#7a1020', scale);
        F.draw(ctx, text[i], x0 + i * 6 * scale, y, COL.red, scale);
      }
      if (t > 1.3) F.draw(ctx, 'FINAL SCORE: ' + f.score, W / 2, 118, COL.white, 1, 'center');
      if (t > 1.6) F.draw(ctx, 'HIGH SCORE: ' + G.hi(), W / 2, 134, COL.yellow, 1, 'center');
      if (t > 1.9) F.draw(ctx, 'STAGE REACHED: ' + f.stage, W / 2, 150, COL.cyan, 1, 'center');
      if (f.rank === 0 && t > 2.2) rainbowText(ctx, 'A NEW RECORD!', W / 2, 172, 1, G.time, 1);
    },

    drawEntry: function (ctx, G) {
      var t = G.time, en = G.entry, f = G.final;
      if (f.rank === 0) rainbowText(ctx, 'NEW HIGH SCORE!', W / 2, 44, 2, t, 3);
      else rainbowText(ctx, 'TOP 5 SCORE!', W / 2, 44, 2, t, 3);
      F.draw(ctx, 'YOUR SCORE  ' + f.score, W / 2, 84, COL.white, 1, 'center');
      F.draw(ctx, 'RANK ' + (f.rank + 1) + '   STAGE ' + f.stage, W / 2, 98, COL.cyan, 1, 'center');
      F.draw(ctx, 'ENTER YOUR INITIALS', W / 2, 126, COL.yellow, 1, 'center');
      for (var i = 0; i < 3; i++) {
        var x = W / 2 - 46 + i * 34, cur = i === en.pos;
        var ch = String.fromCharCode(65 + en.letters[i]);
        if (!cur || ((t * 5) | 0) & 1) F.draw(ctx, ch, x, 148, cur ? COL.yellow : COL.cyan, 4);
        ctx.fillStyle = cur ? COL.yellow : '#262a55';
        ctx.fillRect(x, 180, 20, 2);
      }
      F.draw(ctx, H.Input.touch ? 'ARROWS: LETTER   FIRE: OK' : 'ARROWS OR TYPE   ENTER: OK', W / 2, 206, COL.dim, 1, 'center');
    }
  };
})(window.HI3 = window.HI3 || {});
