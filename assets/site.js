(function () {
  "use strict";
  var FPS = 16, SYNC_TOLERANCE = 0.09;
  var groups = window.DATA.groups;
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  var fmt = function (s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };

  var state = { group: groups[0], item: groups[0].items[0], view: "grid", focus: 0, rate: 1, playing: true, duration: 0 };
  var players = [], stripHeads = [], dragging = false;

  function clearStage() {
    players.forEach(function (v) { v.pause(); v.removeAttribute("src"); v.load(); });
    players = [];
    $("stage").textContent = "";
  }
  function makeVideo(c) {
    var v = el("video");
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = false;
    v.preload = "auto"; v.disablePictureInPicture = true;
    v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
    v.poster = c.poster; v.src = c.src;
    v.playbackRate = state.rate;
    return v;
  }
  function watch(v, tile) {
    var on = function () { tile.classList.add("wait"); };
    var off = function () { tile.classList.remove("wait"); };
    v.addEventListener("waiting", on);
    v.addEventListener("loadstart", on);
    v.addEventListener("seeking", on);
    ["playing", "canplay", "seeked"].forEach(function (e) { v.addEventListener(e, off); });
  }
  function tile(c, i, n) {
    var t = el("div", "tile" + (c.ours ? " ours" : ""));
    var v = makeVideo(c);
    t.appendChild(v);
    t.appendChild(el("span", "tag", c.label));
    if (n > 1) t.appendChild(el("span", "key", String(i + 1)));
    var s = el("div", "spin"); t.appendChild(s);
    watch(v, t);
    t.addEventListener("click", function () {
      if (state.view === "grid" && n > 1) { state.focus = i; setView("focus"); } else toggle();
    });
    players.push(v);
    return t;
  }

  function buildStage(t0) {
    clearStage();
    var vids = state.item.videos, stage = $("stage"), n = vids.length;
    if (n === 1 && state.view !== "grid") state.view = "grid";
    if (state.view === "focus") {
      stage.className = "stage n1";
      stage.appendChild(tile(vids[state.focus] || vids[0], state.focus, 1));
    } else {
      stage.className = "stage n" + n;
      vids.forEach(function (c, i) { stage.appendChild(tile(c, i, n)); });
    }
    var main = players[0];
    main.addEventListener("loadedmetadata", function () {
      state.duration = main.duration;
      drawTicks();
      drawNoteMarks();
      seek(t0 || 0);
      if (state.playing) playAll();
    });
    main.addEventListener("ended", function () { seek(0); if (state.playing) playAll(); });
    syncButtons();
  }

  function playAll() { players.forEach(function (v) { var p = v.play(); if (p) p.catch(function () {}); }); }
  function pauseAll() { players.forEach(function (v) { v.pause(); }); }
  function toggle() {
    state.playing = !state.playing;
    if (state.playing) playAll(); else pauseAll();
    syncButtons();
  }
  function seek(t) {
    t = Math.max(0, Math.min(state.duration ? state.duration - 0.05 : t, t));
    players.forEach(function (v) { if (v.readyState > 0) v.currentTime = t; });
    render(t);
  }
  function setRate(r) { state.rate = r; players.forEach(function (v) { v.playbackRate = r; }); syncButtons(); }

  function syncLoop() {
    var m = players[0];
    if (m && !m.seeking && !dragging) {
      var t = m.currentTime;
      render(t);
      if (!m.paused) {
        var stalled = players.some(function (v) { return v.readyState < 3 && !v.ended; });
        players.slice(1).forEach(function (v) {
          if (v.readyState > 0 && !v.seeking && Math.abs(v.currentTime - t) > SYNC_TOLERANCE) v.currentTime = t;
        });
        if (stalled && m.readyState >= 3 && players.length > 1) { m.pause(); m.dataset.held = "1"; }
      } else if (m.dataset.held === "1" && state.playing) {
        if (players.every(function (v) { return v.readyState >= 3; })) { delete m.dataset.held; var p = m.play(); if (p) p.catch(function () {}); }
      }
    }
    requestAnimationFrame(syncLoop);
  }
  function render(t) {
    var d = state.duration || 1, pct = Math.min(100, t / d * 100);
    $("fill").style.width = pct + "%";
    $("head").style.left = pct + "%";
    $("clock").textContent = fmt(t) + " / " + fmt(state.duration);
    $("timeline").setAttribute("aria-valuenow", Math.round(t));
    stripHeads.forEach(function (h) { h.style.left = pct + "%"; });
  }

  function drawTicks() {
    var box = $("ticks"), d = state.duration;
    box.textContent = "";
    var step = d > 120 ? 60 : 15;
    for (var s = step; s < d - step / 3; s += step) {
      var e = el("span", "", fmt(s)); e.style.left = s / d * 100 + "%"; box.appendChild(e);
    }
    $("timeline").setAttribute("aria-valuemax", Math.round(d));
  }
  function noteTimes() {
    var out = [], re = /\b(\d{1,3})s\b/g, m;
    while ((m = re.exec(state.item.note))) out.push(+m[1]);
    return out;
  }
  function drawNoteMarks() {
    var box = $("marks"); box.textContent = "";
    noteTimes().forEach(function (s) {
      if (s >= state.duration) return;
      var b = el("button"); b.type = "button"; b.title = "Jump to " + fmt(s);
      b.setAttribute("aria-label", b.title); b.style.left = s / state.duration * 100 + "%";
      b.addEventListener("click", function (ev) { ev.stopPropagation(); seek(s); });
      box.appendChild(b);
    });
  }
  function drawNote() {
    var box = $("note"), text = state.item.note, re = /\b(\d{1,3})s\b/g, last = 0, m;
    box.textContent = "";
    while ((m = re.exec(text))) {
      box.appendChild(document.createTextNode(text.slice(last, m.index)));
      (function (sec, label) {
        var b = el("button", "", label); b.type = "button"; b.title = "Jump to " + fmt(sec);
        b.addEventListener("click", function () { seek(sec); });
        box.appendChild(b);
      })(+m[1], m[0]);
      last = m.index + m[0].length;
    }
    box.appendChild(document.createTextNode(text.slice(last)));
  }
  function drawStrips() {
    var box = $("strips"); box.textContent = ""; stripHeads = [];
    state.item.videos.forEach(function (c) {
      var r = el("div", "strip-row" + (c.ours ? " ours" : ""));
      r.appendChild(el("div", "strip-label", c.label));
      var s = el("div", "strip"); s.style.backgroundImage = "url(" + c.strip + ")";
      var h = el("i"); s.appendChild(h); stripHeads.push(h);
      s.addEventListener("click", function (e) {
        var q = s.getBoundingClientRect();
        seek((e.clientX - q.left) / q.width * state.duration);
      });
      r.appendChild(s); box.appendChild(r);
    });
  }
  function syncButtons() {
    document.querySelectorAll(".views button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.view === state.view));
      b.disabled = state.item.videos.length === 1 && b.dataset.view !== "grid";
    });
    document.querySelectorAll(".speeds button").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.dataset.rate === state.rate)); });
    $("play-icon").setAttribute("d", state.playing ? "M6 4h4v16H6zM14 4h4v16h-4z" : "M7 4v16l13-8z");
    $("play").setAttribute("aria-label", state.playing ? "Pause" : "Play");
  }
  function setView(v) {
    if (v !== "grid" && state.item.videos.length === 1) return;
    var t = players[0] ? players[0].currentTime : 0;
    state.view = v; buildStage(t);
  }
  function setItem(g, it, keep) {
    state.group = g; state.item = it; state.focus = 0;
    if (!keep || it.videos.length === 1) state.view = "grid";
    state.duration = 0; state.playing = true;
    $("title").textContent = it.title;
    var n = it.videos.length;
    $("count").textContent = g.kind + " · " + (n === 1 ? "1 video" : n + " videos, played in sync");
    $("prompt").textContent = it.prompt;
    drawNote();
    $("blurb").textContent = g.blurb;
    document.querySelectorAll("#groups button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.id === g.id)); });
    $("marks").textContent = ""; $("ticks").textContent = "";
    buildStage(0); drawStrips(); markCard();
    try { history.replaceState(null, "", "#" + it.id); } catch (e) {}
  }
  function markCard() {
    document.querySelectorAll(".card").forEach(function (c) {
      if (c.dataset.id === state.item.id) c.setAttribute("aria-current", "true"); else c.removeAttribute("aria-current");
    });
  }
  function step(dir) {
    var list = state.group.items, i = list.indexOf(state.item);
    setItem(state.group, list[(i + dir + list.length) % list.length], true);
  }

  /* Build static UI */
  groups.forEach(function (g) {
    var b = el("button", "", g.name); b.type = "button"; b.dataset.id = g.id;
    var s = el("small", "", String(g.items.length)); b.appendChild(s);
    b.addEventListener("click", function () { setItem(g, g.items[0]); });
    $("groups").appendChild(b);
  });
  var total = 0;
  function cardMeta(g, it) {
    var n = it.videos.length;
    if (g.id === "long") return "About 4 min 15 s";
    if (n === 1) return "61 s";
    return n + (g.kind === "Ablation" ? " settings" : " methods");
  }
  groups.forEach(function (g) {
    var sec = el("section", "wall-group");
    var head = el("div", "wall-group-head");
    head.appendChild(el("h3", "", g.name));
    head.appendChild(el("span", "muted", g.items.length + (g.items.length === 1 ? " result \u00b7 " : " results \u00b7 ") + g.blurb));
    sec.appendChild(head);
    var grid = el("div", "wall-grid");
    g.items.forEach(function (it) {
      total++;
      var c = el("button", "card"); c.type = "button"; c.dataset.id = it.id;
      var th = el("span", "thumb");
      th.style.backgroundImage = "url(" + it.videos[0].strip + ")";
      th.style.backgroundPosition = "9.09% 0";
      c.appendChild(th);
      c.appendChild(el("b", "", it.title));
      c.appendChild(el("small", "", cardMeta(g, it)));
      c.addEventListener("mousemove", function (e) {
        var r = c.getBoundingClientRect();
        var f = Math.min(11, Math.floor((e.clientX - r.left) / r.width * 12));
        th.style.backgroundPosition = (f / 11 * 100) + "% 0";
      });
      c.addEventListener("mouseleave", function () { th.style.backgroundPosition = "9.09% 0"; });
      c.addEventListener("click", function () { setItem(g, it); $("theater").scrollIntoView({ behavior: "smooth", block: "start" }); });
      grid.appendChild(c);
    });
    sec.appendChild(grid);
    $("wall").appendChild(sec);
  });
  var distinct = {};
  groups.forEach(function (g) { g.items.forEach(function (i) { distinct[i.prompt] = 1; }); });
  $("wall-count").textContent = total + " result sets · " + Object.keys(distinct).length + " distinct prompts · hover a card to scan through time";

  document.querySelectorAll(".views button").forEach(function (b) { b.addEventListener("click", function () { setView(b.dataset.view); }); });
  document.querySelectorAll(".speeds button").forEach(function (b) { b.addEventListener("click", function () { setRate(+b.dataset.rate); }); });
  $("play").addEventListener("click", toggle);

  var tl = $("timeline");
  var scrub = function (e) {
    var r = tl.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * state.duration);
  };
  tl.addEventListener("pointerdown", function (e) { dragging = true; tl.setPointerCapture(e.pointerId); scrub(e); });
  tl.addEventListener("pointermove", function (e) { if (dragging) scrub(e); });
  ["pointerup", "pointercancel"].forEach(function (n) { tl.addEventListener(n, function () { dragging = false; }); });

  $("keys-open").addEventListener("click", function () { $("keys").showModal(); });
  $("keys-close").addEventListener("click", function () { $("keys").close(); });

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = e.target.tagName;
    if (tag === "SELECT" || tag === "INPUT") return;
    if ($("keys").open && e.key !== "?") return;
    var cur = players[0] ? players[0].currentTime : 0, k = e.key;
    if (k === " ") { if (tag === "BUTTON" || tag === "SUMMARY") return; e.preventDefault(); toggle(); }
    else if (k === "ArrowRight") { e.preventDefault(); seek(cur + 2); }
    else if (k === "ArrowLeft") { e.preventDefault(); seek(cur - 2); }
    else if (k === "." || k === ",") {
      if (state.playing) { state.playing = false; pauseAll(); syncButtons(); }
      seek(cur + (k === "." ? 1 : -1) / FPS);
    }
    else if (k === "g" || k === "G") setView("grid");
    else if (k === "f" || k === "F") setView("focus");
    else if (k === "n" || k === "N") step(1);
    else if (k === "p" || k === "P") step(-1);
    else if (k === "?") { if ($("keys").open) $("keys").close(); else $("keys").showModal(); }
    else if (/^[1-5]$/.test(k) && +k <= state.item.videos.length && state.item.videos.length > 1) { state.focus = +k - 1; setView("focus"); }
  });

  /* Start from a shared hash when present. */
  function fromHash() {
    var found = null, id = location.hash.slice(1);
    groups.forEach(function (g) { g.items.forEach(function (i) { if (i.id === id) found = [g, i]; }); });
    return found;
  }
  window.addEventListener("hashchange", function () {
    var f = fromHash();
    if (f && f[1] !== state.item) setItem(f[0], f[1]);
  });
  var start = fromHash();
  if (start) setItem(start[0], start[1]); else setItem(groups[0], groups[0].items[0]);
  requestAnimationFrame(syncLoop);
})();
