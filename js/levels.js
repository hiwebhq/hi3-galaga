/* levels.js — Level manager: stage layouts, endless progression, attack scheduling,
 * bonus stages and the per-stage phase machine. */
(function (H) {
  'use strict';
  var C = H.CONFIG;
  var P = H.Player, B = H.Bullets, E = H.Enemies, A = H.Audio, FX = H.FX;

  /* Formation layouts (10 columns). A basic, B advanced, C elite, D commander. */
  var LAYOUTS = [
    ['..BBBBBB..', '.AAAAAAAA.', '.AAAAAAAA.'],
    ['...CCCC...', '.BBBBBBBB.', 'AAAAAAAAAA', 'AAAAAAAAAA'],
    ['....CC....', '..BCCCCB..', '.BBBBBBBB.', 'AAAAAAAAAA', '.AAAAAAAA.'],
    ['C.CC..CC.C', 'BBBBBBBBBB', 'BB.AAAA.BB', 'AAAAAAAAAA', 'A.AAAAAA.A'],
    ['...D..D...', '..CCCCCC..', '.BBBBBBBB.', 'AAAAAAAAAA', 'AAAAAAAAAA'],
    ['..D.DD.D..', '.CCC..CCC.', 'BBBBBBBBBB', 'AAAA..AAAA', 'AAAAAAAAAA'],
    ['.D.D..D.D.', 'CCCCCCCCCC', 'BBB.BB.BBB', 'BBAAAAAABB', 'AAAAAAAAAA'],
    ['D.D.DD.D.D', 'CCCCCCCCCC', 'BBBBBBBBBB', 'ABABAABABA', 'AAAAAAAAAA']
  ];

  var BONUS_WAVES = [
    { pat: 2, split: false, type: 'A', variant: 0 },
    { pat: 0, split: true, type: 'B', variant: 0 },
    { pat: 3, split: false, type: 'A', variant: 1 },
    { pat: 1, split: true, type: 'C', variant: 0 },
    { pat: 4, split: false, type: 'B', variant: 1 }
  ];

  H.Levels = {
    layout: function (stage) {
      return LAYOUTS[stage <= 5 ? stage - 1 : 4 + ((stage - 5) % 4)];
    },
    bonusAfter: function (stage) {
      var b = C.bonus;
      return b.enabled && stage >= b.firstAfter && (stage - b.firstAfter) % b.every === 0;
    },
    bonusTotal: BONUS_WAVES.length * C.bonus.perWave
  };

  var L = H.Level = {
    phase: 'intro',   // intro | wave | clear | bonusIntro | bonus | bonusResult | over
    t: 0, diveT: 0, fireT: 0, bonusCount: 0, waveIdx: 0, timeLeft: 0, lastTick: 0,
    result: { hits: 0, acc: 0, accBonus: 0, perfect: false },

    start: function (G) {
      this.phase = 'intro'; this.t = 0;
      G.diff = H.difficulty(G.stage);
      E.reset();
      B.clearEnemy();
      A.music('game');
      A.sfx.stage();
    },

    startBonus: function (G) {
      this.phase = 'bonusIntro'; this.t = 0;
      E.reset();
      B.clearEnemy();
      G.stats.shots = 0; G.stats.hits = 0; G.stats.bonusHits = 0;
      A.music('bonus');
      A.sfx.bonusStart();
    },

    finishBonus: function (G) {
      var r = this.result, st = G.stats, total = H.Levels.bonusTotal;
      r.hits = st.bonusHits;
      r.acc = st.shots > 0 ? Math.min(1, st.hits / st.shots) : 0;
      r.accBonus = Math.round(r.acc * C.score.accuracyMax / 10) * 10;
      r.perfect = r.hits >= total;
      G.addScore(r.accBonus + (r.perfect ? C.score.perfect : 0));
      this.phase = 'bonusResult'; this.t = 0;
      this.bonusCount++;
      E.reset();
      if (r.perfect) { A.sfx.perfect(); FX.flash(0.5, '#ffe93c'); } else A.sfx.clear();
    },

    gameOver: function () {
      this.phase = 'over'; this.t = 0;
      A.stopMusic();
    },

    update: function (dt, G) {
      var d = G.diff;
      this.t += dt;
      switch (this.phase) {
        case 'intro':
          if (this.t >= 2.2) {
            this.phase = 'wave'; this.t = 0;
            E.spawnStage(G);
            this.diveT = 1.2; this.fireT = 2;
          }
          break;

        case 'wave':
          if (E.alive === 0 && P.state !== 'captured') {
            this.phase = 'clear'; this.t = 0;
            B.clearEnemy();
            A.sfx.clear();
            break;
          }
          if (E.entering === 0 && P.state === 'alive') {
            this.diveT -= dt * (E.alive <= 4 ? 1.8 : 1);        // last stragglers get impatient
            if (this.diveT <= 0 && E.divers < d.maxDivers) {
              E.launch(G);
              this.diveT = d.diveInterval * (0.7 + Math.random() * 0.6);
            }
            if (d.formationFire) {
              this.fireT -= dt;
              if (this.fireT <= 0) {
                E.formationFire(G);
                this.fireT = d.formationFire * (0.6 + Math.random() * 0.8);
              }
            }
          }
          break;

        case 'clear':
          if (this.t >= 2.3) {
            if (H.Levels.bonusAfter(G.stage)) this.startBonus(G);
            else { G.stage++; this.start(G); }
          }
          break;

        case 'bonusIntro':
          if (this.t >= 2.6) {
            this.phase = 'bonus'; this.t = 0; this.waveIdx = 0;
            this.timeLeft = C.bonus.time; this.lastTick = 99;
          }
          break;

        case 'bonus':
          if (this.waveIdx < BONUS_WAVES.length && this.t >= this.waveIdx * C.bonus.waveGap) {
            E.spawnBonusWave(BONUS_WAVES[this.waveIdx], this.bonusCount);
            this.waveIdx++;
          }
          this.timeLeft = Math.max(0, C.bonus.time - this.t);
          var sec = Math.ceil(this.timeLeft);
          if (sec <= 5 && sec !== this.lastTick && sec > 0) { this.lastTick = sec; A.sfx.tick(); }
          if ((this.waveIdx >= BONUS_WAVES.length && E.alive === 0) || this.timeLeft <= 0) this.finishBonus(G);
          break;

        case 'bonusResult':
          if (this.t >= 4.6) { G.stage++; this.start(G); }
          break;

        case 'over':
          if (this.t >= 2.8) G.endGame();
          break;
      }
    }
  };
})(window.HI3 = window.HI3 || {});
