/* HI3 - THE GALACTIC DEFENDER
 * config.js — every tunable game constant lives here.
 * Adjust these values to rebalance the game without touching the systems.
 */
(function (H) {
  'use strict';

  H.CONFIG = {
    TITLE: 'HI3',
    SUBTITLE: 'THE GALACTIC DEFENDER',
    W: 240,                 // logical playfield size (scaled to fit any screen)
    H: 320,

    player: {
      speed: 135,           // px / second
      y: 286,
      maxShots: 3,          // simultaneous player shots allowed on screen
      fireCooldown: 0.13,   // seconds between shots while fire is held
      shotSpeed: 400,
      lives: 3,
      maxLives: 6,
      respawnDelay: 1.6,
      invuln: 2.5,          // seconds of invulnerability after respawn
      hitW: 5,              // half-width of the (forgiving) player hitbox
      hitH: 5
    },

    // score, hit points and half-size hitboxes per enemy type
    enemy: {
      A: { score: 50, hp: 1, hw: 4, hh: 4 },    // basic
      B: { score: 80, hp: 1, hw: 5, hh: 4 },    // advanced
      C: { score: 150, hp: 2, hw: 6, hh: 5 },   // elite
      D: { score: 400, hp: 2, hw: 7, hh: 6 }    // commander
    },

    score: {
      squadBonus: 500,      // destroy a commander's whole attack squad mid-dive
      bonusKill: 100,       // each enemy in a bonus stage
      perfect: 1000,        // perfect bonus stage
      accuracyMax: 500,     // bonus stage accuracy bonus at 100%
      rescue: 1000,         // destroy the commander while captured
      beamBreak: 300        // destroy a commander while its beam is active
    },

    extraLife: { first: 15000, every: 40000 },

    bonus: {
      enabled: true,
      firstAfter: 3,        // bonus stage after stage 3 ...
      every: 4,             // ... then after every 4th stage (7, 11, ...)
      time: 30,             // countdown seconds
      perWave: 8,
      waveGap: 4.6
    },

    capture: {
      charge: 0.8,          // telegraph time before the beam can grab
      duration: 2.6,        // active beam time
      pullSpeed: 46,        // px / second the captured ship is dragged upward
      jam: 0.7,             // seconds the guns are jammed after capture
      cooldown: 9           // min seconds between beams
    },

    stars: [
      { count: 46, speed: 9, colors: ['#2c3260', '#39406e', '#3a2c60'] },
      { count: 28, speed: 22, colors: ['#8a94d6', '#6a74a8', '#a08ad6'] },
      { count: 14, speed: 46, colors: ['#ffffff', '#bfe9ff', '#ffe9bf'] }
    ],

    defaultScores: [
      { name: 'HI3', score: 10000, stage: 6 },
      { name: 'ACE', score: 7500, stage: 5 },
      { name: 'NOV', score: 5000, stage: 4 },
      { name: 'ZAP', score: 3000, stage: 3 },
      { name: 'PIX', score: 1500, stage: 2 }
    ]
  };

  H.COL = {
    cyan: '#3cf0ff', blue: '#1f6bff', red: '#ff3b3b', orange: '#ff9a1f',
    yellow: '#ffe93c', green: '#3cff5a', purple: '#b04cff', pink: '#ff4fd8',
    white: '#ffffff', dim: '#6a74a8'
  };
  H.RAINBOW = ['#ff3b3b', '#ff9a1f', '#ffe93c', '#3cff5a', '#3cf0ff', '#b04cff', '#ff4fd8'];

  /* Difficulty curve: everything ramps gradually and is capped. */
  H.difficulty = function (stage) {
    var s = Math.min(stage - 1, 24);
    return {
      speed: 1 + s * 0.04,                                   // enemy movement multiplier
      formationSpeed: 10 + s * 1.2,                          // formation sway px/s
      diveInterval: Math.max(0.75, 3.4 - s * 0.2),           // seconds between attacks
      maxDivers: Math.min(1 + Math.floor(stage / 2), 6),     // simultaneous divers
      multiDive: stage >= 3 ? Math.min(0.2 + s * 0.04, 0.6) : 0,
      bulletSpeed: 85 + s * 5,
      maxBullets: Math.min(2 + stage, 12),
      shotsPerDive: stage < 3 ? 1 : stage < 8 ? 2 : 3,
      formationFire: stage >= 3 ? Math.max(1.2, 4.5 - s * 0.2) : 0, // 0 = off
      beamChance: stage >= 5 ? 0.4 : 0,
      entryGap: Math.max(0.7, 1.5 - s * 0.05)
    };
  };

  H.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
})(window.HI3 = window.HI3 || {});
