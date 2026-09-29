// shared/theme-boot.js — aplica o TEMA ESCURO antes da 1ª pintura (docs/DESIGN.md › Tema escuro).
// Script CLÁSSICO e síncrono no <head>, logo depois do ui.css: como módulo ESM (deferido) a página
// pintaria clara e trocaria depois (o "piscar"). Só lê a escolha salva; quem troca é o shared/theme.js.
(function () {
  try { if (localStorage.getItem('moj_theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); }
  catch (e) { /* localStorage indisponível (aba anônima, bloqueio): fica o tema claro */ }
})();
