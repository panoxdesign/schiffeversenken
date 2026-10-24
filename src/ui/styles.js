// CSS für das gesamte UI (wird per <style> injiziert). Nur transform/opacity werden animiert.
export const CSS = `
.fb{--ink:#2b1b0e;--parch1:#f6e8c2;--parch2:#e3c88f;--parch3:#b9955c;--wood1:#5a3820;--wood2:#37200f;--wood3:#1c1009;
--brass1:#fbe7a0;--brass2:#dcab4a;--brass3:#8a5f1f;--red:#b3331f;--sea:#4a9bbd;--cream:#f7e9c6;
--serif:'Palatino Linotype','Book Antiqua',Palatino,Georgia,'Times New Roman',serif;
position:absolute;inset:0;overflow:hidden;font-family:var(--serif);color:var(--cream);pointer-events:none;
-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.fb *{box-sizing:border-box}
.fb [hidden]{display:none!important}
.fb .ic{width:1em;height:1em;display:block;flex:none;overflow:visible}
.fb .wheel .ic,.fb .emb .ic,.fb .art .ic,.fb .pw .ic,.fb .ok .ic{width:100%;height:100%}
.fb button{font-family:inherit;color:inherit;pointer-events:auto;touch-action:manipulation}
.fb :focus{outline:none}
.fb :focus-visible{outline:3px solid #ffe08a;outline-offset:2px}
.fb .scr{position:absolute;inset:0;display:flex;opacity:0;transition:opacity .35s ease;pointer-events:none}
.fb .scr.in{opacity:1}

/* ---------- Buttons ---------- */
.fb .btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:44px;padding:0 22px;
border:2px solid var(--brass3);border-radius:9px;cursor:pointer;font-size:17px;font-weight:700;letter-spacing:.03em;color:var(--cream);
background:linear-gradient(#7a4d2b,#4a2c16 55%,#3a2210);text-shadow:0 1px 2px rgba(0,0,0,.7);
box-shadow:inset 0 1px 0 rgba(255,225,160,.35),inset 0 -2px 4px rgba(0,0,0,.35),0 3px 0 #170c05,0 6px 10px rgba(0,0,0,.45);
transition:transform .12s ease;will-change:transform}
.fb .btn::after{content:"";position:absolute;inset:0;border-radius:7px;background:linear-gradient(rgba(255,226,150,.5),rgba(255,226,150,.1));opacity:0;transition:opacity .15s;pointer-events:none}
.fb .btn:hover::after{opacity:.55}
.fb .btn:hover{transform:translateY(-1px)}
.fb .btn:active{transform:translateY(2px);box-shadow:inset 0 1px 0 rgba(255,225,160,.3),0 1px 0 #170c05,0 2px 4px rgba(0,0,0,.4)}
.fb .btn .ic{font-size:1.25em}
.fb .btn.primary{color:#2b1608;font-size:22px;min-height:56px;padding:0 34px;border-color:#6b4510;text-shadow:0 1px 0 rgba(255,244,200,.6);
background:linear-gradient(#fff0b0,#e9bf5c 45%,#c18a26 80%,#e1b350);
box-shadow:inset 0 1px 0 #fff8d8,inset 0 -3px 5px rgba(120,70,10,.45),0 4px 0 #4a2d0a,0 8px 14px rgba(0,0,0,.5)}
.fb .btn.primary::after{background:linear-gradient(rgba(255,255,255,.7),rgba(255,255,255,.1))}
.fb .btn.ghost{background:rgba(30,16,8,.55);border-color:rgba(220,171,74,.65);box-shadow:inset 0 1px 0 rgba(255,225,160,.2),0 3px 8px rgba(0,0,0,.4)}
.fb .btn[disabled],.fb .btn[aria-disabled=true]{opacity:.45;cursor:not-allowed;filter:saturate(.5);transform:none}
.fb .btn[disabled]::after{display:none}
.fb .ibtn{width:48px;height:48px;min-height:48px;padding:0;border-radius:50%;font-size:30px;color:#f1c96a}
.fb .ibtn .ic{font-size:1em;filter:drop-shadow(0 2px 2px rgba(0,0,0,.6))}

/* ---------- Texte ---------- */
.fb .gold{background:linear-gradient(180deg,#fff6cf 0%,#f6d77f 26%,#c88f2c 52%,#f3cf72 72%,#8e5c17 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
-webkit-text-fill-color:transparent;filter:drop-shadow(0 2px 0 #3a2108) drop-shadow(0 5px 8px rgba(0,0,0,.6))}
.fb .parch{position:relative;color:var(--ink);border:2px solid #6e4a1f;border-radius:10px;
background:radial-gradient(ellipse at 20% 15%,rgba(255,250,225,.55),transparent 60%),radial-gradient(ellipse at 85% 90%,rgba(150,100,40,.25),transparent 55%),linear-gradient(rgba(246,232,194,.94),rgba(222,196,142,.94));
box-shadow:inset 0 0 38px rgba(120,76,24,.55),inset 0 0 0 3px rgba(255,240,200,.25),0 12px 30px rgba(0,0,0,.55)}
.fb .wood{color:var(--cream);border:2px solid var(--brass3);border-radius:12px;
background:repeating-linear-gradient(90deg,rgba(0,0,0,.09) 0 2px,transparent 2px 9px),linear-gradient(rgba(84,52,28,.95),rgba(42,24,12,.96));
box-shadow:inset 0 1px 0 rgba(255,220,150,.3),inset 0 0 0 3px rgba(0,0,0,.25),0 10px 24px rgba(0,0,0,.55)}
.fb h2,.fb h3,.fb h4,.fb p{margin:0}

/* ---------- Ladebildschirm ---------- */
.fb-load{z-index:50;align-items:center;justify-content:center;flex-direction:column;gap:18px;pointer-events:auto;transition:opacity .7s ease;opacity:1;
background:radial-gradient(ellipse at 50% 40%,#3b2414 0%,#1d1009 60%,#0b0604 100%)}
.fb-load.out{opacity:0}
.fb-load .wheel{width:min(34vmin,230px);height:min(34vmin,230px);animation:fb-spin 14s linear infinite;filter:drop-shadow(0 8px 14px rgba(0,0,0,.7))}
.fb-load .cap{font-size:clamp(28px,6vmin,46px);font-weight:900;letter-spacing:.14em;text-transform:uppercase}
.fb-load .msg{font-size:clamp(14px,2.4vmin,18px);font-style:italic;color:#d9bf88;min-height:1.4em}
.fb-load .rope{position:relative;width:min(78vw,420px);height:16px;border-radius:9px;background:#120a05;border:2px solid #6b4510;box-shadow:inset 0 2px 5px #000,0 0 0 2px rgba(0,0,0,.4);overflow:hidden}
.fb-load .rope i{position:absolute;inset:0;transform-origin:0 50%;transform:scaleX(0);transition:transform .35s ease-out;
background:repeating-linear-gradient(115deg,#d8b87a 0 6px,#8c6a3a 6px 11px)}
.fb-load .spark{position:absolute;top:50%;left:0;width:0;height:0;transition:transform .35s ease-out;will-change:transform}
.fb-load .spark::before{content:"";position:absolute;left:-13px;top:-13px;width:26px;height:26px;border-radius:50%;background:radial-gradient(#fff6c0 0,#ffb44a 35%,rgba(255,110,30,0) 70%);animation:fb-flick .16s steps(2) infinite}
@keyframes fb-spin{to{transform:rotate(360deg)}}
@keyframes fb-flick{0%{opacity:1;transform:scale(1)}100%{opacity:.7;transform:scale(1.25)}}

/* ---------- Hauptmenü ---------- */
.fb-menu{z-index:20;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,2.2vh,22px);padding:max(12px,env(safe-area-inset-top)) 16px max(12px,env(safe-area-inset-bottom));
background:radial-gradient(ellipse at 50% 46%,rgba(10,6,3,.12) 0%,rgba(10,6,3,.55) 62%,rgba(6,3,2,.82) 100%)}
.fb-menu .logo{display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px}
.fb-menu .emb{width:clamp(56px,11vh,96px);height:clamp(56px,11vh,96px);filter:drop-shadow(0 6px 8px rgba(0,0,0,.7))}
.fb-menu .title{font-size:clamp(46px,min(13.5vw,15vh),124px);line-height:1;font-weight:900;letter-spacing:.07em;text-transform:uppercase;padding:0 .08em}
.fb-menu .sub{display:flex;align-items:center;gap:14px;font-size:clamp(13px,2.5vh,22px);letter-spacing:.42em;text-transform:uppercase;color:#f1d58e;text-shadow:0 2px 6px #000,0 0 14px rgba(0,0,0,.8);padding-left:.42em}
.fb-menu .sub::before,.fb-menu .sub::after{content:"";width:clamp(28px,8vw,90px);height:2px;background:linear-gradient(90deg,transparent,#e4b857,transparent)}
.fb-menu .scroll{width:min(94vw,500px);padding:26px 22px 18px;display:flex;flex-direction:column;gap:clamp(10px,1.8vh,16px);align-items:stretch;pointer-events:auto;margin-top:6px}
.fb-menu .scroll::before,.fb-menu .scroll::after{content:"";position:absolute;left:-12px;right:-12px;height:16px;border-radius:9px;border:2px solid #2a170a;
background:repeating-linear-gradient(90deg,rgba(0,0,0,.14) 0 2px,transparent 2px 8px),linear-gradient(#a9764a,#5b3a20 60%,#3b2412);box-shadow:0 4px 8px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,225,170,.4)}
.fb-menu .scroll::before{top:-9px}.fb-menu .scroll::after{bottom:-9px}
.fb-menu .scroll h3{text-align:center;font-size:clamp(15px,2.6vh,19px);letter-spacing:.14em;text-transform:uppercase;color:#6b3f12;font-weight:800}
.fb .diffs{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.fb .diff{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:clamp(72px,12vh,104px);padding:8px 4px;cursor:pointer;color:var(--ink);
border:2px solid rgba(110,74,31,.65);border-radius:9px;background:rgba(255,246,214,.4);transition:transform .12s ease;font-size:14px;font-weight:700;line-height:1.15;text-align:center}
.fb .diff .ic{font-size:clamp(24px,4.4vh,34px);color:#5a3814}
.fb .diff small{font-weight:400;font-size:12px;font-style:italic;color:#5a4128;display:block}
.fb .diff:hover{transform:translateY(-2px);background:rgba(255,246,214,.7)}
.fb .diff[aria-checked=true]{border-color:#8a5200;background:linear-gradient(rgba(255,236,160,.95),rgba(235,190,90,.9));box-shadow:inset 0 0 0 2px rgba(255,255,255,.5),0 3px 8px rgba(80,40,0,.45)}
.fb .diff[aria-checked=true]::after{content:"";position:absolute;top:-8px;right:-6px;width:22px;height:22px;border-radius:50%;border:2px solid #4a2d0a;
background:radial-gradient(circle at 35% 30%,#ff8a70,#b3231a 70%);box-shadow:0 2px 3px rgba(0,0,0,.5)}
.fb-menu .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.fb-menu .row .btn{flex:1 1 140px;font-size:16px}
.fb-menu .go{align-self:center;width:100%}
.fb-menu .ver{position:absolute;bottom:6px;right:10px;font-size:11px;color:rgba(240,220,170,.5)}

/* ---------- Modale (Einstellungen, Anleitung, Pause) ---------- */
.fb-modal{z-index:60;align-items:center;justify-content:center;padding:12px;background:rgba(8,4,2,.72);pointer-events:auto}
.fb-modal .pnl{width:min(94vw,520px);max-height:calc(100% - 8px);overflow:auto;padding:22px 24px 20px;display:flex;flex-direction:column;gap:14px;transform:translateY(14px) scale(.97);transition:transform .3s cubic-bezier(.2,.9,.3,1.2);overscroll-behavior:contain}
.fb-modal.in .pnl{transform:none}
.fb-modal h2{text-align:center;font-size:clamp(24px,4.4vh,32px);font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#5a3010}
.fb-modal .close{align-self:center;min-width:180px}
.fb .sl{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 10px;color:var(--ink);font-weight:700;font-size:16px}
.fb .sl output{font-variant-numeric:tabular-nums;min-width:3.4em;text-align:right;color:#6b3f12}
.fb .sl input{grid-column:1/-1;width:100%;margin:0;height:44px;background:transparent;-webkit-appearance:none;appearance:none;pointer-events:auto;cursor:pointer;touch-action:pan-y}
.fb .sl input::-webkit-slider-runnable-track{height:12px;border-radius:7px;border:2px solid #4a2d0a;
background:linear-gradient(90deg,transparent calc(var(--p,50%) - 1px),transparent 0),repeating-linear-gradient(115deg,#d4b074 0 5px,#8d6b3b 5px 9px);
box-shadow:inset 0 2px 3px rgba(0,0,0,.5);-webkit-mask:none}
.fb .sl input::-moz-range-track{height:12px;border-radius:7px;border:2px solid #4a2d0a;background:repeating-linear-gradient(115deg,#d4b074 0 5px,#8d6b3b 5px 9px)}
.fb .sl input::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;margin-top:-11px;border-radius:50%;border:2px solid #3a2208;
background:radial-gradient(circle at 35% 28%,#fff3b8,#e2b04a 45%,#9a6a1f 90%);box-shadow:0 3px 5px rgba(0,0,0,.5),inset 0 -2px 3px rgba(90,50,5,.5)}
.fb .sl input::-moz-range-thumb{width:26px;height:26px;border-radius:50%;border:2px solid #3a2208;background:radial-gradient(circle at 35% 28%,#fff3b8,#e2b04a 45%,#9a6a1f 90%)}
.fb .sl .fill{display:none}
.fb .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.fb .seg .btn{min-height:44px;padding:0 8px;font-size:15px}
.fb .seg .btn[aria-pressed=true]{color:#2b1608;text-shadow:0 1px 0 rgba(255,244,200,.6);background:linear-gradient(#fff0b0,#e9bf5c 45%,#c18a26 80%,#e1b350);border-color:#6b4510}
.fb .sect{font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#7a4a14;border-bottom:1px solid rgba(110,74,31,.45);padding-bottom:3px}
.fb .note{font-size:13px;font-style:italic;color:#5a4128;line-height:1.35}
.fb .help ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;color:var(--ink);font-size:15px;line-height:1.38}
.fb .help li{display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start}
.fb .help li b.n{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 35% 28%,#d85a45,#8f1f12);color:#ffe9c4;font-size:15px;border:2px solid #4a1a0e;box-shadow:0 2px 3px rgba(0,0,0,.4)}
.fb .help kbd{font:700 13px var(--serif);padding:1px 7px;border-radius:5px;background:#3b2412;color:#f6e0a0;border:1px solid #1c0f06;box-shadow:0 2px 0 #1c0f06}
.fb .help .ships{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font-size:13px}
.fb .help .ships span{display:inline-flex;align-items:center;gap:5px}
.fb .help .ships i{display:inline-flex;gap:2px}
.fb .help .ships i b{width:9px;height:9px;background:#6b4a22;border:1px solid #2b1b0e}
.fb-pause .pnl{align-items:stretch;text-align:center}
.fb-pause .pnl .btn{width:100%}
.fb-pause .pw{width:64px;height:64px;margin:0 auto -4px;font-size:64px;color:#6b4510;filter:drop-shadow(0 3px 3px rgba(0,0,0,.4))}

/* ---------- Platzierung ---------- */
.fb-place{z-index:15}
.fb-place .pnl{position:absolute;left:max(14px,env(safe-area-inset-left));top:max(14px,8%);width:276px;max-height:calc(100% - 28px);overflow:auto;padding:14px 14px 14px;display:flex;flex-direction:column;gap:10px;pointer-events:auto}
.fb-place h3{text-align:center;font-size:17px;letter-spacing:.07em;white-space:nowrap;text-transform:uppercase;font-weight:900;color:#f7dc92}
.fb-place .hint{font-size:13.5px;line-height:1.35;color:#ecd9ae;text-align:center;font-style:italic}
.fb-place .fleet{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.fb-place .ship{position:relative;width:100%;min-height:50px;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;align-items:center;gap:0 10px;padding:6px 12px;text-align:left;cursor:pointer;
border:2px solid rgba(220,171,74,.35);border-radius:9px;background:rgba(0,0,0,.28);transition:transform .12s ease;font-size:16px;font-weight:700}
.fb-place .ship:hover{transform:translateX(2px);background:rgba(255,226,150,.12)}
.fb-place .ship .nm{display:flex;align-items:center;gap:7px}
.fb-place .ship .cells{display:flex;gap:3px;grid-column:2;grid-row:1/3}
.fb .cells b{display:block;width:13px;height:13px;border-radius:2px;background:linear-gradient(#e8c577,#a8782c);border:1px solid #2b1a0a;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
.fb-place .ship .len{grid-column:1;grid-row:2;font-size:11px;color:#c9ac72;font-weight:400}
.fb-place .ship[aria-pressed=true]{border-color:#ffd978;background:linear-gradient(rgba(255,214,110,.28),rgba(255,214,110,.1));box-shadow:0 0 0 2px rgba(255,217,120,.35),inset 0 0 12px rgba(255,200,90,.25)}
.fb-place .ship .ok{width:18px;height:18px;border-radius:50%;background:#2f7d3c;color:#e8ffe0;display:none;padding:3px;border:2px solid #143d1a;flex:none}
.fb-place .ship.done{opacity:.62}
.fb-place .ship.done .ok{display:block}
.fb-place .ship.done .len{display:none}
.fb-place .ship.done .cells b{background:linear-gradient(#8fb48a,#4b7b47)}
.fb-place .ship.done .len{display:none}
.fb-place .acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fb-place .acts .btn{padding:0 8px;font-size:15px;flex-direction:column;gap:0;line-height:1.1;min-height:48px}
.fb-place .acts .rot{grid-column:1/-1;flex-direction:row;gap:8px}
.fb-place .acts .rot small{font-weight:400;font-size:12px;opacity:.85}
.fb-place .confirm{width:100%;font-size:17px;min-height:54px;padding:0 8px;gap:8px;white-space:nowrap}
.fb-place .pz{position:absolute;left:max(14px,env(safe-area-inset-left));top:max(14px,env(safe-area-inset-top))}
.fb-place .pnl{top:calc(max(14px,env(safe-area-inset-top)) + 58px)}

/* ---------- HUD ---------- */
.fb-hud{z-index:12;display:block}
.fb-hud .top{position:absolute;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));height:max(56px,8vh);display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.fb-hud .pz{pointer-events:auto}
.fb-hud .turn{position:relative;margin-top:2px;min-width:min(60vw,310px);display:flex;align-items:center;justify-content:center;gap:10px;padding:0 28px;height:clamp(44px,6.8vh,58px);font-size:clamp(17px,2.9vh,24px);font-weight:900;letter-spacing:.05em;
border:2px solid var(--brass3);border-radius:8px;color:#f9e6ae;text-shadow:0 2px 3px rgba(0,0,0,.75);white-space:nowrap;
background:repeating-linear-gradient(90deg,rgba(0,0,0,.09) 0 2px,transparent 2px 9px),linear-gradient(rgba(94,58,31,.95),rgba(46,26,13,.96));
box-shadow:inset 0 1px 0 rgba(255,220,150,.35),inset 0 0 0 3px rgba(0,0,0,.25),0 6px 14px rgba(0,0,0,.5)}
.fb-hud .turn .ic{font-size:1.35em;color:#f1c96a}
.fb-hud .turn.foe{color:#ffc9b8;border-color:#a03a2a;background:repeating-linear-gradient(90deg,rgba(0,0,0,.1) 0 2px,transparent 2px 9px),linear-gradient(rgba(96,30,22,.95),rgba(48,14,10,.96))}
.fb-hud .turn.foe .ic{color:#ff9b7d}
.fb-hud .turn.pop{animation:fb-pop .55s cubic-bezier(.2,1.3,.4,1)}
.fb-hud .turn .dots{display:none;gap:3px}
.fb-hud .turn.foe .dots{display:inline-flex}
.fb-hud .dots i{width:5px;height:5px;border-radius:50%;background:currentColor;animation:fb-dot 1.1s ease-in-out infinite}
.fb-hud .dots i:nth-child(2){animation-delay:.18s}.fb-hud .dots i:nth-child(3){animation-delay:.36s}
@keyframes fb-pop{0%{transform:scale(.7) translateY(-14px);opacity:0}60%{transform:scale(1.07);opacity:1}100%{transform:none}}
@keyframes fb-dot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
.fb-hud .stats{display:flex;gap:6px;pointer-events:none;margin-top:2px}
.fb-hud .st{min-width:62px;padding:5px 9px 4px;text-align:center;border-radius:8px;border:1.5px solid rgba(220,171,74,.55);background:rgba(26,14,7,.72);box-shadow:0 3px 8px rgba(0,0,0,.4)}
.fb-hud .st span{display:block;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#d2b574}
.fb-hud .st b{display:block;font-size:19px;line-height:1.15;color:#fff0c4;font-variant-numeric:tabular-nums}
.fb-hud .coord{position:absolute;left:50%;bottom:max(12px,env(safe-area-inset-bottom));margin-left:-34px;width:68px;height:68px;border-radius:50%;display:grid;place-items:center;font-size:27px;font-weight:900;letter-spacing:.02em;color:#2b1608;
border:3px solid #5b3a0e;background:radial-gradient(circle at 35% 28%,#fff3b8,#e2b04a 50%,#a8741f);box-shadow:inset 0 0 0 3px rgba(255,248,210,.45),0 6px 12px rgba(0,0,0,.55);transition:opacity .12s}
.fb-hud .bot{position:absolute;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));display:flex;justify-content:space-between;align-items:flex-end;gap:10px;pointer-events:none}
.fb-hud .fleet{padding:6px 12px 8px;border-radius:10px;border:2px solid var(--brass3);background:rgba(28,15,8,.78);box-shadow:inset 0 1px 0 rgba(255,220,150,.25),0 5px 12px rgba(0,0,0,.5)}
.fb-hud .fleet h4{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#e1bf74;margin-bottom:4px;font-weight:800}
.fb-hud .fleet.foe h4{color:#f0a48e}
.fb-hud .fl{display:flex;gap:10px}
.fb-hud .sh{display:flex;flex-direction:column;align-items:flex-start;gap:3px;font-size:11px;color:#f1e1b6;transition:opacity .3s}
.fb-hud .sh .nm{white-space:nowrap}
.fb-hud .sh .cells{display:flex;gap:2px}
.fb-hud .cells b{width:12px;height:12px}
.fb-hud .sh .cells b.h{background:radial-gradient(circle at 40% 35%,#ffb066,#d6401e 60%,#7a1408);border-color:#2a0a05}
.fb-hud .sh.sunk{opacity:.8}
.fb-hud .sh.sunk .nm{text-decoration:line-through;text-decoration-color:#ff6a50;text-decoration-thickness:2px;color:#ff9c88}
.fb-hud .sh.sunk .cells b{background:linear-gradient(#a8261a,#5c0f08);border-color:#220604}
.fb-hud .fleet.foe .sh:not(.sunk) .cells b{background:linear-gradient(#6d5a3a,#3f3220);box-shadow:none}
.fb-hud .fleet.foe .sh:not(.sunk) .cells b.h{background:radial-gradient(circle at 40% 35%,#ffb066,#d6401e 60%,#7a1408)}

/* ---------- Banner ---------- */
.fb-ban{position:absolute;left:0;right:0;top:24%;display:flex;justify-content:center;pointer-events:none;z-index:30}
.fb-ban .bn{position:relative;display:flex;align-items:center;gap:16px;padding:12px clamp(26px,6vw,64px);max-width:96vw;text-align:center;opacity:0;transform:scale(.6);will-change:transform,opacity;
font-size:clamp(26px,min(7vw,9vh),66px);font-weight:900;letter-spacing:.05em;line-height:1.1;
clip-path:polygon(0 0,100% 0,calc(100% - 22px) 50%,100% 100%,0 100%,22px 50%);background:linear-gradient(#e9d4a0,#c8a868);color:var(--ink)}
.fb-ban .bn.go{animation:fb-bin .22s cubic-bezier(.2,1.3,.4,1) forwards}
.fb-ban .bn.end{animation:fb-bout .24s ease-in forwards}
.fb-ban .bn .ic{font-size:1.15em;flex:none}
.fb-ban .bn .tx{padding:0 .1em}
.fb-ban .hit{background:linear-gradient(#3b0c06,#8a2410 55%,#4a0f07);box-shadow:inset 0 0 0 3px #ff8a3a}
.fb-ban .hit .tx{background:linear-gradient(#fff4c0,#ffb53a 45%,#ff4a1a);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;filter:drop-shadow(0 3px 0 #2a0803)}
.fb-ban .miss{background:linear-gradient(#082638,#1c5877 55%,#0e3249)}
.fb-ban .miss .tx{background:linear-gradient(#f4fcff,#9bd8f2 55%,#4a9fc8);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;filter:drop-shadow(0 3px 0 #06202f)}
.fb-ban .sunk{background:linear-gradient(#2d1c04,#6a4510 55%,#34200a);box-shadow:inset 0 0 0 3px #f0c860}
.fb-ban .sunk .tx{background:linear-gradient(180deg,#fff6cf,#f6d77f 30%,#c88f2c 60%,#f3cf72);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;filter:drop-shadow(0 3px 0 #2a1604)}
.fb-ban .sunk .ic{width:1.1em;height:1.1em}
.fb-ban .warning{background:linear-gradient(#3d0d0d,#6e1c14);color:#ffe0a6;box-shadow:inset 0 0 0 3px #e8a020;font-size:clamp(22px,min(5.5vw,7vh),52px)}
.fb-ban .warning .tx{text-shadow:0 2px 3px rgba(0,0,0,.7)}
.fb-ban .turn,.fb-ban .info{box-shadow:inset 0 0 0 3px rgba(110,74,31,.65),inset 0 0 26px rgba(120,76,24,.4)}
.fb-ban .turn .tx,.fb-ban .info .tx{text-shadow:0 1px 0 rgba(255,246,214,.6)}
@keyframes fb-bin{0%{opacity:0;transform:scale(.55)}70%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
@keyframes fb-bout{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.12) translateY(-12px)}}

/* ---------- Game Over ---------- */
.fb-over{z-index:40;align-items:center;justify-content:center;padding:12px;background:radial-gradient(ellipse at 50% 45%,rgba(10,6,3,.35),rgba(6,3,2,.8));pointer-events:auto}
.fb-over .pnl{position:relative;width:min(94vw,540px);max-height:calc(100% - 8px);overflow:auto;padding:22px 24px 22px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;transform:translateY(20px) scale(.95);transition:transform .45s cubic-bezier(.2,1.1,.3,1.2)}
.fb-over.in .pnl{transform:none}
.fb-over .art{width:clamp(96px,20vh,160px);height:clamp(80px,17vh,134px);margin-top:-4px}
.fb-over h2{font-size:clamp(26px,5.2vh,40px);line-height:1.12;font-weight:900;letter-spacing:.03em}
.fb-over.win h2{color:#ffeeb0;background:linear-gradient(#2d1c04,#5e3d0c);padding:8px 18px;border-radius:9px;border:2px solid #d9a93e;text-shadow:0 2px 0 #1a0f02,0 0 10px rgba(0,0,0,.6);box-shadow:0 4px 10px rgba(0,0,0,.4)}
.fb-over.lose h2{color:#5a1810;text-shadow:0 1px 0 rgba(255,240,200,.5)}
.fb-over .sb{font-style:italic;color:#5a4128;font-size:15px}
.fb-over .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
.fb-over .grid div{padding:7px 4px;border-radius:8px;background:rgba(60,34,12,.12);border:1px solid rgba(110,74,31,.4)}
.fb-over .grid span{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b4a22}
.fb-over .grid b{display:block;font-size:24px;color:#2b1608;font-variant-numeric:tabular-nums}
.fb-over .btns{display:flex;gap:10px;width:100%;flex-wrap:wrap}
.fb-over .btns .btn{flex:1 1 150px}
.fb-over .coin{position:absolute;top:-30px;width:26px;height:26px;opacity:0;pointer-events:none;animation:fb-fall 2.8s ease-in 1 both;will-change:transform,opacity}
@keyframes fb-fall{0%{opacity:0;transform:translate3d(0,0,0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translate3d(var(--dx,0),105vh,0) rotate(540deg)}}

/* ---------- Koordinate / kleine Bildschirme ---------- */
@media (max-width:760px), (max-height:540px) and (orientation:landscape){
 .fb-ban{top:15%}
 .fb-ban .bn{max-width:80vw;font-size:clamp(20px,min(6vw,5.5vh),34px);padding:8px 28px;gap:8px}
 .fb-menu .title{font-size:min(12.4vw,15vh)}
 .fb-menu .sub{letter-spacing:.3em;font-size:12.5px;white-space:nowrap;padding-left:.3em;gap:10px}
 .fb-menu .sub::before,.fb-menu .sub::after{width:18px}
 .fb-hud .turn .dots{display:none!important}
 .fb-hud .turn .ic{font-size:1.15em}
 .fb-over .btns .btn{font-size:18px;padding:0 10px;flex-basis:130px;white-space:nowrap}
 .fb-place .ship{position:relative}
 .fb-place .ship .ok{position:absolute;top:2px;right:2px}
 .fb-place .ship .nm{font-size:11px;letter-spacing:-.2px}
 .fb-hud .top{height:auto}
 .fb-hud .turn{min-width:0;flex:1;padding:0 10px;font-size:16px;height:46px;gap:6px}
 .fb-hud .stats{flex-direction:column;gap:0;padding:4px 8px;border-radius:8px;border:1.5px solid rgba(220,171,74,.55);background:rgba(26,14,7,.72)}
 .fb-hud .st{display:flex;gap:6px;justify-content:space-between;min-width:92px;padding:0;border:0;background:none;box-shadow:none;text-align:left;align-items:baseline}
 .fb-hud .st span{font-size:10px;letter-spacing:.05em}.fb-hud .st b{font-size:12.5px;line-height:1.35}
 .fb-hud .bot{gap:6px}
 .fb-hud .fleet{flex:1 1 0;min-width:0;padding:4px 7px 5px}
 .fb-hud .fl{flex-direction:column;gap:1px}
 .fb-hud .sh{flex-direction:row;align-items:center;justify-content:space-between;gap:4px;font-size:10px}
 .fb-hud .cells b{width:9px;height:9px}
 .fb-hud .fleet h4{font-size:9.5px;margin-bottom:1px}
 .fb-hud .coord{bottom:auto;top:calc(max(10px,env(safe-area-inset-top)) + 54px);margin-left:-26px;width:52px;height:52px;font-size:21px}
 .fb-place .pnl{left:0;right:0;top:auto;bottom:0;width:auto;max-height:none;border-radius:14px 14px 0 0;border-width:2px 0 0;padding:8px 10px max(10px,env(safe-area-inset-bottom));gap:6px;overflow:visible}
 .fb-place h3,.fb-place .hint{display:none}
 .fb-place .hint{display:block;font-size:12px}
 .fb-place .fleet{flex-direction:row;gap:5px}
 .fb-place .fleet li{flex:1 1 0;min-width:0}
 .fb-place .ship{grid-template-columns:1fr;min-height:50px;padding:5px 3px;text-align:center;font-size:11.5px;justify-items:center;gap:3px}
 .fb-place .ship .len{display:none}
 .fb-place .ship .cells b{width:9px;height:9px}
 .fb-place .ship .ok{width:13px;height:13px;padding:1px;border-width:1px}
 .fb-place .ship .nm{justify-content:center}
 .fb-place .ship .cells{grid-column:1;grid-row:2}
 .fb-place .acts{grid-template-columns:repeat(3,1fr)}
 .fb-place .acts .rot{grid-column:auto;flex-direction:column;gap:0}
 .fb-place .acts .rot small{display:none}
 .fb-place .acts .btn{font-size:13px;padding:0 4px;min-height:46px}
 .fb-place .acts .btn .ic{font-size:1.15em}
 .fb-place .confirm{font-size:17px;min-height:48px}
 .fb-modal .pnl{padding:16px 16px 16px}
}
@media (max-height:540px) and (orientation:landscape){
 .fb-menu{flex-direction:row;gap:3vw;flex-wrap:nowrap}
 .fb-menu .title{font-size:clamp(34px,11vh,70px)}
 .fb-menu .emb{width:clamp(44px,17vh,70px);height:clamp(44px,17vh,70px)}
 .fb-menu .scroll{width:min(52vw,440px);padding:18px 16px 12px;margin:0;gap:8px}
 .fb-menu .diff{min-height:62px}
 .fb-menu .btn.primary{min-height:48px;font-size:19px}
 .fb-menu .sub{font-size:12px;letter-spacing:.25em}
 .fb-hud .turn{height:42px;font-size:15px}
 .fb-over .art{display:none}
}
@media (max-height:540px) and (orientation:landscape){
 .fb-place .pnl{display:flex;flex-direction:row;align-items:stretch;gap:8px;padding:6px 10px max(8px,env(safe-area-inset-bottom))}
 .fb-place .pnl .hint{display:none}
 .fb-place .fleet{flex:1 1 auto;min-width:0}
 .fb-place .acts{display:flex;flex:0 0 auto;gap:6px}
 .fb-place .acts .btn{padding:0 10px;min-height:48px}
 .fb-place .confirm{width:auto;flex:0 0 auto;padding:0 12px;min-height:48px;font-size:14px}
 .fb-place .acts .btn{padding:0 7px;font-size:12.5px}
 .fb-place .ship .cells b{width:7px;height:7px}
 .fb-place .ship .cells{gap:2px}
 .fb-hud .turn{flex:0 1 420px;margin-left:auto;margin-right:auto}
 .fb-hud .fl{flex-direction:row;gap:7px}
 .fb-hud .sh{flex-direction:column;align-items:flex-start;gap:2px}
 .fb-hud .top{height:auto}
 .fb-hud .coord{top:calc(max(10px,env(safe-area-inset-top)) + 54px);bottom:auto;margin-left:-26px}
 .fb-over .pnl{padding:12px 18px}.fb-over .grid b{font-size:19px}
 .fb-modal .pnl{padding:12px 18px;gap:8px}
}
.fb .pnl{scrollbar-width:thin;scrollbar-color:#b8862e rgba(0,0,0,.25)}
@media (prefers-reduced-motion:reduce){.fb *{animation-duration:.01s!important;transition-duration:.01s!important}.fb-load .wheel{animation:none!important}}
`;
