// Einstiegspunkt: verdrahtet alle Module. Gehört dem Integrator.
import { Engine } from './core/Engine.js';
import { World } from './world/World.js';
import { BoardView } from './board/BoardView.js';
import { ShipFactory } from './ships/ShipFactory.js';
import { Effects } from './fx/Effects.js';
import { CameraRig } from './fx/CameraRig.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { UI } from './ui/UI.js';
import { GameController } from './game/GameController.js';
import { openWebSocket } from './net/WebSocketTransport.js';
import { serverWsUrl, takeJoinCode } from './net/link.js';

async function boot() {
  const engine = new Engine(document.getElementById('app'));
  const audio = new AudioEngine();
  const ui = new UI(document.getElementById('ui-root'), { audio, engine });
  ui.showLoading(0.05);

  const world = new World(engine);
  ui.showLoading(0.35);
  await nextFrame();

  const boards = {
    player: new BoardView(engine, world, 'player'),
    enemy: new BoardView(engine, world, 'enemy'),
  };
  const shipFactory = new ShipFactory(engine, world);
  ui.showLoading(0.6);
  await nextFrame();

  const fx = new Effects(engine, world);
  const cameraRig = new CameraRig(engine);
  ui.showLoading(0.8);
  await nextFrame();

  // Online: Spielserver unter VITE_SERVER_URL bzw. im Dev über den Vite-Proxy (/ws) auf demselben Host.
  const net = { connect: () => openWebSocket(serverWsUrl(import.meta.env.VITE_SERVER_URL)) };
  const join = takeJoinCode(); // Einladungslink ?join=CODE – sofort aus der Adresse entfernen
  const controller = new GameController({ engine, world, boards, shipFactory, fx, cameraRig, audio, ui, net });

  engine.precompile();
  ui.showLoading(1);
  await nextFrame();
  engine.start();
  ui.hideLoading();
  controller.start(join ? { join } : undefined);

  if (import.meta.env.DEV) window.__game = { engine, world, boards, shipFactory, fx, cameraRig, audio, ui, controller };
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

boot().catch((err) => {
  console.error(err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;margin:0;padding:24px;color:#f4e4c1;background:#1a0f08;font:14px monospace;white-space:pre-wrap;z-index:99999';
  el.textContent = 'Fehler beim Start:\n\n' + (err && err.stack ? err.stack : String(err));
  document.body.appendChild(el);
});
