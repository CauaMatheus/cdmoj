// diff.mjs — DIFF VISUAL do design system (docs/DESIGN.md): o estilo COMPUTADO de todo elemento
// (e dos ::before/::after) de cada página, numa referência (A) × na árvore atual (B), no Chrome.
// Chamado por css-visual-diff.sh, que sobe os dois servidores sobre o MESMO fixture.
//
//   node diff.mjs --a <url-base> --b <url-base> --pages <arquivo> --out <dir>
//                 [--widths 1366,390] [--only <regex>] [--idle <ms sem mutação>]
//
// Cada carga roda num contexto de navegador NOVO (sem cookie/localStorage/cache herdado). A
// referência é carregada DUAS vezes: o que muda entre A1 e A2 (relógio, "há 3 min", sorteio) é
// INSTÁVEL e fica fora da comparação — senão todo diff teria ruído. Animações CSS ficam paradas.
// Saída: uma linha por página×largura, <out>/report.json e <out>/pairs.txt (cada mudança
// "propriedade: antes → depois" com a contagem). Código de saída 1 se houve diferença.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const A = arg('a'), B = arg('b'), OUT = arg('out', 'visual-out');
const WIDTHS = arg('widths', '1366,390').split(',').map(Number);
const ONLY = arg('only') ? new RegExp(arg('only')) : null;
const IDLE = +arg('idle', '500');   // ms sem NENHUMA mutação no DOM = página assentada
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

// O snapshot fica na página e vem em fatias: um retorno de vários MB trava a sessão CDP.
const SNAP = `(() => {
  const out = {};
  for (const e of document.querySelectorAll('*')) {
    const path = []; let n = e;
    while (n && n.parentElement) { path.unshift(n.tagName + [...n.parentElement.children].indexOf(n)); n = n.parentElement; }
    const v = {};
    const cs = getComputedStyle(e);
    for (const p of cs) v[p] = cs.getPropertyValue(p);
    for (const pse of ['::before', '::after']) {
      const c = getComputedStyle(e, pse);
      if (c.content && c.content !== 'none' && c.content !== 'normal')
        for (const p of ['content', 'color', 'background-color', 'border-top-color', 'font-size', 'font-weight', 'display'])
          v[pse + ' ' + p] = c.getPropertyValue(p);
    }
    // id com sufixo numérico longo é gerado a cada carga (ex.: datalist cmp-teams-207517): fora da chave
    out[path.join('/') + (e.id ? '#' + e.id.replace(/-?\\d{4,}$/, '') : '')] = v;
  }
  return JSON.stringify(out);
})()`;

async function snapshot(base, pg, width) {
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
    await S('Page.navigate', { url });
    await Promise.race([lp, new Promise(r => setTimeout(r, 20000))]);
    listeners.delete(onLoad);
    // espera o DOM ASSENTAR: o app busca dados depois do load e renderiza em ondas — sem isto a
    // mesma página vinha com 72 elementos numa carga e 187 na outra (falso positivo)
    await S('Runtime.evaluate', { awaitPromise: true, expression: `new Promise(ok => {
      let t; const done = () => { mo.disconnect(); ok(); };
      const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, ${IDLE}); });
      mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      t = setTimeout(done, ${IDLE}); setTimeout(done, 10000);
    })` }, 15000);
    const len = (await S('Runtime.evaluate', { expression: `(window.__vsnap = ${SNAP}).length`, returnByValue: true })).result.value;
    let str = '';
    for (let i = 0; i < len; i += 256 * 1024)
      str += (await S('Runtime.evaluate', { expression: `window.__vsnap.slice(${i}, ${i + 256 * 1024})`, returnByValue: true })).result.value;
    return JSON.parse(str);
  } finally {
    listeners.delete(onDlg);
    await send('Target.closeTarget', { targetId }).catch(() => {});
    await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}

const unstable = (a1, a2) => {
  const u = new Map();   // elemento -> Set(propriedade) instáveis; elemento ausente em A2 = inteiro instável
  for (const k of Object.keys(a1)) {
    if (!(k in a2)) { u.set(k, null); continue; }
    for (const p in a1[k]) if (a1[k][p] !== a2[k][p]) { if (!u.has(k)) u.set(k, new Set()); u.get(k).add(p); }
  }
  return u;
};

function compare(a1, a2, b) {
  const u = unstable(a1, a2);
  const skip = (k, p) => u.has(k) && (u.get(k) === null || u.get(k).has(p));
  const onlyA = Object.keys(a1).filter(k => !(k in b) && !(u.has(k) && u.get(k) === null));
  const onlyB = Object.keys(b).filter(k => !(k in a1) && !(k in a2));
  const changed = [];
  for (const k of Object.keys(a1)) {
    if (!(k in b)) continue;
    const props = Object.keys(a1[k]).filter(p => !skip(k, p) && (p.startsWith('--') ? (p in b[k] && a1[k][p] !== b[k][p]) : a1[k][p] !== b[k][p]));
    if (props.length) changed.push({ el: k, props, vals: props.map(p => [a1[k][p], b[k][p]]) });
  }
  return { u, onlyA, onlyB, changed, n: Object.keys(a1).length, bad: changed.length + onlyA.length + onlyB.length };
}

const report = []; const pairs = {}; let dirty = 0;
for (const pg of PAGES) for (const w of WIDTHS) {
  const label = `${pg.path}${pg.sess ? ' [' + pg.sess + ']' : ''} @${w}`;
  let r, tries = 0;
  try {
    // página que monta as seções na ordem em que a API responde muda de ESTRUTURA entre cargas
    // (a Central do admin): divergiu ⇒ recarrega os dois lados; só é DIFF se persistir 3 vezes
    do {
      const a1 = await snapshot(A, pg, w), a2 = await snapshot(A, pg, w), b = await snapshot(B, pg, w);
      r = compare(a1, a2, b); tries++;
    } while (r.bad && tries < 3);
  } catch (e) { console.log(`ERRO   ${label}: ${e.message}`); report.push({ page: label, error: e.message }); dirty++; continue; }
  if (r.bad) {
    dirty++;
    for (const c of r.changed) c.props.forEach((p, i) => { const key = `${p}: ${c.vals[i][0]} → ${c.vals[i][1]}`; pairs[key] = (pairs[key] || 0) + 1; });
  }
  console.log(`${r.bad ? 'DIFF ' : 'igual'}  ${label}  (${r.n} elementos; ${r.changed.length} mudaram; DOM −${r.onlyA.length}/+${r.onlyB.length}; instáveis ${r.u.size}${tries > 1 ? '; ' + tries + ' tentativas' : ''})`);
  report.push({ page: label, elements: r.n, unstable: r.u.size, tries, changed: r.changed.length, onlyA: r.onlyA.slice(0, 5), onlyB: r.onlyB.slice(0, 5),
    sample: r.changed.slice(0, 5).map(c => ({ el: c.el.slice(-100), props: c.props.slice(0, 8) })) });
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
writeFileSync(join(OUT, 'pairs.txt'), Object.entries(pairs).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${String(n).padStart(6)}  ${k}`).join('\n') + '\n');
console.log(`\n${report.length - dirty}/${report.length} iguais — detalhes em ${OUT}/report.json e ${OUT}/pairs.txt`);
bye(dirty ? 1 : 0);
