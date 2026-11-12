/* sprites.js — original pixel art (built at runtime, no image files) + bitmap font. */
(function (H) {
  'use strict';

  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* Sprites are authored as their LEFT half (last column = centre) and mirrored. */
  function build(half, pal) {
    var hw = half[0].length, w = hw * 2 - 1, h = half.length;
    var c = mk(w, h), g = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < hw; x++) {
        var ch = half[y][x];
        if (!ch || ch === '.') continue;
        g.fillStyle = pal ? (pal[ch] || '#fff') : '#fff';
        g.fillRect(x, y, 1, 1);
        g.fillRect(w - 1 - x, y, 1, 1);
      }
    }
    return c;
  }

  var ART = {
    ship: [
      '....a...', '....a...', '...ab...', '...ab..w', '...ab.ww', '..aab.wc', '..abbawc',
      '.aabbaab', '.abbbabb', 'aabbaabb', 'abbaaabb', 'ab..aab.', 'a...a.b.'
    ],
    mini: ['...a', '...a', '.a.b', '.abb', 'aabb', 'abab', 'a..b'],
    A: [
      ['a....', '.a.aa', '..aaa', '.aaca', 'aaaaa', 'a.aab', 'a..a.', '.....'],
      ['.....', 'aa.aa', '..aaa', '.aaca', 'aaaaa', '.aaab', '.a.a.', 'a....']
    ],
    B: [
      ['a....b', 'aa..bb', 'aaa.ab', '.aaaab', '..aacb', '.aaaab', 'aa.aab', 'a...a.', '....a.'],
      ['......', '....bb', 'a...ab', 'aaaaab', 'aaaacb', 'aaaaab', 'aa.aab', 'a...a.', '...a..']
    ],
    C: [
      ['..aa...', '.aaaa.b', 'aaaaabb', 'aacaaab', 'aaccaab', 'aaaaabb', '.aaabbb', '..ab.bw', '.aa..b.', 'aa...b.', 'a......'],
      ['..aa...', '.aaaa.b', 'aaaaabb', 'aacaaab', 'aaccaab', 'aaaaabb', '.aaabbb', '..ab.bw', '..aa.b.', '...aab.', '...a...']
    ],
    D: [
      ['a...b...', 'a..bb..w', 'aa.bb.ww', 'aaabbbww', '.aaabbbb', '.aacccbb', 'aaaccabb', 'aaaaaabw', 'aaa.aabb', 'aa..abbb', 'a..aa.b.', '...a..b.', '..a.....'],
      ['a...b...', 'a..bb..w', 'aa.bb.ww', 'aaabbbww', '.aaabbbb', '.aacccbb', 'aaaccabb', 'aaaaaabw', 'aaa.aabb', 'aa..abbb', '.a.aa.b.', '.a..a.b.', '....a...']
    ]
  };

  var PAL = {
    ship: { a: '#3cf0ff', b: '#1f6bff', w: '#ffffff', c: '#0a2a8a' },
    A: [{ a: '#3cff5a', b: '#ffe93c', c: '#ff3b3b' }, { a: '#3c8bff', b: '#7df9ff', c: '#ffe93c' }],
    B: [{ a: '#ff9a1f', b: '#ffe93c', c: '#3c8bff' }, { a: '#c05cff', b: '#ff6ad5', c: '#ffe93c' }],
    C: [{ a: '#b04cff', b: '#ff4fd8', c: '#ffe93c', w: '#ffffff' }, { a: '#ff3b3b', b: '#ff9a1f', c: '#7df9ff', w: '#ffffff' }],
    D: [{ a: '#ffd91f', b: '#ff3b3b', c: '#3c8bff', w: '#ffffff' }, { a: '#ff8a1f', b: '#b04cff', c: '#ffffff', w: '#ffe93c' }]
  };

  var S = H.Sprites = {
    ship: null, mini: null,
    enemies: {},            // enemies[type][variant][frame]; variant 2 = white hit-flash
    glows: {},
    init: function () {
      this.ship = build(ART.ship, PAL.ship);
      this.shipFlash = build(ART.ship, null);
      this.mini = build(ART.mini, PAL.ship);
      var types = ['A', 'B', 'C', 'D'];
      for (var i = 0; i < types.length; i++) {
        var t = types[i], set = [];
        for (var v = 0; v < 2; v++) set.push([build(ART[t][0], PAL[t][v]), build(ART[t][1], PAL[t][v])]);
        set.push([build(ART[t][0], null), build(ART[t][1], null)]);
        this.enemies[t] = set;
      }
    },
    enemy: function (type, variant, frame) { return this.enemies[type][variant][frame]; },
    colors: function (type, variant) {
      var p = PAL[type][variant] || PAL[type][0];
      return [p.a, p.b, '#ffffff'];
    },
    /* soft radial glow sprite, drawn with additive blending for neon bloom */
    glow: function (color) {
      var c = this.glows[color];
      if (!c) {
        c = mk(32, 32);
        var g = c.getContext('2d');
        var gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, color);
        gr.addColorStop(0.35, color);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.9;
        g.fillStyle = gr;
        g.fillRect(0, 0, 32, 32);
        this.glows[color] = c;
      }
      return c;
    }
  };

  /* ---------- 5x7 bitmap font ---------- */
  var G = {
    'A': '01110 10001 10001 11111 10001 10001 10001', 'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110', 'D': '11110 10001 10001 10001 10001 10001 11110',
    'E': '11111 10000 10000 11110 10000 10000 11111', 'F': '11111 10000 10000 11110 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111', 'H': '10001 10001 10001 11111 10001 10001 10001',
    'I': '01110 00100 00100 00100 00100 00100 01110', 'J': '00111 00010 00010 00010 00010 10010 01100',
    'K': '10001 10010 10100 11000 10100 10010 10001', 'L': '10000 10000 10000 10000 10000 10000 11111',
    'M': '10001 11011 10101 10101 10001 10001 10001', 'N': '10001 11001 10101 10011 10001 10001 10001',
    'O': '01110 10001 10001 10001 10001 10001 01110', 'P': '11110 10001 10001 11110 10000 10000 10000',
    'Q': '01110 10001 10001 10001 10101 10010 01101', 'R': '11110 10001 10001 11110 10100 10010 10001',
    'S': '01111 10000 10000 01110 00001 00001 11110', 'T': '11111 00100 00100 00100 00100 00100 00100',
    'U': '10001 10001 10001 10001 10001 10001 01110', 'V': '10001 10001 10001 10001 10001 01010 00100',
    'W': '10001 10001 10001 10101 10101 11011 10001', 'X': '10001 10001 01010 00100 01010 10001 10001',
    'Y': '10001 10001 01010 00100 00100 00100 00100', 'Z': '11111 00001 00010 00100 01000 10000 11111',
    '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00110 01000 10000 11111', '3': '11110 00001 00001 01110 00001 00001 11110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
    '-': '00000 00000 00000 11111 00000 00000 00000', '.': '00000 00000 00000 00000 00000 01100 01100',
    ',': '00000 00000 00000 00000 01100 00100 01000', ':': '00000 01100 01100 00000 01100 01100 00000',
    '!': '00100 00100 00100 00100 00100 00000 00100', '?': '01110 10001 00001 00010 00100 00000 00100',
    '/': '00001 00001 00010 00100 01000 10000 10000', '%': '11001 11010 00010 00100 01000 01011 10011',
    '+': '00000 00100 00100 11111 00100 00100 00000', '=': '00000 00000 11111 00000 11111 00000 00000',
    '<': '00010 00100 01000 10000 01000 00100 00010', '>': '01000 00100 00010 00001 00010 00100 01000',
    '\'': '00100 00100 01000 00000 00000 00000 00000', '(': '00010 00100 01000 01000 01000 00100 00010',
    ')': '01000 00100 00010 00010 00010 00100 01000', '*': '00000 10101 01110 11111 01110 10101 00000'
  };
  var CHARS = Object.keys(G).join('');
  var atlases = {};

  function atlas(color) {
    var a = atlases[color];
    if (a) return a;
    a = mk(CHARS.length * 5, 7);
    var g = a.getContext('2d');
    g.fillStyle = color;
    for (var i = 0; i < CHARS.length; i++) {
      var bits = G[CHARS[i]].replace(/ /g, '');
      for (var p = 0; p < 35; p++) if (bits[p] === '1') g.fillRect(i * 5 + (p % 5), (p / 5) | 0, 1, 1);
    }
    atlases[color] = a;
    return a;
  }

  H.Font = {
    width: function (text, scale) { scale = scale || 1; return String(text).length * 6 * scale - scale; },
    draw: function (ctx, text, x, y, color, scale, align) {
      text = String(text).toUpperCase();
      scale = scale || 1;
      var w = text.length * 6 * scale - scale;
      if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
      x = Math.round(x); y = Math.round(y);
      var a = atlas(color || '#ffffff');
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (ch === ' ') continue;
        var idx = CHARS.indexOf(ch);
        if (idx < 0) continue;
        ctx.drawImage(a, idx * 5, 0, 5, 7, x + i * 6 * scale, y, 5 * scale, 7 * scale);
      }
    }
  };
})(window.HI3 = window.HI3 || {});
