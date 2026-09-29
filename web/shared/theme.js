// shared/theme.js — o seletor CLARO/ESCURO da interface (docs/DESIGN.md › Tema escuro).
// Opt-in: o padrão é o claro, e o escuro só vale para quem clica (fica salvo no navegador,
// localStorage `moj_theme`). Troca EM LUGAR: o tema é o atributo `data-theme="dark"` no <html> +
// o styles/theme-dark.css (que redefine os tokens) — nada recarrega. Quem usa o claro nunca baixa
// o theme-dark.css. Montado pelo cabeçalho do site (site-header.js) e pelo chip de usuário das
// páginas de contest (contest-shell.js). Antes da 1ª pintura quem aplica a escolha salva é o BOOT
// INLINE do <head> de cada página (BOOT, abaixo — o css-ratchet.sh confere que é o mesmo em todas).
import { el } from '/shared/dom.js';
import { T } from '/shared/i18n.js';

const KEY = 'moj_theme';
const HREF = '/shared/styles/theme-dark.css';
// o boot inline de cada página (texto EXATO; docs/DESIGN.md › Tema escuro). document.write no <head>
// = <link> inserido pelo analisador, que bloqueia a renderização como um <link> comum: sem "piscar".
// ⚠ Vai ANTES do <link> do ui.css: script inline depois de uma folha de estilo PENDENTE espera ela
// carregar e trava a análise do HTML junto (medido: +220 ms no `load` em 4G). O escuro vence o
// claro pela especificidade (`:root[data-theme]` > `:root`), então a ordem não importa p/ o tema.
export const BOOT = `<script>try{if(localStorage.getItem('moj_theme')==='dark'){document.write('<link rel="stylesheet" id="moj-theme-dark" href="${HREF}">');document.documentElement.setAttribute('data-theme','dark')}}catch(e){}</script>`;
function ensureDarkCss() {
  if (document.getElementById('moj-theme-dark')) return;
  document.head.append(el('link', { rel: 'stylesheet', id: 'moj-theme-dark', href: HREF }));
}
export const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
export function setTheme(dark) {
  if (dark) { ensureDarkCss(); document.documentElement.setAttribute('data-theme', 'dark'); }
  else document.documentElement.removeAttribute('data-theme');
  try { dark ? localStorage.setItem(KEY, 'dark') : localStorage.removeItem(KEY); } catch { /* sem storage: vale só nesta página */ }
  document.dispatchEvent(new CustomEvent('moj:theme', { detail: { dark } }));
}

export function mkThemeToggle() {
  const b = el('button', { type: 'button', class: 'theme-toggle' });
  const paint = () => {
    const d = isDark();
    b.textContent = d ? '☀' : '☾';
    const label = d ? T('Usar o tema claro', 'Use the light theme', 'Usar el tema claro')
                    : T('Usar o tema escuro', 'Use the dark theme', 'Usar el tema oscuro');
    b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', d ? 'true' : 'false');
  };
  b.addEventListener('click', () => setTheme(!isDark()));
  document.addEventListener('moj:theme', paint);
  paint();
  return b;
}
