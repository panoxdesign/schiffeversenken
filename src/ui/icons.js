// Inline-SVG-Icons als Strings. Verläufe liegen in einem globalen <defs>-SVG (DEFS_SVG), damit sie
// auch in versteckten Containern funktionieren.
export const DEFS_SVG = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<linearGradient id="fb-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".35" stop-color="#e9bf5c"/><stop offset=".7" stop-color="#b9831f"/><stop offset="1" stop-color="#e6bb55"/></linearGradient>
<linearGradient id="fb-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a34"/><stop offset="1" stop-color="#4a2c16"/></linearGradient>
<linearGradient id="fb-bone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#cdbd96"/></linearGradient>
<radialGradient id="fb-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
</defs></svg>`;

const svg = (vb, body, cls = '') => `<svg class="ic ${cls}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

/** Totenkopf mit gekreuzten Knochen. */
export const skull = (cls = '') => svg('0 0 100 100', `
<g stroke="#1a0f08" stroke-width="3" stroke-linejoin="round" fill="url(#fb-bone)">
 <g><rect x="6" y="66" width="88" height="10" rx="5" transform="rotate(28 50 71)"/><circle cx="12" cy="85" r="6.5"/><circle cx="21" cy="92" r="6.5"/><circle cx="88" cy="50" r="6.5"/><circle cx="79" cy="43" r="6.5"/></g>
 <g><rect x="6" y="66" width="88" height="10" rx="5" transform="rotate(-28 50 71)"/><circle cx="88" cy="85" r="6.5"/><circle cx="79" cy="92" r="6.5"/><circle cx="12" cy="50" r="6.5"/><circle cx="21" cy="43" r="6.5"/></g>
 <path d="M50 6C29 6 17 19 17 36c0 11 5 18 12 23v11c0 3 2 5 5 5h32c3 0 5-2 5-5V59c7-5 12-12 12-23C83 19 71 6 50 6z"/>
</g>
<g fill="#1a0f08"><ellipse cx="38" cy="37" rx="9" ry="10"/><ellipse cx="62" cy="37" rx="9" ry="10"/><path d="M50 47l-6 12h12z"/>
<rect x="37" y="62" width="3.4" height="9" rx="1.5"/><rect x="48.3" y="62" width="3.4" height="9" rx="1.5"/><rect x="59.6" y="62" width="3.4" height="9" rx="1.5"/></g>
<ellipse cx="38" cy="37" rx="3" ry="3.5" fill="#ff6a2a" opacity=".85"/><ellipse cx="62" cy="37" rx="3" ry="3.5" fill="#ff6a2a" opacity=".85"/>`, cls);

/** Steuerrad. */
export const wheel = (cls = '') => {
  let sp = '';
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    sp += `<line x1="${50 + c * 10}" y1="${50 + s * 10}" x2="${50 + c * 38}" y2="${50 + s * 38}" stroke-width="6"/><circle cx="${50 + c * 44}" cy="${50 + s * 44}" r="5.5" stroke-width="2.5"/>`;
  }
  return svg('0 0 100 100', `<g stroke="#2b1a0a" fill="url(#fb-brass)" stroke-linecap="round"><circle cx="50" cy="50" r="30" fill="none" stroke="#2b1a0a" stroke-width="12"/>
<circle cx="50" cy="50" r="30" fill="none" stroke="url(#fb-brass)" stroke-width="7"/>${sp}<circle cx="50" cy="50" r="12" stroke-width="3"/><circle cx="50" cy="50" r="4.5" fill="#2b1a0a" stroke="none"/></g>`, cls);
};

/** Kompassrose. */
export const compass = (cls = '') => {
  const pt = (r, a) => `${50 + Math.sin(a) * r},${50 - Math.cos(a) * r}`;
  let big = '', small = '', ticks = '';
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    big += `<polygon points="${pt(46, a)} ${pt(7, a + Math.PI / 4)} ${pt(10, a)}" fill="url(#fb-brass)" stroke="#2b1a0a" stroke-width="1.2"/><polygon points="${pt(46, a)} ${pt(7, a - Math.PI / 4)} ${pt(10, a)}" fill="#8f5f1b" stroke="#2b1a0a" stroke-width="1.2"/>`;
    const b = a + Math.PI / 4;
    small += `<polygon points="${pt(30, b)} ${pt(6, b + Math.PI / 4)} ${pt(8, b)} ${pt(6, b - Math.PI / 4)}" fill="#c99a3d" stroke="#2b1a0a" stroke-width="1"/>`;
  }
  for (let k = 0; k < 32; k++) { const a = (k * Math.PI) / 16; ticks += `<line x1="${pt(k % 4 ? 46 : 44, a).replace(',', '" y1="')}" x2="${pt(49.5, a).replace(',', '" y2="')}" stroke="#d9b266" stroke-width="${k % 4 ? 0.8 : 1.6}"/>`; }
  return svg('0 0 100 100', `<circle cx="50" cy="50" r="49" fill="#1f130a" stroke="url(#fb-brass)" stroke-width="2.4"/><circle cx="50" cy="50" r="42" fill="none" stroke="#7a5524" stroke-width=".8"/>${ticks}${small}${big}<circle cx="50" cy="50" r="4" fill="url(#fb-brass)" stroke="#2b1a0a" stroke-width="1"/>`, cls);
};

export const anchor = (cls = '') => svg('0 0 100 100', `<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="16" r="8"/><line x1="50" y1="24" x2="50" y2="86"/><line x1="33" y1="38" x2="67" y2="38"/><path d="M16 60c2 20 18 28 34 28s32-8 34-28"/><path d="M8 66l8-8 8 8M92 66l-8-8-8 8"/></g>`, cls);
export const boat = (cls = '') => svg('0 0 100 100', `<g fill="currentColor"><path d="M48 12v50H20z" opacity=".95"/><path d="M54 24v38h26z" opacity=".75"/><path d="M10 68h80c-4 14-14 20-26 20H36C24 88 14 82 10 68z"/><rect x="47" y="8" width="4" height="62"/></g>`, cls);
export const cog = (cls = '') => svg('0 0 100 100', `<g fill="none" stroke="currentColor"><circle cx="50" cy="50" r="30" stroke-width="12" stroke-dasharray="11.8 11.8"/><circle cx="50" cy="50" r="24" stroke-width="9"/><circle cx="50" cy="50" r="9" stroke-width="7"/></g>`, cls);
export const book = (cls = '') => svg('0 0 100 100', `<g fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"><path d="M50 22C40 14 24 14 10 18v62c14-4 30-4 40 4 10-8 26-8 40-4V18C76 14 60 14 50 22z"/><line x1="50" y1="22" x2="50" y2="84"/></g>`, cls);
export const rotate = (cls = '') => svg('0 0 100 100', `<g fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M82 50A32 32 0 1 1 66 22"/><path d="M70 6v20H50"/></g>`, cls);
export const dice = (cls = '') => svg('0 0 100 100', `<rect x="12" y="12" width="76" height="76" rx="14" fill="none" stroke="currentColor" stroke-width="8"/><g fill="currentColor"><circle cx="34" cy="34" r="6.5"/><circle cx="66" cy="34" r="6.5"/><circle cx="50" cy="50" r="6.5"/><circle cx="34" cy="66" r="6.5"/><circle cx="66" cy="66" r="6.5"/></g>`, cls);
export const broom = (cls = '') => svg('0 0 100 100', `<g fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M24 24l52 52M76 24L24 76"/></g>`, cls);
export const check = (cls = '') => svg('0 0 100 100', `<path d="M18 54l22 22 42-48" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`, cls);
export const sabre = (cls = '') => svg('0 0 100 100', `<g stroke-linecap="round" stroke-linejoin="round"><path d="M18 82L78 14c4-5 8 0 5 4-12 22-34 46-58 66z" fill="#d9dde2" stroke="#222" stroke-width="3"/><path d="M12 70l18 18" stroke="url(#fb-brass)" stroke-width="9"/><circle cx="10" cy="92" r="6" fill="url(#fb-brass)" stroke="#222" stroke-width="2"/></g>`, cls);

/** Schatzkiste mit Gold. */
export const chest = (cls = '') => svg('0 0 140 120', `
<circle cx="70" cy="62" r="60" fill="url(#fb-glow)"/>
<g stroke="#1a0f08" stroke-width="3" stroke-linejoin="round">
 <g fill="url(#fb-brass)"><circle cx="40" cy="48" r="9"/><circle cx="56" cy="40" r="9"/><circle cx="72" cy="36" r="9"/><circle cx="88" cy="41" r="9"/><circle cx="102" cy="49" r="9"/><circle cx="48" cy="52" r="8"/><circle cx="80" cy="46" r="8"/><circle cx="95" cy="55" r="8"/><circle cx="64" cy="50" r="8"/></g>
 <path d="M16 62h108v44c0 4-3 7-7 7H23c-4 0-7-3-7-7z" fill="url(#fb-wood)"/>
 <path d="M16 62c0-16 14-24 54-24s54 8 54 24z" fill="#6b4224"/>
 <rect x="14" y="58" width="112" height="9" rx="2" fill="url(#fb-brass)"/>
 <rect x="30" y="38" width="9" height="75" fill="url(#fb-brass)" opacity=".9"/><rect x="101" y="38" width="9" height="75" fill="url(#fb-brass)" opacity=".9"/>
 <rect x="61" y="58" width="18" height="26" rx="3" fill="url(#fb-brass)"/>
</g><circle cx="70" cy="68" r="3.2" fill="#1a0f08"/><rect x="68.6" y="68" width="2.8" height="10" fill="#1a0f08"/>
<g fill="#fff6c0" opacity=".9"><path d="M30 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M112 24l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/></g>`, cls);

export const coin = (cls = '') => svg('0 0 40 40', `<circle cx="20" cy="20" r="17" fill="url(#fb-brass)" stroke="#6b4510" stroke-width="2.5"/><circle cx="20" cy="20" r="11.5" fill="none" stroke="#8a5f1f" stroke-width="1.6"/><path d="M20 12v16M15 17c0-3 10-3 10 0s-10 3-10 6 10 3 10 0" fill="none" stroke="#8a5f1f" stroke-width="2" stroke-linecap="round"/>`, cls);
export const swords = sabre;
