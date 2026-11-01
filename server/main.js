// Startpunkt des Spielservers: `npm run server`.
// Umgebungsvariablen: PORT (Standard 8787), HOST (Standard 0.0.0.0),
// ALLOWED_ORIGINS (kommagetrennt; leer = nur localhost; „*“ = alle).
import { createGameServer } from './GameServer.js';
import { realClock, cryptoRng } from './runtime.js';
import { startServer, parseOrigins } from './wsAdapter.js';

const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || '0.0.0.0';
const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);

const core = createGameServer({ clock: realClock, rng: cryptoRng });
const server = await startServer({ core, port, host, allowedOrigins });

console.log(`⚓ Hafen offen: http://${host}:${server.port}/health · WebSocket /ws`);
console.log(`  Erlaubte Herkunft: ${allowedOrigins ? allowedOrigins.join(', ') : 'nur localhost'}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
