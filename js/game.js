/* game.js — Game engine: main loop, state machine, collision system, scoring,
 * persistence, resizing and error handling. */
(function (H) {
  'use strict';
  var C = H.CONFIG, W = C.W, HH = C.H;
  var A = H.Audio, I = H.Input, FX = H.FX, Stars = H.Stars, B = H.Bullets, P = H.Player, E = H.Enemies,
    L = H.Level, UI = H.UI;

  /* ---------- local persistence (high scores + settings) ---------- */
  var Store = H.Store = {
    key: 'hi3-galactic-defender.v1',
    data: {
      scores: C.defaultScores.map(function (s) { return { name: s.name, score: s.score, stage: s.stage }; }),
      settings: { master: 8, music: 6, sfx: 8, muted: false, crt: true }
    },
    load: function () {
      try {
        var raw = window.localStorage.getItem(this.key);
        if (!raw) return;
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.scores)) {
          var ok = d.scores.filter(function (s) { return s && typeof s.score === 'number' && typeof s.name === 'string'; })
            .map(function (s) { return { name: s.name.slice(0, 3), score: s.score, stage: s.stage || 1 }; });
          if (ok.length) this.data.scores = ok.sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
        }
        if (d && d.settings) {
          var S = this.data.settings;
          ['master', 'music', 'sfx'].forEach(function (k) {
            if (typeof d.settings[k] === 'number') S[k] = H.clamp(Math.round(d.settings[k]), 0, 10);
          });
          S.muted = !!d.settings.muted;
          S.crt = d.settings.crt !== false;
        }
      } catch (e) { console.warn('Could not read saved data:', e); }
    },
    save: function () {
      try { window.localStorage.setItem(this.key, JSON.stringify(this.data)); }
      catch (e) { /* storage unavailable (private mode): play on without saving */ }
    }
  };

  var G = H.Game = {
    state: 'title',      // title | howto | settings | scores | play | paused | entry | gameover
    stateT: 0, backTo: 'title', menu: null,
    time: 0,             // UI clock (always runs)
    pt: 0,               // gameplay clock (frozen while paused)
    stage: 1, score: 0, shown: 0, lives: 3, nextLife: 0, diff: H.difficulty(1),
    stats: { shots: 0, hits: 0, bonusHits: 0 },
    banner: '', bannerT: 0, starBoost: 1,
    final: { score: 0, stage: 1, rank: -1 }, lastRank: -1,
    entry: { letters: [0, 0, 0], pos: 0 },
    running: false, raf: 0, last: 0, failed: false,

    /* ---------- boot ---------- */
    boot: function () {
      if (this.running) return;                     // never start a second loop
      var cv = this.cv = document.getElementById('game');
      var ctx = this.ctx = cv.getContext('2d', { alpha: false });
      ctx.imageSmoothingEnabled = false;

      Store.load();
      H.Sprites.init(); Stars.init(); FX.init(); B.init();
      I.init(cv);
      var self = this;
      I.handler = function (a, ch) { self.onKey(a, ch); };
      I.pointerHandler = function (kind, x, y) { self.onPointer(kind, x, y); };
      I.onGesture = function () { A.init(); };
      I.onTouchMode = function () { self.resize(); };

      var bp = document.getElementById('btn-pause'), bm = document.getElementById('btn-mute');
      if (bp) bp.addEventListener('click', function () { bp.blur(); self.togglePause(); });
      if (bm) bm.addEventListener('click', function () {
        bm.blur();
        Store.data.settings.muted = !Store.data.settings.muted;
        self.applySettings();
      });

      window.addEventListener('resize', function () { self.resize(); });
      window.addEventListener('orientationchange', function () { setTimeout(function () { self.resize(); }, 120); });
      if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { self.resize(); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { I.releaseAll(); self.pause(); }
      });
      window.addEventListener('blur', function () { self.pause(); });

      this.applySettings(true);
      this.resize();
      this.setState('title');
      this.running = true;
      this.last = performance.now();
      this._frame = function (now) { self.frame(now); };
      this.raf = requestAnimationFrame(this._frame);
    },

    applySettings: function (noSave) {
      var S = Store.data.settings;
      A.vol.master = S.master / 10; A.vol.music = S.music / 10; A.vol.sfx = S.sfx / 10;
      A.muted = S.muted;
      A.applyVolumes();
      document.body.classList.toggle('crt-off', !S.crt);
      var bm = document.getElementById('btn-mute');
      if (bm) { bm.classList.toggle('off', S.muted); bm.setAttribute('aria-pressed', S.muted ? 'true' : 'false'); }
      if (!noSave) Store.save();
    },

    /* keep the 3:4 playfield undistorted at any window size / orientation */
    resize: function () {
      var vw = window.innerWidth, vh = window.innerHeight;
      var portrait = vh >= vw;
      document.body.classList.toggle('portrait', portrait);
      var reserve = portrait ? (I.touch ? Math.min(170, Math.max(120, vh * 0.2)) : 52) : 0;
      var app = document.getElementById('app');
      if (app) app.style.bottom = reserve + 'px';
      var aw = vw - 8, ah = vh - reserve - 8;
      var s = Math.max(0.5, Math.min(aw / W, ah / HH));
      if (s > 2 && s - Math.floor(s) < 0.12) s = Math.floor(s);   // snap to crisp integer scale when close
      var cw = Math.floor(W * s), ch = Math.floor(HH * s);
      this.cv.style.width = cw + 'px';
      this.cv.style.height = ch + 'px';
      var scr = document.getElementById('screen');
      if (scr) scr.style.setProperty('--px', Math.max(2, s) + 'px');
    },

    /* ---------- state machine ---------- */
    setState: function (s) {
      this.state = s; this.stateT = 0;
      document.body.setAttribute('data-state', s);
      switch (s) {
        case 'title':
          this.menu = UI.titleMenu(this); this.lastRank = -1;
          FX.clear();
          A.pauseMusic(false); A.music('title');
          break;
        case 'howto': this.menu = UI.backMenu(this, 284); break;
        case 'scores': this.menu = UI.backMenu(this, 214); break;
        case 'settings': this.menu = UI.settingsMenu(this); break;
        case 'paused': this.menu = UI.pauseMenu(this); A.pauseMusic(true); break;
        case 'gameover': this.menu = UI.overMenu(this); break;
        case 'play': this.menu = null; A.pauseMusic(false); break;
        default: this.menu = null;
      }
    },
    open: function (s) { this.backTo = this.state; this.setState(s); },
    back: function () { this.setState(this.backTo === 'settings' ? 'title' : this.backTo); },

    pause: function () { if (this.state === 'play' && L.phase !== 'over') { I.releaseAll(); this.setState('paused'); } },
    resume: function () { if (this.state === 'paused') this.setState('play'); },
    togglePause: function () {
      if (this.state === 'play') this.pause(); else if (this.state === 'paused') this.resume();
    },

    newGame: function () {
      this.score = 0; this.shown = 0; this.stage = 1;
      this.lives = C.player.lives; this.nextLife = C.extraLife.first;
      this.stats.shots = this.stats.hits = this.stats.bonusHits = 0;
      this.banner = ''; this.bannerT = 0; this.pt = 0; this.lastRank = -1;
      FX.clear(); B.clear(); E.reset(); P.reset();
      L.bonusCount = 0;
      L.start(this);
      this.setState('play');
    },

    hi: function () {
      var top = Store.data.scores.length ? Store.data.scores[0].score : 0;
      return this.score > top && this.state !== 'title' ? this.score : top;
    },

    /* ---------- scoring ---------- */
    addScore: function (n) {
      this.score += n;
      while (this.score >= this.nextLife) {
        this.nextLife += C.extraLife.every;
        if (this.lives < C.player.maxLives) {
          this.lives++;
          this.banner = 'EXTRA SHIP!'; this.bannerT = 2;
          FX.flash(0.3, '#3cff5a');
          A.sfx.extra();
        }
      }
    },

    playerDied: function (swallowed) {
      if (P.state === 'dead') return;
      var captor = P.captor;
      P.state = 'dead'; P.captor = null;
      if (captor) E.endBeam(captor);
      FX.burst(P.x, P.y, ['#3cf0ff', '#ffffff', '#ff9a1f', '#1f6bff', '#ffe93c'], 48, 130, 1.1);
      FX.burst(P.x, P.y, ['#ffffff', '#ff9a1f'], 16, 50, 1.4, 60);
      FX.ring(P.x, P.y, '#3cf0ff', 26, 0.5);
      FX.ring(P.x, P.y, '#ffffff', 14, 0.35);
      FX.shake(6, 0.6);
      FX.flash(0.6, swallowed ? '#b04cff' : '#ffffff');
      A.sfx.playerBoom();
      B.clearEnemy();
      this.lives--;
      if (this.lives <= 0) { this.lives = 0; L.gameOver(); }
      else P.respawnT = C.player.respawnDelay;
    },

    endGame: function () {
      var list = Store.data.scores, rank = -1;
      if (this.score > 0) {
        rank = list.length;
        for (var i = 0; i < list.length; i++) if (this.score > list[i].score) { rank = i; break; }
        if (rank >= 5) rank = -1;
      }
      this.final.score = this.score; this.final.stage = this.stage; this.final.rank = rank;
      I.releaseAll();
      FX.clear();
      if (rank >= 0) {
        this.entry.letters[0] = this.entry.letters[1] = this.entry.letters[2] = 0;
        this.entry.pos = 0;
        this.setState('entry');
        A.sfx.perfect();
      } else {
        this.setState('gameover');
        A.sfx.over();
      }
    },

    commitEntry: function () {
      var en = this.entry, name = '';
      for (var i = 0; i < 3; i++) name += String.fromCharCode(65 + en.letters[i]);
      var list = Store.data.scores;
      list.splice(this.final.rank, 0, { name: name, score: this.final.score, stage: this.final.stage });
      list.length = Math.min(list.length, 5);
      this.lastRank = this.final.rank;
      Store.save();
      FX.clear();
      this.setState('gameover');
    },

    /* ---------- input routing ---------- */
    onKey: function (a, code) {
      if (this.failed) { if (a === 'enter') window.location.reload(); return; }
      if (this.state === 'entry') { this.entryKey(a, code); return; }
      if (a === 'char') return;
      if (a === 'mute') { Store.data.settings.muted = !Store.data.settings.muted; this.applySettings(); return; }
      switch (this.state) {
        case 'play':
          if (a === 'esc') this.pause();
          break;
        case 'paused':
          if (a === 'esc') { A.sfx.select(); this.resume(); } else this.menu.key(a);
          break;
        case 'gameover':
          if (this.stateT < 0.7) return;               // ignore button mashing right after dying
          if (a === 'esc') this.setState('title'); else this.menu.key(a);
          break;
        case 'title':
          if (a !== 'esc' && a !== 'back') this.menu.key(a);
          break;
        default:                                       // howto / settings / scores
          if (a === 'esc' || a === 'back') { A.sfx.select(); this.back(); } else this.menu.key(a);
      }
    },

    entryKey: function (a, code) {
      var en = this.entry;
      if (this.stateT < 0.6) return;
      if (a === 'char') {
        en.letters[en.pos] = code.charCodeAt(0) - 65;
        A.sfx.select();
        if (++en.pos >= 3) this.commitEntry();
        return;
      }
      if (code && /^Key/.test(code)) return;           // letter keys are handled as characters above
      if (a === 'left' || a === 'down') { en.letters[en.pos] = (en.letters[en.pos] + 25) % 26; A.sfx.blip(); }
      else if (a === 'right' || a === 'up') { en.letters[en.pos] = (en.letters[en.pos] + 1) % 26; A.sfx.blip(); }
      else if (a === 'enter' || a === 'fire') { A.sfx.select(); if (++en.pos >= 3) this.commitEntry(); }
      else if (a === 'back' || a === 'esc') { if (en.pos > 0) en.pos--; }
    },

    onPointer: function (kind, x, y) {
      if (this.failed) return;
      if (this.state === 'play') return;               // the player controller reads the pointer directly
      if (this.state === 'entry') { if (kind === 'down') this.entryKey('enter'); return; }
      if (this.state === 'gameover' && this.stateT < 0.7) return;
      if (this.menu) this.menu.pointer(kind, x, y, I.pointer.active);
    },

    /* ---------- collision system ---------- */
    collide: function () {
      var i, j, s, e, T, list = E.list;
      // player lasers vs enemies (slightly generous)
      for (i = B.pn - 1; i >= 0; i--) {
        s = B.ps[i];
        for (j = 0; j < list.length; j++) {
          e = list[j];
          if (!e.alive || e.y < -8) continue;
          T = C.enemy[e.type];
          if (Math.abs(s.x - e.x) <= T.hw + 4 && s.y <= e.y + T.hh && s.y + 6 >= e.y - T.hh) {
            B.killPlayer(i);
            FX.burst(s.x, e.y + T.hh, ['#ffffff', '#7df9ff'], 4, 45, 0.18);
            this.stats.hits++;
            E.hit(e, this);
            break;
          }
        }
      }
      if (P.state !== 'alive' || P.inv > 0) return;
      // enemy shots vs player (small, fair hitbox)
      var hw = C.player.hitW, hh = C.player.hitH;
      for (i = B.en - 1; i >= 0; i--) {
        s = B.es[i];
        if (Math.abs(s.x - P.x) < hw && Math.abs(s.y - P.y) < hh + 1) { this.playerDied(false); return; }
      }
      // ramming enemies vs player
      for (j = 0; j < list.length; j++) {
        e = list[j];
        if (!e.alive || e.state === 'form' || e.state === 'bonus' || e.state === 'wait' || e.state === 'beam') continue;
        T = C.enemy[e.type];
        if (Math.abs(e.x - P.x) < T.hw + hw - 1 && Math.abs(e.y - P.y) < T.hh + hh - 1) {
          E.kill(e, this);
          this.playerDied(false);
          return;
        }
      }
    },

    /* ---------- main loop ---------- */
    frame: function (now) {
      if (this.failed) return;
      var dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) dt = 0; else if (dt > 0.05) dt = 0.05;   // clamp long frames (tab switches)
      try {
        this.update(dt);
        this.render();
      } catch (err) {
        this.fail(err);
        return;
      }
      this.raf = requestAnimationFrame(this._frame);
    },

    update: function (dt) {
      this.time += dt; this.stateT += dt;
      if (this.state === 'paused') return;            // complete freeze: nothing in the world advances
      if (this.backTo === 'paused' && this.state === 'settings') return;

      var boost = 1;
      if (this.state === 'play') {
        boost = L.phase === 'clear' ? 7 : L.phase === 'intro' ? 3.5 : L.phase === 'bonusIntro' ? 5 : 1;
      }
      this.starBoost += (boost - this.starBoost) * Math.min(1, dt * 4);
      Stars.update(dt, this.starBoost);

      if (this.state === 'play') {
        this.pt += dt;
        if (this.bannerT > 0) this.bannerT -= dt;
        P.update(dt, this);
        L.update(dt, this);
        if (this.state !== 'play') return;            // game ended this frame
        E.update(dt, this);
        B.update(dt);
        this.collide();
        FX.update(dt);
        if (this.shown < this.score) {                // arcade-style rolling score counter
          this.shown = Math.min(this.score, this.shown + Math.max(10, Math.ceil((this.score - this.shown) * dt * 10)));
        }
      } else {
        if (this.state === 'entry' && Math.random() < dt * 14) {      // high-score confetti
          FX.burst(Math.random() * W, -2, H.RAINBOW, 3, 40, 6, 90);
        }
        FX.update(dt);
      }
    },

    render: function () {
      var ctx = this.ctx, st = this.state, inGame = st === 'play' || st === 'paused';
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, HH);
      ctx.save();
      if (st === 'play') FX.applyShake(ctx);
      Stars.draw(ctx, inGame ? this.pt : this.time, this.starBoost);

      if (inGame) {
        var pt = this.pt;
        E.drawBeam(ctx, pt);
        E.draw(ctx, pt);
        B.draw(ctx, pt);
        P.draw(ctx, pt);
        FX.draw(ctx);
        FX.drawPops(ctx);
        UI.drawHUD(ctx, this);
        UI.drawMessages(ctx, this);
        if (L.phase === 'over') {                      // world fades to red as the game ends
          ctx.globalAlpha = Math.min(0.35, L.t * 0.14);
          ctx.fillStyle = '#ff1030';
          ctx.fillRect(0, 0, W, HH);
          ctx.globalAlpha = 1;
        }
      } else if (st === 'title') UI.drawTitle(ctx, this);
      else if (st === 'howto') UI.drawHowTo(ctx);
      else if (st === 'settings') UI.drawSettings(ctx);
      else if (st === 'scores') UI.drawScores(ctx, this);
      else if (st === 'gameover') { FX.draw(ctx); UI.drawGameOver(ctx, this); }
      else if (st === 'entry') { FX.draw(ctx); UI.drawEntry(ctx, this); }
      ctx.restore();

      if (st === 'play') FX.drawFlash(ctx);
      if (st === 'paused') UI.drawPause(ctx, this);
      if (this.menu && (st !== 'gameover' || this.stateT > 0.7)) this.menu.draw(ctx, this.time);
    },

    /* ---------- graceful failure ---------- */
    fail: function (err) {
      this.failed = true;
      try { cancelAnimationFrame(this.raf); } catch (e) { /* ignore */ }
      try { A.stopMusic(); } catch (e) { /* ignore */ }
      console.error('HI3 game error:', err);
      var el = document.getElementById('error');
      if (el) {
        el.querySelector('.msg').textContent = String(err && err.message ? err.message : err);
        el.classList.add('show');
      }
    }
  };

  function start() {
    try { G.boot(); } catch (err) { G.fail(err); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.HI3 = window.HI3 || {});
