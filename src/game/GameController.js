// Spielablauf: MENU -> PLACEMENT -> BATTLE -> GAMEOVER (Hot-Seat zusätzlich HANDOVER = Sichtschutz, Online LOBBY). Inszenierung gegen die Modul-Verträge (ARCHITECTURE.md).
import * as THREE from 'three';
import { FLEET, RULES, BOARD_SIZE, COL_LABELS, ROW_LABELS, FLAGSHIP_POSITION, BOARD_CENTER } from '../config.js';
import { Board } from '../../shared/Board.js';
import { fleetOf, normalizeCode } from '../../shared/protocol.js';
import { TIMES } from '../../shared/rules.js';
import { systemClock } from '../../shared/clock.js';
import { distinctNames } from '../../shared/names.js';
import { AIOpponent } from './opponents/AIOpponent.js';
import { NetClient } from '../net/NetClient.js';
import { NetOpponent } from '../net/NetOpponent.js';
import { inviteLink } from '../net/link.js';
import { watchHarbor } from '../net/harbor.js';
import { genitive, yourShip, netErrorText, gameOverText } from './onlineTexts.js';
import { Input } from './Input.js';

const CANCEL = { cancelled: true };
const LENGTHS = FLEET.map((f) => f.length);

/** Defensiver Aufruf: fehlende Methode oder Fehler blockieren das Spiel nie. */
function call(obj, method, ...args) {
  try {
    const fn = obj && obj[method];
    return typeof fn === 'function' ? fn.apply(obj, args) : undefined;
  } catch (e) {
    console.warn(`[game] ${method} fehlgeschlagen`, e);
    return undefined;
  }
}

const label = (c, r) => ROW_LABELS[r] + COL_LABELS[c];
const other = (side) => (side === 'player' ? 'enemy' : 'player');
const ignoreCancel = (e) => { if (e !== CANCEL) console.error('[game] Fehler im Ablauf', e); };

export class GameController {
  constructor(ctx) {
    this.ctx = ctx;
    const { engine } = ctx;
    this.state = 'menu';
    /** 'ai' | 'hotseat' | 'online'. Hot-Seat: Spieler 1 = Seite 'player' (links), Spieler 2 = 'enemy' (rechts).
     *  Online: der eigene Spieler ist immer 'player'. */
    this.mode = 'ai';
    this.names = { player: '', enemy: '' };
    this.difficulty = 'normal';
    this.rng = Math.random;

    this._token = 0;
    this._paused = false; // Abläufe angehalten (nicht online)
    this._pauseMenu = false; // Pausenmenü offen (online läuft das Spiel dabei weiter)
    this._net = null; // Online: Verbindung während der Lobby (danach gehört sie dem NetOpponent)
    /** Uhr für Online-Fristen (Platzierungs- und Zugzeit); Tests injizieren eine vorspulbare. */
    this.clock = ctx.clock || systemClock;
    /** Online-Partie: { turn, turnUntil, placeUntil, placeTimer, frozen } (Zeiten nach this.clock). */
    this._onl = null;
    // Weck-Ping zum Spielserver, sobald das Hauptmenü öffnet (nur wenn das Netz einen Health-Check anbietet)
    this._harbor = ctx.net && typeof ctx.net.health === 'function'
      ? watchHarbor({
        ping: () => ctx.net.health(),
        offline: () => globalThis.navigator?.onLine === false,
        onStatus: (s) => call(ctx.ui, 'setHarbor', s),
      })
      : null;
    this._resumeWaiters = [];
    this._lastPauseToggle = 0;
    this._timeScale = 1; // nur für Debug/Tests

    // Gegen die KI ist enemy ein Wissens-Brett (nur Schussergebnisse und versenkte Schiffe, die Flotte kennt
    // der Gegner). Im Hot-Seat liegen beide Flotten vollständig hier.
    this.logic = { player: this._newBoard(), enemy: this._newBoard() };
    this.ships = { player: [], enemy: [] };
    this.flagships = { player: null, enemy: null };
    this.opponent = null;
    this.stats = this._newStats(); // Spieler links
    this.statsEnemy = this._newStats(); // Seite rechts (Hot-Seat: Spieler 2)
    this._view = null;
    this._pending = null; // wartet auf Spieler-Schuss
    this._readyWaiters = [];
    this._pl = { side: 'player', selected: 0, orientation: 'h', hover: null };
    this._turnSide = 'player'; // wer schießt (Hot-Seat: wer vor dem Gerät sitzt)
    this._aim = 'enemy'; // Brett, auf das gezielt wird
    this._curtain = null; // offener Sichtschutz { side, resolve, reject }
    this._hs = this._newHotseat();

    // Feuer-Handles, deren Position jeden Frame nachgeführt wird (Schiffe schaukeln)
    this._fires = [];
    this._tmpV = new THREE.Vector3();
    this._offUpdate = engine.onUpdate((dt) => this._updateFires(), 15);

    this.input = new Input({ engine, cameraRig: ctx.cameraRig });
    this.input.onHover = (cell) => this._onHover(cell);
    this.input.onSelect = (cell) => this._onSelect(cell);
    this.input.onRotate = () => this._onRotate();
    this.input.onPause = () => this._togglePause();
    ctx.ui.onPauseRequested = () => this._togglePause();

    this.debug = this._makeDebug();
  }

  _newBoard() { return new Board({ size: BOARD_SIZE, noTouching: RULES.noTouching }); }
  _newStats() { return { shots: 0, hits: 0, turns: 0, startedAt: 0 }; }
  _newHotseat() { return { received: { player: [], enemy: [] }, review: null }; }
  _statsOf(side) { return side === 'player' ? this.stats : this.statsEnemy; }
  /** Aus wessen Sicht HUD und Schiffe gezeigt werden. */
  _viewer() { return this.mode === 'hotseat' ? this._turnSide : 'player'; }

  // ------------------------------------------------------------------ Menü
  /**
   * @param {{ join?: string, resume?: string, notice?: {title: string, text: string, reload?: boolean}, page?: string }} [opts]
   *   join: Code aus dem Einladungslink (Menü wird übersprungen); resume: Token einer laufenden Partie (Neuladen);
   *   notice: Hinweis über dem Menü; page: Menüseite.
   */
  start({ join, resume, notice, page } = {}) {
    this._resetGame();
    const { world, audio, ui } = this.ctx;
    this.state = 'menu';
    call(world, 'setMood', 'menu');
    this._setView('menu', 1.6);
    call(audio, 'playMusic', 'menu');
    call(ui, 'showMainMenu', {
      page,
      onStart: (key) => this._beginPlacement(key),
      onHotseat: (names) => this._beginHotseat(names),
      onInvite: () => this._onlineInvite(),
      onJoin: (code) => this._onlineJoin(code),
    });
    if (this._harbor) {
      call(ui, 'setHarbor', this._harbor.status);
      this._harbor.check();
    }
    if (notice) this._notice(notice);
    if (join != null) this._onlineJoin(join);
    else if (resume) this._onlineResume(resume);
  }

  _notice({ title, text, reload }) {
    call(this.ctx.ui, 'showLobby', {
      phase: 'notice', title, text,
      action: reload ? { label: 'Neu laden', onClick: () => globalThis.location?.reload() } : null,
      onCancel: () => call(this.ctx.ui, 'hideLobby'),
    });
  }

  // ------------------------------------------------------------------ Online: Lobby
  _playerName() {
    const n = this.ctx.ui && this.ctx.ui.playerName;
    return typeof n === 'string' ? n : '';
  }

  /** Lobby betreten: Menü weg, Verbindung zum Hafen aufbauen. Liefert den Ablauf-Token. */
  _enterLobby(title, text, onCancel = this._toOnlineMenu) {
    this._resetGame();
    this.state = 'lobby';
    call(this.ctx.ui, 'hideMainMenu');
    call(this.ctx.ui, 'showLobby', { phase: 'busy', title, text, onCancel });
    return this._token;
  }

  _session(method, arg) { return call(this.ctx.net && this.ctx.net.session, method, arg); }

  /** Zurück ins Online-Menü (bricht Lobby bzw. Partie ab). */
  _toOnlineMenu = () => this.start({ page: 'online' });

  async _connect(token) {
    const net = this.ctx.net;
    if (!net || typeof net.connect !== 'function') throw Object.assign(new Error('kein Netz'), { code: 'unavailable' });
    const transport = await net.connect();
    if (token !== this._token) { transport.close(); throw CANCEL; }
    const client = this._net = new NetClient(transport, { now: () => this.clock.now() });
    client.onLost = () => { if (this._net === client) this.start({ notice: netErrorText('lost') }); };
    await client.hello(this._playerName());
    await this._cp(token);
    return client;
  }

  /** Freund einladen: Raum anlegen, Code und Link zeigen, auf den Gast warten. */
  async _onlineInvite() {
    const token = this._enterLobby('Hafen wird angesteuert …', 'Einen Augenblick, Käpt\'n.');
    try {
      const client = await this._connect(token);
      const code = await client.createRoom();
      await this._cp(token);
      call(this.ctx.ui, 'showLobby', {
        phase: 'invite', code, link: inviteLink(code, globalThis.location?.href), onCancel: this._toOnlineMenu,
      });
      const matched = await client.waitMatched();
      await this._cp(token);
      this._beginOnline(client, matched, 'host');
    } catch (e) { this._lobbyFailed(e, token); }
  }

  /** Code eingeben oder Einladungslink: dem Raum beitreten. */
  async _onlineJoin(input) {
    const code = normalizeCode(input);
    const token = this._enterLobby(code ? `Runde ${code} wird angesteuert …` : 'Hafen wird angesteuert …', 'Einen Augenblick, Käpt\'n.');
    if (!code) { this._lobbyFailed({ code: 'badCode' }, token); return; }
    try {
      const client = await this._connect(token);
      const matched = await client.joinRoom(code);
      await this._cp(token);
      call(this.ctx.ui, 'showLobby', { phase: 'busy', title: `Du trittst ${genitive(matched.opponent)} Runde bei …`, text: 'Leinen los!', onCancel: this._toOnlineMenu });
      await this._wait(1.2, token);
      this._beginOnline(client, matched, 'guest');
    } catch (e) { this._lobbyFailed(e, token); }
  }

  _lobbyFailed(e, token) {
    if (e === CANCEL || token !== this._token) return;
    if (!e || !e.code) console.error('[game] Fehler in der Lobby', e);
    this.start({ notice: netErrorText(e && e.code), page: 'online' });
  }

  /**
   * Gegner gefunden: Verbindung geht an den Netz-Gegner über, Platzierung beginnt.
   * st: `state` des Servers nach dem Wiederverbinden – dann wird der Stand ohne Animationen aufgebaut.
   */
  _beginOnline(client, { seat, name, opponent }, role, st = null) {
    // Nach einem Abbruch mitten in der Platzierung: bereits gesetzte Schiffe behalten
    const keep = st && st.phase === 'placement' && !st.fleet && this.mode === 'online' && this.state === 'placement' ? fleetOf(this.logic.player) : null;
    this._net = null; // gehört ab jetzt dem Netz-Gegner (wird mit ihm aufgeräumt)
    this._resetGame();
    this.mode = 'online';
    this.names = { player: name, enemy: opponent };
    this._onl = { turn: null, turnUntil: 0, placeUntil: 0, placeTimer: null, frozen: false };
    this.opponent = new NetOpponent(client, seat, {
      onGameOver: (msg) => this._onlineGameOver(msg),
      onLost: () => this._onlineLost(),
      onStatus: (msg) => this._onlineStatus(msg),
      onPlacementDeadline: (ms, at) => this._onlinePlacementDeadline(ms, at),
      onStart: () => { if (this.state === 'placement') this._onlineForcedStart(); },
    });
    this._session('save', client.token);
    if (st) { this._restoreOnline(st, keep); return; }
    if (client.ended) { this._onlineGameOver(client.ended); return; } // Gegner schon wieder weg
    this._enterPlacement('player');
    const deadline = client.latest.placementDeadline; // kam evtl. schon vor dem Netz-Gegner an
    if (deadline) this._onlinePlacementDeadline(deadline.ms, deadline.at);
    if (role === 'host') call(this.ctx.ui, 'announce', `${opponent} ist an Bord!`, 'info');
  }

  // ------------------------------------------------------------------ Platzierung
  _beginPlacement(key) {
    this._resetGame();
    this.mode = 'ai';
    if (key) this.difficulty = key;
    this._enterPlacement('player');
  }

  /** Hot-Seat starten. names: [Spieler 1, Spieler 2]. */
  _beginHotseat(names) {
    this._resetGame();
    this.mode = 'hotseat';
    const [a, b] = distinctNames(names[0], names[1]);
    this.names = { player: a, enemy: b };
    this._enterPlacement('player');
  }

  _enterPlacement(side) {
    const { ui, world, audio, boards } = this.ctx;
    this.state = 'placement';
    call(ui, 'hideMainMenu');
    call(world, 'setMood', 'menu');
    call(audio, 'playMusic', 'menu');
    this._setView(side === 'player' ? 'placement' : 'placementEnemy', 1.6);
    this._pl = { side, selected: 0, orientation: 'h', hover: null };
    this.input.setBoard(boards[side]);
    call(ui, 'showPlacement', {
      fleet: FLEET,
      onSelectShip: (i) => this._plSelect(i),
      onRotate: () => this._plRotate(),
      onRandom: () => this._plRandom(),
      onClear: () => this._plClear(),
      onConfirm: () => this._plConfirm(),
    });
    call(ui, 'announce', this.mode === 'hotseat' ? `${this.names[side]}, platziere deine Flotte` : 'Platziere deine Flotte', 'info');
    this._plRefresh();
  }

  _plBoard() { return this.logic[this._pl.side]; }

  _plNextFree() {
    for (let i = 0; i < FLEET.length; i++) if (!this._plBoard().isPlaced(i)) return i;
    return -1;
  }

  _plAnchor(len, col, row, o) {
    if (o === 'h') col = Math.min(col, BOARD_SIZE - len);
    else row = Math.min(row, BOARD_SIZE - len);
    return { col, row };
  }

  _plRefresh() {
    const { ui, boards } = this.ctx;
    const pl = this._pl;
    const lb = this._plBoard(), view = boards[pl.side];
    const placed = FLEET.map((f, i) => lb.isPlaced(i));
    call(ui, 'updatePlacement', { placed, selectedIndex: pl.selected, orientation: pl.orientation, canConfirm: placed.every(Boolean) });
    const h = pl.hover;
    if (!h || pl.selected < 0 || this.state !== 'placement') { call(view, 'hideGhost'); return; }
    const len = LENGTHS[pl.selected];
    const a = this._plAnchor(len, h.col, h.row, pl.orientation);
    const valid = lb.canPlace(len, a.col, a.row, pl.orientation, pl.selected);
    call(view, 'showGhost', len, a.col, a.row, pl.orientation, valid);
  }

  /** Visuelles Schiff mit der Logik abgleichen. */
  _plSync(i) {
    const { shipFactory, boards } = this.ctx;
    const side = this._pl.side;
    const s = this.logic[side].ships[i];
    let obj = this.ships[side][i];
    if (!s) { if (obj) call(obj, 'setVisible', false); return; }
    if (!obj) { obj = call(shipFactory, 'createShip', LENGTHS[i], side); this.ships[side][i] = obj; }
    call(obj, 'place', boards[side], s.col, s.row, s.orientation);
    call(obj, 'setVisible', true);
  }

  _plSelect(i) {
    if (this.state !== 'placement' || i < 0 || i >= FLEET.length) return;
    const lb = this._plBoard();
    if (lb.isPlaced(i)) { // aufnehmen
      this._pl.orientation = lb.ships[i].orientation;
      lb.remove(i);
      this._plSync(i);
    }
    this._pl.selected = i;
    call(this.ctx.audio, 'play', 'click');
    this._plRefresh();
  }

  _plRotate() {
    if (this.state !== 'placement') return;
    this._pl.orientation = this._pl.orientation === 'h' ? 'v' : 'h';
    call(this.ctx.audio, 'play', 'rotate');
    this._plRefresh();
  }

  _plRandom() {
    if (this.state !== 'placement') return;
    this._plBoard().randomize(LENGTHS, this.rng);
    for (let i = 0; i < FLEET.length; i++) this._plSync(i);
    this._pl.selected = -1;
    call(this.ctx.audio, 'play', 'place');
    this._plRefresh();
  }

  _plClear() {
    if (this.state !== 'placement') return;
    this._plBoard().clear();
    for (let i = 0; i < FLEET.length; i++) this._plSync(i);
    this._pl.selected = 0;
    call(this.ctx.audio, 'play', 'click');
    this._plRefresh();
  }

  _plConfirm() {
    if (this.state !== 'placement' || this._plNextFree() !== -1) return;
    if (this._onl && this._onl.offline) { call(this.ctx.audio, 'play', 'error'); return; } // erst nach dem Wiederverbinden
    if (this.mode === 'hotseat' && this._pl.side === 'player') this._hsHandoverPlacement();
    else this._startBattle();
  }

  /** Hot-Seat: Spieler 1 fertig -> Sichtschutz -> Spieler 2 platziert rechts. */
  _hsHandoverPlacement() {
    const { ui, boards } = this.ctx;
    const token = this._token;
    call(ui, 'hidePlacement');
    call(boards.player, 'hideGhost');
    this._handover('enemy', token).then(() => this._enterPlacement('enemy')).catch(ignoreCancel);
  }

  _plClick(cell) {
    const pl = this._pl, lp = this._plBoard(), audio = this.ctx.audio;
    const idx = lp.shipAt(cell.col, cell.row);
    if (idx >= 0) { // platziertes Schiff wieder aufnehmen
      pl.orientation = lp.ships[idx].orientation;
      lp.remove(idx);
      this._plSync(idx);
      pl.selected = idx;
      pl.hover = cell;
      call(audio, 'play', 'click');
    } else if (pl.selected >= 0) {
      const len = LENGTHS[pl.selected];
      const a = this._plAnchor(len, cell.col, cell.row, pl.orientation);
      if (lp.place(pl.selected, len, a.col, a.row, pl.orientation)) {
        this._plSync(pl.selected);
        call(audio, 'play', 'place');
        pl.selected = this._plNextFree();
      } else {
        call(audio, 'play', 'error');
      }
    }
    this._plRefresh();
  }

  // ------------------------------------------------------------------ Eingabe-Weiterleitung
  _onHover(cell) {
    if (this._pauseMenu) return;
    const { boards, ui } = this.ctx;
    if (this.state === 'placement') {
      this._pl.hover = cell;
      this._plRefresh();
    } else if (this.state === 'battle' && this._pending) {
      if (cell) {
        call(boards[this._aim], 'setHover', cell.col, cell.row, this.logic[this._aim].wasShot(cell.col, cell.row) ? 'invalid' : 'aim');
        call(ui, 'setCoordinate', label(cell.col, cell.row));
      } else {
        call(boards[this._aim], 'setHover', 0, 0, null);
        call(ui, 'setCoordinate', null);
      }
    }
  }

  _onSelect(cell) {
    if (this._pauseMenu) return;
    if (this.state === 'placement') this._plClick(cell);
    else if (this.state === 'battle' && this._pending) {
      if (this.logic[this._aim].wasShot(cell.col, cell.row)) { call(this.ctx.audio, 'play', 'error'); return; }
      const p = this._pending;
      this._pending = null;
      this.input.setBoard(null);
      call(this.ctx.boards[this._aim], 'setHover', 0, 0, null);
      call(this.ctx.ui, 'setCoordinate', null);
      p.resolve(cell);
    }
  }

  _onRotate() { if (!this._pauseMenu) this._plRotate(); }

  // ------------------------------------------------------------------ Pause
  _togglePause() {
    const now = performance.now();
    if (now - this._lastPauseToggle < 200) return; // UI und Input melden ESC evtl. beide
    this._lastPauseToggle = now;
    if (this._pauseMenu) { this._resume(); return; }
    if (this.state !== 'placement' && this.state !== 'battle') return;
    const online = this.mode === 'online';
    this._pauseMenu = true;
    this._paused = !online; // online läuft die Partie weiter
    this._pauseStart = now;
    this.input.enabled = false;
    call(this.ctx.ui, 'showPause', {
      online, onResume: () => this._resume(), onMenu: () => this.start(),
      onResign: online ? () => { this._resume(); call(this.opponent, 'resign'); } : undefined,
    });
  }

  _resume() {
    if (!this._pauseMenu) return;
    this._pauseMenu = false;
    if (this._paused) this.stats.startedAt += performance.now() - this._pauseStart;
    this._paused = false;
    this.input.enabled = true;
    call(this.ctx.ui, 'hidePause');
    const w = this._resumeWaiters.splice(0);
    for (const r of w) r();
    this.input.refresh();
  }

  // ------------------------------------------------------------------ Async-Helfer
  async _cp(token) {
    if (token !== this._token) throw CANCEL;
    while (this._paused) {
      await new Promise((r) => this._resumeWaiters.push(r));
      if (token !== this._token) throw CANCEL;
    }
  }

  async _race(p, token, ms = 6000) {
    let t;
    const timeout = new Promise((r) => { t = setTimeout(r, ms); });
    try { await Promise.race([Promise.resolve(p), timeout]); }
    catch (e) { console.warn('[game] Animation-Fehler', e); }
    finally { clearTimeout(t); }
    await this._cp(token);
  }

  _sleep(sec) { return new Promise((r) => setTimeout(r, sec * 1000 * this._timeScale)); }

  async _wait(sec, token) {
    await this._sleep(sec);
    await this._cp(token);
  }

  _setView(name, dur) {
    this._view = name;
    let p;
    try { p = this.ctx.cameraRig.setView(name, dur); } catch (e) { console.warn(e); }
    return Promise.resolve(p).catch((e) => console.warn(e));
  }

  async _camTo(name, dur, token) {
    if (this._view === name) return;
    await this._race(this._setView(name, dur), token, 4000);
  }

  // ------------------------------------------------------------------ Aufräumen
  _stopAllFires() {
    for (const f of this._fires) call(f.handle, 'stop');
    this._fires.length = 0;
  }

  _resetGame() {
    const { ui, boards, fx, world } = this.ctx;
    this._token++;
    this._paused = false;
    this._pauseMenu = false;
    if (this._net) { const n = this._net; this._net = null; n.close(); }
    const w = this._resumeWaiters.splice(0);
    for (const r of w) r();
    if (this._pending) { const p = this._pending; this._pending = null; p.reject(CANCEL); }
    if (this._curtain) { const c = this._curtain; this._curtain = null; c.reject(CANCEL); }
    this._readyWaiters.splice(0).forEach((r) => r());
    this.input.enabled = true;
    this.input.setBoard(null);
    this._stopAllFires();
    for (const side of ['player', 'enemy']) {
      for (const s of this.ships[side]) if (s) call(s, 'dispose');
      this.ships[side] = [];
      this.logic[side] = this._newBoard();
      const b = boards[side];
      call(b, 'clearMarkers');
      call(b, 'hideGhost');
      call(b, 'setHover', 0, 0, null);
      call(b, 'setActive', false);
    }
    call(fx, 'clearAll');
    for (const m of ['hideMainMenu', 'hidePlacement', 'hideHUD', 'hideGameOver', 'hidePause', 'hideCurtain', 'hideLobby']) call(ui, m);
    call(ui, 'setCoordinate', null);
    call(this.opponent, 'dispose');
    this.opponent = null;
    this._clearOnline();
    this._onl = null;
    if (this.mode === 'online') this._session('clear');
    this.stats = this._newStats();
    this.statsEnemy = this._newStats();
    this._hs = this._newHotseat();
    this._turnSide = 'player';
    this._aim = 'enemy';
  }

  // ------------------------------------------------------------------ Hot-Seat: Sichtschutz & Rückblick
  /** Sichtbarkeit der (nicht versenkten) Schiffe: nur die von viewer; 'all' = alle, null = keine. */
  _showShips(viewer) {
    for (const side of ['player', 'enemy']) {
      this.ships[side].forEach((obj, i) => {
        const s = this.logic[side].ships[i];
        if (obj && s && !s.sunk) call(obj, 'setVisible', viewer === 'all' || viewer === side);
      });
    }
  }

  /** Vollbild-Sichtschutz, bis side „bereit“ bestätigt. */
  async _handover(side, token) {
    this.state = 'handover';
    this.input.setBoard(null);
    this._showShips(null);
    call(this.ctx.ui, 'setCoordinate', null);
    await new Promise((resolve, reject) => {
      this._curtain = { side, resolve, reject };
      call(this.ctx.ui, 'showCurtain', { name: this.names[side], onReady: () => this._curtainReady() });
      this._readyWaiters.splice(0).forEach((r) => r());
    });
    await this._cp(token);
  }

  _curtainReady() {
    const c = this._curtain;
    if (!c) return;
    this._curtain = null;
    call(this.ctx.ui, 'hideCurtain');
    call(this.ctx.audio, 'play', 'bell', { volume: 0.4 });
    c.resolve();
  }

  async _hotseatLoop(token) {
    try {
      let side = this.rng() < 0.5 ? 'player' : 'enemy'; // Münzwurf
      for (let opening = true; ; opening = false) {
        await this._handover(side, token);
        this.state = 'battle';
        await this._hsBriefing(side, opening, token);
        if (await this._humanTurn(side, token) === 'won') { await this._gameOver(true, token, side); return; }
        await this._wait(0.6, token);
        side = other(side);
      }
    } catch (e) {
      if (e === CANCEL) return;
      console.error('[game] Fehler im Hot-Seat-Ablauf', e);
      this.start();
    }
  }

  /** Nach der Übergabe: eigene Flotte zeigen, neue Einschläge des Gegners aufleuchten lassen. */
  async _hsBriefing(side, opening, token) {
    const { ui, boards, audio } = this.ctx;
    this._turnSide = side;
    this._showShips(side);
    this._updateUI();
    await this._camTo(side, 1.1, token);
    if (opening) {
      call(ui, 'announce', `${this.names[side]} eröffnet das Feuer!`, 'turn');
      await this._wait(1.2, token);
      return;
    }
    const shots = this._hs.received[side].splice(0);
    if (!shots.length) return;
    this._hs.review = { side, shots, text: this._reviewText(other(side), shots) };
    call(ui, 'announce', this._hs.review.text, 'info');
    for (const s of shots) {
      call(boards[side], 'setHover', s.col, s.row, s.result === 'miss' ? 'aim' : 'invalid');
      call(audio, 'play', s.result === 'miss' ? 'splash' : 'explosion', { volume: 0.35 });
      await this._wait(0.5, token);
    }
    call(boards[side], 'setHover', 0, 0, null);
    await this._wait(0.6, token);
  }

  /** z. B. „Rotbart traf deine Fregatte (B7) und verfehlte bei C4“ – ohne Pronomen. */
  _reviewText(shooter, shots) {
    const parts = shots.map((s) => {
      const where = label(s.col, s.row);
      if (s.result === 'miss') return `verfehlte bei ${where}`;
      return `${s.result === 'sunk' ? 'versenkte' : 'traf'} ${yourShip(s.shipIndex)} (${where})`;
    });
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}` : parts[0];
    return `${this.names[shooter]} ${list}`;
  }

  // ------------------------------------------------------------------ Kampf
  _ensureFlagships() {
    const { shipFactory } = this.ctx;
    for (const side of ['player', 'enemy']) {
      if (!this.flagships[side]) this.flagships[side] = call(shipFactory, 'createFlagship', side) || null;
    }
  }

  _startBattle() {
    const { ui, world, audio, boards } = this.ctx;
    const token = this._token;
    this.state = 'battle';
    call(ui, 'hidePlacement');
    call(boards[this._pl.side], 'hideGhost');
    this.input.setBoard(null);

    this._ensureFlagships();
    this.stats = this._newStats();
    this.statsEnemy = this._newStats();
    this.stats.startedAt = performance.now();

    call(world, 'setMood', 'battle');
    call(audio, 'playMusic', 'battle');
    call(ui, 'showHUD', this.mode === 'online' ? { foe: this.names.enemy } : undefined);
    if (this.mode === 'hotseat') { this._hotseatLoop(token); return; }
    this._updateUI();
    if (this.mode === 'online') { this._onlineBattle(token); return; }
    this.opponent = new AIOpponent({ difficulty: this.difficulty, rng: this.rng, sleep: (sec) => this._sleep(sec) });
    this._battleLoop(token);
  }

  /** Kampf gegen die KI (online: _onlineBattle). */
  async _battleLoop(token) {
    let errors = 0, first;
    try {
      ({ first } = await this.opponent.submitFleet(fleetOf(this.logic.player)));
      await this._cp(token);
    } catch (e) {
      if (e !== CANCEL && token === this._token) { console.error('[game] Flotte konnte nicht übergeben werden', e); this.start(); }
      return;
    }
    while (token === this._token) {
      try {
        await this._camTo(first === 'player' ? 'enemy' : 'player', 1.4, token);
        for (;;) {
          if (first === 'player') {
            const w = await this._humanTurn('player', token);
            if (w === 'won') { await this._gameOver(true, token); return; }
          }
          first = 'player';
          const l = await this._enemyTurn(token);
          if (l === 'lost') { await this._gameOver(false, token); return; }
        }
      } catch (e) {
        if (e === CANCEL || token !== this._token) return;
        console.error('[game] Fehler im Kampfablauf', e);
        if (++errors > 5) { console.error('[game] zu viele Fehler, zurück ins Menü'); this.start(); return; }
        this._pending = null;
      }
    }
  }

  _awaitPlayerShot(token) {
    return new Promise((resolve, reject) => {
      this._pending = { resolve, reject };
      this.input.setBoard(this.ctx.boards[this._aim]);
      this.input.refresh();
      this._readyWaiters.splice(0).forEach((r) => r());
    });
  }

  /** Zug eines Menschen am Gerät (gegen die KI immer 'player'). */
  async _humanTurn(side, token) {
    const { ui, boards } = this.ctx;
    const target = other(side), hs = this.mode === 'hotseat';
    this._statsOf(side).turns++;
    this._turnSide = side;
    this._aim = target;
    call(ui, 'setTurn', 'player', hs ? `${this.names[side]} ist am Zug` : undefined);
    call(boards[side], 'setActive', false);
    call(boards[target], 'setActive', true);
    await this._camTo(target, 1.1, token);
    call(ui, 'announce', hs ? `Feuer frei, ${this.names[side]}!` : 'Dein Zug', 'turn');
    for (;;) {
      const cell = await this._awaitPlayerShot(token);
      await this._cp(token);
      const res = await this._shoot(side, cell.col, cell.row, token);
      if (res.result === 'repeat') continue;
      this._updateUI();
      if (this._fleetSunk(target)) return 'won';
      if (res.result === 'miss' || !RULES.shootAgainOnHit) return 'continue';
    }
  }

  /** Zug der KI. */
  async _enemyTurn(token) {
    const { ui, boards } = this.ctx;
    this.statsEnemy.turns++;
    call(ui, 'setTurn', 'enemy');
    call(boards.enemy, 'setActive', false);
    call(boards.player, 'setActive', true);
    call(ui, 'announce', 'Der Feind ist am Zug', 'turn');
    const shotP = this.opponent.nextShot();
    await this._camTo('player', 1.1, token);
    for (let shot = await shotP; ; shot = await this.opponent.nextShot()) {
      await this._cp(token);
      if (!shot) return 'continue';
      const res = await this._shoot('enemy', shot.col, shot.row, token);
      this._updateUI();
      if (this._fleetSunk('player')) return 'lost';
      if (res.result === 'miss' || res.result === 'repeat' || !RULES.shootAgainOnHit) return 'continue';
    }
  }

  _fleetSunk(side) { return this.logic[side].sunkCount() === FLEET.length; }

  /** KI/Hot-Seat: Gegner-Schuss auf das eigene Brett auswerten bzw. eigenen Schuss beim Gegner auflösen lassen. */
  async _resolveShot(shooter, col, row, token) {
    if (shooter === 'enemy' || this.mode === 'hotseat') return this.logic[other(shooter)].receiveShot(col, row);
    if (this.logic.enemy.wasShot(col, row)) return { result: 'repeat', shipIndex: -1, cellIndex: -1, cells: [] };
    const r = await this.opponent.shoot(col, row);
    await this._cp(token);
    return this._learnShot(col, row, r);
  }

  /** Ergebnis eines eigenen Schusses ins Wissens-Brett eintragen. r: { result, ship? } (ship bei 'sunk'). */
  _learnShot(col, row, r) {
    const kb = this.logic.enemy;
    if (r.result === 'sunk') {
      const { index, length, col: c, row: rw, orientation } = r.ship;
      kb.recordSunk(index, length, c, rw, orientation);
      return { result: 'sunk', shipIndex: index, cellIndex: -1, cells: kb.ships[index].cells.map((x) => ({ ...x })) };
    }
    kb.recordShot(col, row, r.result === 'hit');
    return { result: r.result, shipIndex: -1, cellIndex: -1, cells: [] };
  }

  /**
   * Ein kompletter Schuss samt Inszenierung. shooter: 'player' | 'enemy'.
   * given: bereits feststehendes Ergebnis (online vom Server); sonst wird es hier ermittelt.
   */
  async _shoot(shooter, col, row, token, given) {
    const { boards, fx, audio, cameraRig, world, ui, shipFactory } = this.ctx;
    const tSide = shooter === 'player' ? 'enemy' : 'player';
    const view = boards[tSide];
    const res = given || await this._resolveShot(shooter, col, row, token);
    if (res.result === 'repeat') return res;
    const st = this._statsOf(shooter);
    st.shots++;
    if (res.result !== 'miss') st.hits++;
    if (this.mode === 'hotseat') this._hs.received[tSide].push({ col, row, result: res.result, shipIndex: res.shipIndex });

    const target = view.cellToWorld ? view.cellToWorld(col, row, new THREE.Vector3()) : new THREE.Vector3();
    target.y = call(world, 'getWaterHeight', target.x, target.z) || 0;

    // Feuern
    const flag = this.flagships[shooter];
    let muzzle = new THREE.Vector3();
    const m = call(flag, 'getCannonPosition', target, muzzle);
    if (m && m.isVector3) muzzle = m; else muzzle.copy(FLAGSHIP_POSITION[shooter]).setY(3);
    call(flag, 'fireRecoil');
    call(audio, 'play', 'cannon', { x: muzzle.x });
    call(cameraRig, 'shake', 0.4);
    setTimeout(() => { if (token === this._token) call(audio, 'play', 'whistle', { x: target.x }); }, 150 * this._timeScale);
    await this._race(call(fx, 'fireCannon', muzzle, target, { flightTime: 0.9 }), token);

    // Ergebnis
    const mine = this.mode === 'hotseat' || shooter === 'player';
    const foe = this.mode === 'online' ? this.names.enemy : null;
    if (res.result === 'miss') {
      call(fx, 'splash', target);
      call(audio, 'play', 'splash', { x: target.x });
      call(view, 'markMiss', col, row);
      call(ui, 'announce', mine ? 'Daneben!' : foe ? `${foe} verfehlt!` : 'Der Feind verfehlt!', 'miss');
      await this._wait(0.45, token);
      return res;
    }

    let ship = this.ships[tSide][res.shipIndex];
    call(fx, 'explosion', target, 1);
    call(audio, 'play', 'explosion', { x: target.x });
    call(cameraRig, 'shake', 0.8);
    call(view, 'markHit', col, row);
    if (res.cellIndex >= 0) call(ship, 'damage', res.cellIndex);
    this._startFire(tSide, col, row, ship, res.cellIndex, target);

    if (res.result === 'hit') {
      call(ui, 'announce', mine ? 'Treffer!' : foe ? `${foe} trifft ${yourShip(res.shipIndex)}!` : 'Wir wurden getroffen!', 'hit');
      await this._wait(0.55, token);
      return res;
    }

    // Versenkt
    const info = this.logic[tSide].ships[res.shipIndex];
    const name = FLEET[res.shipIndex].name;
    call(ui, 'announce', mine ? `${name} versenkt!` : foe ? `${foe} hat ${yourShip(res.shipIndex)} versenkt!` : `Unsere ${name} ist gesunken!`, 'sunk');
    await this._wait(0.5, token);
    this._stopShipFires(tSide, res.cells);
    if (!ship) { // Gegnerschiff wird erst beim Versenken bekannt
      ship = this.ships[tSide][res.shipIndex] = call(shipFactory, 'createShip', info.length, tSide);
      call(ship, 'place', view, info.col, info.row, info.orientation);
      for (let i = 0; i < info.length; i++) call(ship, 'damage', i);
    }
    call(ship, 'setVisible', true);
    const a = view.cellToWorld(info.col, info.row, new THREE.Vector3());
    const b = view.cellToWorld(info.orientation === 'h' ? info.col + info.length - 1 : info.col, info.orientation === 'v' ? info.row + info.length - 1 : info.row, new THREE.Vector3());
    const mid = a.add(b).multiplyScalar(0.5);
    const sinkP = call(ship, 'sink');
    call(fx, 'sinkEffect', mid, info.length, info.orientation);
    call(audio, 'play', 'sink', { x: mid.x });
    if (RULES.noTouching) for (const n of this.logic[tSide].neighborsOf(res.shipIndex)) call(view, 'markBlocked', n.col, n.row);
    this._updateUI();
    const over = this._fleetSunk(tSide);
    await this._wait(over ? 0.8 : 1.0, token);
    if (over) await this._race(sinkP, token, 4000);
    return res;
  }

  // ------------------------------------------------------------------ Feuer
  _startFire(tSide, col, row, ship, cellIndex, target) {
    const handle = call(this.ctx.fx, 'startFire', target, 1);
    if (!handle) return;
    this._fires.push({
      handle, side: tSide, col, row, ship: ship || null,
      idx: cellIndex, x: target.x, z: target.z,
    });
  }

  _stopShipFires(side, cells) {
    for (let i = this._fires.length - 1; i >= 0; i--) {
      const f = this._fires[i];
      if (f.side === side && cells.some((c) => c.col === f.col && c.row === f.row)) { call(f.handle, 'stop'); this._fires.splice(i, 1); }
    }
  }

  _updateFires() {
    const fires = this._fires;
    if (!fires.length) return;
    const v = this._tmpV, world = this.ctx.world;
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      let ok = false;
      if (f.ship && typeof f.ship.getCellWorldPosition === 'function') {
        try { f.ship.getCellWorldPosition(f.idx, v); ok = true; } catch (_) { /* ignorieren */ }
      }
      if (!ok) {
        const y = world && world.getWaterHeight ? world.getWaterHeight(f.x, f.z) : 0;
        v.set(f.x, y, f.z);
      }
      if (f.handle && typeof f.handle.setPosition === 'function') f.handle.setPosition(v);
    }
  }

  // ------------------------------------------------------------------ Online: Kampf (der Server ist Schiedsrichter)
  // Ergebnis und Zugrecht kommen vom Server (shotResult, turn), nicht aus lokalen Regeln. Das eigene Brett wird
  // lokal mitgeführt (für Schaden und Feuer); die Flotte dazu nennt der Server beim Start.

  async _onlineBattle(token) {
    const { ui } = this.ctx, foe = this.names.enemy;
    call(ui, 'setTurn', 'enemy', `Warte auf ${foe} …`);
    this._onlinePlacementTimer();
    let start;
    try {
      start = await this.opponent.submitFleet(fleetOf(this.logic.player));
      await this._cp(token);
    } catch (e) {
      // Spielende bzw. Verbindungsabbruch haben eigene Pfade
      if (e !== CANCEL && token === this._token && e.code !== 'ended' && e.code !== 'connection') { console.error('[game] Flotte konnte nicht übergeben werden', e); this.start(); }
      return;
    }
    this._clearOnline();
    this._adoptFleet(start.fleet);
    call(ui, 'announce', start.first === 'player' ? 'Du eröffnest das Feuer!' : `${foe} eröffnet das Feuer!`, 'turn');
    this._onlineLoop(token);
  }

  /** Server-Ereignisse der Reihe nach inszenieren, bis das Spiel endet oder abgebrochen wird. */
  async _onlineLoop(token) {
    for (;;) {
      let ev;
      try { ev = await this.opponent.nextEvent(); } catch { return; } // Spielende oder Verbindung weg: eigene Pfade
      if (token !== this._token) return;
      try {
        if (ev.type === 'turn') await this._onlineTurn(ev, token);
        else if (ev.type === 'error') this._onlineAim(token); // Schuss abgelehnt (z. B. Zeit lief gerade ab)
        else if (await this._onlineShot(ev, token)) return;
      } catch (e) {
        if (e === CANCEL || token !== this._token) return;
        console.error('[game] Fehler im Online-Ablauf', e);
      }
    }
  }

  async _onlineTurn(ev, token) {
    const { ui, boards } = this.ctx, o = this._onl, foe = this.names.enemy;
    const side = this.opponent.side(ev.seat);
    o.turnUntil = ev.at + ev.ms;
    if (side !== o.turn) {
      o.turn = side;
      this._statsOf(side).turns++;
      call(boards[side], 'setActive', false);
      call(boards[other(side)], 'setActive', true);
      call(ui, 'setTurn', side, side === 'enemy' ? `${foe} zielt …` : undefined);
      call(ui, 'announce', side === 'player' ? 'Dein Zug' : `${foe} ist am Zug`, 'turn');
      this._updateUI();
      await this._camTo(other(side), 1.1, token);
    }
    this._onlineTurnTimer();
    this._onlineAim(token);
  }

  /** Eigener Zug: auf einen Klick warten und ihn an den Server schicken. */
  _onlineAim(token) {
    const o = this._onl;
    if (!o || o.turn !== 'player' || o.frozen || this._pending || this.state !== 'battle') return;
    this._turnSide = 'player';
    this._aim = 'enemy';
    this._awaitPlayerShot(token).then((cell) => { if (token === this._token) this.opponent.shoot(cell.col, cell.row); }, ignoreCancel);
  }

  /** Laufendes Zielen abbrechen (Zufallsschuss des Servers, Gegner getrennt). */
  _cancelAim() {
    if (!this._pending) return;
    const p = this._pending;
    this._pending = null;
    p.reject(CANCEL);
    this.input.setBoard(null);
    call(this.ctx.boards.enemy, 'setHover', 0, 0, null);
    call(this.ctx.ui, 'setCoordinate', null);
  }

  /** shotResult inszenieren; true, wenn damit eine Flotte versenkt ist (Spielende). */
  async _onlineShot(ev, token) {
    const { ui } = this.ctx, foe = this.names.enemy;
    this._cancelAim();
    call(ui, 'setTimer', null);
    const shooter = this.opponent.side(ev.shooter);
    if (ev.auto) call(ui, 'announce', shooter === 'player' ? 'Zeit um – ein Zufallsschuss!' : `${foe} zögert – ein Zufallsschuss!`, 'warning');
    let res;
    if (shooter === 'enemy') {
      res = this.logic.player.receiveShot(ev.col, ev.row);
      if (res.result !== ev.result) console.warn('[game] eigenes Brett weicht vom Server ab', ev, res.result);
    } else {
      res = this._learnShot(ev.col, ev.row, ev);
    }
    await this._shoot(shooter, ev.col, ev.row, token, res);
    this._updateUI();
    if (!this._fleetSunk(other(shooter))) return false;
    await this._gameOver(shooter === 'player', token);
    return true;
  }

  /** Flotte vom Server übernehmen, falls sie von der lokalen abweicht (Server hat nach Zeitablauf ergänzt). */
  _adoptFleet(fleet) {
    if (!Array.isArray(fleet)) return;
    const key = (f) => JSON.stringify([...f].sort((a, b) => a.index - b.index).map((x) => [x.index, x.col, x.row, x.orientation]));
    if (key(fleetOf(this.logic.player)) === key(fleet)) return;
    this._placeOwnFleet(fleet);
    this._updateUI();
    call(this.ctx.ui, 'announce', 'Der Hafenmeister hat deine Flotte aufgestellt', 'info');
  }

  /** Eigene Flotte (placeFleet-Format) ins Brett und in die Szene setzen. */
  _placeOwnFleet(fleet) {
    const b = this._newBoard();
    for (const x of fleet) b.place(x.index, LENGTHS[x.index], x.col, x.row, x.orientation);
    this.logic.player = b;
    this._pl.side = 'player';
    for (let i = 0; i < FLEET.length; i++) this._plSync(i);
  }

  // ------------------------------------------------------------------ Online: Wiederverbinden
  /** Partie nach Neuladen fortsetzen (Token aus dem Tab-Speicher). */
  async _onlineResume(saved) {
    const cancel = () => { this._session('clear'); this._toOnlineMenu(); };
    const token = this._enterLobby('Zurück an Bord …', 'Deine Partie wird gesucht.', cancel);
    try {
      if (await this._rejoin(saved, token) === 'gone') { this._session('clear'); this.start({ notice: netErrorText('gone'), page: 'online' }); }
    } catch (e) { this._lobbyFailed(e, token); }
  }

  /** Verbindung zum Hafen während der Partie verloren: Szene bleibt stehen, neu verbinden, solange die Schonfrist läuft. */
  async _onlineLost() {
    if (this.state === 'gameover') return; // nichts mehr zu retten
    const o = this._onl, saved = this.opponent && this.opponent.client.token;
    if (this.mode !== 'online' || !o || !saved) { this.start({ notice: netErrorText('lost'), page: 'online' }); return; }
    const token = ++this._token; // laufende Abläufe beenden
    this._cancelAim();
    this._clearOnline();
    o.offline = true;
    o.turn = null;
    const { ui } = this.ctx;
    call(ui, 'setConnection', { text: 'Verbindung zum Hafen verloren – neuer Versuch …' });
    const giveUp = this.clock.now() + TIMES.graceMs;
    for (let delay = 1000; ; delay = Math.min(delay * 2, 8000)) {
      await new Promise((r) => this.clock.setTimeout(r, delay));
      if (token !== this._token) return;
      if (this.clock.now() >= giveUp) break;
      try {
        if (await this._rejoin(saved, token) === 'gone') { this.start({ notice: netErrorText('gone'), page: 'online' }); }
        return;
      } catch (e) {
        if (e === CANCEL || token !== this._token) return;
        if (e && e.code === 'version') { this.start({ notice: netErrorText('version'), page: 'online' }); return; }
      }
    }
    this.start({ notice: netErrorText('lost'), page: 'online' });
  }

  /** Mit dem Token der Partie neu verbinden: 'back' (Stand wiederhergestellt) oder 'gone' (Partie unbekannt). */
  async _rejoin(saved, token) {
    const net = this.ctx.net;
    if (!net || typeof net.connect !== 'function') throw Object.assign(new Error('kein Netz'), { code: 'unavailable' });
    const transport = await net.connect();
    if (token !== this._token) { transport.close(); throw CANCEL; }
    const client = new NetClient(transport, { now: () => this.clock.now() });
    try {
      const welcome = await client.hello(this._playerName(), saved);
      if (!welcome.resumed) { client.close(); return 'gone'; }
      const st = await client.next((m) => m.type === 'state');
      if (token !== this._token) throw CANCEL;
      this._beginOnline(client, st, null, st);
      return 'back';
    } catch (e) { client.close(); throw e; }
  }

  /** Stand aus `state` aufbauen – ohne Animationen; danach geht es mit den Server-Ereignissen weiter. */
  _restoreOnline(st, keep) {
    const opp = this.opponent, token = this._token;
    if (st.phase === 'placement') {
      if (st.fleet) { // schon bestätigt: wartet auf den Gegner
        opp.fleetSent = true;
        this._placeOwnFleet(st.fleet);
        this._startBattle();
      } else {
        this._enterPlacement('player');
        const d = opp.client.latest.placementDeadline; // kam evtl. direkt nach state, vor dem Netz-Gegner
        if (d && d.at >= st.at) this._onlinePlacementDeadline(d.ms, d.at);
        if (keep) {
          for (const x of keep) this.logic.player.place(x.index, LENGTHS[x.index], x.col, x.row, x.orientation);
          for (let i = 0; i < FLEET.length; i++) this._plSync(i);
          this._pl.selected = this._plNextFree();
          this._plRefresh();
        }
      }
    } else {
      opp.fleetSent = true;
      opp.started = { restored: true };
      this._restoreBattle(st);
      if (st.phase === 'gameover') { this._restoreGameOver(st, token); return; }
      this._onlineLoop(token);
    }
    if (st.opponentStatus === 'grace') this._onlineStatus({ status: 'grace', ms: st.graceMs });
  }

  /** Bretter, Marker, Schaden, Feuer und versenkte Schiffe so setzen, wie sie nach allen Schüssen aussehen. */
  _restoreBattle(st) {
    const { ui, world, audio, boards } = this.ctx;
    this.state = 'battle';
    this.input.setBoard(null);
    this._ensureFlagships();
    this._placeOwnFleet(st.fleet);
    const pos = (side, c, r) => {
      const v = boards[side].cellToWorld ? boards[side].cellToWorld(c, r, new THREE.Vector3()) : new THREE.Vector3();
      v.y = call(world, 'getWaterHeight', v.x, v.z) || 0;
      return v;
    };

    // Eigene Flotte: Einschläge des Gegners
    const own = this.logic.player, hits = [];
    for (const s of st.received) {
      const r = own.receiveShot(s.col, s.row);
      if (r.result === 'miss') { call(boards.player, 'markMiss', s.col, s.row); continue; }
      call(boards.player, 'markHit', s.col, s.row);
      call(this.ships.player[r.shipIndex], 'damage', r.cellIndex);
      hits.push({ ...s, shipIndex: r.shipIndex, cellIndex: r.cellIndex });
    }
    for (const h of hits) if (!own.ships[h.shipIndex].sunk) this._startFire('player', h.col, h.row, this.ships.player[h.shipIndex], h.cellIndex, pos('player', h.col, h.row));
    own.ships.forEach((s, i) => { if (s && s.sunk) call(this.ships.player[i], 'setVisible', false); }); // liegen bereits am Grund

    // Wissens-Brett: eigene Schüsse und versenkte Gegnerschiffe
    const kb = this.logic.enemy;
    for (const s of st.shots) {
      kb.recordShot(s.col, s.row, s.result !== 'miss');
      call(boards.enemy, s.result === 'miss' ? 'markMiss' : 'markHit', s.col, s.row);
    }
    for (const x of st.sunk) kb.recordSunk(x.index, x.length, x.col, x.row, x.orientation);
    for (const s of st.shots) if (s.result === 'hit' && kb.shipAt(s.col, s.row) < 0) this._startFire('enemy', s.col, s.row, null, -1, pos('enemy', s.col, s.row));

    if (RULES.noTouching) {
      for (const [side, b] of [['player', own], ['enemy', kb]]) b.ships.forEach((s, i) => { if (s && s.sunk) for (const n of b.neighborsOf(i)) call(boards[side], 'markBlocked', n.col, n.row); });
    }

    // Statistik: jeder abgeschlossene Zug endet mit einem Fehlschuss; den laufenden Zug zählt das nächste turn
    const misses = (list) => list.filter((s) => s.result === 'miss').length;
    const [mine, theirs] = [st.stats[st.seat], st.stats[1 - st.seat]];
    this.stats = { shots: mine.shots, hits: mine.hits, turns: misses(st.shots), startedAt: performance.now() - (st.elapsedMs || 0) };
    this.statsEnemy = { shots: theirs.shots, hits: theirs.hits, turns: misses(st.received), startedAt: 0 };
    if (st.over && st.over.reason === 'allSunk') this._statsOf(st.over.winner === st.seat ? 'player' : 'enemy').turns++;

    call(world, 'setMood', 'battle');
    call(audio, 'playMusic', 'battle');
    call(ui, 'showHUD', { foe: this.names.enemy });
    call(ui, 'setTurn', 'enemy', 'Zurück an Bord …');
    this._setView('player', 1.2);
    this._updateUI();
  }

  _restoreGameOver(st, token) {
    const over = st.over;
    if (over.winner === null) {
      this.start({ notice: { title: `${this.names.enemy} hat abgelegt`, text: 'Die Partie ist geplatzt, bevor ein Schuss fiel.' }, page: 'online' });
      return;
    }
    this._gameOver(over.winner === st.seat, token, null, over.reason).catch(ignoreCancel);
  }

  // ------------------------------------------------------------------ Online: Zeiten & Verbindung des Gegners
  _onlinePlacementDeadline(ms, at) {
    const o = this._onl;
    if (!o || o.turn) return;
    o.placeUntil = (at ?? this.clock.now()) + ms;
    o.frozen = false;
    this._onlinePlacementTimer();
  }

  /** Platzierungszeit anzeigen; solange noch platziert wird, ergänzt der Client bei Ablauf selbst. */
  _onlinePlacementTimer() {
    const o = this._onl;
    if (!o || !o.placeUntil || o.frozen) return;
    if (o.placeTimer != null) this.clock.clearTimeout(o.placeTimer);
    const left = Math.max(0, o.placeUntil - this.clock.now());
    o.placeTimer = this.clock.setTimeout(() => { o.placeTimer = null; this._onlinePlacementUp(); }, left);
    call(this.ctx.ui, 'setTimer', { ms: Math.min(TIMES.placementMs, left), warn: this.state === 'placement' });
  }

  /** Platzierungszeit um: fehlende Schiffe zufällig ergänzen, gesetzte bleiben, und bestätigen. */
  _onlinePlacementUp() {
    if (this.mode !== 'online' || this.state !== 'placement') return;
    this._plBoard().completeRandom(LENGTHS, this.rng);
    for (let i = 0; i < FLEET.length; i++) this._plSync(i);
    this._pl.selected = -1;
    call(this.ctx.ui, 'announce', 'Die Zeit ist um – der Rest der Flotte läuft aus!', 'warning');
    this._plConfirm();
  }

  /** Server hat nach Ablauf der Platzierungszeit ergänzt, bevor dieser Client bestätigt hat. */
  _onlineForcedStart() {
    this._plBoard().completeRandom(LENGTHS, this.rng); // wird gleich durch die Flotte des Servers ersetzt
    this._startBattle();
  }

  _onlineTurnTimer() {
    const o = this._onl;
    if (!o || !o.turn) return;
    const left = Math.max(0, o.turnUntil - this.clock.now());
    call(this.ctx.ui, 'setTimer', { ms: Math.min(TIMES.turnMs, left), warn: o.turn === 'player', frozen: o.frozen });
  }

  /** opponentStatus: Gegner getrennt (Schonfrist, Zeiten stehen), zurück, oder nach Spielende abgelegt. */
  _onlineStatus(msg) {
    const { ui } = this.ctx, o = this._onl, foe = this.names.enemy;
    if (!o) return;
    if (msg.status === 'grace') {
      o.frozen = true;
      this._cancelAim();
      if (o.placeTimer != null) { this.clock.clearTimeout(o.placeTimer); o.placeTimer = null; }
      const until = o.turn ? o.turnUntil : o.placeUntil;
      if (until) call(ui, 'setTimer', { ms: Math.min(o.turn ? TIMES.turnMs : TIMES.placementMs, Math.max(0, until - this.clock.now())), frozen: true });
      call(ui, 'setConnection', { text: `${foe} hat die Verbindung verloren`, ms: msg.ms });
    } else if (msg.status === 'back') {
      o.frozen = false; // Restzeit kommt gleich neu (turn bzw. placementDeadline)
      call(ui, 'setConnection', null);
      call(ui, 'announce', `${foe} ist zurück an Bord!`, 'info');
    } else if (msg.status === 'left') {
      call(ui, 'announce', `${foe} hat abgelegt`, 'info');
    }
  }

  /** Online-Fristen und -Anzeigen beenden. */
  _clearOnline() {
    const o = this._onl;
    if (o && o.placeTimer != null) { this.clock.clearTimeout(o.placeTimer); o.placeTimer = null; }
    if (o) o.placeUntil = 0;
    call(this.ctx.ui, 'setTimer', null);
    call(this.ctx.ui, 'setConnection', null);
  }

  // ------------------------------------------------------------------ UI-Status
  _updateUI() {
    const { ui } = this.ctx;
    const viewer = this._viewer();
    const st = (side, hidden) => FLEET.map((f, i) => {
      const s = this.logic[side].ships[i];
      return { name: f.name, length: f.length, hits: s ? (hidden ? (s.sunk ? f.length : 0) : s.hits) : 0, sunk: !!(s && s.sunk) };
    });
    call(ui, 'updateFleetStatus', { player: st(viewer, false), enemy: st(other(viewer), true) });
    const { shots, hits, turns } = this._statsOf(viewer);
    call(ui, 'updateStats', { shots, hits, accuracy: shots ? hits / shots : 0, turn: turns });
  }

  // ------------------------------------------------------------------ Spielende
  /**
   * Spielende vom Server. Bei „alle versenkt“ hat der Client das Ende schon selbst erkannt (die Schüsse kommen
   * vorher an); alle anderen Gründe brechen die laufende Sequenz ab.
   */
  _onlineGameOver(msg) {
    if (msg.reason === 'allSunk' || this.state === 'gameover') return;
    if (msg.winner === null) { // Abbruch während der Platzierung
      this.start({ notice: { title: `${this.names.enemy} hat abgelegt`, text: 'Die Partie ist geplatzt, bevor ein Schuss fiel.' }, page: 'online' });
      return;
    }
    const token = ++this._token;
    if (this._pending) { const p = this._pending; this._pending = null; p.reject(CANCEL); }
    this._pauseMenu = false;
    this._paused = false;
    this.input.enabled = true;
    const { ui, boards } = this.ctx;
    call(ui, 'hidePause');
    call(ui, 'hidePlacement');
    call(boards.player, 'hideGhost');
    call(boards.enemy, 'setHover', 0, 0, null);
    this._gameOver(msg.winner === this.opponent.seat, token, null, msg.reason).catch(ignoreCancel);
  }

  /** winner: Hot-Seat-Seite des Siegers; reason: Online-Grund des Spielendes. */
  async _gameOver(won, token, winner, reason = 'allSunk') {
    const { world, audio, fx, ui, boards } = this.ctx;
    const hs = this.mode === 'hotseat', online = this.mode === 'online';
    this.state = 'gameover';
    this._clearOnline();
    if (online) this._session('clear'); // nach dem Ende gibt es nichts mehr fortzusetzen
    if (hs) this._showShips('all');
    if (this._pauseMenu) { this._pauseMenu = false; this._paused = false; this.input.enabled = true; call(ui, 'hidePause'); }
    this._readyWaiters.splice(0).forEach((r) => r());
    this.input.setBoard(null);
    call(boards.player, 'setActive', false);
    call(boards.enemy, 'setActive', false);
    call(ui, 'setCoordinate', null);
    call(world, 'setMood', won ? 'victory' : 'defeat');
    call(audio, 'playMusic', 'none');
    call(audio, 'play', won ? 'victory' : 'defeat');
    this._setView(hs ? 'overview' : won ? 'victory' : 'defeat', 2.2);
    if (won) {
      call(fx, 'celebrate', BOARD_CENTER.player.clone());
      await this._wait(1.0, token);
      call(fx, 'celebrate', BOARD_CENTER.enemy.clone());
      await this._wait(1.0, token);
    } else {
      await this._wait(2.0, token);
    }
    const { shots, hits, turns, startedAt } = this.stats;
    call(ui, 'hideHUD');
    const durationSec = Math.round((performance.now() - startedAt) / 1000);
    const sum = (st) => ({ shots: st.shots, hits: st.hits, accuracy: st.shots ? st.hits / st.shots : 0, turns: st.turns });
    if (online) winner = won ? 'player' : 'enemy';
    const restart = hs ? () => this._beginHotseat([this.names.player, this.names.enemy])
      : online ? null // Revanche folgt mit Etappe 6
        : () => this._beginPlacement(this.difficulty);
    call(ui, 'showGameOver', {
      won,
      stats: { shots, hits, accuracy: shots ? hits / shots : 0, turns, durationSec },
      ...((hs || online) && {
        winnerName: this.names[winner],
        players: ['player', 'enemy'].map((side) => ({ name: this.names[side], winner: side === winner, ...sum(this._statsOf(side)) })),
      }),
      ...(online && { ...gameOverText(reason, won, this.names.enemy), reason }),
      onRestart: restart,
      onMenu: () => this.start(online ? { page: 'online' } : undefined),
    });
  }

  // ------------------------------------------------------------------ Debug
  _makeDebug() {
    const self = this;
    return {
      get state() { return self.state; },
      get logic() { return self.logic; },
      get stats() { return self.stats; },
      get paused() { return self._paused; },
      /** Zeitskala für interne Wartezeiten (0.1 = 10x schneller). */
      setTimeScale(s) { self._timeScale = s; },
      begin(key = 'normal') { self._beginPlacement(key); },
      get mode() { return self.mode; },
      get names() { return { ...self.names }; },
      /** Seite, deren Sichtschutz gerade offen ist, sonst null. */
      get curtain() { return self._curtain ? self._curtain.side : null; },
      /** Letzter Hot-Seat-Rückblick { side, shots, text }. */
      get review() { return self._hs.review; },
      get turnSide() { return self._turnSide; },
      beginHotseat(names = ['Rotbart', 'Einaugen-Jule']) { self._beginHotseat(names); return self.state; },
      /** „Ich bin <Name> – bereit“ bestätigen. */
      readyCurtain() { const side = this.curtain; self._curtainReady(); return side; },
      autoPlace() { self._plRandom(); return self.state; },
      confirm() { self._plConfirm(); return self.state; },
      /** Menü -> Platzierung -> Kampf (Schiffe zufällig). */
      quickStart(key = 'normal') { self._beginPlacement(key); self._plRandom(); self._plConfirm(); return self.state; },
      /** Resolve, sobald der Spieler schießen darf oder das Spiel zu Ende ist. */
      ready(timeoutMs = 60000) {
        return new Promise((resolve) => {
          if (self._pending || self._curtain || self.state === 'gameover') { resolve(self.state); return; }
          const t = setTimeout(() => resolve('timeout'), timeoutMs);
          self._readyWaiters.push(() => { clearTimeout(t); resolve(self.state); });
        });
      },
      /** Schießt als Spieler auf (col,row). */
      fire(col, row) {
        if (!self._pending) return false;
        self._onSelect({ col, row });
        return true;
      },
      /** mode: 'hit' = nächste unbeschossene Gegner-Schiffszelle, 'miss' = Wasserzelle, 'random'. */
      async autoFire(mode = 'random') {
        await this.ready();
        if (!self._pending) return null;
        const known = self.logic[self._aim], truth = self.mode === 'hotseat' ? known : self.opponent && self.opponent.board, cand = [];
        for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
          if (known.wasShot(c, r)) continue;
          const isShip = truth ? truth.shipAt(c, r) >= 0 : false;
          if (mode === 'hit' ? isShip : mode === 'miss' ? !isShip : true) cand.push([c, r]);
        }
        if (!cand.length) return null;
        const [c, r] = cand[Math.floor(Math.random() * cand.length)];
        self._onSelect({ col: c, row: r });
        return { col: c, row: r };
      },
      /** n Spielerzüge automatisch (Muster z. B. ['miss','hit','random']); danach Status. */
      async simulate(n = 5, pattern = ['random']) {
        for (let i = 0; i < n && self.state === 'battle'; i++) {
          await this.autoFire(pattern[i % pattern.length]);
          await new Promise((r) => setTimeout(r, 30));
        }
        return this.status();
      },
      /** Spielt bis zum Ende (mode 'random' oder 'hit' für schnellen Sieg). */
      async playToEnd(mode = 'random', maxShots = 300) {
        for (let i = 0; i < maxShots && self.state !== 'gameover'; i++) {
          const r = await this.autoFire(mode);
          if (!r && self.state !== 'gameover') await new Promise((res) => setTimeout(res, 50));
        }
        return this.status();
      },
      status() {
        return { state: self.state, mode: self.mode, difficulty: self.difficulty, stats: { ...self.stats }, fires: self._fires.length, pending: !!self._pending, curtain: this.curtain };
      },
    };
  }
}
