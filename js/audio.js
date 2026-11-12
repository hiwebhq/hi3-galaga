/* audio.js — Audio manager. All sound is synthesized with the Web Audio API
 * (no audio files). Audio starts on the player's first interaction. */
(function (H) {
  'use strict';

  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function e8(a) { var o = []; for (var i = 0; i < a.length; i++) o.push(a[i], 0); return o; }
  function q4(a) { var o = []; for (var i = 0; i < a.length; i++) o.push(a[i], 0, 0, 0); return o; }
  function sparse(len, map) { var o = []; for (var i = 0; i < len; i++) o.push(map[i] || 0); return o; }

  /* Original step-sequenced tunes (MIDI note numbers, 0 = rest, 16th-note steps) */
  var TRACKS = {
    title: {
      bpm: 128, lv: 0.07, bv: 0.17, ll: 1.6, bl: 3,
      lead: e8([69, 72, 76, 81, 79, 76, 72, 76, 65, 69, 72, 77, 76, 72, 69, 72,
        67, 71, 74, 79, 77, 74, 71, 74, 64, 68, 71, 76, 80, 76, 71, 68]),
      bass: q4([45, 45, 57, 45, 41, 41, 53, 41, 43, 43, 55, 43, 40, 40, 52, 40])
    },
    game: {
      bpm: 144, lv: 0.035, bv: 0.12, ll: 2.5, bl: 1.5,
      lead: sparse(32, { 0: 76, 6: 79, 12: 83, 16: 81, 22: 79, 26: 78 }),
      bass: e8([40, 40, 52, 40, 40, 40, 47, 50, 43, 43, 55, 43, 45, 45, 57, 47])
    },
    bonus: {
      bpm: 160, lv: 0.06, bv: 0.15, ll: 0.9, bl: 3,
      lead: [72, 76, 79, 84, 79, 76, 72, 76, 77, 81, 84, 89, 84, 81, 77, 81,
        79, 83, 86, 91, 86, 83, 79, 83, 72, 76, 79, 84, 88, 84, 79, 76],
      bass: q4([36, 48, 41, 53, 43, 55, 36, 48])
    }
  };

  var A = H.Audio = {
    ctx: null, ready: false,
    vol: { master: 0.8, music: 0.6, sfx: 0.8 }, muted: false,
    track: null, trackName: '', pending: '', step: 0, nextT: 0, timer: 0, paused: false,

    /* must be called from a user gesture */
    init: function () {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) { /* ignore */ } }
        return;
      }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        var c = this.ctx = new AC();
        this.master = c.createGain();
        this.musicG = c.createGain();
        this.sfxG = c.createGain();
        this.musicG.connect(this.master);
        this.sfxG.connect(this.master);
        this.master.connect(c.destination);
        var len = c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
        this.ready = true;
        this.applyVolumes();
        var self = this;
        this.timer = setInterval(function () { self.tick(); }, 25);
        if (this.pending) { var p = this.pending; this.pending = ''; this.music(p); }
      } catch (err) {
        console.warn('Audio unavailable:', err);
      }
    },

    applyVolumes: function () {
      if (!this.ready) return;
      var t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master * 0.9, t, 0.02);
      this.musicG.gain.setTargetAtTime(this.vol.music, t, 0.02);
      this.sfxG.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
    },

    /* ---- music sequencer (look-ahead scheduling) ---- */
    music: function (name) {
      if (!this.ready) { this.pending = name; return; }
      if (this.trackName === name) return;
      this.trackName = name;
      this.track = TRACKS[name] || null;
      this.step = 0;
      this.nextT = this.ctx.currentTime + 0.06;
    },
    stopMusic: function () { this.track = null; this.trackName = ''; this.pending = ''; },
    pauseMusic: function (p) {
      this.paused = p;
      if (!p && this.ready) this.nextT = this.ctx.currentTime + 0.05;
    },
    tick: function () {
      var tr = this.track;
      if (!tr || this.paused || !this.ready || this.ctx.state !== 'running') return;
      var now = this.ctx.currentTime, sd = 60 / tr.bpm / 4;
      if (this.nextT < now - 0.25) this.nextT = now + 0.02;   // tab was asleep: resync
      while (this.nextT < now + 0.14) {
        var l = tr.lead[this.step % tr.lead.length], b = tr.bass[this.step % tr.bass.length];
        if (l) this.tone('square', mtof(l), 0, sd * tr.ll, tr.lv, this.nextT, this.musicG);
        if (b) this.tone('triangle', mtof(b), 0, sd * tr.bl, tr.bv, this.nextT, this.musicG);
        this.nextT += sd;
        this.step++;
      }
    },

    /* ---- synth primitives ---- */
    tone: function (type, f0, f1, dur, vol, at, dest) {
      var c = this.ctx, t = at || c.currentTime;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfxG);
      o.start(t); o.stop(t + dur + 0.03);
    },
    noise: function (dur, vol, f0, f1, delay) {
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noiseBuf; s.loop = true;
      f.type = 'lowpass';
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.sfxG);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
    },
    seq: function (type, notes, stepDur, vol, len) {
      var t = this.ctx.currentTime;
      for (var i = 0; i < notes.length; i++) {
        if (notes[i]) this.tone(type, mtof(notes[i]), 0, stepDur * (len || 1.4), vol, t + i * stepDur);
      }
    }
  };

  function fx(fn) {
    return function () {
      if (!A.ready || A.muted) return;
      try { fn(); } catch (e) { /* never let audio break the game */ }
    };
  }

  A.sfx = {
    laser: fx(function () { A.tone('square', 1500, 380, 0.09, 0.1); }),
    hit: fx(function () { A.tone('square', 420, 180, 0.05, 0.12); }),
    boom: fx(function () { A.noise(0.22, 0.34, 3200, 200); A.tone('triangle', 240, 50, 0.2, 0.2); }),
    bigBoom: fx(function () { A.noise(0.5, 0.5, 2600, 90); A.tone('sawtooth', 170, 30, 0.5, 0.2); }),
    playerBoom: fx(function () {
      A.noise(1.0, 0.6, 4200, 60);
      A.tone('sawtooth', 500, 40, 0.9, 0.22);
      A.tone('square', 260, 30, 0.7, 0.12, A.ctx.currentTime + 0.1);
    }),
    dive: fx(function () {
      var t = A.ctx.currentTime;
      A.tone('triangle', 1250, 520, 0.2, 0.1, t);
      A.tone('triangle', 1000, 300, 0.3, 0.1, t + 0.18);
    }),
    eshot: fx(function () { A.tone('square', 560, 240, 0.08, 0.05); }),
    beam: fx(function () { A.tone('sine', 380, 860, 0.26, 0.09); A.tone('sine', 760, 1500, 0.26, 0.04); }),
    capture: fx(function () { A.seq('square', [81, 75, 81, 75, 81, 75], 0.09, 0.1, 1); }),
    rescue: fx(function () { A.seq('square', [72, 76, 79, 84, 88, 91], 0.06, 0.11); }),
    stage: fx(function () { A.seq('square', [64, 0, 67, 0, 71, 76], 0.085, 0.1, 1.6); }),
    clear: fx(function () { A.seq('square', [72, 76, 79, 76, 79, 84], 0.09, 0.1, 1.6); }),
    bonusStart: fx(function () { A.seq('square', [60, 64, 67, 72, 67, 72, 76, 79], 0.07, 0.1); }),
    perfect: fx(function () { A.seq('square', [72, 72, 76, 79, 84, 79, 84, 88, 91, 96], 0.08, 0.11, 1.8); }),
    extra: fx(function () { A.seq('square', [76, 79, 88, 84, 86, 91], 0.07, 0.12); }),
    over: fx(function () { A.seq('triangle', [67, 0, 65, 0, 63, 0, 62, 0, 55, 0, 48], 0.16, 0.24, 2.4); }),
    blip: fx(function () { A.tone('square', 660, 0, 0.05, 0.07); }),
    select: fx(function () { A.tone('square', 880, 1320, 0.1, 0.09); }),
    tick: fx(function () { A.tone('square', 990, 0, 0.04, 0.06); })
  };
})(window.HI3 = window.HI3 || {});
