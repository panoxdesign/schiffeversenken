# Freibeuter – Schiffe versenken

Piraten-Schiffe-versenken in 3D, gebaut nur mit **three.js** (Rendering) und **Vite** (Dev-Server/Build).
Alle Grafiken, Texturen, Modelle, Sounds und die Musik werden zur Laufzeit prozedural erzeugt. Es gibt keine externen Assets.

## Starten

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # Produktions-Build nach dist/
npm run preview
```

URL-Parameter:
- `?fps` blendet FPS, Draw-Calls und Dreiecke ein.
- `?quality=low|medium|high` erzwingt eine Grafikstufe. Standard ist automatische Erkennung; die Auflösung passt sich zusätzlich dynamisch an, um 60 fps zu halten.

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
| `tests/` | Logik-Tests: `node --test` |

Schnittstellen und Performance-Budget stehen in `ARCHITECTURE.md`.
