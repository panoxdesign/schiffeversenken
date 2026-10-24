// HTML/CSS-Overlay: Laden, Hauptmenü, Platzierung, HUD, Banner, Game Over, Pause, Einstellungen.
import { CSS } from './styles.js';
import * as I from './icons.js';
import { DIFFICULTIES, FLEET, QUALITY_PRESETS } from '../config.js';

const DIFF_ICON = { easy: 'boat', normal: 'anchor', hard: 'skull' };
const DIFF_TXT = { easy: 'Der Gegner schießt wild drauflos', normal: 'Ein erfahrener Seebär jagt Treffer', hard: 'Der Teufel kennt jede Schwäche' };
const QUALITY_LABEL = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };
const BANNER_MS = 1400, BANNER_MIN_MS = 520, BANNER_OUT_MS = 240;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const fmtPct = (a) => Math.round((a || 0) * 100) + ' %';
const fmtTime = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignorieren */ } }

export class UI {
  constructor(root, { audio, engine } = {}) {
    this.root = root; this.audio = audio || null; this.engine = engine || null;
    this.onPauseRequested = null;
    this._timers = new Map(); this._focusBack = null;
    this._cb = {}; this._st = {}; // Callbacks und Zwischenstände (Diff-Updates)

    if (!document.getElementById('fb-style')) { const s = document.createElement('style'); s.id = 'fb-style'; s.textContent = CSS; document.head.appendChild(s); }
    this.el = el('div', 'fb'); this.el.setAttribute('lang', 'de');
    this.el.insertAdjacentHTML('afterbegin', I.DEFS_SVG);
    root.appendChild(this.el);

    this._difficulty = lsGet('freibeuter.difficulty', 'normal');
    if (!DIFFICULTIES[this._difficulty]) this._difficulty = 'normal';

    this._bindGlobal();
    this._buildBanner();
  }

  /* ------------------------------------------------------------------ Grundlagen */
  _snd(name, o) { try { this.audio && this.audio.play(name, o); } catch (e) { /* ignorieren */ } }
  _later(key, fn, ms) { clearTimeout(this._timers.get(key)); this._timers.set(key, setTimeout(fn, ms)); }
  _show(node, ms = 20) {
    clearTimeout(this._timers.get(node)); node.hidden = false;
    this._later(node, () => node.classList.add('in'), ms);
  }
  _hide(node, delay = 380) {
    node.classList.remove('in');
    this._later(node, () => { if (!node.classList.contains('in')) node.hidden = true; }, delay);
  }
  _screen(cls) { const n = el('div', 'scr ' + cls); n.hidden = true; this.el.appendChild(n); return n; }
  _isOpen(n) { return !!n && !n.hidden && n.classList.contains('in'); }

  _bindGlobal() {
    // Audio entsperren: erste Nutzerinteraktion irgendwo
    const kick = () => {
      const a = this.audio; if (!a) return done();
      a.unlock(); a.startAmbience();
      if (a.ctx && a.ctx.state === 'running') done();
    };
    const evs = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    const done = () => evs.forEach((e) => window.removeEventListener(e, kick, true));
    evs.forEach((e) => window.addEventListener(e, kick, true));
    // Hover-/Klick-Sounds für alle Buttons des UI
    this.el.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled && this.el.contains(b) && !(e.relatedTarget && b.contains(e.relatedTarget))) this._snd('hover');
    });
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b || !this.el.contains(b)) return;
      if (!b.disabled && !b.dataset.nosnd) this._snd('click');
      if (e.detail > 0 && b.blur) b.blur(); // Leertaste/Enter sollen nicht versehentlich erneut auslösen
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.repeat) return;
      if (this._isOpen(this._settings)) return this.hideSettings();
      if (this._isOpen(this._help)) return this.hideHelp();
      if (this._isOpen(this._pause)) { if (this._cb.pause && this._cb.pause.onResume) this._cb.pause.onResume(); return; }
      if (this._isOpen(this._menu) || this._isOpen(this._over) || (this._load && !this._load.hidden)) return;
      if (this.onPauseRequested) this.onPauseRequested();
    });
  }
  _requestPause() { if (this.onPauseRequested) this.onPauseRequested(); }
  _focus(node) {
    this._focusBack = document.activeElement;
    setTimeout(() => { const f = node.querySelector('[data-focus]') || node.querySelector('button'); if (f) f.focus({ preventScroll: true }); }, 60);
  }
  _unfocus() { const b = this._focusBack; this._focusBack = null; if (b && b.focus && document.contains(b)) b.focus({ preventScroll: true }); }

  /* ------------------------------------------------------------------ Laden */
  showLoading(progress = 0) {
    if (!this._load) {
      const n = this._load = el('div', 'scr fb-load in');
      n.innerHTML = `<div class="wheel">${I.compass()}</div><div class="cap gold">Freibeuter</div><div class="msg"></div>
        <div class="rope" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i><div class="spark"></div></div>`;
      this.el.appendChild(n);
      this._loadBar = n.querySelector('i'); this._loadMsg = n.querySelector('.msg'); this._loadSpark = n.querySelector('.spark'); this._loadRope = n.querySelector('.rope');
      this._loadW = 0;
    }
    clearTimeout(this._timers.get('load')); this._load.hidden = false; this._load.classList.remove('out');
    const p = Math.min(1, Math.max(0, progress));
    if (p === this._lp) return; this._lp = p;
    this._loadBar.style.transform = `scaleX(${p})`;
    const w = this._loadRope.clientWidth || 300;
    this._loadSpark.style.transform = `translateX(${Math.round(p * (w - 4))}px)`;
    this._loadRope.setAttribute('aria-valuenow', Math.round(p * 100));
    const m = p < 0.3 ? 'Anker wird gelichtet …' : p < 0.6 ? 'Segel werden gesetzt …' : p < 0.9 ? 'Kanonen werden geladen …' : 'Klar zum Auslaufen!';
    if (m !== this._loadMsgT) { this._loadMsgT = m; this._loadMsg.textContent = m; }
  }
  hideLoading() {
    if (!this._load) return;
    this._load.classList.add('out');
    this._later('load', () => { this._load.hidden = true; }, 750);
  }

  /* ------------------------------------------------------------------ Hauptmenü */
  showMainMenu({ onStart } = {}) {
    this._cb.start = onStart;
    if (!this._menu) {
      const n = this._menu = this._screen('fb-menu');
      const diffs = Object.entries(DIFFICULTIES).map(([k, d]) =>
        `<button class="diff" role="radio" data-k="${k}" aria-checked="false">${I[DIFF_ICON[k]] ? I[DIFF_ICON[k]]() : ''}<span>${esc(d.name)}</span><small>${esc(DIFF_TXT[k] || '')}</small></button>`).join('');
      n.innerHTML = `<div class="logo"><div class="emb">${I.skull()}</div><h1 class="title gold" style="margin:0">Freibeuter</h1><div class="sub">Schiffe versenken</div></div>
        <div class="scroll parch"><h3>Wähle deinen Gegner</h3><div class="diffs" role="radiogroup" aria-label="Schwierigkeit">${diffs}</div>
        <button class="btn primary go" data-focus>${I.sabre()}In See stechen</button>
        <div class="row"><button class="btn ghost" data-act="settings">${I.cog()}Einstellungen</button><button class="btn ghost" data-act="help">${I.book()}Anleitung</button></div></div>`;
      n.querySelector('.diffs').addEventListener('click', (e) => { const b = e.target.closest('.diff'); if (b) this._setDifficulty(b.dataset.k); });
      n.querySelector('.go').addEventListener('click', () => { this._snd('bell', { volume: 0.5 }); this._cb.start && this._cb.start(this._difficulty); });
      n.querySelector('[data-act=settings]').addEventListener('click', () => this.showSettings());
      n.querySelector('[data-act=help]').addEventListener('click', () => this.showHelp());
      this._setDifficulty(this._difficulty, true);
    }
    this._show(this._menu); this._focus(this._menu);
    if (this.audio) this.audio.playMusic('menu');
  }
  hideMainMenu() { if (this._menu) this._hide(this._menu); }
  _setDifficulty(k, silent) {
    if (!DIFFICULTIES[k]) return; this._difficulty = k; lsSet('freibeuter.difficulty', k);
    this._menu.querySelectorAll('.diff').forEach((b) => { b.setAttribute('aria-checked', String(b.dataset.k === k)); b.tabIndex = b.dataset.k === k ? 0 : -1; });
  }

  /* ------------------------------------------------------------------ Einstellungen / Anleitung */
  showSettings() {
    if (!this._settings) {
      const n = this._settings = this._screen('fb-modal fb-set'); n.style.zIndex = 70;
      const sl = (ch, label) => `<label class="sl"><span>${label}</span><output></output><input type="range" min="0" max="100" step="1" data-ch="${ch}" aria-label="${label}"></label>`;
      n.innerHTML = `<div class="pnl parch" role="dialog" aria-modal="true" aria-label="Einstellungen"><h2>Einstellungen</h2>
        <div class="sect">Lautstärke</div>${sl('master', 'Gesamt')}${sl('music', 'Seemannslieder')}${sl('sfx', 'Effekte &amp; Meer')}
        <div class="sect">Grafikqualität</div><div class="seg" role="group" aria-label="Grafikqualität">${Object.keys(QUALITY_PRESETS).map((k) => `<button class="btn" data-q="${k}" aria-pressed="false">${QUALITY_LABEL[k] || k}</button>`).join('')}</div>
        <p class="note">Tipp: Auf schwächeren Geräten hilft „Niedrig“. Die Kantenglättung greift erst nach dem Neuladen der Seite.</p>
        <button class="btn primary close" data-focus>Fertig</button></div>`;
      n.addEventListener('pointerdown', (e) => { if (e.target === n) this.hideSettings(); });
      n.querySelector('.close').addEventListener('click', () => this.hideSettings());
      n.querySelectorAll('input[type=range]').forEach((inp) => {
        const out = inp.parentNode.querySelector('output');
        const upd = () => { out.textContent = inp.value + ' %'; inp.style.setProperty('--p', inp.value + '%'); inp.setAttribute('aria-valuetext', inp.value + ' Prozent'); };
        inp.addEventListener('input', () => { upd(); if (this.audio) this.audio.setVolume(inp.dataset.ch, inp.value / 100); });
        inp.addEventListener('change', () => { if (inp.dataset.ch === 'sfx') this._snd('place', { volume: 0.7 }); else if (inp.dataset.ch === 'music') this._snd('bell', { volume: 0.4, pitch: 1.5 }); });
        inp._upd = upd;
      });
      n.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
        if (this.engine && this.engine.setQuality) this.engine.setQuality(b.dataset.q);
        this._syncSettings();
      }));
    }
    this._syncSettings(); this._show(this._settings); this._focus(this._settings);
  }
  _syncSettings() {
    const n = this._settings; if (!n) return;
    n.querySelectorAll('input[type=range]').forEach((inp) => { inp.value = Math.round((this.audio ? this.audio.getVolume(inp.dataset.ch) : 1) * 100); inp._upd(); });
    const q = (this.engine && this.engine.qualityName) || lsGet('freibeuter.quality', 'high');
    n.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === q)));
  }
  hideSettings() { if (this._settings) { this._hide(this._settings); this._unfocus(); } }

  showHelp() {
    if (!this._help) {
      const n = this._help = this._screen('fb-modal fb-help'); n.style.zIndex = 70;
      const ships = FLEET.map((s) => `<span>${esc(s.name)} <i>${'<b></b>'.repeat(s.length)}</i></span>`).join('');
      n.innerHTML = `<div class="pnl parch help" role="dialog" aria-modal="true" aria-label="Spielanleitung"><h2>Spielanleitung</h2><ol>
        <li><b class="n">1</b><div><b>Ziel:</b> Versenke alle Schiffe des Feindes, bevor er deine Flotte auf den Meeresgrund schickt.</div></li>
        <li><b class="n">2</b><div><b>Aufstellen:</b> Platziere deine fünf Schiffe auf dem Meer. Sie dürfen sich nicht berühren, auch nicht über Eck.<div class="ships">${ships}</div></div></li>
        <li><b class="n">3</b><div><b>Feuern:</b> Ziele mit der Maus aufs Feindmeer und klicke. Am Handy zielt der erste Tipp, der zweite Tipp auf dieselbe Zelle feuert.</div></li>
        <li><b class="n">4</b><div><b>Treffer:</b> Wer trifft, darf gleich noch einmal schießen. Daneben? Dann ist der Gegner am Zug.</div></li>
        <li><b class="n">5</b><div><b>Tasten:</b> <kbd>R</kbd> dreht das Schiff, <kbd>Esc</kbd> öffnet die Pause.</div></li></ol>
        <button class="btn primary close" data-focus>Verstanden, Käpt'n!</button></div>`;
      n.addEventListener('pointerdown', (e) => { if (e.target === n) this.hideHelp(); });
      n.querySelector('.close').addEventListener('click', () => this.hideHelp());
    }
    this._show(this._help); this._focus(this._help);
  }
  hideHelp() { if (this._help) { this._hide(this._help); this._unfocus(); } }

  /* ------------------------------------------------------------------ Platzierung */
  showPlacement({ fleet, onSelectShip, onRotate, onRandom, onClear, onConfirm } = {}) {
    this._cb.place = { onSelectShip, onRotate, onRandom, onClear, onConfirm };
    fleet = fleet || FLEET;
    if (!this._place) {
      const n = this._place = this._screen('fb-place');
      n.innerHTML = `<button class="btn ibtn ghost pz" aria-label="Pause">${I.wheel()}</button><div class="pnl wood"><h3>Flotte aufstellen</h3><p class="hint"></p><ul class="fleet"></ul>
        <div class="acts"><button class="btn rot" data-a="rot">${I.rotate()}<span>Drehen (R)</span><small></small></button>
        <button class="btn" data-a="rnd">${I.dice()}<span>Zufällig</span></button><button class="btn" data-a="clr">${I.broom()}<span>Leeren</span></button></div>
        <button class="btn primary confirm" data-a="ok" disabled>${I.anchor()}Klar zum Gefecht!</button></div>`;
      n.querySelector('.pz').addEventListener('click', () => this._requestPause());
      n.querySelector('.acts').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return; const c = this._cb.place || {};
        if (b.dataset.a === 'rot') { c.onRotate && c.onRotate(); } else if (b.dataset.a === 'rnd') c.onRandom && c.onRandom(); else if (b.dataset.a === 'clr') c.onClear && c.onClear();
      });
      n.querySelector('.confirm').addEventListener('click', () => { const c = this._cb.place || {}; c.onConfirm && c.onConfirm(); });
      n.querySelector('.fleet').addEventListener('click', (e) => { const b = e.target.closest('.ship'); if (b && this._cb.place && this._cb.place.onSelectShip) this._cb.place.onSelectShip(+b.dataset.i); });
      this._pl = { hint: n.querySelector('.hint'), list: n.querySelector('.fleet'), rotSmall: n.querySelector('.rot small'), ok: n.querySelector('.confirm') };
    }
    this._pl.list.innerHTML = fleet.map((s, i) => `<li><button class="ship" data-i="${i}" aria-pressed="false"><span class="nm"><span class="ok">${I.check()}</span>${esc(s.name)}</span><span class="cells">${'<b></b>'.repeat(s.length)}</span><span class="len">${s.length} Felder</span></button></li>`).join('');
    this._pl.ships = [...this._pl.list.querySelectorAll('.ship')];
    this._pl.state = null; this._pl.n = fleet.length;
    this.updatePlacement({ placed: fleet.map(() => false), selectedIndex: 0, orientation: 'h', canConfirm: false });
    this._show(this._place);
  }
  updatePlacement({ placed = [], selectedIndex = -1, orientation = 'h', canConfirm = false } = {}) {
    const p = this._pl; if (!p) return;
    const key = placed.map((x) => (x ? 1 : 0)).join('') + '|' + selectedIndex + '|' + orientation + '|' + (canConfirm ? 1 : 0);
    if (p.state === key) return; p.state = key;
    p.ships.forEach((b, i) => {
      const done = !!placed[i], sel = i === selectedIndex;
      b.classList.toggle('done', done); b.setAttribute('aria-pressed', String(sel));
    });
    p.ok.disabled = !canConfirm;
    p.rotSmall.textContent = orientation === 'h' ? 'waagerecht' : 'senkrecht';
    const all = placed.length && placed.every(Boolean);
    const hint = all ? 'Alle Schiffe in Position. Klar zum Gefecht?' : 'Wähle ein Schiff und setze es aufs Meer. Schiffe dürfen sich nicht berühren!';
    if (p.hint.textContent !== hint) p.hint.textContent = hint;
  }
  hidePlacement() { if (this._place) this._hide(this._place); }

  /* ------------------------------------------------------------------ HUD */
  showHUD() {
    if (!this._hud) {
      const n = this._hud = this._screen('fb-hud');
      n.innerHTML = `<div class="top"><button class="btn ibtn ghost pz" aria-label="Pause">${I.wheel()}</button>
        <div class="turn" role="status" aria-live="polite"><span class="ti"></span><span class="tt">Klar zum Gefecht!</span><span class="dots"><i></i><i></i><i></i></span></div>
        <div class="stats" aria-label="Statistik"><div class="st"><span>Runde</span><b data-s="turn">1</b></div><div class="st"><span>Schüsse</span><b data-s="shots">0</b></div>
        <div class="st"><span>Treffer</span><b data-s="hits">0</b></div><div class="st"><span>Quote</span><b data-s="acc">0 %</b></div></div></div>
        <div class="coord" hidden aria-hidden="true"></div>
        <div class="bot"><div class="fleet own"><h4>Deine Flotte</h4><div class="fl"></div></div><div class="fleet foe"><h4>Feindliche Flotte</h4><div class="fl"></div></div></div>`;
      n.querySelector('.pz').addEventListener('click', () => this._requestPause());
      this._hd = { turn: n.querySelector('.turn'), ti: n.querySelector('.ti'), tt: n.querySelector('.tt'), coord: n.querySelector('.coord'),
        fl: { player: n.querySelector('.own .fl'), enemy: n.querySelector('.foe .fl') }, stat: {}, sig: { player: null, enemy: null }, ships: { player: [], enemy: [] } };
      n.querySelectorAll('[data-s]').forEach((b) => { this._hd.stat[b.dataset.s] = b; });
      this._hd.turnKey = null; this._hd.coordT = null;
    }
    this._show(this._hud);
  }
  hideHUD() { if (this._hud) this._hide(this._hud); }
  setTurn(who) {
    if (!this._hud) this.showHUD();
    const h = this._hd, foe = who === 'enemy'; if (h.turnKey === who) return; h.turnKey = who;
    h.turn.classList.toggle('foe', foe);
    h.ti.innerHTML = foe ? I.skull() : I.anchor();
    h.tt.textContent = foe ? 'Der Feind zielt …' : "Dein Zug, Käpt'n!";
    h.turn.classList.remove('pop'); void h.turn.offsetWidth; h.turn.classList.add('pop');
  }
  updateFleetStatus({ player = [], enemy = [] } = {}) {
    if (!this._hud) this.showHUD();
    for (const side of ['player', 'enemy']) {
      const list = side === 'player' ? player : enemy, h = this._hd, cont = h.fl[side];
      const shape = list.map((s) => s.name + s.length).join('|');
      if (h.sig[side] !== shape) { // Struktur neu aufbauen (nur wenn sich die Flotte ändert)
        h.sig[side] = shape; h.ships[side] = [];
        cont.innerHTML = list.map((s) => `<div class="sh"><span class="nm">${esc(s.name)}</span><span class="cells">${'<b></b>'.repeat(s.length)}</span></div>`).join('');
        [...cont.children].forEach((c) => h.ships[side].push({ root: c, cells: [...c.querySelectorAll('b')], k: '' }));
      }
      list.forEach((s, i) => {
        const o = h.ships[side][i], k = (s.sunk ? 's' : '') + (s.hits | 0); if (!o || o.k === k) return; o.k = k;
        o.root.classList.toggle('sunk', !!s.sunk);
        o.cells.forEach((c, j) => c.classList.toggle('h', j < (s.hits | 0) || !!s.sunk));
        o.root.title = s.sunk ? s.name + ' (versenkt)' : s.name;
      });
    }
  }
  updateStats({ shots = 0, hits = 0, accuracy = 0, turn = 1 } = {}) {
    if (!this._hud) this.showHUD();
    const set = (k, v) => { const e = this._hd.stat[k]; v = String(v); if (e.textContent !== v) e.textContent = v; };
    set('turn', turn); set('shots', shots); set('hits', hits); set('acc', fmtPct(accuracy));
  }
  setCoordinate(label) {
    if (!this._hud) return; const h = this._hd, v = label || null;
    if (h.coordT === v) return; h.coordT = v;
    if (v) { h.coord.textContent = v; h.coord.hidden = false; } else h.coord.hidden = true;
  }

  /* ------------------------------------------------------------------ Banner */
  _buildBanner() {
    this._banWrap = el('div', 'fb-ban'); this._banWrap.setAttribute('role', 'status'); this._banWrap.setAttribute('aria-live', 'polite');
    this._ban = el('div', 'bn'); this._banWrap.appendChild(this._ban); this.el.appendChild(this._banWrap);
    this._banQ = []; this._banBusy = false; this._banStart = 0;
  }
  announce(text, kind = 'info') {
    if (!text) return;
    this._banQ.push({ text: String(text), kind });
    while (this._banQ.length > 3) this._banQ.shift(); // Überlauf: älteste wartende verwerfen
    if (!this._banBusy) return this._banNext();
    // Neue Ansage verkürzt die laufende
    const left = BANNER_MIN_MS - (performance.now() - this._banStart);
    this._later('banEnd', () => this._banEnd(), Math.max(0, left));
  }
  _banNext() {
    const a = this._banQ.shift(); if (!a) { this._banBusy = false; return; }
    this._banBusy = true; this._banStart = performance.now();
    const b = this._ban, k = ['hit', 'miss', 'sunk', 'info', 'turn', 'warning'].includes(a.kind) ? a.kind : 'info';
    b.className = 'bn ' + k;
    const sk = k === 'sunk' ? I.skull() : '';
    b.innerHTML = `${sk}<span class="tx">${esc(a.text)}</span>${sk}`;
    void b.offsetWidth; b.classList.add('go');
    this._later('banEnd', () => this._banEnd(), BANNER_MS - BANNER_OUT_MS);
  }
  _banEnd() {
    const b = this._ban; b.classList.remove('go'); b.classList.add('end');
    this._later('banNext', () => { b.className = 'bn'; this._banNext(); }, BANNER_OUT_MS);
  }

  /* ------------------------------------------------------------------ Game Over */
  showGameOver({ won = false, stats = {}, onRestart, onMenu } = {}) {
    this._cb.over = { onRestart, onMenu };
    if (!this._over) {
      const n = this._over = this._screen('fb-over');
      n.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return; const c = this._cb.over || {};
        if (b.dataset.a === 'again') c.onRestart && c.onRestart(); else if (b.dataset.a === 'menu') c.onMenu && c.onMenu();
      });
    }
    const n = this._over; n.classList.toggle('lose', !won); n.classList.toggle('win', !!won);
    const g = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
    n.innerHTML = `<div class="pnl parch" role="dialog" aria-modal="true" aria-label="${won ? 'Sieg' : 'Niederlage'}">
      <div class="art">${won ? I.chest() : I.skull()}</div>
      <h2>${won ? 'Sieg! Die Meere gehören dir!' : "Ab zu Davy Jones' Kiste …"}</h2>
      <p class="sb">${won ? 'Die feindliche Flotte liegt auf dem Meeresgrund. Die Beute gehört dir, Käpt\'n!' : 'Deine Flotte ruht nun bei den Fischen. Aber ein echter Pirat gibt niemals auf!'}</p>
      <div class="grid">${g('Schüsse', stats.shots | 0)}${g('Treffer', stats.hits | 0)}${g('Trefferquote', fmtPct(stats.accuracy))}${g('Runden', stats.turns | 0)}${g('Dauer', fmtTime(stats.durationSec))}${g('Flotte', won ? 'Siegreich' : 'Versenkt')}</div>
      <div class="btns"><button class="btn primary" data-a="again" data-focus>Neue Partie</button><button class="btn" data-a="menu">Hauptmenü</button></div></div>`;
    if (won) { // einmaliger Münzregen (transform/opacity, danach entfernt)
      const pnl = n.querySelector('.pnl'); let h = '';
      for (let i = 0; i < 18; i++) h += `<span class="coin" style="left:${Math.round(Math.random() * 96)}%;--dx:${Math.round(Math.random() * 120 - 60)}px;animation-delay:${(Math.random() * 1.6).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.4).toFixed(2)}s">${I.coin()}</span>`;
      pnl.insertAdjacentHTML('beforeend', h);
      this._later('coins', () => n.querySelectorAll('.coin').forEach((c) => c.remove()), 5200);
    }
    this._show(n); this._focus(n);
  }
  hideGameOver() { if (this._over) this._hide(this._over); }

  /* ------------------------------------------------------------------ Pause */
  showPause({ onResume, onMenu } = {}) {
    this._cb.pause = { onResume, onMenu };
    if (!this._pause) {
      const n = this._pause = this._screen('fb-modal fb-pause');
      n.innerHTML = `<div class="pnl parch" role="dialog" aria-modal="true" aria-label="Pause"><div class="pw">${I.wheel()}</div><h2>Pause</h2>
        <p class="note" style="text-align:center">Die Flotte hält inne, Käpt'n.</p>
        <button class="btn primary" data-a="resume" data-focus>Weiter</button><button class="btn" data-a="set">${I.cog()}Einstellungen</button><button class="btn" data-a="menu">Hauptmenü</button></div>`;
      n.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return; const c = this._cb.pause || {};
        if (b.dataset.a === 'resume') c.onResume && c.onResume(); else if (b.dataset.a === 'menu') c.onMenu && c.onMenu(); else if (b.dataset.a === 'set') this.showSettings();
      });
    }
    this._show(this._pause); this._focus(this._pause);
  }
  hidePause() { if (this._pause) { this._hide(this._pause); this._unfocus(); } }
}
