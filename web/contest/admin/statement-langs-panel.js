// contest/admin/statement-langs-panel.js — "Idiomas do enunciado": a lista de idiomas que a
// sanfona OFERECE (conf STATEMENT_LANGS: AUTOMÁTICO = tudo que existe, o default; ou lista fixa),
// com a disponibilidade por problema (arquivo no contest ou tradução no banco). Reusado pelo painel Prova › Problemas (admin) e pela aba 🌐 Idiomas do
// juiz-chefe — a rota /contest/admin/statement-langs aceita os dois papéis.
import { el } from '/shared/ui.js';
import { apiGet, apiPost } from '/shared/api.js';
import { T } from '/shared/i18n.js';
import { STMT_SHORT, stmtName } from '/shared/statement-langs.js';

const enc = encodeURIComponent;

export function makeStatementLangsPanel(CONTEST) {
  const G = { contest: CONTEST, auth: true };
  const box = el('div', { class: 'section' });
  const body = el('div', {});
  const msg = el('div', { class: 'small' });
  let DATA = null;

  function render() {
    body.innerHTML = '';
    if (!DATA) return;
    const all = DATA.all || ['pt', 'en', 'es'];
    const auto = (DATA.mode || 'auto') === 'auto';
    const on = new Set(DATA.langs || ['pt']);
    const checks = {};
    // modo: AUTOMÁTICO (default — todo idioma que o problema tem entra na sanfona) × LISTA fixa
    const rAuto = el('input', { type: 'radio', name: 'stmtMode', value: 'auto' }); rAuto.checked = auto;
    const rList = el('input', { type: 'radio', name: 'stmtMode', value: 'list' }); rList.checked = !auto;
    const row = el('div', { class: 'row u-gap-1 u-wrap u-items-center u-ml-1.6' });
    all.forEach((l) => {
      const cb = el('input', { type: 'checkbox' }); cb.checked = auto ? true : on.has(l); cb.disabled = auto; checks[l] = cb;
      row.append(el('label', { class: 'row u-gap-.35 u-items-center u-pointer' }, cb,
        el('b', {}, STMT_SHORT[l] || l.toUpperCase()), el('span', { class: 'small muted' }, stmtName(l))));
    });
    const syncMode = () => { const a = rAuto.checked; all.forEach((l) => { checks[l].disabled = a; if (a) checks[l].checked = true; }); };
    rAuto.addEventListener('change', syncMode); rList.addEventListener('change', syncMode);
    const save = el('button', { class: 'btn', onclick: async () => {
      const payload = rAuto.checked ? { mode: 'auto' } : { langs: all.filter((l) => checks[l].checked) };
      msg.className = 'small'; msg.textContent = T('Salvando…', 'Saving…', 'Guardando…');
      try { await apiPost('/contest/admin/statement-langs?contest=' + enc(CONTEST), payload, G); msg.textContent = T('✓ salvo', '✓ saved', '✓ guardado'); await load(); }
      catch (e) { msg.className = 'small error-box'; msg.textContent = e.message || T('falha', 'failed', 'fallido'); }
    } }, T('Salvar idiomas', 'Save languages', 'Guardar idiomas'));
    body.append(
      el('p', { class: 'small muted u-mt-.2 u-mb-.5 u-mx-0' },
        T('Decida quais idiomas do enunciado o competidor pode escolher na sanfona. No modo automático, todo idioma que um problema tem aparece nesse problema. A sanfona abre no idioma do contest (LOCALE) se ele for oferecido; senão, no primeiro. Um idioma oferecido sem tradução em um problema mostra o português nesse problema.',
          'Decide which statement languages the competitor can pick in the accordion. In automatic mode, every language a problem has appears for that problem. The accordion opens in the contest language (LOCALE) if it is offered; otherwise, in the first one. An offered language without a translation in a problem shows Portuguese for that problem.',
          'Decide qué idiomas del enunciado puede elegir el competidor en el acordeón. En el modo automático, aparece para cada problema todo idioma que ese problema tenga. El acordeón se abre en el idioma de la competencia (LOCALE) si está disponible; si no, en el primero. Un idioma ofrecido sin traducción en un problema muestra el portugués para ese problema.')),
      el('label', { class: 'row u-gap-.4 u-items-center u-pointer' }, rAuto,
        el('b', {}, T('Automático', 'Automatic', 'Automático')), el('span', { class: 'small muted' }, T('todos os idiomas que existem em cada problema (padrão)', 'every language each problem has (default)', 'todos los idiomas que cada problema tiene (por defecto)'))),
      el('label', { class: 'row u-gap-.4 u-items-center u-pointer u-mt-.3' }, rList,
        el('b', {}, T('Só estes idiomas', 'Only these languages', 'Solo estos idiomas')), el('span', { class: 'small muted' }, T('marque a lista; só PT = prova só em português', 'check the list; PT alone = Portuguese-only contest', 'marca la lista; solo PT = competencia solo en portugués'))),
      row,
      el('div', { class: 'row u-gap-.6 u-items-center u-mt-.5' }, save, msg),
      el('div', { class: 'small muted u-mt-.4 u-mb-.2 u-mx-0' },
        T('Idioma padrão agora: ', 'Default language now: ', 'Idioma predeterminado ahora: '), el('b', {}, (DATA.default || 'pt').toUpperCase()),
        DATA.locale ? ' · LOCALE=' + DATA.locale : ''));
    // disponibilidade por problema: letra × idioma
    const av = DATA.available || {};
    const letters = Object.keys(av);
    if (letters.length) {
      const tbl = el('table', { class: 'moj narrow' },
        el('thead', {}, el('tr', {}, el('th', {}, T('Problema', 'Problem', 'Problema')),
          ...all.map((l) => el('th', { class: 'c' }, STMT_SHORT[l] || l.toUpperCase())))));
      const tb = el('tbody');
      letters.forEach((L) => tb.append(el('tr', {}, el('td', {}, el('b', {}, L)),
        ...all.map((l) => el('td', { class: 'c', title: av[L][l] ? T('tradução disponível', 'translation available', 'traducción disponible') : T('sem tradução — mostra o português', 'no translation — shows Portuguese', 'sin traducción — muestra el portugués') },
          av[L][l] ? '✓' : el('span', { class: 'muted' }, '—'))))));
      tbl.append(tb);
      body.append(el('div', { class: 'small muted u-mt-.6 u-mb-.2 u-mx-0' }, T('Traduções disponíveis por problema (do pacote ou enviadas pelo admin):', 'Available translations per problem (from the package or uploaded by the admin):', 'Traducciones disponibles por problema (del paquete o subidas por el admin):')), tbl);
    }
  }
  async function load() {
    try { DATA = await apiGet('/contest/admin/statement-langs?contest=' + enc(CONTEST), G); }
    catch (e) { body.innerHTML = ''; body.append(el('div', { class: 'error-box' }, e.message || T('Falha.', 'Failed.', 'Falló.'))); return; }
    render();
  }
  box.append(el('h3', { class: 'u-mt-0 u-mb-.3 u-mx-0' }, T('🌐 Idiomas do enunciado', '🌐 Statement languages', '🌐 Idiomas del enunciado')), body);
  return { el: box, panel: box, load };
}
