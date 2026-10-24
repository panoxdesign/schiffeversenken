// Pointer-/Touch-/Tastatur-Eingabe. Raycast auf Ebene y=0 -> BoardView.worldToCell.
// Callbacks: onHover(cell|null), onSelect(cell), onRotate(), onPause()
import * as THREE from 'three';

const MOVE_TOLERANCE = 10; // px zwischen down/up, ab dem es kein Klick mehr ist

export class Input {
  constructor({ engine, cameraRig }) {
    this.engine = engine;
    this.cameraRig = cameraRig;
    this.dom = engine.renderer.domElement;
    this.board = null; // aktives BoardView
    this.enabled = true;
    this.onHover = null;
    this.onSelect = null;
    this.onRotate = null;
    this.onPause = null;

    // vorab angelegt (keine Allokation pro Event)
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();

    this._hoverCol = -1;
    this._hoverRow = -1;
    this._hoverCell = { col: 0, row: 0 };
    this._down = null; // { x, y, id, type, button }
    this._touchAim = { col: -1, row: -1 };

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onCancel = this._onCancel.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this._onKey = this._onKey.bind(this);
    this._onContext = (e) => e.preventDefault();

    const d = this.dom;
    d.addEventListener('pointerdown', this._onDown);
    d.addEventListener('pointermove', this._onMove);
    d.addEventListener('pointerup', this._onUp);
    d.addEventListener('pointercancel', this._onCancel);
    d.addEventListener('pointerleave', this._onLeave);
    d.addEventListener('contextmenu', this._onContext);
    window.addEventListener('keydown', this._onKey);
  }

  /** Setzt das aktive Brett (oder null) und setzt Hover zurück. */
  setBoard(board) {
    this.board = board;
    this.resetHover(true);
  }

  /** Hover-Zustand vergessen (z. B. nach Kamerafahrt); notify=true meldet null. */
  resetHover(notify = false) {
    const had = this._hoverCol >= 0;
    this._hoverCol = -1; this._hoverRow = -1;
    this._touchAim.col = -1; this._touchAim.row = -1;
    if (notify && had && this.onHover) this.onHover(null);
  }

  /** Aktuelle Zelle unter dem Zeiger (neu berechnet, z. B. nach Kamerafahrt). */
  refresh() { this._hoverCol = -1; this._hoverRow = -1; if (this._lastX !== undefined) this._updateHover(this._lastX, this._lastY, false); }

  /** Liefert wiederverwendetes {col,row} oder null. */
  _cellAt(clientX, clientY) {
    if (!this.board) return null;
    const rect = this.dom.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(this._ndc, this.engine.camera);
    if (!this._raycaster.ray.intersectPlane(this._plane, this._hit)) return null;
    const c = this.board.worldToCell(this._hit);
    if (!c) return null;
    this._hoverCell.col = c.col; this._hoverCell.row = c.row;
    return this._hoverCell;
  }

  _updateHover(x, y, fromTouch) {
    this._lastX = x; this._lastY = y;
    const c = this._cellAt(x, y);
    const col = c ? c.col : -1, row = c ? c.row : -1;
    if (col === this._hoverCol && row === this._hoverRow) return;
    this._hoverCol = col; this._hoverRow = row;
    if (this.enabled && this.onHover) this.onHover(c ? { col, row } : null);
  }

  _onDown(e) {
    if (e.pointerType === 'mouse') {
      this._parallax(e);
      if (e.button === 2) { if (this.enabled && this.onRotate) this.onRotate(); return; }
      if (e.button !== 0) return;
    }
    this._down = { x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType };
    try { this.dom.setPointerCapture(e.pointerId); } catch (_) { /* ignorieren */ }
    if (e.pointerType !== 'mouse') this._updateHover(e.clientX, e.clientY, true); // Touch: Ziel folgt dem Finger
  }

  _onMove(e) {
    if (e.pointerType === 'mouse') {
      this._parallax(e);
      this._updateHover(e.clientX, e.clientY, false);
    } else if (this._down && this._down.id === e.pointerId) {
      this._updateHover(e.clientX, e.clientY, true);
    }
  }

  _onUp(e) {
    const d = this._down;
    this._down = null;
    if (!d || d.id !== e.pointerId) return;
    try { this.dom.releasePointerCapture(e.pointerId); } catch (_) { /* ignorieren */ }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (dx * dx + dy * dy > MOVE_TOLERANCE * MOVE_TOLERANCE) return;
    if (!this.enabled) return;
    const c = this._cellAt(e.clientX, e.clientY);
    if (!c) { this._touchAim.col = -1; return; }
    if (d.type === 'mouse') {
      if (this.onSelect) this.onSelect({ col: c.col, row: c.row });
      return;
    }
    // Touch: erster Tap zielt, zweiter Tap auf dieselbe Zelle löst aus
    if (this._touchAim.col === c.col && this._touchAim.row === c.row) {
      this._touchAim.col = -1; this._touchAim.row = -1;
      if (this.onSelect) this.onSelect({ col: c.col, row: c.row });
    } else {
      this._touchAim.col = c.col; this._touchAim.row = c.row;
      this._updateHover(e.clientX, e.clientY, true);
    }
  }

  _onCancel(e) {
    if (this._down && this._down.id === e.pointerId) this._down = null;
  }

  _onLeave(e) {
    if (e.pointerType === 'mouse' && !this._down) {
      this._lastX = undefined;
      this.resetHover(true);
      if (this.cameraRig && this.cameraRig.setPointerParallax) this.cameraRig.setPointerParallax(0, 0);
    }
  }

  _parallax(e) {
    const rig = this.cameraRig;
    if (!rig || !rig.setPointerParallax) return;
    const w = this.engine.width || window.innerWidth, h = this.engine.height || window.innerHeight;
    rig.setPointerParallax((e.clientX / w) * 2 - 1, -((e.clientY / h) * 2 - 1));
  }

  _onKey(e) {
    if (e.repeat && e.code !== 'KeyR' && e.code !== 'Space') return;
    if (e.code === 'KeyR' || e.code === 'Space') {
      if (e.code === 'Space') e.preventDefault();
      if (this.enabled && !e.repeat && this.onRotate) this.onRotate();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!e.repeat && this.onPause) this.onPause();
    }
  }

  dispose() {
    const d = this.dom;
    d.removeEventListener('pointerdown', this._onDown);
    d.removeEventListener('pointermove', this._onMove);
    d.removeEventListener('pointerup', this._onUp);
    d.removeEventListener('pointercancel', this._onCancel);
    d.removeEventListener('pointerleave', this._onLeave);
    d.removeEventListener('contextmenu', this._onContext);
    window.removeEventListener('keydown', this._onKey);
  }
}
