/* Ring Channel TV - remote control (D-pad) navigation layer.
 * Arrow keys move a highlight to the nearest clickable item in that direction,
 * OK/Enter clicks it. Works on any page of the site, including content added later.
 */
(function () {
  if (window.__tvnav) { window.__tvnav.refresh(); return; }

  var style = document.createElement('style');
  style.textContent =
    '.tvnav-focus{outline:4px solid #ffd400 !important;outline-offset:3px !important;' +
    'box-shadow:0 0 18px 6px rgba(255,212,0,.65) !important;border-radius:6px;' +
    'position:relative;z-index:2147483000;transition:outline .08s}' +
    'html{scroll-behavior:smooth}';
  (document.head || document.documentElement).appendChild(style);

  var SELECTOR = [
    'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea',
    'video[controls]', 'summary', '[onclick]', '[tabindex]:not([tabindex="-1"])',
    '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=option]',
    '[role=checkbox]', '[role=switch]'
  ].join(',');

  var current = null;
  var remote = false;   // becomes true once a remote/keyboard key is used; touch turns it off

  function visible(el) {
    if (!el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    if (el.disabled) return false;
    return true;
  }

  function candidates() {
    var set = new Set(document.querySelectorAll(SELECTOR));
    // React/SPA sites often make plain divs clickable: detect via pointer cursor.
    var all = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (set.has(el)) continue;
      if (getComputedStyle(el).cursor === 'pointer') {
        var p = el.parentElement;
        // only the outermost pointer element, to avoid nested duplicates
        if (!p || getComputedStyle(p).cursor !== 'pointer') set.add(el);
      }
    }
    var out = [];
    set.forEach(function (el) { if (visible(el)) out.push(el); });
    // skip elements nested inside another candidate (keep the outer card)
    return out.filter(function (el) {
      for (var p = el.parentElement; p; p = p.parentElement) {
        if (p !== el && out.indexOf(p) !== -1 && p.tagName !== 'BODY' &&
            p.getBoundingClientRect().width < window.innerWidth * 0.9) return false;
      }
      return true;
    });
  }

  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function setFocus(el) {
    if (!el) return;
    if (current) current.classList.remove('tvnav-focus');
    current = el;
    el.classList.add('tvnav-focus');
    try { el.focus({ preventScroll: true }); } catch (e) {}
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    var r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight - 60) {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
  }

  function move(dir) {
    var list = candidates();
    if (!list.length) {
      window.scrollBy(0, dir === 'up' ? -300 : dir === 'down' ? 300 : 0);
      return;
    }
    if (!current || !document.contains(current) || !visible(current)) {
      setFocus(firstInView(list)); return;
    }
    var from = current.getBoundingClientRect();
    var c = center(from);
    var best = null, bestScore = Infinity;
    list.forEach(function (el) {
      if (el === current || current.contains(el) || el.contains(current)) return;
      var r = el.getBoundingClientRect(), p = center(r), dx = p.x - c.x, dy = p.y - c.y;
      var main, cross;
      if (dir === 'left')  { if (r.right > from.left + 2) return; main = -dx; cross = Math.abs(dy); }
      if (dir === 'right') { if (r.left < from.right - 2) return; main = dx;  cross = Math.abs(dy); }
      if (dir === 'up')    { if (r.bottom > from.top + 2) return; main = -dy; cross = Math.abs(dx); }
      if (dir === 'down')  { if (r.top < from.bottom - 2) return; main = dy;  cross = Math.abs(dx); }
      var score = main + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) setFocus(best);
    else if (dir === 'up' || dir === 'down') window.scrollBy(0, dir === 'up' ? -250 : 250);
  }

  function firstInView(list) {
    var inView = list.filter(function (el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    });
    var pool = inView.length ? inView : list;
    pool.sort(function (a, b) {
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
    return pool[0];
  }

  function activate() {
    if (!current || !document.contains(current)) { move('down'); return; }
    var tag = current.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { current.focus(); current.click(); return; }
    if (tag === 'VIDEO') { playPause(current); return; }
    var opts = { bubbles: true, cancelable: true, view: window };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (t) {
      try { current.dispatchEvent(new (window.PointerEvent && t.indexOf('pointer') === 0 ? PointerEvent : MouseEvent)(t, opts)); } catch (e) {}
    });
    current.click();
  }

  function activeVideo() {
    var vids = Array.prototype.slice.call(document.querySelectorAll('video'));
    return vids.filter(function (v) { return !v.paused; })[0] || vids[0];
  }
  function playPause(v) {
    v = v || activeVideo();
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }
  function seek(sec) {
    var v = activeVideo();
    if (v && isFinite(v.duration)) v.currentTime = Math.max(0, v.currentTime + sec);
  }

  document.addEventListener('keydown', function (e) {
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    var k = e.key;
    if (typing && (k === 'ArrowLeft' || k === 'ArrowRight')) return; // let cursor move in text
    var dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
    if (dir || ((k === 'Enter' || k === ' ' || e.keyCode === 23) && !typing)) remote = true;
    if (dir) { e.preventDefault(); e.stopPropagation(); if (typing) t.blur(); move(dir); return; }
    if ((k === 'Enter' || k === ' ' || e.keyCode === 23) && !typing) {
      e.preventDefault(); e.stopPropagation(); activate();
    }
  }, true);

  // Keep a highlight on screen when the page changes (SPA route changes, new content).
  var pending = null;
  new MutationObserver(function () {
    if (pending) return;
    pending = setTimeout(function () {
      pending = null;
      if (!remote) return;
      if (!current || !document.contains(current) || !visible(current)) {
        current = null;
        var list = candidates();
        if (list.length) setFocus(firstInView(list));
      }
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Touching the screen (phone/tablet) hides the remote highlight
  document.addEventListener('touchstart', function () {
    remote = false;
    if (current) { current.classList.remove('tvnav-focus'); current = null; }
  }, { passive: true, capture: true });

  window.__tvnav = {
    setRemote: function (on) { remote = !!on; if (on) this.refresh(); },
    refresh: function () { setTimeout(function () { if (!remote) return; if (!current || !document.contains(current)) { current = null; var l = candidates(); if (l.length) setFocus(firstInView(l)); } }, 600); },
    playPause: function () { playPause(); },
    seek: seek
  };
  window.__tvnav.refresh();
})();
