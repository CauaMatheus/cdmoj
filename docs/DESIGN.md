# Design system do web/

Como o MOJ se estiliza e onde mexer quando a identidade visual precisar mudar. O front é
**ESM sem build**, então o design system também é CSS puro servido como está: tokens em
variáveis CSS, módulos por componente/domínio e um manifesto que define a ordem.

## Estrutura

```
web/shared/ui.css                 MANIFESTO: só a ordem dos módulos (uma linha @import por módulo)
web/shared/styles/
  tokens.css                      a ÚNICA fonte de cor, medida, fonte, sombra e z-index
  base.css                        reset, tipografia base, links, .container
  utilities.css                   classes de uma propriedade (.muted, .center, .small, .hidden…)
  responsive.css                  ajustes de celular do cromo do site e dos painéis
  print.css                       o que nunca vai ao papel
  components/                     peças reusáveis em qualquer tela
    topbar  card  button  form  table  verdict  tag  balloon
    code-editor  chart  footer  panel
  domains/                        o que é de UMA área do produto
    statement  home  news  problem  treino-home  contest-list  score
  pages/                          CSS PRÓPRIO de uma tela, FORA do manifesto: cada página o carrega
                                  com um <link> seu (ex.: pages/problemas-editar.css)
```

**`pages/`**: o que só uma tela usa não vai para o bundle de todo mundo. Cada página carrega o seu
arquivo com um `<link>` logo depois do `ui.css`, que é o ponto onde o `<style>` dela ficava, então
a cascata é a de antes. Arquivo compartilhado por telas irmãs é permitido (`pages/guia-cli.css`
serve aos quatro guias de CLI e de autoria). Quando uma regra de `pages/` passar a servir a mais de
uma área, ela sobe para `components/`. **Exceção:** os roteiros de ensaio
(`web/contest/ajuda/ensaio/{pt,en,es}.html`) mantêm o `<style>` inline, porque o
`server/bin/build-ensaio-pdf.sh` converte o HTML em PDF pelo LibreOffice, que não resolve
`<link href="/shared/…">`.

As 52 páginas continuam carregando só `<link rel="stylesheet" href="/shared/ui.css">`. Nenhuma
página precisa saber em que módulo mora uma classe. Em produção esse endereço entrega o **bundle**
(os módulos já concatenados, ver abaixo); em dev, o próprio manifesto.

**A ordem do manifesto É a cascata.** Entre duas regras de mesma especificidade, vence a que vem
depois. Os módulos nasceram (2026-09-29) de faixas **contíguas** do `ui.css` antigo e na mesma
ordem. A remontagem foi conferida linha a linha contra o original, e o estilo computado de todo
elemento das 56 páginas foi comparado no Chrome. Reordenar módulos pede a mesma conferência.

## Tokens: três níveis

| Nível | Exemplos | Quem usa |
|---|---|---|
| **Primitivos**: a paleta crua | `--blue-600`, `--slate-500`, `--space-4`, `--radius-lg`, `--elev-2` | só o próprio `tokens.css` |
| **Semânticos**: o papel | `--color-primary`, `--color-text-muted`, `--color-border`, `--color-danger-bg`, `--shadow-card` | componentes e páginas |
| **Legado**: alias dos nomes antigos | `--blue`, `--line`, `--ink`, `--ok`, `--mono`, `--border` | os ~700 usos que já existiam |

- **Trocar a identidade visual** (outro azul, outra fonte, cantos mais retos) é mexer nos
  primitivos e semânticos do `tokens.css`. O legado aponta para os semânticos e acompanha sozinho.
- **Tema escuro**, se um dia vier, é redefinir os **semânticos** dentro de
  `@media (prefers-color-scheme: dark)`. Por isso componente novo usa semântico, nunca primitivo:
  `--blue-600` continua sendo aquele azul no escuro, `--color-primary` não.
- Os tokens de espaçamento (`--space-*`), tamanho de texto (`--text-*`) e raio (`--radius-*`) já
  existem. O CSS migrado da Fase 1 ainda usa os valores literais; a adoção vem nas próximas fases.

### Exportação para ferramentas de design (formato DTCG)

`web/shared/styles/tokens.json` e `tokens.dark.json` são os mesmos tokens no formato do W3C Design
Tokens Community Group, o que Style Dictionary, Tokens Studio (Figma) e afins leem. São **gerados**
do `tokens.css` por `python3 server/bin/tokens-export.py`: mudou um token, rode o comando e
commite os `.json` junto. O `css-ratchet.sh` reprova se eles estiverem desatualizados.

- Os grupos são os níveis (`primitive`, `semantic`, `component`, `page`, `js`). Alias continua
  alias (`"{primitive.blue-600}"`), e o nível legado fica de fora.
- O `tokens.dark.json` traz só o que o tema escuro redefine, nos mesmos caminhos (mescle por cima).
- O exportador confere a **ida e volta**: resolver cada alias no JSON tem de dar o mesmo valor
  final que resolver a cadeia de `var()` no CSS. Se divergir, não grava.
- O caminho é CSS → JSON. Para importar uma mudança feita na ferramenta de design, edite o
  `tokens.css` e exporte de novo.

## Como estilizar uma tela nova

1. Procure o componente em `styles/components/`. `.section`, `.btn` (+ `secondary`, `ghost`,
   `danger`), `table.moj` (+ `.n` na coluna numérica), `.pill`, `.tag`, `.notice`, `.alert`,
   `details.fgroup`, `.dash-cards`, `.groupbar`/`.subnav` cobrem a maior parte dos painéis.
2. Faltou uma peça que **outra tela também usaria**? Crie ou estenda um módulo em
   `components/`. É de uma área só? Use `domains/`. Módulo novo = um arquivo + uma linha no
   manifesto, na posição certa.
3. Cor, espaço e raio saem de **token semântico**. Falta um? Crie o primitivo e o semântico no
   `tokens.css`. Hex solto numa página é justamente o que este sistema existe para evitar.
4. **Não** crie `<style>` em página, `style="…"` no HTML nem `el(…, { style: '…' })` /
   `.style.x = …` no JS para aparência. A exceção legítima é valor que vem do **dado**: cor de
   balão, largura calculada do placar (`--nprob`), posição absoluta de uma etiqueta. Nesses casos
   passe o dado por uma variável CSS (`style: '--bdot:#c00'`, `setProperty('--x', v)`) e deixe a
   regra no módulo.

## Quem lê o CSS como texto

O `ui.css` é um manifesto de `@import`. Onde o CSS é **inlinado num `<style>`** (documento
`blob:`/`srcdoc`, cuja base URL é opaca), um caminho relativo não resolve. Nesses lugares os
imports precisam ser expandidos:

| Onde | Como |
|---|---|
| Relatório offline (`server/score/report-gen.sh`, `rep_css`) | `server/bin/css-bundle.sh web/shared/ui.css` |
| Enunciado aberto em aba nova (`web/contest/contest.js`) | `bundledCss('/shared/ui.css')` de `web/shared/css-bundle.js` |
| Testes que leem regras (`smoke-print-chrome.sh`, `css-ratchet.sh`) | `css-bundle.sh` |

Os dois expansores aceitam **só** a sintaxe do manifesto: uma linha inteira
`@import url("caminho/relativo.css");`, sem media/layer/supports. Qualquer outra forma é erro
(rc 2 no shell), porque um relatório com metade do estilo sairia sem ninguém notar. Mexeu num
expansor, mexa no outro.

⚠ O CSS expandido vai **inlinado** no relatório offline, cujo smoke proíbe `import ` (seguido
de espaço), `fetch(` e `<script src=`. Isso vale inclusive para comentários de módulo. O
`css-ratchet.sh` confere.

## Bundle do deploy (`make css-bundle`)

O `make deploy` roda `make css-bundle`, que grava `web/shared/ui.bundle.css`: uma linha de
cabeçalho ("GERADO… NÃO EDITE") seguida da saída do `css-bundle.sh`. É **só concatenação**, sem
transpilar nem minificar, e o arquivo fica fora do git, no molde do `web/version.json`. A escrita
é atômica: se o manifesto não expandir, o alvo falha, o bundle anterior fica intacto e o deploy
para antes do restart.

O nginx (`server/etc/nginx/moj-app.conf.in`, `location = /shared/ui.css`) serve o bundle **no
endereço `/shared/ui.css`** quando ele existe (`try_files /shared/ui.bundle.css /shared/ui.css`).
Sem o bundle, serve o manifesto e tudo funciona do mesmo jeito, só que com a cascata de
requisições. Por isso ele é opcional em dev e nenhuma página muda.

Por que existe: com o manifesto, o navegador só descobre os 24 módulos **depois** de baixar o
`ui.css`. Isso custa uma ida e volta a mais na rede antes da primeira pintura, além de 25
revalidações por navegação (números em "Cache do CSS").

⚠ **Editou um módulo num checkout que tem bundle?** Rode `make css-bundle`, senão o nginx
continua servindo o CSS velho. O `css-ratchet.sh` reprova quando o bundle existe e não bate com
os módulos. Para editar CSS localmente, o mais simples é apagar o bundle
(`rm web/shared/ui.bundle.css`).

## Guarda: `server/test/css-ratchet.sh` (no `make check`)

**Portões** (reprovam sempre):
- o manifesto expande, e todo arquivo de `shared/styles/` aparece nele exatamente uma vez;
- nenhum `var(--x)` usa token sem definição em lugar nenhum. Foi assim que o editor de problemas
  viveu com `var(--border,#2a2a2a)` e `var(--bg,#14171c)`: fallbacks de tema escuro num site
  claro, porque `--border`/`--bg`/`--fg` nunca foram definidos;
- o CSS expandido é seguro para o relatório offline;
- o `tokens.json`/`tokens.dark.json` (DTCG) está em dia com o `tokens.css`;
- se `web/shared/ui.bundle.css` existe, ele é idêntico ao expandido de agora (fora a linha de
  cabeçalho). Bundle velho significa produção servindo estilo velho sem ninguém perceber.
- todo arquivo de `styles/pages/` é carregado por alguma página, e todo `<link>` para `pages/`
  aponta para um arquivo que existe.

**Catraca** (o legado não pode crescer): hex fora do `tokens.css`, blocos e linhas de `<style>`
no HTML, `style="…"`, estilo aplicado por JS, `<style>` criado por JS e `.css` avulso. Os
números ficam em `server/test/css-ratchet.baseline`. Se algum subir, o teste reprova. Se descer,
ele avisa, e `bash server/test/css-ratchet.sh --update` trava o novo patamar (o `--update` só
aceita descer).

## Tema escuro (opt-in)

O padrão é o **claro**. O escuro vale só para quem clica no **☾** da barra (no cabeçalho do site,
ao lado do idioma, e no chip de usuário das páginas de contest). A escolha fica salva no navegador
(`localStorage` `moj_theme`).

- **Como funciona:** `<html data-theme="dark">` redefine os tokens no fim do `tokens.css`
  (bloco "TEMA ESCURO"). Nenhum componente conhece o tema: ele só lê tokens. Quem troca é o
  `shared/theme.js` (sem recarregar); o `shared/theme-boot.js`, um script clássico síncrono no
  `<head>`, aplica a escolha **antes da primeira pintura**, para a página não piscar clara.
- **Semânticos à mão; o resto derivado.** Os tokens `--color-*` do escuro foram escolhidos à mão.
  Os de componente, página e JS são **derivados** em OKLCH pelo papel do nome: `-bg` vira
  superfície escura com a mesma matiz, `-text` vira texto claro, `-border` vira borda média, e o
  que já era de tema escuro (os chips do editor) fica como está. O contraste de 149 pares texto ×
  fundo foi conferido: todos ≥ 4,5:1 (WCAG AA).
- **Papel duplo:** a mesma cor de marca não serve para texto e para fundo sob texto branco. Por
  isso existem os `--color-*-fill` (fundo de botão, topbar, hero, chip ativo). No claro eles têm o
  mesmo valor do texto de marca; no escuro o texto clareia e o preenchimento continua saturado.
  **Fundo sob texto branco usa `-fill`.**
- **O que fica claro de propósito:** a impressão (o bloco é `@media screen`), o relatório offline
  (força `color-scheme: light`), os roteiros de ensaio (documentos), as paletas de dados (balões,
  gráficos) e o conteúdo dos enunciados.
- **Cor que vem de dado** e é aplicada como tom claro precisa de regra própria no escuro. Exemplo:
  o problema resolvido na tela do contest mistura a cor do balão à superfície escura
  (`pages/contest.css`).

## Diff visual (`server/test/visual/css-visual-diff.sh`)

A prova de que uma refatoração de estilo "não mudou nada", ou a lista exata do que mudou. Ele
compara o **estilo computado** de todo elemento (e dos `::before`/`::after`) entre um commit de
referência e a árvore de trabalho, em desktop (1366 px) e celular (390 px), no Chrome headless:

```
bash server/test/visual/css-visual-diff.sh            # referência = HEAD
bash server/test/visual/css-visual-diff.sh main --only 'admin|score' --widths 1366
bash server/test/visual/css-visual-diff.sh abc123 --b def456   # dois commits (dá p/ seguir editando)
```

- **Páginas:** todo `web/**/*.html` deslogado, mais as telas **logadas com dados** de
  `server/test/visual/pages.txt` (competidor, juiz, juiz-chefe, staff, telão e todos os painéis do
  admin). Os dados vêm do contest fictício do `server/bin/shots-ajuda.sh --serve`, com a API de
  verdade (`router.sh`) e sem tocar em dado real. Os dois lados usam o mesmo fixture e o mesmo
  ambiente.
- **Ruído tratado:** cada página é carregada duas vezes na referência, e o que muda entre as duas
  cargas (horário relativo, sorteio) fica fora da comparação. A página só é comparada depois que o
  DOM para de mudar por 500 ms. Página que diverge é recarregada até 3 vezes (a Central monta as
  seções na ordem em que a API responde). As animações ficam paradas.
- **Saída:** uma linha por página e largura; `report.json` e `pairs.txt` (cada mudança
  "propriedade: antes → depois", com a contagem) ficam em `/tmp/moj-visual-diff/last/`. O código
  de saída é 1 se houve diferença.
- **Validado** (29/09/2026): o teste nulo (`HEAD` contra a árvore com o `web/` igual) dá 216/216
  iguais, e 0,1 rem de padding a mais num módulo aparece como diferença em 96 elementos.
- Leva cerca de 25 minutos com todas as páginas. `--only` restringe por regex. Precisa de node,
  python3, jq e Chrome/Chromium (`CHROME=<binário>`). Não está no `make check`, por ser pesado.

Painel novo do admin ou aba nova do chefe: acrescente uma linha em `pages.txt`.

## Cache do CSS

Todo o estático do site, **CSS inclusive**, é servido com `Cache-Control: no-cache` (issue #22:
nada de arquivo velho no navegador depois de um deploy). O que resolve o desempenho do CSS modular
é o **bundle**: o `/shared/ui.css` sai já concatenado (`server/etc/nginx/moj-app.conf.in`). A
decisão saiu de medição (2026-09-29).

Ambiente: nginx 1.27 com as diretivas de gzip da produção. No **navegador**, Chrome headless
medindo 5 páginas × 6 repetições por combinação, com a ordem das variantes sorteada a cada rodada
e cada visita fria num contexto novo (o handshake entra na conta). "Quente" é voltar ao site
dentro dos 5 minutos do `max-age`. No **servidor**, `h2load` disparando o CSS de uma página com
50 e 200 clientes, 5 repetições.

Variantes:

- **A:** o `ui.css` único de antes da divisão, com `no-cache`;
- **B:** o manifesto modular com `no-cache`;
- **C:** o manifesto modular com `max-age=300`;
- **D:** o bundle com `max-age=300`;
- **E:** o bundle com `no-cache` (**o que está em produção**).

Primeira pintura (FCP), mediana das 5 páginas, HTTP/2, 1ª rodada (A, B, C):

| Rede | Visita | A | B | C |
|---|---|---|---|---|
| cabo (20 ms) | fria | 92 ms | 144 ms | 148 ms |
| cabo (20 ms) | quente | 84 ms | 130 ms | 84 ms |
| 4G (150 ms) | fria | 562 ms | 914 ms | 908 ms |
| 4G (150 ms) | quente | 346 ms | 706 ms | **214 ms** |
| 3G (562 ms) | fria | 1394 ms | 2160 ms | 2162 ms |
| 3G (562 ms) | quente | 1172 ms | 1962 ms | **622 ms** |

A mesma medida na 2ª rodada, depois do bundle (A, C, D, E):

| Rede | Visita | A | C | D | E |
|---|---|---|---|---|---|
| cabo (20 ms) | fria | 96 ms | 156 ms | 96 ms | 104 ms |
| cabo (20 ms) | quente | 86 ms | 84 ms | **60 ms** | 86 ms |
| 4G (150 ms) | fria | 566 ms | 916 ms | 574 ms | 578 ms |
| 4G (150 ms) | quente | 348 ms | 218 ms | **192 ms** | 350 ms |

Em HTTP/1.1 as diferenças são as mesmas, e maiores para o manifesto sem bundle (4G fria: A 576,
C 1158, D 596 ms), porque o navegador abre no máximo 6 conexões por origem.

Conclusões:

- **O manifesto servido cru (B, C) piora a visita fria em ~350 ms em 4G.** O navegador só
  descobre os módulos depois de baixar o `ui.css`, o que custa uma ida e volta a mais na rede. O
  `max-age` não resolve isso. Com `no-cache` (B), cada navegação ainda revalida 25 arquivos: no
  servidor, cerca de 13× a CPU do nginx por página e 2,9 a 5,4 KB de cabeçalhos, contra 0,1 a
  0,2 KB de A.
- **O bundle (D, E) volta ao patamar de A** na visita fria (+8 ms em 4G/HTTP/2): 1 requisição
  e 19,3 KB contra 16,3 KB. Os 3 KB a mais são conteúdo real, os tokens novos do `tokens.css`.
- **Com o bundle, `no-cache` (E) fica igual a A nas duas visitas** (4G: 578 × 566 ms fria,
  350 × 348 ms quente). É a configuração adotada: mantém a regra da issue #22 sem exceção.
- **O `max-age` (D) deixaria a visita quente 156 ms mais rápida** que A em 4G, porque o CSS nem
  seria pedido. O preço seria até 5 min de JS novo com CSS velho depois de cada deploy. Foi
  descartado para manter a regra de não cachear. Se um dia valer a pena, a medição está aqui.

## Roteiro

1. **Fundação** (feita): tokens em três níveis, `ui.css` dividido em módulos, expansores, catraca,
   tokens indefinidos corrigidos e bundle no deploy; diff visual (`css-visual-diff.sh`).
2. **Componentes**: extrair os padrões repetidos nos `<style>` das páginas (sub-abas, chips,
   grades de formulário, caixas de aviso) e passar os módulos a usar tokens semânticos.
3. **Páginas**: migrar os 41 blocos `<style>` para `domains/`, dos maiores para os menores
   (`problemas/editar.html`, `treino/index.html`, `contest/index.html`…).
4. **JS**: trocar `style:`/`.style.x =` de aparência por classes, começando pelas abas do admin.
5. **Tema escuro** (feito, opt-in): semânticos à mão, o resto derivado, contraste conferido.
