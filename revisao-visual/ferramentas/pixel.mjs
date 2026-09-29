import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const A = arg('a'), B = arg('b'), OUT = arg('out', 'visual-out');
const WIDTHS = arg('widths', '1366,390').split(',').map(Number);
const ONLY = arg('only') ? new RegExp(arg('only')) : null;
const IDLE = +arg('idle', '1000');   // ms sem NENHUMA mutação no DOM = página assentada
const PAGES = readFileSync(arg('pages'), 'utf8').split('\n').map(l => l.replace(/#\s.*$/, '').trim())
  .filter(Boolean).map(l => { const [path, sess] = l.split(/\s+/); return { path, sess }; })
  .filter(p => !ONLY || ONLY.test(p.path + ' ' + (p.sess || '')));
mkdirSync(OUT, { recursive: true });

// ---- Chrome + CDP (sessões por alvo, flatten) ----
const CHROME = process.env.CHROME || ['google-chrome', 'chromium', 'chromium-browser', 'google-chrome-stable']
  .find(b => spawnSync('sh', ['-c', `command -v ${b}`]).status === 0);
if (!CHROME) { console.error('diff.mjs: Chrome/Chromium não encontrado (defina CHROME=<binário>)'); process.exit(2); }
const port = 9400 + Math.floor(Math.random() * 400);
const prof = mkdtempSync(join(tmpdir(), 'moj-vdiff-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
  '--disable-background-networking', '--disable-component-update', '--font-render-hinting=none', 'about:blank'],
  { stdio: 'ignore' });
const bye = (rc) => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} process.exit(rc); };
let ver;
for (let i = 0; i < 150 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await new Promise(r => setTimeout(r, 100)); } }
if (!ver) { console.error('diff.mjs: o Chrome não subiu (defina CHROME=<binário>)'); bye(2); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(ok => { ws.onopen = ok; });
let mid = 0; const pend = new Map(); const listeners = new Set();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.ko(new Error(m.error.message)) : p.ok(m.result); }
  else if (m.method) listeners.forEach(f => f(m));
};
const send = (method, params = {}, sessionId, ms = 30000) => Promise.race([
  new Promise((ok, ko) => { const id = ++mid; pend.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }),
  new Promise((_, ko) => setTimeout(() => ko(new Error(method + ': timeout')), ms))]);

import { execFileSync } from 'node:child_process';
const START = +arg('start', '0');
const NEUTRAL = process.env.NEUTRAL_B ? readFileSync(process.env.NEUTRAL_B, 'utf8') : '';
const FROZEN = Math.floor(Date.now() / 60000) * 60000 + 30000;  // meio de um minuto, fixo na rodada
async function shot(base, pg, width, file, extraCss = '') {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p, ms) => send(m, p, sessionId, ms);
  const onDlg = (m) => { if (m.sessionId === sessionId && m.method === 'Page.javascriptDialogOpening') S('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); };
  listeners.add(onDlg);
  try {
    await S('Page.enable'); await S('Runtime.enable'); await S('Animation.enable');
    await S('Animation.setPlaybackRate', { playbackRate: 0 });
    await S('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    let hash = ''; let path = pg.path; if (path.includes('#')) { hash = path.slice(path.indexOf('#')); path = path.slice(0, path.indexOf('#')); }
    const q = 'c=demo' + (pg.sess ? '&sess=' + pg.sess : '');
    const url = base + path + (path.includes('?') ? '&' : '?') + q + hash;
    let loaded; const lp = new Promise(r => { loaded = r; });
    const onLoad = (m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') loaded(); };
    listeners.add(onLoad);
    // rede ociosa: nenhuma requisição em voo há IDLE ms (a API do fixture executa bash por chamada)
    const infl = new Set(); let last = Date.now();
    const onNet = (m) => { if (m.sessionId !== sessionId) return;
      if (m.method === 'Network.requestWillBeSent') { infl.add(m.params.requestId); last = Date.now(); }
      else if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') { infl.delete(m.params.requestId); last = Date.now(); } };
    listeners.add(onNet);
    await S('Network.enable');
    // relógio da página CONGELADO no mesmo instante p/ A e B (contador "Ends in", "há X min")
    await S('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const F = ${FROZEN}; const D = Date;
      function FD(...a) { return new.target ? (a.length ? new D(...a) : new D(F)) : new D(F).toString(); }
      FD.prototype = D.prototype; FD.now = () => F; FD.parse = D.parse; FD.UTC = D.UTC;
      Object.setPrototypeOf(FD, D); globalThis.Date = FD; })();
      // CSS de captura (caret + neutralização) ANTES da 1ª pintura: aplicado depois, ele força uma
      // repintura parcial só no lado em que muda algo, e o antialiasing dos cantos sai diferente
      (() => { const s = document.createElement('style'); s.id = '__vcss';
        s.textContent = '*{caret-color:transparent!important}' + ${JSON.stringify(extraCss)};
        const add = () => { if (!document.documentElement) return false; document.documentElement.appendChild(s); return true; };
        if (!add()) { const mo = new MutationObserver(() => { if (add()) mo.disconnect(); }); mo.observe(document, { childList: true }); } })();` });
    await S('Page.navigate', { url });
    await Promise.race([lp, new Promise(r => setTimeout(r, 20000))]);
    listeners.delete(onLoad);
    for (const t0 = Date.now(); Date.now() - t0 < 25000; await new Promise(r => setTimeout(r, 100)))
      if (!infl.size && Date.now() - last >= IDLE) break;
    listeners.delete(onNet);
    await S('Runtime.evaluate', { awaitPromise: true, expression: `new Promise(ok => {
      let t; const done = () => { mo.disconnect(); ok(); };
      const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, ${IDLE}); });
      mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      t = setTimeout(done, ${IDLE}); setTimeout(done, 10000);
    })` }, 15000);
    // sem cursor piscando; fontes carregadas
    const chk = await S('Runtime.evaluate', { awaitPromise: true, expression: `(async()=>{if(!document.getElementById('__vcss'))throw new Error('CSS de captura ausente');
      /* a página cita o próprio endereço (location.host); A e B rodam em portas diferentes: fixa, nos dois lados, com o mesmo nº de dígitos */
      const H=location.host, F=location.hostname+':'+'0'.repeat(location.port.length);
      const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); for(let n;(n=w.nextNode());) if(n.data.includes(H)) n.data=n.data.split(H).join(F);
      for(const e of document.querySelectorAll('input,textarea')) if(e.value.includes(H)) e.value=e.value.split(H).join(F);await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()` });
    if (chk.exceptionDetails) throw new Error('captura: ' + (chk.exceptionDetails.exception?.description || chk.exceptionDetails.text));
    const { cssContentSize: cs } = await S('Page.getLayoutMetrics');
    const h = Math.min(Math.ceil(cs.height), 16000);
    const r = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: h, scale: 1 } }, 60000);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
  } finally {
    listeners.delete(onDlg);
    await send('Target.closeTarget', { targetId }).catch(() => {});
    await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}
let idx = 0, total = PAGES.length * WIDTHS.length;
for (const pg of PAGES) for (const w of WIDTHS) {
  idx++; if (idx <= START) continue;
  const label = (process.env.LABEL ? '{' + process.env.LABEL + '} ' : '') + `${pg.path}${pg.sess ? ' [' + pg.sess + ']' : ''} @${w}`;
  const slug = (String(idx).padStart(3, '0') + '_' + label).replace(/[^A-Za-z0-9@._-]+/g, '_');
  const d = join(OUT, slug); mkdirSync(d, { recursive: true });
  let res, tries = 0;
  try {
    do {
      await shot(A, pg, w, join(d, 'A.png'), NEUTRAL); await shot(B, pg, w, join(d, 'B.png'), NEUTRAL); await shot(A, pg, w, join(d, 'A2.png'), NEUTRAL);
      res = execFileSync('python3', [process.env.FILT, join(d, 'A.png'), join(d, 'A2.png'), join(d, 'B.png'), join(d, 'diff.png')]).toString().trim().split(' ');
      tries++;
    } while (+res[0] > 0 && tries < 4);
  } catch (e) { console.log(`ERRO  [${idx}/${total}] ${label}: ${e.message}`); bye(3); }
  const n = +res[0];
  console.log(`${n ? 'DIFF ' : 'igual'} [${idx}/${total}] ${label}  px=${n} instáveis=${res[1]} A=${res[2]} B=${res[3]}`);
  if (n) { console.log(`PARADA: ${d}`); bye(1); }
  if (process.env.KEEP_B) {   // miniatura do B que passou: prova de que o estado apareceu na tela
    mkdirSync(process.env.KEEP_B, { recursive: true });
    execFileSync('python3', ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(join(d, 'B.png'))}); im=im.crop((0,0,im.width,min(im.height,2400))); im.thumbnail((im.width//2, 1200)); im.save(${JSON.stringify(join(process.env.KEEP_B, slug + '.png'))})`]);
  }
  if (!process.env.KEEP_ALL) rmSync(d, { recursive: true, force: true });
}
console.log(`\n${total}/${total} iguais`); bye(0);
