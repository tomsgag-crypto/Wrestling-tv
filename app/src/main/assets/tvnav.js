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
    'html{scroll-behavior:smooth}' +
    /* keep the page fixed side-to-side */
    'html,body{overflow-x:hidden !important;overflow-x:clip !important;overscroll-behavior-x:none !important;max-width:100vw}' +
    /* full screen is done by the app zooming in on the player; the page itself is left alone */
    'html.rc-fs #rc-bar,html.rc-fs #rc-msg{display:none !important}' +
    '#rc-msg{position:fixed;left:50%;bottom:7vh;transform:translateX(-50%);background:rgba(10,10,20,.92);color:#fff;' +
    'font:600 20px/1.3 sans-serif;padding:12px 22px;border-radius:10px;border:2px solid #ffd400;' +
    'z-index:2147483647;pointer-events:none;transition:opacity .4s;max-width:80vw;text-align:center}' +
    /* phone button bar */
    '#rc-bar{position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;gap:8px;opacity:.9}' +
    '#rc-bar button{font:600 15px/1 sans-serif;color:#fff;background:rgba(15,15,25,.88);border:2px solid #ffd400;' +
    'border-radius:22px;padding:10px 14px;margin:0;-webkit-tap-highlight-color:transparent}' +
    '#rc-bar button:active{background:#ffd400;color:#111}';
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
    set.forEach(function (el) {
      if (el.closest && el.closest('#rc-bar,#rc-msg')) return;   // our own phone buttons
      if (visible(el)) out.push(el);
    });
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
    showVert(el, false);
  }

  // Scroll only up/down to show an element (never sideways).
  function scrollParent(el) {
    for (var a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      var cs = getComputedStyle(a);
      if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 4) return a;
    }
    return document.scrollingElement || document.documentElement;
  }
  function showVert(el, centre) {
    var sp = scrollParent(el), r = el.getBoundingClientRect(), top = 0, bottom = innerHeight;
    if (sp !== document.scrollingElement && sp !== document.documentElement) {
      var pr = sp.getBoundingClientRect(); top = Math.max(0, pr.top); bottom = Math.min(innerHeight, pr.bottom);
    }
    var h = bottom - top, d = 0;
    if (centre) d = (r.top + r.height / 2) - (top + h / 2);
    else if (r.top < top + 60) d = r.top - top - 60;
    else if (r.bottom > bottom - 60) d = r.bottom - bottom + 60;
    if (d) sp.scrollTop += d;
    noSideways();
  }
  function noSideways() {
    var se = document.scrollingElement;
    if (se && se.scrollLeft) se.scrollLeft = 0;
    if (document.body && document.body.scrollLeft) document.body.scrollLeft = 0;
  }
  window.addEventListener('scroll', noSideways, { passive: true });

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

  var TOUCH = window.RingApp && RingApp.isTv ? !RingApp.isTv() : ('ontouchstart' in window);

  // ---------- on-screen message ----------
  var msgTimer = null;
  function message(text, ms) {
    var m = document.getElementById('rc-msg');
    if (!m) { m = document.createElement('div'); m.id = 'rc-msg'; document.documentElement.appendChild(m); }
    m.textContent = text; m.style.opacity = '1';
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { m.style.opacity = '0'; }, ms || 2500);
  }

  // ---------- zoom: full-screen video, or the TV guide on its own ----------
  var fsOn = false, fsEl = null, fsMode = null;   // fsMode: 'video' or 'guide'
  var guidePrev = null, savedScroll = null;

  function area(el) { var r = el.getBoundingClientRect(); return r.width * r.height; }
  function pickVideo() {
    var best = null, bestScore = 0;
    Array.prototype.forEach.call(document.querySelectorAll('video, iframe'), function (el) {
      var r = el.getBoundingClientRect();
      if (r.width < 160 || r.height < 90 || !visible(el)) return;
      var op = 1;
      for (var a = el; a && a.nodeType === 1; a = a.parentElement) op *= +getComputedStyle(a).opacity;
      if (op < 0.5) return;                                         // faint decorative layer
      var score = r.width * r.height, src = (el.currentSrc || el.src || '') + '';
      var cover = r.width >= innerWidth * 0.95 && r.height >= innerHeight * 0.95;
      if (el.tagName === 'VIDEO') {
        if (!el.paused && el.readyState > 1) score *= 4;          // actually playing
        if (el.loop && el.muted && !el.controls) score *= cover ? 0.05 : 0.3;   // background/static effect
        if (el.controls || el.poster) score *= 1.5;
      } else if (/youtube|youtu\.be|vimeo|player|embed|stream|twitch|dailymotion|archive\.org/i.test(src)) {
        score *= 3;
      }
      if (score > bestScore) { bestScore = score; best = el; }
    });
    if (best) return best;
    Array.prototype.forEach.call(document.querySelectorAll('canvas'), function (el) {
      var r = el.getBoundingClientRect();
      if (r.width >= 160 && r.height >= 90 && visible(el) && r.width * r.height > bestScore) { bestScore = r.width * r.height; best = el; }
    });
    return best;
  }

  // Tell the app where the player (or guide) is on screen; it zooms its view to fill the screen with it.
  function report() {
    if (!fsOn) return;
    var els = [].concat(fsEl || []);
    if (!els.length || !els.every(function (x) { return document.contains(x); }) || !visible(els[0])) {   // site swapped it
      var e = fsMode === 'guide' ? guideBox() : pickVideo(); if (!e) return; fsEl = e; els = [].concat(e);
    }
    var l = 1e9, t = 1e9, rr = -1e9, b = -1e9;
    els.forEach(function (x) {
      var q = x.getBoundingClientRect(); if (!q.width && !q.height) return;
      l = Math.min(l, q.left); t = Math.min(t, q.top); rr = Math.max(rr, q.right); b = Math.max(b, q.bottom);
    });
    if (rr <= l || b <= t) return;
    if (window.RingApp && RingApp.zoomTo) RingApp.zoomTo(l, t, rr - l, b - t, innerWidth, innerHeight);
  }
  var fsTimer = null;
  window.addEventListener('resize', function () { setTimeout(report, 150); setTimeout(report, 600); });
  window.addEventListener('scroll', function () { report(); }, { passive: true, capture: true });

  function zoomOn(el, mode) {
    fsEl = el; fsMode = mode; fsOn = true;
    document.documentElement.classList.add('rc-fs');
    if (current) { current.classList.remove('tvnav-focus'); }
    if (window.RingApp) { if (RingApp.setMode) RingApp.setMode(mode); RingApp.setShowing(true); }
    report();
    clearInterval(fsTimer); fsTimer = setInterval(report, 500);
  }

  function zoomOff() {
    clearInterval(fsTimer);
    document.documentElement.classList.remove('rc-fs');
    fsOn = false; fsEl = null; fsMode = null;
    if (window.RingApp) RingApp.setShowing(false);
    if (current && remote) current.classList.add('tvnav-focus');
  }

  function fsEnter(quiet) {
    var el = pickVideo();
    if (!el) { if (!quiet) message('No video on this page to show full screen'); return false; }
    guidePrev = null;
    zoomOn(el, 'video');
    if (window.RingApp) RingApp.setFullscreen(true);
    updateBar();
    return true;
  }

  function fsExit(keepWanted) {
    if (window.RingApp && !keepWanted) RingApp.setFullscreen(false);
    zoomOff();
    updateBar();
  }

  // ---------- phone buttons ----------
  function updateBar() {
    if (!TOUCH || !document.body) return;
    var bar = document.getElementById('rc-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rc-bar';
      bar.innerHTML = '<button data-act="fs"></button><button data-act="guide">&#9776; Guide</button>';
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        if (b.getAttribute('data-act') === 'fs') { if (fsOn) fsExit(false); else fsEnter(false); }
        else showGuide();
      }, true);
      document.documentElement.appendChild(bar);
    }
    var fsBtn = bar.querySelector('[data-act=fs]');
    fsBtn.innerHTML = fsOn ? '&#10005; Exit full screen' : '&#x26F6; Full screen';
    fsBtn.style.display = (fsOn || pickVideo()) ? '' : 'none';
  }

  // double-tap the video to go full screen / back
  var lastTap = 0;
  document.addEventListener('touchend', function (e) {
    if (!TOUCH || !e.changedTouches.length) return;
    if (e.target.closest && e.target.closest('#rc-bar')) return;
    if (fsOn) return;                     // while zoomed, the app's own tap layer handles touches
    var t = e.changedTouches[0], v = pickVideo();
    if (!v) { lastTap = 0; return; }
    var r = v.getBoundingClientRect();
    if (t.clientX < r.left || t.clientX > r.right || t.clientY < r.top || t.clientY > r.bottom) { lastTap = 0; return; }
    var now = Date.now();
    if (now - lastTap < 350) {
      lastTap = 0; e.preventDefault();
      if (fsOn) fsExit(false); else fsEnter(false);
    } else lastTap = now;
  }, { passive: false, capture: true });

  // called by the app after a page load when full screen was left on
  function fsRestore(tries) {
    if (fsOn) return;
    if (fsEnter(true)) return;
    if ((tries || 0) < 20) setTimeout(function () { fsRestore((tries || 0) + 1); }, 500);
  }

  // ---------- TV guide ----------
  var GUIDE = /\b(tv\s*)?guide\b|schedule|listings|prevue|what'?s on|line-?up/i;
  function findGuide() {
    var els = candidates(), i, el, txt;
    for (i = 0; i < els.length; i++) {
      el = els[i];
      txt = [(el.innerText || ''), el.getAttribute('aria-label') || '', el.getAttribute('title') || '',
        el.getAttribute('href') || '', el.id || ''].join(' ');
      if (GUIDE.test(txt) && (el.innerText || '').length < 60) return { click: el };
    }
    var sec = document.querySelector('[id*="guide" i],[class*="guide" i],[data-testid*="guide" i],' +
      '[id*="schedule" i],[class*="schedule" i],[data-testid*="schedule" i],[id*="prevue" i],[class*="prevue" i]');
    if (sec && visible(sec)) return { section: sec };
    var heads = document.querySelectorAll('h1,h2,h3,h4');
    for (i = 0; i < heads.length; i++) if (GUIDE.test(heads[i].innerText || '') && visible(heads[i])) return { heading: heads[i] };
    // any short bit of text that says "... guide" (e.g. a styled banner rather than a real heading)
    var all = document.body.getElementsByTagName('*');
    for (i = 0; i < all.length; i++) {
      el = all[i];
      if (el.children.length > 2 || el.closest('#rc-bar,#rc-msg')) continue;
      txt = (el.innerText || '').trim();
      if (txt.length > 3 && txt.length < 50 && /guide|prevue|schedule|listings/i.test(txt) && visible(el)) return { heading: el };
    }
    return null;
  }

  function focusAfter(h) {
    var list = candidates().filter(function (el) {
      return h.contains(el) || (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    remote = true;
    if (list.length) setFocus(list[0]);
    showVert(h, false);
  }

  function focusIn(box) {
    var list = candidates().filter(function (el) { return box.contains(el); });
    if (list.length) { remote = true; setFocus(firstInView(list)); }
  }

  /** The box holding the guide: the first block around the guide's title that's clearly bigger than the title. */
  function guideBox() {
    var g = findGuide(); if (!g) return null;
    var player = pickVideo();
    if (g.section && !(player && g.section.contains(player))) return g.section;
    var h = g.heading || g.click; if (!h) return null;
    var hr = h.getBoundingClientRect(), best = null;
    for (var a = h.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      if (player && a.contains(player)) break;
      var r = a.getBoundingClientRect();
      best = a;
      if (r.height > Math.max(hr.height * 3, 150) && r.width >= hr.width * 0.9) break;
    }
    if (best) return best;
    // no wrapper of its own: use the title plus what follows it
    var parts = [h];
    for (var n = h.nextElementSibling; n && parts.length < 4; n = n.nextElementSibling) {
      if (player && n.contains(player)) break;
      parts.push(n);
    }
    return parts;
  }

  function showGuide() {
    if (fsOn && fsMode === 'guide') { closeGuide(); return; }
    var box = guideBox();
    if (!box) { oldGuide(); return; }
    guidePrev = fsOn && fsMode === 'video' ? 'video' : null;
    var first = [].concat(box)[0], sp = scrollParent(first);
    savedScroll = { el: sp, top: sp.scrollTop };
    showVert(first, true);                // bring it on screen so it's drawn and animating
    zoomOn(box, 'guide');
  }

  function closeGuide() {
    if (savedScroll) { savedScroll.el.scrollTop = savedScroll.top; savedScroll = null; }
    if (guidePrev === 'video') {
      var v = pickVideo();
      if (v) { guidePrev = null; zoomOn(v, 'video'); updateBar(); return; }
    }
    guidePrev = null;
    zoomOff();
    updateBar();
  }

  // Fallback when the guide is a separate page/link: open it and highlight inside it.
  function oldGuide() {
    if (fsOn) fsExit(true);
    var g = findGuide();
    if (!g) { message('Couldn\'t find the TV guide on this page'); return; }
    if (g.click) {
      setFocus(g.click); current.click();
      setTimeout(function () {
        var box = guideBox();
        if (box) { showVert([].concat(box)[0], true); zoomOn(box, 'guide'); }
      }, 900);
    } else if (g.heading) {
      focusAfter(g.heading);
    }
  }

  /** Remote keys while zoomed (sent by the app): video – ▲▼ guide, OK pause; guide – ▲▼ scroll it, OK/Back close. */
  function zoomKey(k) {
    if (fsMode === 'guide') {
      if (k === 'up' || k === 'down') {
        var sc = null, all = [];
        [].concat(fsEl || []).forEach(function (x) { all = all.concat([].slice.call(x.querySelectorAll('*'))); });
        for (var i = 0; i < all.length && !sc; i++) {
          var cs = getComputedStyle(all[i]);
          if (/(auto|scroll)/.test(cs.overflowY) && all[i].scrollHeight > all[i].clientHeight + 4) sc = all[i];
        }
        if (sc) sc.scrollTop += (k === 'up' ? -1 : 1) * sc.clientHeight * 0.6;
      } else if (k === 'ok') closeGuide();
      return;
    }
    if (k === 'up' || k === 'down') showGuide();
    else if (k === 'ok' && fsEl && fsEl.tagName === 'VIDEO') playPause(fsEl);
  }

  function back() {
    if (fsOn && fsMode === 'guide') { closeGuide(); return true; }
    if (fsOn) { fsExit(false); return true; }
    return false;
  }

  document.addEventListener('keydown', function (e) {
    if (fsOn) {                                   // keys while the video is full screen
      var fk = e.key;
      if (fk === 'ArrowUp' || fk === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); zoomKey(fk === 'ArrowUp' ? 'up' : 'down'); return; }
      if (fk === 'ArrowLeft' || fk === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); return; }
      if (fk === 'Enter' || e.keyCode === 23 || fk === ' ') {
        e.preventDefault(); e.stopPropagation(); zoomKey('ok'); return;
      }
    }
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
  var pending = null, barTimer = null;
  new MutationObserver(function () {
    if (TOUCH) { clearTimeout(barTimer); barTimer = setTimeout(updateBar, 500); }
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
    playPause: function () { if (fsOn && fsEl && fsEl.tagName === 'VIDEO') playPause(fsEl); else playPause(); },
    toggleFullscreen: function () { if (fsOn && fsMode === 'video') fsExit(false); else { if (fsOn) zoomOff(); fsEnter(false); } },
    zoomKey: zoomKey,
    restoreFullscreen: function () { fsRestore(0); },
    guide: showGuide,
    back: back,
    seek: seek
  };
  window.__tvnav.refresh();
  setTimeout(updateBar, 800);
})();
