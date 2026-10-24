# Freibeuter – Schiffe versenken (Architektur & Schnittstellen-Vertrag)

Piraten-Schiffe-versenken in AAA-Optik. **Nur `three` (inkl. `three/addons/...` aus demselben Paket) und `vite`.**
Keine weiteren Libraries, keine externen Assets (keine Bilder, Sounds, Fonts, CDNs). Alle Texturen werden
prozedural erzeugt (Canvas2D / Shader / DataTexture), alle Sounds per WebAudio synthetisiert.
Fonts: nur System-Fonts (z. B. `Georgia, 'Times New Roman', serif`, `'Palatino Linotype', Palatino`).

Sprache im Spiel: **Deutsch**. Code-Kommentare: Deutsch oder Englisch, knapp.

## Performance-Budget (Pflicht – 60 fps auch auf schwachen Geräten)
- Keine Shadow-Maps. Keine Post-Processing-Ketten (kein EffectComposer). Licht: 1 Hemisphere + 1 Directional (World).
- Draw-Calls gesamt < 150 (high), Dreiecke < 400k (high) / < 150k (low).
- **Keine Allokationen pro Frame** in `update`-Funktionen (Vektoren vorab anlegen, wiederverwenden).
- Partikel/Marker: `InstancedMesh` oder ein einzelnes `Points`/`BufferGeometry` mit eigenem Shader, gepoolt.
- Geometrie zusammenführen (`BufferGeometryUtils.mergeGeometries` aus `three/addons/utils/BufferGeometryUtils.js` erlaubt).
- Texturen klein halten (≤ 1024², meist 256–512), wiederverwenden, Mipmaps an.
- `engine.quality` respektieren (siehe `src/config.js` → `QUALITY_PRESETS`: `detail`, `particleScale`, `oceanSegments`, `clouds`, `birds`).
- Transparente Objekte sparsam; `depthWrite:false` bei additiven Partikeln.
- Shader-Programme möglichst teilen (gleiche Materialinstanzen wiederverwenden).

## Koordinatensystem
- y = oben, Wasserspiegel y = 0 (Wellen ±~0.6).
- Zwei Spielfelder 10×10, Zellgröße `CELL = 2`. Mittelpunkte: `BOARD_CENTER.player = (-12,0,0)`, `BOARD_CENTER.enemy = (12,0,0)`.
- Zelle `(col,row)`: `col` 0..9 entlang +x (Beschriftung 1–10), `row` 0..9 entlang +z (Beschriftung A–J).
  Weltmitte einer Zelle: `x = center.x + (col - 4.5) * CELL`, `z = center.z + (row - 4.5) * CELL`.
- Ausrichtung `'h'`: Schiff belegt `(col+i, row)`; `'v'`: `(col, row+i)`. Bug/Vorderseite zeigt zur Zelle mit Index 0... egal, aber konsistent.
- Kamera blickt im Normalfall von +z (Süden) schräg nach unten Richtung -z.
- Flaggschiffe (Deko, feuern die Kanonen): `FLAGSHIP_POSITION.player = (-34,0,2)`, `.enemy = (34,0,2)`.
- Wellen: `src/world/waves.js` → `getWaveHeight(x,z,t)`, `getWaveNormal(x,z,t,target)`, `WAVES_GLSL` (gerstnerDisplace/gerstnerHeight). Zeit = `engine.time`.

## Gemeinsame Kern-Dateien (gehören dem Integrator, NICHT verändern)
`index.html`, `vite.config.js`, `package.json`, `src/main.js`, `src/config.js`, `src/core/Engine.js`,
`src/core/EventBus.js`, `src/core/noise.js`, `src/world/waves.js`, diese Datei.
Wer eine Änderung daran braucht, implementiert lokal einen Workaround und meldet den Wunsch im Abschlussbericht.

### Engine (`src/core/Engine.js`)
- `engine.scene`, `engine.camera` (PerspectiveCamera, fov 45), `engine.renderer`, `engine.time`, `engine.delta`
- `engine.onUpdate(fn(dt, time), priority=0) → unsubscribe` – jedes Modul registriert seine Updates selbst.
  Prioritäten: World 0, Schiffe/Board 10, FX 20, CameraRig 90 (zuletzt, nach allem anderen).
- `engine.onResize(fn(w,h,aspect)) → unsubscribe`
- `engine.quality` (Preset-Objekt), `engine.qualityName`, `engine.setQuality(name)` (emittiert `bus 'quality'`)
- `engine.width`, `engine.height`, `engine.pixelRatio`. URL `?fps` zeigt FPS-Anzeige, `?quality=low|medium|high` erzwingt Stufe.
### EventBus (`src/core/EventBus.js`): `bus.on(type, fn) → off`, `bus.emit(type, payload)`.
### Noise (`src/core/noise.js`): `createRng(seed)`, `valueNoise2D`, `fbm2D`, `NOISE_GLSL` (hash12, vnoise, fbm).

---

## Modul A – Welt (`src/world/`, Agent „World“)
Datei-Eigentum: `src/world/*` außer `waves.js`.
```js
const world = new World(engine);
world.ocean            // Ocean-Instanz
world.sunDirection     // THREE.Vector3 (normiert, zeigt ZUR Sonne)
world.sunColor         // THREE.Color
world.getWaterHeight(x, z) // = getWaveHeight(x, z, engine.time)
world.setMood(name)    // optional: 'menu' | 'battle' | 'victory' | 'defeat' – sanfte Licht/Farb-Übergänge
```
Inhalt: Ozean-Shader (Gerstner aus `waves.js`, Fresnel, Himmelsreflexion, Sonnenglanz, Subsurface-Farbe,
Schaum an Wellenkämmen, Distanznebel/Horizont-Übergang), Himmelskuppel (Verlauf, Sonne, Wolken via Shader),
Licht (Hemisphere + Directional, **keine Schatten**), `scene.environment` per PMREM aus Himmel (einmalig),
`scene.fog` passend zum Horizont, Inseln mit Palmen/Felsen/Fort in der Ferne, Möwen (instanziert),
treibende Fässer/Kisten. Stimmung: Goldene Stunde / dramatischer Abendhimmel.
Spielfelder liegen bei x∈[-22,22], z∈[-10,10] – dort keine Deko; Flaggschiffe bei x=±34.

## Modul B – Schiffe & Spielfeld-Darstellung (`src/ships/`, `src/board/`, Agent „Ships“)
```js
const board = new BoardView(engine, world, 'player' | 'enemy');
board.side, board.center                       // Vector3
board.cellToWorld(col, row, target = new Vector3()) → Vector3   // y = 0
board.worldToCell(point) → { col, row } | null                  // point auf y=0-Ebene
board.setHover(col, row, mode)   // mode: 'aim' | 'invalid' | null (ausblenden)
board.showGhost(length, col, row, orientation, valid)  // Platzierungsvorschau
board.hideGhost()
board.markMiss(col, row)         // Fehlschuss-Marker (z. B. Boje + Wasserring)
board.markHit(col, row)          // Treffer-Marker (z. B. brennendes Wrackteil/rote Markierung)
board.markBlocked(col, row)      // dezente Markierung „hier kann nichts sein“ (Nachbarn versenkter Schiffe)
board.setActive(bool)            // aktuelles Zielbrett hervorheben (Rahmen leuchtet)
board.setLabelsVisible(bool)
board.clearMarkers()
```
Brett-Optik: auf dem Wasser schwimmendes Gitter (Vertex-Shader mit `WAVES_GLSL`, damit es mit den Wellen geht),
Seil/Holz-Rahmen mit Bojen an den Ecken, Beschriftung A–J / 1–10 (Canvas-Textur), Spieler- und Gegnerbrett farblich unterscheidbar.

```js
const factory = new ShipFactory(engine, world);
const ship = factory.createShip(length, side)   // side: 'player' | 'enemy'
ship.object3D
ship.length
ship.place(board, col, row, orientation)        // positioniert & dreht auf Zellen
ship.setVisible(bool)
ship.damage(index)                              // Zellenindex 0..length-1: sichtbarer Schaden (verkohlt, Löcher)
ship.getCellWorldPosition(index, target) → Vector3  // Weltpos (inkl. Wellenhöhe) für Feuer-FX
ship.sink() → Promise                           // Untergangsanimation (~3 s), danach unsichtbar/unter Wasser
ship.reset()                                    // Schaden entfernen, wieder schwimmfähig
ship.dispose()                                  // aus Szene entfernen, Update abmelden
const flagship = factory.createFlagship(side)   // dekorativ, großes Schiff an FLAGSHIP_POSITION[side]
flagship.getCannonPosition(targetVec3, out) → Vector3 // Mündung der Kanone, die zum Ziel zeigt
flagship.fireRecoil()                           // kurze Rückstoß-Animation
```
Schiffe: Low-Poly-aber-detailliert, prozedural: Rumpf mit Planken (Canvas-Holztextur), Deck, Heckkastell,
Masten nach Größe (5→3 Masten, 4→2–3, 3→2, 2→1), Segel mit Wind-Animation (Vertex-Shader), Spieler: helle Segel
mit Wappen; Gegner: schwarze Segel mit Totenkopf. Flaggen, Kanonen, Laternen. Schiffe schaukeln mit den Wellen
(`getWaveHeight`/`getWaveNormal`). Pro Schiff wenige Draw-Calls (Geometrie mergen, Materialien teilen).

## Modul C – Effekte & Kamera (`src/fx/`, Agent „FX“)
```js
const fx = new Effects(engine, world);
fx.fireCannon(from, to, { flightTime }) → Promise   // Mündungsfeuer + Rauch + Kugel im Bogen; resolve beim Einschlag
fx.splash(pos)                         // Fehlschuss: Wasserfontäne, Gischt, Ring
fx.explosion(pos, scale = 1)           // Treffer: Feuerball, Funken, Holzsplitter, Rauch
fx.startFire(pos, scale = 1) → { stop(), setPosition(v) }   // dauerhaftes Feuer+Rauch (gebudgetet, gepoolt)
fx.sinkEffect(pos, length, orientation)   // Blasen, Schaumteppich, Treibgut
fx.celebrate(pos)                      // Sieg: Feuerwerk / Goldmünzen
fx.clearAll()                          // alle laufenden/persistenten Effekte entfernen (Neustart)

const cameraRig = new CameraRig(engine);
cameraRig.setView(name, duration = 1.6) → Promise
  // 'menu' (langsamer Orbit über die Szene), 'placement' (Spielerbrett nah), 'player' (Spielerbrett),
  // 'enemy' (Gegnerbrett zum Zielen), 'overview' (beide Bretter), 'victory', 'defeat'
cameraRig.shake(strength = 1)           // abklingendes Kamerawackeln
cameraRig.setPointerParallax(nx, ny)    // -1..1, leichte Parallaxe durch Maus
```
Kamera-Views müssen das 20×20-Brett in Hoch- **und** Querformat vollständig zeigen (Abstand an Aspect anpassen).
Easing-Übergänge (keine Sprünge). Partikel: eigenes Shader-Partikelsystem (Soft-Sprites aus prozeduraler Textur),
gepoolt, `particleScale` respektieren.

## Modul D – Audio & UI (`src/audio/`, `src/ui/`, Agent „AudioUI“)
```js
const audio = new AudioEngine();
audio.unlock()            // beim ersten User-Gesture (UI ruft auf); bis dahin sind alle Aufrufe No-Ops
audio.play(name, { x = 0, volume = 1, pitch = 1 } = {})
  // names: 'cannon','cannonFar','whistle','splash','explosion','woodHit','sink','bubbles',
  //        'click','hover','place','rotate','error','victory','defeat','bell','coins'
  // x = Welt-x → Stereo-Panning (x/40 geklemmt)
audio.startAmbience()     // Meeresrauschen, Wind, Holzknarren, Möwen (Loop, prozedural)
audio.playMusic(name)     // 'menu' | 'battle' | 'none' – prozedurale Seemannslied-Musik, weiches Überblenden
audio.setVolume(channel, v)  // channel: 'master' | 'music' | 'sfx', v 0..1 (in localStorage merken)
audio.getVolume(channel)
```
```js
const ui = new UI(rootElement, { audio, engine })  // HTML/CSS-Overlay, root hat pointer-events:none → eigene Elemente auf auto
ui.showLoading(progress 0..1) / ui.hideLoading()
ui.showMainMenu({ onStart(difficultyKey) })   // 'easy'|'normal'|'hard' (DIFFICULTIES aus config), Titel „Freibeuter“
ui.hideMainMenu()
ui.showPlacement({ fleet, onSelectShip(index), onRotate(), onRandom(), onClear(), onConfirm() })
ui.updatePlacement({ placed: boolean[], selectedIndex, orientation: 'h'|'v', canConfirm })
ui.hidePlacement()
ui.showHUD() / ui.hideHUD()
ui.setTurn('player' | 'enemy')
ui.updateFleetStatus({ player: [{ name, length, hits, sunk }], enemy: [{ name, length, hits, sunk }] })
   // Gegner: hits nur bekannt, wenn versenkt → Controller übergibt hits=0 bzw. =length wenn sunk
ui.updateStats({ shots, hits, accuracy /*0..1*/, turn })
ui.announce(text, kind = 'info')  // kind: 'hit'|'miss'|'sunk'|'info'|'turn'|'warning' – großes animiertes Banner
ui.setCoordinate(label | null)    // z. B. "B7" am Zielcursor / in der Ecke
ui.showGameOver({ won, stats: { shots, hits, accuracy, turns, durationSec }, onRestart(), onMenu() })
ui.hideGameOver()
ui.showPause({ onResume(), onMenu() }) / ui.hidePause()
ui.onPauseRequested = null        // vom Controller gesetzt; UI ruft es bei Pause-Button / ESC
```
UI-Stil: Pergament, Holz, Messing, Seil, Wachssiegel, Totenkopf – alles per CSS-Gradients/SVG-inline/Canvas erzeugt.
Responsive (Handy hoch/quer), Touch-tauglich (Buttons ≥ 44 px). Einstellungen (Lautstärken, Qualität → `engine.setQuality`)
im Hauptmenü und Pausemenü. UI spielt Klick/Hover-Sounds selbst. Bei erster Interaktion `audio.unlock()` +
`audio.startAmbience()`.

## Modul E – Spiellogik, KI, Steuerung (`src/game/`, Agent „Game“)
```js
const controller = new GameController({ engine, world, boards, shipFactory, fx, cameraRig, audio, ui });
controller.start()   // → Hauptmenü
```
Dateien: `Board.js` (reine Logik: Platzierung, Berührungsregel, Schüsse, Versenkt-Erkennung, Zufallsplatzierung),
`AI.js` (easy: zufällig mit leichter Logik; normal: Hunt/Target; hard: Wahrscheinlichkeitsdichte-Karte, beachtet
`RULES.noTouching`), `Input.js` (Pointer/Touch/Tastatur, Raycast auf y=0-Ebene → `board.worldToCell`;
Touch: erster Tap zielt, zweiter Tap auf gleiche Zelle feuert; Taste R = drehen, ESC = Pause),
`GameController.js` (Zustandsautomat MENU → PLACEMENT → BATTLE (PLAYER_TURN/ENEMY_TURN) → GAMEOVER,
Inszenierung: Kamerafahrten, Schuss-Sequenzen mit `await fx.fireCannon(...)`, Sounds, Banner, Gegner-Schiffe
werden erst beim Versenken sichtbar und gehen dann unter). Regeln aus `RULES` / `FLEET` in `config.js`.
Unit-testbare reine Logik (Board, AI) ohne three.js-Abhängigkeit.

### Ablauf einer Runde (Referenz)
1. Spieler zielt (Hover → `boards.enemy.setHover`, `ui.setCoordinate`), klickt.
2. `flagship.player.fireRecoil()`, `audio.play('cannon')`, `cameraRig.shake(0.4)`, `await fx.fireCannon(muzzle, target)`.
3. Ergebnis: Miss → `fx.splash`, `audio.play('splash')`, `boards.enemy.markMiss`, Banner „Daneben!“.
   Hit → `fx.explosion`, `fx.startFire`, `audio.play('explosion')`, `markHit`, Banner „Treffer!“.
   Versenkt → Gegner-Schiff sichtbar, `ship.sink()`, `fx.sinkEffect`, `audio.play('sink')`, Banner „<Name> versenkt!“,
   Nachbarzellen `markBlocked` (bei noTouching).
4. Bei Treffer erneut schießen (`RULES.shootAgainOnHit`), sonst Gegnerzug (Kamera → 'player', KI denkt 0.6–1.2 s).
5. Sieg/Niederlage → `cameraRig.setView('victory'|'defeat')`, `fx.celebrate`, Musik, `ui.showGameOver`.
