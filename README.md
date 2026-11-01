# Freibeuter – Schiffe versenken

Piraten-Schiffe-versenken in 3D, gebaut nur mit **three.js** (Rendering) und **Vite** (Dev-Server/Build).
Alle Grafiken, Texturen, Modelle, Sounds und die Musik werden zur Laufzeit prozedural erzeugt. Es gibt keine externen Assets.

## Starten

```bash
npm install
npm run dev        # http://localhost:5173 – startet auch den Spielserver (Online, über /ws)
npm run build      # Produktions-Build nach dist/
npm run preview
npm run server     # Spielserver einzeln (Port 8787, siehe server/main.js)
```

URL-Parameter:
- `?fps` blendet FPS, Draw-Calls und Dreiecke ein.
- `?join=CODE` tritt direkt einer Online-Runde bei (Einladungslink).
- `?quality=low|medium|high` erzwingt eine Grafikstufe. Standard ist automatische Erkennung; die Auflösung passt sich zusätzlich dynamisch an, um 60 fps zu halten.

## Deployment

Der Client ist statisch und läuft auf **Vercel**, der Spielserver („Hafen“) als Node-Prozess auf **Render** (Free).

**1. Spielserver auf Render**
- In Render „New → Blueprint“ wählen und das Repo verbinden. `render.yaml` legt den Dienst `freibeuter-hafen` an
  (Build `npm ci --omit=dev`, Start `npm run server`, Health-Check `/health`).
- Den Branch wählen, der laufen soll (z. B. `main`).
- Umgebungsvariable `ALLOWED_ORIGINS` = Adresse des Clients, z. B. `https://schiffeversenken.vercel.app`.
  Mehrere Adressen kommagetrennt. Ohne Eintrag nimmt der Server nur `localhost` an. Fehlt die Client-Adresse hier,
  blockiert der Browser den Weck-Ping, und das Menü zeigt „Hafen nicht erreichbar“, obwohl der Server läuft.
- Die Server-Adresse notieren, z. B. `https://freibeuter-hafen.onrender.com`. `…/health` muss `{"ok":true,…}` liefern.

**2. Client auf Vercel**
- Projekt aus dem Repo anlegen (Vite wird erkannt, siehe `vercel.json`).
- Umgebungsvariable `VITE_SERVER_URL` = Server-Adresse aus Schritt 1 (ohne `/ws`). Sie wird beim Build eingebaut,
  nach einer Änderung also neu deployen.
- Die endgültige Client-Adresse muss in `ALLOWED_ORIGINS` auf Render stehen. Vorschau-Deployments haben eigene
  Adressen und werden sonst abgewiesen.

**Hinweise**
- Ein Free-Server auf Render schläft nach einer Weile ohne Verkehr ein und braucht beim ersten Aufruf einige Sekunden
  bis etwa eine Minute. Das Hauptmenü pingt ihn darum schon beim Öffnen und zeigt „Hafen erwacht …“ bzw.
  „Hafen nicht erreichbar“.
- KI und Hot-Seat brauchen keinen Server und funktionieren auch offline.

## Spielregeln
- Spielfeld 10×10. Flotte: Galeone (5), Fregatte (4), Brigg (3), Schoner (3), Schaluppe (2).
- Schiffe dürfen sich nicht berühren, auch nicht diagonal.
- Nach einem Treffer darf man erneut schießen.
- Drei KI-Stufen: Leichtmatrose, Bootsmann, Kapitän (Wahrscheinlichkeitskarte).

## Steuerung
- **Maus:** zielen und klicken. Rechtsklick oder `R`/Leertaste dreht das Schiff beim Platzieren.
- **Touch:** erster Tap zielt, zweiter Tap auf dieselbe Zelle feuert bzw. platziert.
- `ESC`/`P`: Pause.

## Projektstruktur
| Ordner | Inhalt |
|---|---|
| `src/core` | Engine (Renderer, Loop, adaptive Auflösung), EventBus, Noise |
| `src/world` | Ozean-Shader (Gerstner-Wellen), Himmel, Licht, Inseln, Möwen, Treibgut |
| `src/ships`, `src/board` | Prozedurale Piratenschiffe, schwimmendes Spielfeld, Marker |
| `src/fx` | GPU-Partikelsystem (Kanonen, Explosionen, Feuer, Gischt, Feuerwerk), Kamera |
| `src/audio` | WebAudio-Synthese: Effekte, Ambience, prozedurale Seemannsmusik |
| `src/ui` | HTML/CSS-Oberfläche (Menüs, HUD, Banner) |
| `src/game` | Spielregeln, KI, Eingabe, Spielablauf |
| `dev/` | Testseiten der einzelnen Module (z. B. `/dev/ships.html`) |
| `tests/` | Logik-, Controller- und Server-Tests: `npm test` |

Schnittstellen und Performance-Budget stehen in `ARCHITECTURE.md`.
