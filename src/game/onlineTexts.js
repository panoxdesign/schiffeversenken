// Texte für den Online-Modus (Piratenton). Banner mit Namen verwenden keine Pronomen.
import { FLEET } from '../config.js';

/** „Rotbarts“, „Klaus'“ */
export const genitive = (name) => (/[sßxz]$/i.test(name) ? `${name}'` : `${name}s`);

/** „deine Galeone“ / „deinen Schoner“ */
export const yourShip = (index) => `${FLEET[index].id === 'schoner' ? 'deinen' : 'deine'} ${FLEET[index].name}`;

const RETRY = 'Versuch es gleich noch einmal.';

/** Fehlercode (Server oder 'connection'/'unavailable') -> { title, text, reload? } */
export function netErrorText(code) {
  switch (code) {
    case 'version': return { title: 'Eine neue Version liegt im Hafen', text: 'Bitte lade die Seite neu, um online zu spielen.', reload: true };
    case 'full': return { title: 'Der Hafen ist voll', text: `Gerade liegen zu viele Schiffe vor Anker. ${RETRY}` };
    case 'roomNotFound': return { title: 'Unbekannter Code', text: 'Zu diesem Code liegt kein Schiff vor Anker. Prüf den Code noch einmal.' };
    case 'roomExpired': return { title: 'Einladung verfallen', text: 'Dieser Code ist abgelaufen. Lass dir einen neuen geben.' };
    case 'roomFull': return { title: 'Die Runde ist voll', text: "In dieser Runde sind schon zwei Käpt'ns an Bord." };
    case 'rateLimit': return { title: 'Zu viele Versuche', text: 'Warte eine Minute, bevor du den nächsten Code probierst.' };
    case 'badCode': return { title: 'Ungültiger Code', text: 'Ein Code hat 4 Zeichen und enthält kein 0, O, 1, I oder L.' };
    case 'lost': return { title: 'Verbindung zum Hafen verloren', text: `Der Hafen antwortet nicht mehr. ${RETRY}` };
    case 'gone': return { title: 'Verbindung zum Hafen verloren', text: 'Der Hafen kennt deine Partie nicht mehr – vermutlich wurde er neu gestartet.' };
    default: return { title: 'Hafen nicht erreichbar', text: `Der Hafen antwortet gerade nicht. ${RETRY}` };
  }
}

/** Titel und Untertitel des Game-Over-Bildschirms je Grund ({} = Standardtexte). */
export function gameOverText(reason, won, opponent) {
  if (reason === 'allSunk') return {};
  if (!won) {
    if (reason === 'resign') return { title: 'Flagge gestrichen', sub: 'Du hast aufgegeben. Ein echter Pirat kommt wieder!' };
    if (reason === 'timeout') return { title: 'Eingeschlafen!', sub: 'Drei Züge in Folge verpasst – die Partie ist verloren.' };
    return {};
  }
  const sub = 'Kein Schuss mehr nötig – die Beute gehört dir, Käpt\'n!';
  if (reason === 'fled') return { title: 'Der Feind ist geflohen – Sieg!', sub };
  if (reason === 'resign') return { title: `${opponent} hat die Flagge gestrichen – Sieg!`, sub };
  if (reason === 'timeout') return { title: `${opponent} ist eingeschlafen – Sieg!`, sub };
  return { title: 'Sieg!', sub };
}
