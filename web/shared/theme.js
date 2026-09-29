// shared/theme.js — o seletor CLARO/ESCURO da interface (docs/DESIGN.md › Tema escuro).
// Opt-in: o padrão é o claro, e o escuro só vale para quem clica (fica salvo no navegador,
// localStorage `moj_theme`). Troca EM LUGAR: o tema é só um atributo no <html>
// (`data-theme="dark"`), que redefine os tokens do tokens.css — nada recarrega.
// Montado pelo cabeçalho do site (site-header.js) e pelo chip de usuário das páginas de contest
// (contest-shell.js). O shared/theme-boot.js aplica a escolha antes da 1ª pintura.
import { el } from '/shared/dom.js';
import { T } from '/shared/i18n.js';

const KEY = 'moj_theme';
export const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
export function setTheme(dark) {
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
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
