/* input.js — Input manager: keyboard, on-screen touch buttons, mouse / touch on the canvas. */
(function (H) {
  'use strict';
  var C = H.CONFIG;

  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'fire', Enter: 'enter', NumpadEnter: 'enter', Escape: 'esc', KeyP: 'esc', KeyM: 'mute',
    Backspace: 'back'
  };

  var I = H.Input = {
    left: false, right: false, fire: false,
    k: { left: false, right: false, fire: false },   // keyboard
    t: { left: false, right: false, fire: false },   // touch buttons
    pointer: { active: false, x: 0, y: 0 },
    touch: false,
    handler: null,          // function(action, char)
    pointerHandler: null,   // function(kind, x, y)
    onGesture: null,        // called on every user gesture (unlocks audio)
    onTouchMode: null,

    sync: function () {
      this.left = this.k.left || this.t.left;
      this.right = this.k.right || this.t.right;
      this.fire = this.k.fire || this.t.fire;
    },
    releaseAll: function () {
      this.k.left = this.k.right = this.k.fire = false;
      this.t.left = this.t.right = this.t.fire = false;
      this.pointer.active = false;
      this.sync();
    },
    emit: function (a, ch) { if (this.handler) this.handler(a, ch); },
    gesture: function () { if (this.onGesture) this.onGesture(); },
    setTouch: function () {
      if (this.touch) return;
      this.touch = true;
      document.body.classList.add('touch');
      if (this.onTouchMode) this.onTouchMode();
    },

    init: function (canvas) {
      var self = this;

      window.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var a = KEYMAP[e.code];
        self.gesture();
        if (a) {
          e.preventDefault();
          if (a === 'left' || a === 'right' || a === 'fire') { self.k[a] = true; self.sync(); }
          // navigation keys may auto-repeat; action keys may not
          if (!e.repeat || a === 'left' || a === 'right' || a === 'up' || a === 'down') self.emit(a, e.code);
        }
        // letter keys are also reported as characters (used for high-score initials)
        if (!e.repeat && /^Key[A-Z]$/.test(e.code)) self.emit('char', e.code.charAt(3));
      });
      window.addEventListener('keyup', function (e) {
        var a = KEYMAP[e.code];
        if (a === 'left' || a === 'right' || a === 'fire') { self.k[a] = false; self.sync(); }
      });
      window.addEventListener('blur', function () { self.releaseAll(); });

      /* canvas pointer: menus + drag-to-steer */
      function pos(e) {
        var r = canvas.getBoundingClientRect();
        self.pointer.x = (e.clientX - r.left) / r.width * C.W;
        self.pointer.y = (e.clientY - r.top) / r.height * C.H;
      }
      canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (e.pointerType === 'touch') self.setTouch();
        self.gesture();
        pos(e);
        self.pointer.active = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (self.pointerHandler) self.pointerHandler('down', self.pointer.x, self.pointer.y);
      });
      canvas.addEventListener('pointermove', function (e) {
        pos(e);
        if (self.pointerHandler) self.pointerHandler('move', self.pointer.x, self.pointer.y);
      });
      function up() { self.pointer.active = false; }
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);

      /* on-screen buttons */
      function bind(id, name, action) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          self.gesture();
          try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          self.t[name] = true; self.sync();
          el.classList.add('on');
          self.emit(action);
        });
        function off() { self.t[name] = false; self.sync(); el.classList.remove('on'); }
        el.addEventListener('pointerup', off);
        el.addEventListener('pointercancel', off);
        el.addEventListener('lostpointercapture', off);
        el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      }
      bind('btn-left', 'left', 'left');
      bind('btn-right', 'right', 'right');
      bind('btn-fire', 'fire', 'fire');

      /* audio unlock on any gesture (iOS needs touchend / click) */
      ['touchend', 'click'].forEach(function (ev) {
        window.addEventListener(ev, function () { self.gesture(); }, { passive: true });
      });
      window.addEventListener('touchstart', function () { self.setTouch(); }, { passive: true });

      /* stop the page from scrolling / zooming while playing */
      document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
      document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
      document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) this.setTouch();
    }
  };
})(window.HI3 = window.HI3 || {});
