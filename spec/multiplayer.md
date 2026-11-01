# Spec: Multiplayer (Hot-Seat & Online)

Status: bereit zur Umsetzung · Stand: 2026-10-31 · Grundlage: Design-Interview (16 Entscheidungen) in der Session vom 2026-10-31

## Problemstellung

Freibeuter kann man heute nur allein gegen die KI spielen. Wer mit einer anderen Person spielen möchte, hat keine Möglichkeit dazu – weder am selben Gerät noch über das Internet. Gerade ein Spiel wie Schiffe versenken lebt davon, gegen einen Menschen anzutreten: einen Freund herauszufordern, eine Revanche zu fordern oder einfach gegen irgendwen auf See zu treffen.

## Lösung

Das Hauptmenü bietet drei Modi:

- **Gegen die KI** – unverändert wie bisher.
- **Zu zweit an einem Gerät (Hot-Seat)** – zwei Personen spielen abwechselnd an einem Gerät. Ein Sichtschutz zwischen den Zügen verhindert, dass jemand die gegnerische Flotte sieht. Kein Netzwerk nötig.
- **Online** – über einen kleinen Spielserver:
  - **Freund einladen:** Das Spiel erzeugt einen kurzen Code (z. B. `K7QX`) und einen Link. Wer den Link öffnet oder den Code eingibt, landet direkt in derselben Partie.
  - **Zufälliger Gegner:** Man stellt sich in eine Warteschlange und bekommt den nächsten freien Spieler. Ist niemand da, kann man nach 60 Sekunden stattdessen gegen die KI spielen.

Online ist der Server Schiedsrichter: Er kennt beide Flotten, wertet jeden Schuss aus und verrät jedem Browser nur, was dieser wissen darf. Schummeln über den Browser ist damit ausgeschlossen. Verbindungsabbrüche, untätige Gegner, Revanchen und kurze Piratensprüche zwischen den Spielern sind geregelt.

## User Stories

### Hauptmenü & Identität

1. Als Spieler möchte ich im Hauptmenü zwischen „Gegen die KI“, „Zu zweit an einem Gerät“ und „Online“ wählen, damit ich sofort sehe, welche Spielarten es gibt.
2. Als Spieler möchte ich beim ersten Start automatisch einen Piratennamen (z. B. „Käpt'n Rotbart“) erhalten, damit ich ohne Eingabe loslegen kann.
3. Als Spieler möchte ich meinen Namen im Menü ändern oder per Würfel neu erzeugen, damit ich mich so nennen kann, wie ich möchte.
4. Als Spieler möchte ich, dass mein Name über Sitzungen hinweg gespeichert bleibt, damit ich ihn nicht jedes Mal neu eingeben muss.
5. Als Spieler möchte ich, dass Namen auf 16 Zeichen begrenzt sind, damit sie in Bannern und HUD sauber passen.
6. Als Spieler möchte ich im Menü sehen, wie viele Piraten gerade online sind („3 Piraten auf See“), damit ich einschätzen kann, ob sich die Zufallssuche lohnt.
7. Als Spieler möchte ich, dass „Gegen die KI“ weiterhin die Schwierigkeitswahl zeigt und meine letzte Wahl merkt, damit sich für mich als KI-Spieler nichts verschlechtert.
8. Als Spieler möchte ich, während der Server aufwacht, „Hafen erwacht …“ sehen, damit ich verstehe, warum Online kurz nicht sofort bereit ist.
9. Als Spieler möchte ich, dass der Online-Bereich ausgegraut ist und „Hafen nicht erreichbar“ zeigt, wenn der Server nicht antwortet, damit ich nicht ins Leere klicke.
10. Als Spieler möchte ich, dass KI- und Hot-Seat-Modus auch ohne Internet funktionieren, damit ich jederzeit spielen kann.

### Hot-Seat

11. Als Hot-Seat-Spieler möchte ich vor Spielbeginn für beide Personen einen Namen eingeben (oder die Vorschläge übernehmen), damit Banner und Sichtschutz uns persönlich ansprechen.
12. Als Hot-Seat-Spieler 1 möchte ich meine Flotte auf dem linken Brett platzieren, während Spieler 2 wegschaut.
13. Als Hot-Seat-Spieler möchte ich nach jeder Platzierung und jedem Zugwechsel einen Vollbild-Sichtschutz „Gib das Gerät an <Name> – nicht hinschauen!“ sehen, damit niemand versehentlich die andere Flotte sieht.
14. Als Hot-Seat-Spieler möchte ich die Szene erst nach Klick auf „Ich bin <Name> – bereit“ sehen, damit ich das Gerät in Ruhe übernehmen kann.
15. Als Hot-Seat-Spieler 2 möchte ich meine Flotte auf dem rechten Brett platzieren.
16. Als Hot-Seat-Spieler möchte ich, dass durch einen Münzwurf entschieden wird, wer beginnt, und das als Banner sehen („Einaugen-Jule eröffnet das Feuer!“).
17. Als Hot-Seat-Spieler möchte ich nach der Übergabe einen kurzen Rückblick auf meine eigene Flotte sehen, in dem die neuen Einschläge des Gegners aufleuchten, damit ich weiß, was mir passiert ist.
18. Als Hot-Seat-Spieler möchte ich im Rückblick ein Banner lesen wie „Rotbart traf deine Fregatte (B7) und verfehlte bei C4“, damit ich es auch ohne genaues Hinsehen verstehe.
19. Als Hot-Seat-Spieler möchte ich, dass immer nur meine eigenen Schiffe sichtbar sind, während ich am Zug bin.
20. Als Hot-Seat-Spieler möchte ich nach einem Treffer erneut schießen dürfen, ohne dass ein Sichtschutz kommt, so wie in der bestehenden Regel.
21. Als Hot-Seat-Spieler möchte ich am Spielende beide Flotten aufgedeckt sehen und den Namen der siegreichen Person.
22. Als Hot-Seat-Spieler möchte ich am Spielende die Statistik beider Personen nebeneinander sehen (Schüsse, Treffer, Quote).
23. Als Hot-Seat-Spieler möchte ich keine Zeitlimits haben, damit wir in Ruhe spielen können.
24. Als Hot-Seat-Spieler möchte ich das Spiel pausieren können, wie bisher.
25. Als Hot-Seat-Spieler möchte ich, dass bei identischen Namen beide unterscheidbar bleiben, damit der Sichtschutz eindeutig ist.

### Online – Freund einladen

26. Als Gastgeber möchte ich auf „Freund einladen“ klicken und sofort einen 4-stelligen Code groß angezeigt bekommen.
27. Als Gastgeber möchte ich den Einladungslink mit einem Klick kopieren, damit ich ihn in jeden Messenger einfügen kann.
28. Als Gastgeber auf dem Handy möchte ich einen „Teilen“-Button, der das System-Teilen-Menü öffnet, damit ich den Link direkt per WhatsApp & Co. verschicken kann.
29. Als Gastgeber möchte ich sehen, dass ich auf meinen Gast warte, und das Warten jederzeit abbrechen können.
30. Als Gast möchte ich den Link öffnen und automatisch der Partie beitreten, ohne etwas eintippen zu müssen.
31. Als Gast möchte ich beim Öffnen des Links sehen „Du trittst Rotbarts Runde bei …“, damit ich weiß, was passiert.
32. Als Gast möchte ich alternativ im Online-Menü „Code eingeben“ wählen und den Code eintippen, z. B. wenn man ihn mir vorliest.
33. Als Gast möchte ich, dass Groß-/Kleinschreibung beim Code egal ist und verwechselbare Zeichen (0/O, 1/I/L) gar nicht vorkommen.
34. Als Gast möchte ich eine klare Meldung bekommen, wenn ein Code ungültig, abgelaufen oder der Raum voll ist.
35. Als Spieler möchte ich, dass nach dem Beitritt per Link der Code aus der Adresszeile verschwindet, damit ein Neuladen nach dem Spiel mich nicht erneut beitreten lässt.
36. Als Gastgeber möchte ich, dass ein Raum nach 10 Minuten ohne Beitritt automatisch verfällt.

### Online – Zufälliger Gegner

37. Als Spieler möchte ich auf „Zufälliger Gegner“ klicken und in eine Warteschlange kommen, in der der Erste mit dem Nächsten zusammengebracht wird.
38. Als wartender Spieler möchte ich einen Wartebildschirm („Ausschau halten …“) mit laufender Zeit sehen.
39. Als wartender Spieler möchte ich die Suche jederzeit abbrechen können.
40. Als wartender Spieler möchte ich nach 60 Sekunden ohne Gegner gefragt werden, ob ich weiter warten oder gegen die KI spielen will.
41. Als wartender Spieler möchte ich, wenn ich weiter warte, nicht erneut gefragt werden.
42. Als Spieler möchte ich niemals heimlich gegen eine als Mensch getarnte KI spielen.
43. Als Spieler möchte ich „Gegner gefunden!“ sehen, bevor die Platzierung beginnt.

### Online – Partie

44. Als Online-Spieler möchte ich meine Flotte wie gewohnt platzieren und bestätigen.
45. Als Online-Spieler möchte ich nach der Bestätigung „Warte auf <Name> …“ sehen, wenn mein Gegner noch platziert.
46. Als Online-Spieler möchte ich 2 Minuten Zeit für die Platzierung haben und die Restzeit sehen.
47. Als Online-Spieler möchte ich, dass nach Ablauf der Platzierungszeit meine bereits gesetzten Schiffe bleiben und nur die fehlenden zufällig ergänzt werden.
48. Als Online-Spieler möchte ich, dass der Server auslost, wer beginnt, und das als Banner sehen.
49. Als Online-Spieler möchte ich immer auf meinem gewohnten (linken) Brett meine Flotte sehen, unabhängig davon, welchen Platz ich auf dem Server habe.
50. Als Online-Spieler möchte ich schießen und Kanone, Flug, Treffer/Fehlschuss und Versenken genauso inszeniert sehen wie gegen die KI.
51. Als Online-Spieler möchte ich die Schüsse meines Gegners auf meine Flotte genauso inszeniert sehen wie die KI-Schüsse heute.
52. Als Online-Spieler möchte ich, dass ein versenktes gegnerisches Schiff auftaucht und sinkt und die Nachbarfelder als blockiert markiert werden.
53. Als Online-Spieler möchte ich in Bannern den Namen meines Gegners lesen („Rotbart hat deine Galeone versenkt!“).
54. Als Online-Spieler möchte ich pro Schuss 45 Sekunden Zeit haben und die Restzeit als Sanduhr im HUD sehen.
55. Als Online-Spieler möchte ich, dass die Sanduhr in den letzten 10 Sekunden rot pulsiert und tickt.
56. Als Online-Spieler möchte ich, dass die Zugzeit erst startet, wenn die vorherige Schussanimation durch ist.
57. Als Online-Spieler möchte ich, dass bei abgelaufener Zeit automatisch ein Zufallsschuss für mich abgegeben wird, damit das Spiel weitergeht.
58. Als Online-Spieler möchte ich gewinnen, wenn mein Gegner drei Züge in Folge verpasst („Rotbart ist eingeschlafen – Sieg!“).
59. Als Online-Spieler möchte ich, dass ESC/P das Pausenmenü öffnet, wissend, dass das Spiel online weiterläuft.
60. Als Online-Spieler möchte ich im Pausenmenü „Aufgeben“ wählen können, mit Rückfrage.
61. Als Online-Spieler möchte ich, dass „Hauptmenü“ während einer laufenden Partie als Aufgabe zählt und vorher nachgefragt wird.
62. Als Online-Spieler möchte ich am Spielende meine Statistik und die meines Gegners sehen.

### Online – Verbindung

63. Als Online-Spieler möchte ich, dass sich mein Spiel nach einem kurzen Verbindungsabbruch (Funkloch, Bildschirm aus, App-Wechsel) automatisch wieder verbindet.
64. Als Online-Spieler möchte ich nach einem Neuladen der Seite im selben Tab wieder in meine laufende Partie kommen.
65. Als Online-Spieler möchte ich nach dem Wiederverbinden den kompletten Spielstand ohne erneute Animationen sehen (gesunkene Schiffe liegen bereits am Grund).
66. Als Online-Spieler möchte ich sehen, wenn mein Gegner die Verbindung verloren hat, inklusive Countdown der 60-Sekunden-Schonfrist.
67. Als Online-Spieler möchte ich, dass während der Schonfrist das Spiel eingefroren ist und keine Zugzeit abläuft.
68. Als Online-Spieler möchte ich kampflos gewinnen, wenn mein Gegner nicht innerhalb von 60 Sekunden zurückkehrt („Der Feind ist geflohen – Sieg!“).
69. Als Online-Spieler möchte ich, dass ein Verbindungsverlust während der Platzierung ebenfalls 60 Sekunden Schonfrist hat und ich danach zurück ins Menü (bzw. bei Zufallsgegnern in die Warteschlange) komme.
70. Als Online-Spieler möchte ich eine klare Meldung „Verbindung zum Hafen verloren“ bekommen, wenn der Server selbst weg ist (Neustart, Einschlafen), und zurück ins Menü kommen.
71. Als Online-Spieler mit veralteter Seite möchte ich „Eine neue Version liegt im Hafen – bitte neu laden“ mit einem Neu-laden-Button sehen, statt eines kaputten Spiels.
72. Als Spieler mit veralteter Seite möchte ich weiterhin gegen die KI und im Hot-Seat spielen können.
73. Als Spieler möchte ich „Der Hafen ist voll“ sehen, wenn der Server seine Obergrenze erreicht hat.

### Online – Nach dem Spiel

74. Als Online-Spieler möchte ich im Game-Over-Bildschirm „Revanche“ anbieten können.
75. Als herausgeforderter Spieler möchte ich „Rotbart fordert Revanche!“ sehen und annehmen oder ablehnen können.
76. Als Herausforderer möchte ich „Warte auf Antwort …“ sehen, bis mein Gegner reagiert.
77. Als Spieler möchte ich, dass eine angenommene Revanche ohne neuen Code direkt in eine neue Platzierung führt.
78. Als Verlierer möchte ich in der Revanche beginnen dürfen.
79. Als Spieler möchte ich im selben Raum einen laufenden Spielstand über mehrere Partien sehen (z. B. „2 : 1“).
80. Als Spieler möchte ich „Rotbart hat abgelegt“ sehen, wenn mein Gegner geht oder 60 Sekunden nicht auf Revanche reagiert.
81. Als Spieler eines Zufallsmatches möchte ich nach Spielende „Neuer Gegner“ wählen und direkt wieder in die Warteschlange kommen.

### Online – Sprüche

82. Als Online-Spieler möchte ich über ein Symbol im HUD einen von 6–8 vorgefertigten Piratensprüchen senden („Arrr!“, „Glückstreffer!“, „Gut gezielt!“, „Ihr werdet die Fische füttern!“, „Gnade!“, „Gut gespielt“).
83. Als Online-Spieler möchte ich die Sprüche meines Gegners als Sprechblase über seinem Flaggschiff sehen und kurz hören.
84. Als Online-Spieler möchte ich die Sprüche meines Gegners stummschalten können.
85. Als Online-Spieler möchte ich nicht mit Sprüchen zugespammt werden (höchstens einer alle 3 Sekunden).
86. Als Spieler möchte ich keinen freien Chat, damit ich vor Beleidigungen von Fremden geschützt bin.

### Betrieb

87. Als Betreiber möchte ich den Client kostenlos auf Vercel und den Server kostenlos auf Render betreiben.
88. Als Betreiber möchte ich, dass der Client den schlafenden Render-Server beim Öffnen des Hauptmenüs per Ping weckt, damit Spieler selten warten müssen.
89. Als Betreiber möchte ich die erlaubten Herkunfts-Domains, den Port und die Server-URL über Umgebungsvariablen konfigurieren.
90. Als Betreiber möchte ich, dass der Server ungültige, zu große oder zu häufige Nachrichten verwirft und störende Verbindungen trennt.
91. Als Betreiber möchte ich, dass Raum-Codes nicht durch Durchprobieren erraten werden können.
92. Als Entwickler möchte ich lokal mit einem Befehl Client und Server starten und Online im Browser testen können.
93. Als Entwickler möchte ich, dass die Server-Logik ohne Netzwerk und ohne echte Wartezeiten testbar ist.

## Implementierungsentscheidungen

### Architektur

- **Autoritativer Spielserver** in Node.js mit WebSockets. Jeder Client hat genau eine Verbindung zum Server; Clients sprechen nie direkt miteinander.
- **Ein Repo, ein Projekt, eine `package.json`.** Der Server liegt als eigener Ordner im Repo und importiert den gemeinsamen Code per relativem Pfad. Einzige neue Laufzeit-Abhängigkeit ist `ws` – nur serverseitig, nie im Client-Bundle.
- Die Architekturregel „nur three + vite“ gilt weiterhin für den **Client**; der Server darf `ws` nutzen. Die Architektur-Doku wird entsprechend präzisiert und um das Modul „Netzwerk“ ergänzt.
- **Hosting:** Client auf Vercel (statisch), Server auf Render Free (ein Node-Prozess, HTTP + WebSocket). Server-URL im Client über eine Vite-Umgebungsvariable; in der Entwicklung leitet der Vite-Dev-Server den WebSocket-Pfad an den lokalen Server weiter.

### Gemeinsamer Code (Shared)

- Ein neuer Shared-Bereich ohne three.js und ohne `ws`, genutzt von Client und Server:
  - **Regeln:** Flotte, Spielregeln, Brettgröße. Wandern aus der bisherigen Client-Konfiguration hierher; die Client-Konfiguration exportiert sie unverändert weiter, damit bestehende Module nichts merken.
  - **Board:** die bestehende, bereits three-freie Spielbrett-Logik (Platzieren, Prüfen, Zufallsplatzierung, Schuss annehmen, Nachbarzellen).
  - **Protokoll:** Nachrichtentypen, Protokollversion, Validierungshelfer.
- Board erhält eine Funktion, die **eine teilweise platzierte Flotte zufällig vervollständigt**, ohne die gesetzten Schiffe zu verändern (für den Platzierungs-Timeout).

### Server

- **Server-Kern ohne Transport-Abhängigkeit:** Lobby und Match kennen kein `ws`. Sie nehmen Verbindungen als abstrakte Gegenstelle mit „senden“ und „Nachricht empfangen/getrennt“ entgegen. **Uhr (Zeit + Timer) und Zufall werden injiziert.** Der HTTP/WebSocket-Einstieg ist nur ein dünner Adapter.
- **Einstieg (Adapter):** HTTP-Endpunkt `/health` (Weck-Ping, liefert auch Spielerzahl), WebSocket unter `/ws`, Origin-Prüfung, Payload-Limit, Heartbeat.
- **Lobby:** Raum-Codes erzeugen und auflösen, Warteschlange, Spielerzähler, Sitzungs-Tokens, Ablauf von Räumen.
- **Match:** eine Instanz pro Raum; hält beide Bretter, Zugrecht, Zugzeit, verpasste Züge, Schonfristen, Statistik, Spielstand, Revanche-Abstimmung.
- **Konfiguration per Umgebungsvariablen:** Port, erlaubte Origins.

### Protokoll (Vertrag)

- JSON-Nachrichten mit Feld `type`. Koordinaten `col`/`row` sind 0-basierte Ganzzahlen 0–9 wie im bestehenden Board.
- `PROTOCOL_VERSION` beginnt bei 1 und wird **nur bei inkompatiblen Änderungen** erhöht. Unbekannte Felder werden von beiden Seiten ignoriert.
- **Client → Server:** `hello` (Version, Name, optional Token), `createRoom`, `joinRoom` (Code), `queue`, `leaveQueue`, `placeFleet` (Liste aus Schiffsindex, col, row, Ausrichtung), `shoot` (col, row), `emote` (Nummer), `rematch` (annehmen/ablehnen bzw. anbieten), `leave`, `resign`.
- **Server → Client:** `welcome` (Token, Spielerzahl), `roomCreated` (Code), `matched` (Gegnername, eigener Platz), `placementDeadline`, `start` (wer beginnt), `shotResult` (Schütze, col, row, Ergebnis `miss|hit|sunk`; bei `sunk` zusätzlich Schiffsindex, Position, Ausrichtung, Länge), `turn` (wer, Deadline), `opponentStatus` (getrennt / Schonfrist bis / zurück), `emote`, `rematchOffer`, `gameOver` (Sieger, Grund `allSunk|resign|timeout|fled|abandoned`, Statistik beider, Spielstand), `state` (kompletter Stand nach Wiederverbinden), `players` (Spielerzahl), `error` (Code: `version|full|roomNotFound|roomFull|roomExpired|rateLimit|invalid`).
- Der Server sendet einem Client **niemals** Positionen nicht versenkter gegnerischer Schiffe.

### Raum-Codes & Einladung

- 4 Zeichen aus einem Alphabet ohne verwechselbare Zeichen (ohne 0, O, 1, I, L) – 31 Zeichen. Eingabe case-insensitiv.
- Link-Format: Client-URL mit Query-Parameter `join=<CODE>`. Der Client wertet ihn beim Start aus, überspringt das Menü und entfernt den Parameter danach per `history.replaceState`.
- Ein Raum fasst genau zwei Spieler, ist einmalig und verfällt nach 10 Minuten ohne Beitritt oder sofort bei Abbruch durch den Gastgeber.

### Zustände (Raum)

```
waiting ──join──► placement ──beide Flotten──► battle ──► gameover
   │                  │                          │            │
 10 min / Abbruch   Schonfrist abgelaufen   Schonfrist /   beide „Revanche“ ──► placement
   ▼                  ▼                     3× Timeout /   Ablehnen / 60 s / Verlassen ──► closed
 closed            closed                   Aufgabe ──► gameover
```

Jeder Platz (Seat) hat den Verbindungszustand `connected → grace (60 s) → gone`. In `grace` sind alle Timer des Matches angehalten.

### Zeiten & Grenzwerte

| Wert | Größe |
|---|---|
| Zugzeit | 45 s pro Schuss, Neustart nach jedem Treffer |
| Animations-Puffer auf die Deadline | 3 s, bei „versenkt“ 5 s |
| Warnphase Sanduhr | letzte 10 s |
| Verpasste Züge bis Niederlage | 3 in Folge (Zähler setzt sich bei eigenem Schuss zurück) |
| Platzierungszeit | 2 min (Client vervollständigt und sendet; Server randomisiert hart nach 2 min + 10 s) |
| Schonfrist Verbindungsabbruch | 60 s |
| Revanche-Antwortzeit | 60 s |
| Raum ohne Beitritt | 10 min |
| KI-Angebot in der Warteschlange | nach 60 s, einmalig |
| Emotes | max. 1 pro 3 s |
| Nachrichtengröße | max. 2 KB |
| Nachrichtenrate | max. 20/s pro Verbindung |
| Falsche Codes | max. 5 pro Minute pro Verbindung |
| Verbindungen gesamt | max. 500 |
| Heartbeat | alle 25 s |
| Wiederverbindungsversuche Client | exponentiell 1 s, 2 s, 4 s … (max. 8 s), bis Schonfrist vorbei |

### Validierung & Missbrauchsschutz

- Jede Nachricht: gültiges JSON, bekannter `type`, Felder typ- und bereichsgeprüft. Flotte: genau die Flotte aus den Regeln, Platzierung über Board geprüft (inkl. Berührungsverbot).
- Name: getrimmt, Steuerzeichen entfernt, max. 16 Zeichen; leerer Name → generierter Piratenname. Client escaped Namen bei der Anzeige.
- Ungültige Nachrichten werden verworfen; wiederholte Verstöße führen zur Trennung.
- Bewusst nicht: IP-basierte Limits, Captchas, Bannlisten, Schimpfwortfilter.

### Client

- **Gegner-Abstraktion im GameController.** Die bisher fest verdrahtete KI und die lokale Auswertung gegnerischer Bretter werden hinter eine Schnittstelle gelegt:
  - Flotte übergeben (wartet ggf. auf den Gegner),
  - eigenen Schuss auflösen lassen (liefert Ergebnis, bei „versenkt“ Schiffsinfo),
  - nächsten gegnerischen Schuss abwarten (liefert Zelle + Ergebnis),
  - Ereignisse (Emote, Gegner getrennt/zurück, Timer, Aufgabe, Spielende).
- Implementierungen: **KI-Gegner** (bisheriges Verhalten: lokales Brett + KI) und **Netz-Gegner** (WebSocket; das gegnerische Brett im Client ist ein reines **Wissens-Brett** aus Schüssen und versenkten Schiffen).
- **Hot-Seat** ist kein Gegner-Objekt, sondern ein eigener Ablaufmodus im Controller: feste Plätze (Spieler 1 links, Spieler 2 rechts), Sichtschutz-Overlay, Umschalten der Schiffssichtbarkeit, gespiegelte Kameraansicht, Rückblick.
- Die **Inszenierung eines Schusses bleibt unverändert**; sie erhält das Ergebnis künftig von außen, statt selbst auszuwerten.
- Lokal ist der eigene Spieler online **immer** die linke Seite (`player`); der Server-Platz wird im Client darauf abgebildet.
- **Transport-Abstraktion** im Client: der Netz-Gegner spricht über eine Gegenstelle mit „senden/empfangen“, real per WebSocket, in Tests per In-Memory-Verbindung zum Server-Kern.
- **Speicher im Browser:** Name in `localStorage` (bestehender Helper); Sitzungs-Token + Raum in `sessionStorage` (pro Tab, überlebt Neuladen).
- **Wiederverbinden:** Bei `state` baut der Client Bretter, Marker, Feuer und gesunkene Schiffe ohne Animation auf.
- Online-Pause: Pausenmenü als Overlay ohne Spielstopp, ergänzt um „Aufgeben“.
- KI- und Hot-Seat-Modus haben keine Zeitlimits und keine Emotes.

### UI & Texte

- Hauptmenü: Name mit Bearbeiten/Würfel oben; drei Modus-Buttons; „Online“ öffnet Untermenü (Freund einladen · Code eingeben · Zufälliger Gegner · zurück); Spielerzähler unten. „Gegen die KI“ führt zur bisherigen Schwierigkeitswahl.
- Neue Bildschirme/Overlays: Namenseingabe Hot-Seat, Sichtschutz, Einladung (Code, Link kopieren, Teilen), Code-Eingabe, Warteschlange, „Warte auf Gegner“, Revanche-Dialog, Verbindungsstatus-Hinweis, Versions-Hinweis.
- HUD online zusätzlich: Gegnername, Sanduhr, Emote-Knopf mit Stummschalten.
- Neue Icons als Inline-SVG im Stil der bestehenden Icons (Globus, zwei Figuren, Sanduhr, Flagge); neuer synthetisierter Tick-Sound.
- Texte auf Deutsch im Piratenton. **Banner mit Namen verwenden keine Pronomen** („Einaugen-Jule eröffnet das Feuer!“), da das Geschlecht frei gewählter Namen unbekannt ist.
- Bei identischen Namen erhält der zweite den Zusatz „II“.

## Testentscheidungen

- **Gute Tests prüfen äußeres Verhalten**: Nachrichten rein → Nachrichten raus; Controller-Aktionen → Spielzustand/Aufrufe an Szene & UI. Keine Tests auf interne Datenstrukturen.
- **Testpunkt 1 – Headless-GameController** (bestehend): Controller mit gemockter Szene/UI/Audio, gesteuert über die Debug-API.
  - KI-Modus verhält sich nach dem Umbau identisch (bestehende Tests bleiben grün).
  - Hot-Seat: Ablauf Platzierung P1 → Sichtschutz → P2 → Sichtschutz → Kampf; Sichtbarkeit der Schiffe je Zug; Rückblick-Daten; Münzwurf; Spielende mit Statistik beider. Die Debug-API wird um Modus-Start und „bereit“-Bestätigung ergänzt.
- **Testpunkt 2 – Protokoll-Schnittstelle des Server-Kerns** (neu): zwei simulierte Clients sprechen per Nachrichten mit dem Kern; Uhr und Zufall injiziert, Timer werden vorgespult.
  - Lobby: Code erzeugen/beitreten, ungültig/abgelaufen/voll, Code-Raten-Limit, Warteschlange, Spielerzähler.
  - Match: Flottenvalidierung, Zugrecht, doppelte Zellen, Treffer → erneut, versenkt mit Schiffsinfo, kein Leak gegnerischer Positionen, Sieg.
  - Zeiten: Zugzeit-Ablauf → Zufallsschuss, 3 Timeouts → Niederlage, Platzierungs-Timeout, Schonfrist → Wiederverbinden mit `state` bzw. kampfloser Sieg, Timer pausiert in Schonfrist, Raumablauf nach 10 min, Revanche-Ablauf.
  - Protokollversion, Payload-/Raten-Limits, ungültige Nachrichten.
  - **End-to-End in einem Prozess:** zwei echte GameController mit Netz-Gegner über In-Memory-Transport gegen einen echten Server-Kern, eine komplette Partie bis Game Over.
- **Ein Smoke-Test** mit echtem `ws` auf zufälligem Port: Verbindung, `hello`/`welcome`, Origin-Ablehnung.
- **Vorbild:** die bestehenden Tests mit `node:test` (Headless-Controller mit Mocks; reine Logiktests von Board/KI mit seedbarem Zufall). Neues Skript `npm test` führt alle aus.
- Nicht automatisiert: 3D-Inszenierung, Optik der UI, Deployment – manuelle Prüfung im Browser.

## Nicht im Umfang

- LAN-Modus (lokal heißt ausschließlich Hot-Seat).
- Accounts, Login, Passwörter, dauerhafte Profile.
- Ranglisten, Elo/Skill-Matching, Spielhistorie über Räume hinweg.
- Persistenz von Partien über Server-Neustarts hinweg (Datenbank).
- Freier Text-Chat, Sprachchat.
- Zuschauer, mehr als zwei Spieler pro Raum, Turniere.
- KI als Mensch getarnt in der Warteschlange.
- Schimpfwortfilter, IP-Limits, Captchas, Bannlisten.
- Zeitlimits in Hot-Seat und gegen die KI.
- Peer-to-Peer (WebRTC), Cloudflare Durable Objects, Serverless-Hosting des Spielservers.

## Weitere Hinweise

### Umsetzungs-Etappen

Jede Etappe ist für sich lauffähig, wird committet und lässt das Spiel nie kaputt. Arbeit auf Branch `feature/multiplayer`. Deployment wird **nach Etappe 4** vorgezogen, damit früh echte Online-Tests möglich sind.

| # | Etappe | Inhalt | Fertig, wenn |
|---|---|---|---|
| 1 | Umbau ohne neue Funktion | Shared-Bereich (Regeln, Board, Protokoll-Gerüst), Gegner-Abstraktion, KI-Gegner, `npm test` | KI-Modus unverändert spielbar, alle bestehenden Tests grün |
| 2 | Hot-Seat | Neues Hauptmenü (3 Modi, Name), Namenseingabe, Sichtschutz, Seitenwechsel, Rückblick, Münzwurf, Statistik beider | Hot-Seat komplett spielbar, Controller-Tests für Hot-Seat grün |
| 3 | Server-Kern | Lobby (Codes), Match, Protokoll, Validierung, injizierte Uhr/Zufall, Adapter `ws` | Protokoll-Tests mit zwei simulierten Clients grün, Server lokal startbar |
| 4 | Online mit Freunden | Netz-Gegner, Transport, Einladen/Code/Link/Teilen, Vite-Proxy | Zwei Browser lokal spielen eine Partie per Code und per Link; E2E-In-Memory-Test grün |
| 4a | Deployment (vorgezogen) | Render-Konfiguration, Client-Umgebungsvariable, Vercel, Weck-Ping, Origins | Partie über das Internet zwischen zwei Geräten |
| 5 | Robustheit | Wiederverbinden + Schonfrist + `state`, Zugzeit + Sanduhr, Platzierungszeit, Aufgeben, Versionsprüfung, Limits, Heartbeat | Abbruch-, Timeout- und Limit-Tests grün; Handy-Bildschirm-aus-Test manuell ok |
| 6 | Zufallsgegner & Extras | Warteschlange, Spielerzähler, KI-Angebot, Revanche, Spielstand, „Neuer Gegner“, Emotes | Alle User Stories erfüllt |
| 7 | Doku | Architektur-Doku (Modul Netzwerk, Protokoll, Regel three/ws), README (Start lokal, Deployment) | Doku entspricht dem Code |

Fortschritt hier abhaken:

- [x] Etappe 1 – Umbau
- [x] Etappe 2 – Hot-Seat
- [x] Etappe 3 – Server-Kern
- [x] Etappe 4 – Online mit Freunden (E2E-In-Memory-Test grün; Partie mit zwei echten Browsern noch manuell prüfen)
- [ ] Etappe 4a – Deployment
- [ ] Etappe 5 – Robustheit
- [ ] Etappe 6 – Zufallsgegner & Extras
- [ ] Etappe 7 – Doku

### Zu prüfen bei der Umsetzung

- **Platzierung auf dem rechten Brett (Hot-Seat P2):** Ghost-Vorschau und Eingabe sind bisher nur für das linke Brett genutzt; prüfen, ob die Brett-Ansicht das rechts ohne Änderungen kann.
- **Schadensdarstellung:** Schiffsschaden wird bisher nur auf der Spielerseite visuell angewendet; im Hot-Seat muss das für beide Seiten gelten.
- **Kameraperspektive Spieler 2:** Die vorhandenen Ansichten blicken von der Spielerseite; prüfen, ob die Ansicht auf das eigene rechte Brett für Spieler 2 gut lesbar ist, ggf. eigene Pose ergänzen.
- **Render Free:** Free-Tier-Bedingungen (Einschlafen nach ca. 15 min, Startzeit) vor dem Deployment auf der aktuellen Preisseite gegenprüfen.

### Diagramme

Architektur-Diagramme (Kommunikation, Abhängigkeiten, Ablauf eines Schusses, Nachrichtenliste): https://claude.ai/artifact/AXdftgnEEyq7UF4E29PwF2
