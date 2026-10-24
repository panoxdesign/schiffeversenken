// Testseite für Audio + UI. window.showScreen(name), window.snd(name), window.audioSelfTest().
import { AudioEngine } from '../src/audio/AudioEngine.js';
import { UI } from '../src/ui/UI.js';
import { FLEET } from '../src/config.js';
import { runAudioSelfTest } from '../src/audio/selftest.js';

const audio = new AudioEngine();
const engine = { qualityName: 'high', setQuality(n) { this.qualityName = n; console.log('[quality]', n); } };
const ui = new UI(document.getElementById('ui-root'), { audio, engine });
Object.assign(window, { audio, ui, engine });

const fleetState = () => ({
  player: FLEET.map((s, i) => ({ name: s.name, length: s.length, hits: i === 1 ? 2 : 0, sunk: i === 4 })),
  enemy: FLEET.map((s, i) => ({ name: s.name, length: s.length, hits: i === 2 ? s.length : 0, sunk: i === 2 })),
});
const hideAll = () => { ui.hideMainMenu(); ui.hidePlacement(); ui.hideHUD(); ui.hideGameOver(); ui.hidePause(); ui.hideLoading(); ui.hideSettings(); ui.hideHelp(); };
window.showScreen = (name) => {
  hideAll();
  if (name === 'loading') ui.showLoading(0.62);
  else if (name === 'menu') ui.showMainMenu({ onStart: (d) => { console.log('[start]', d); window.showScreen('placement'); } });
  else if (name === 'placement') {
    ui.showPlacement({ fleet: FLEET, onSelectShip: (i) => ui.updatePlacement({ placed: [true, true, false, false, false], selectedIndex: i, orientation: 'h', canConfirm: false }),
      onRotate() {}, onRandom() { ui.updatePlacement({ placed: FLEET.map(() => true), selectedIndex: -1, orientation: 'v', canConfirm: true }); }, onClear() {}, onConfirm() { window.showScreen('hud'); } });
    ui.updatePlacement({ placed: [true, true, false, false, false], selectedIndex: 2, orientation: 'h', canConfirm: false });
  } else if (name === 'placement-ready') { window.showScreen('placement'); ui.updatePlacement({ placed: FLEET.map(() => true), selectedIndex: -1, orientation: 'v', canConfirm: true }); }
  else if (name === 'hud') { ui.showHUD(); ui.setTurn('player'); ui.updateFleetStatus(fleetState()); ui.updateStats({ shots: 14, hits: 6, accuracy: 6 / 14, turn: 5 }); ui.setCoordinate('B7'); }
  else if (name === 'hud-enemy') { window.showScreen('hud'); ui.setTurn('enemy'); }
  else if (name === 'gameover-win') ui.showGameOver({ won: true, stats: { shots: 41, hits: 17, accuracy: 17 / 41, turns: 24, durationSec: 367 }, onRestart: () => window.showScreen('placement'), onMenu: () => window.showScreen('menu') });
  else if (name === 'gameover-lose') ui.showGameOver({ won: false, stats: { shots: 38, hits: 11, accuracy: 11 / 38, turns: 22, durationSec: 312 }, onRestart: () => window.showScreen('placement'), onMenu: () => window.showScreen('menu') });
  else if (name === 'pause') { ui.showHUD(); ui.setTurn('player'); ui.updateFleetStatus(fleetState()); ui.updateStats({ shots: 14, hits: 6, accuracy: 6 / 14, turn: 5 }); ui.showPause({ onResume: () => ui.hidePause(), onMenu: () => window.showScreen('menu') }); }
  else if (name === 'settings') { window.showScreen('menu'); ui.showSettings(); }
  else if (name === 'help') { window.showScreen('menu'); ui.showHelp(); }
};
window.snd = (n, o) => { audio.unlock(); return audio.play(n, o); };
window.music = (n) => { audio.unlock(); audio.playMusic(n); };
window.audioSelfTest = async (o) => { const r = await runAudioSelfTest(o); return r.allOk + '\n' + r.rows.map((x) => JSON.stringify(x)).join('\n'); };
ui.onPauseRequested = () => { console.log('[pauseRequested]'); window.showScreen('pause'); };

// Debug-Leiste
const dbg = document.getElementById('dbg');
const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; dbg.appendChild(b); };
['loading', 'menu', 'placement', 'hud', 'gameover-win', 'gameover-lose', 'pause'].forEach((n) => add(n, () => window.showScreen(n)));
audio.names.forEach((n) => add('♪' + n, () => window.snd(n)));
['menu', 'battle', 'none'].forEach((n) => add('music:' + n, () => window.music(n)));
['hit', 'miss', 'sunk', 'info', 'turn', 'warning'].forEach((k) => add('bn:' + k, () => ui.announce({ hit: 'Treffer!', miss: 'Daneben!', sunk: 'Galeone versenkt!', info: 'Ahoi!', turn: "Dein Zug, Käpt'n!", warning: 'Hier nicht!' }[k], k)));
if (new URLSearchParams(location.search).has('nodbg')) dbg.style.display = 'none';
if (new URLSearchParams(location.search).has('still')) { const s = document.createElement('style'); s.textContent = '.fb *{transition:none!important}'; document.head.appendChild(s); }
