// Vite-Plugin für die Entwicklung: startet den Spielserver im selben Prozess wie `npm run dev`.
// Er lauscht nur auf 127.0.0.1 und ist ausschließlich über den Vite-Proxy (/ws, /health) erreichbar –
// darum darf er jede Herkunft annehmen (auch Handys im LAN, die die Seite über die LAN-IP öffnen).
// Läuft auf dem Port schon ein Server (z. B. `npm run server`), wird dieser genutzt.
export const DEV_SERVER_PORT = Number(process.env.GAME_SERVER_PORT) || 8787;

/** Vite lädt die Konfiguration bei Änderungen neu; der Server soll trotzdem nur einmal pro Prozess laufen. */
const KEY = Symbol.for('freibeuter.devHarbor');

export function devHarbor() {
  return {
    name: 'freibeuter-dev-harbor',
    apply: 'serve',
    async configureServer(vite) {
      if (globalThis[KEY]) return;
      const log = vite.config.logger;
      try {
        // erst hier laden, damit `vite build` weder Server-Kern noch ws anfasst
        const { createGameServer } = await import('./GameServer.js');
        const { realClock, cryptoRng } = await import('./runtime.js');
        const { startServer } = await import('./wsAdapter.js');
        const core = createGameServer({ clock: realClock, rng: cryptoRng });
        await startServer({ core, port: DEV_SERVER_PORT, host: '127.0.0.1', allowedOrigins: ['*'] });
        globalThis[KEY] = true;
        log.info(`  ⚓ Hafen (Spielserver) läuft auf 127.0.0.1:${DEV_SERVER_PORT}, erreichbar über /ws`);
      } catch (e) {
        if (e.code === 'EADDRINUSE') { globalThis[KEY] = true; log.info(`  ⚓ Port ${DEV_SERVER_PORT} ist belegt – nutze den laufenden Spielserver.`); }
        else log.error(`  ⚓ Spielserver konnte nicht starten: ${e.message}`);
      }
    },
  };
}
