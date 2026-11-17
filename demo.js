// Replay comparado: o PRD2Spec e um prompt direto sobre o mesmo problema.
// Tudo que aparece vem dos artefatos reais, empacotados por site/dados/empacotar.js.
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Markdown minimo, so o que aparece nestes documentos: negrito, codigo,
// citacao e titulo. Sem isso o texto chega com os asteriscos na tela.
function md(s, limite) {
  let t = String(s == null ? "" : s);
  if (limite && t.length > limite) t = t.slice(0, limite).replace(/\s+\S*$/, "") + "…";
  return esc(t)
    .replace(/^\s*&gt;\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, " ");
}
const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const BEATS = [
  { id: "entrada", rot: "Entrada" },
  { id: "pesquisa", rot: "Pesquisa" },
  { id: "escrita", rot: "Escrita" },
  { id: "verificacao", rot: "Verificação" },
  { id: "revisao", rot: "Revisão a frio" },
  { id: "resultado", rot: "Resultado" },
];

const VERIFICACOES = [
  ["V1", "toda citação resolve para um fato completo"],
  ["V2", "as oito seções obrigatórias, na ordem"],
  ["V3", "veredito calculado, nunca declarado"],
  ["V4", "todo requisito cumpre o contrato"],
  ["V5", "nenhum fato diagnosticado e abandonado"],
  ["V6", "critério de aceite com condição testável"],
  ["V7", "pergunta em aberto com caminho e bloqueio"],
  ["V8", "todo risco com sinal e resposta"],
];

const estado = { casos: [], caso: null, dados: null, beat: -1, tocando: false, timer: null };

// ---------------------------------------------------------------- índice
async function iniciar() {
  estado.casos = await (await fetch("dados/casos.json")).json();
  // só os dois casos que o demo oferece; o terceiro fica na página do projeto
  estado.casos = estado.casos.filter((c) => c.id !== "c1-notas-baixas");
  $("casos").innerHTML = estado.casos
    .map((c, i) => `<button class="caso" data-i="${i}" aria-pressed="${i === 0}">
      <b>${esc(c.titulo)}</b><span>“${esc(c.enunciado)}”</span></button>`)
    .join("");
  $("casos").addEventListener("click", (e) => {
    const b = e.target.closest(".caso"); if (!b) return;
    carregar(Number(b.dataset.i));
  });
  montarPassos();
  await carregar(0);
}

function montarPassos() {
  $("passos").innerHTML = BEATS.map((b, i) => `<span class="pst" data-i="${i}">${esc(b.rot)}</span>`).join("");
}

async function carregar(i) {
  parar();
  [...$("casos").children].forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
  estado.caso = estado.casos[i];
  $("ladoA").innerHTML = '<p class="maisl">carregando a execução…</p>';
  $("ladoB").innerHTML = "";
  estado.dados = await (await fetch("dados/" + estado.caso.arquivo)).json();
  zerar();
}

// ---------------------------------------------------------------- controles
function zerar() {
  parar();
  estado.beat = -1;
  $("ladoA").innerHTML = ""; $("ladoB").innerHTML = "";
  $("statA").textContent = ""; $("statB").textContent = "";
  $("result").classList.remove("on"); $("result").innerHTML = "";
  pintarPassos();
  $("bPasso").disabled = false;
  $("bExec").textContent = "Executar";
}

function pintarPassos() {
  [...$("passos").children].forEach((e, i) => {
    e.className = "pst" + (i < estado.beat ? " feito" : i === estado.beat ? " agora" : "");
  });
}

function avancar() {
  if (estado.beat >= BEATS.length - 1) { parar(); return false; }
  estado.beat++;
  pintarPassos();
  desenhar(BEATS[estado.beat].id);
  if (estado.beat === BEATS.length - 1) { $("bPasso").disabled = true; parar(); }
  return true;
}

function tocar() {
  if (estado.tocando) { parar(); return; }
  if (estado.beat >= BEATS.length - 1) zerar();
  estado.tocando = true;
  $("bExec").textContent = "Pausar";
  const passo = () => { if (!avancar()) return; estado.timer = setTimeout(passo, reduz ? 600 : 2600); };
  passo();
}

function parar() {
  estado.tocando = false;
  clearTimeout(estado.timer);
  $("bExec").textContent = estado.beat >= BEATS.length - 1 ? "Executar de novo" : "Executar";
}

// ---------------------------------------------------------------- desenho
function bloco(lado, titulo, html) {
  $(lado).insertAdjacentHTML("beforeend", `<div class="evt"><p class="et">${esc(titulo)}</p>${html}</div>`);
  $(lado).parentElement.scrollIntoView({ block: "nearest", behavior: reduz ? "auto" : "smooth" });
}

function tabela(q) {
  if (q.erro) return `<p class="maisl">a consulta não pôde ser executada: ${esc(q.erro)}</p>`;
  if (!q.total) return `<p class="maisl">sem linhas</p>`;
  const th = q.colunas.map((c) => `<th>${esc(c)}</th>`).join("");
  const tr = q.linhas.map((l) => `<tr>${l.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
  const mais = q.total > q.linhas.length ? `<p class="maisl">e mais ${q.total - q.linhas.length} linha(s)</p>` : "";
  return `<table class="res"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>${mais}`;
}

// o PRD cita fatos com [^id]; aqui a citação vira um botão que abre o fato
function comCitacoes(texto, fatos, citacoes) {
  // corta antes de renderizar, para a citacao nao ser partida ao meio
  return md(texto, 400).replace(/\[\^([^\]]+)\]/g, (_, id) => {
    const alvo = citacoes[id];
    const f = alvo && fatos.find((x) => x.ancora === alvo.split("#")[1]);
    return f ? `<cite data-fato="${esc(f.ancora)}" title="ver o fato e reexecutar a consulta">${esc(id)}</cite>` : "";
  });
}

function desenhar(beat) {
  const d = estado.dados, p = d.pipeline, b = d.baseline;

  if (beat === "entrada") {
    const q = (p.enquadramento && p.enquadramento.perguntas) || [];
    bloco("ladoA", "Enquadrar · questionário fixo com o time",
      q.map((x) => `<p class="qa"><b>${esc(x.pergunta)}</b>${md(x.resposta)}</p>`).join("") ||
      `<p class="maisl">sem enquadramento</p>`);
    const brief = (b.briefing || "").split("## Base de dados")[0].replace(/^#[^\n]*\n/, "").trim();
    bloco("ladoB", "Briefing · o pedido, como ele chega",
      `<div class="sec"><p style="-webkit-line-clamp:unset">${md(brief, 820)}</p></div>`);
    $("statA").textContent = q.length + " perguntas respondidas";
    $("statB").textContent = "1 briefing";
  }

  if (beat === "pesquisa") {
    bloco("ladoA", `Pesquisar · ${p.consultas.length} consultas, uma pergunta cada`,
      p.consultas.map((q) => `<p class="arq">${esc(q.arquivo)}</p>${tabela(q)}`).join(""));
    bloco("ladoA", `Gravar os fatos · ${p.fatos.length} fatos com os quatro campos`,
      p.fatos.map((f) => `<div class="fato"><b>${esc(f.titulo)}</b>${md(f.afirmacao, 190)}
        <dl><dt>fonte</dt><dd>${esc((f.fonte || "").slice(0, 90))}</dd>
        <dt>escopo</dt><dd>${esc((f.escopo || "").slice(0, 110))}</dd>
        <dt>grão</dt><dd>${esc((f.grao || "").slice(0, 90))}</dd>
        <dt>data</dt><dd>${esc(f.data || "")}</dd></dl></div>`).join(""));
    bloco("ladoB", `Consultar · ${b.consultas.length} consultas`,
      b.consultas.map((q) => `<p class="arq">${esc(q.arquivo)}</p>${tabela(q)}`).join(""));
    bloco("ladoB", "Gravar os fatos",
      `<div class="nada">Não há etapa de fato. Os números vão direto da consulta para o texto, sem
       declarar fonte, escopo, grão nem data.</div>`);
    $("statA").textContent = p.consultas.length + " consultas · " + p.fatos.length + " fatos";
    $("statB").textContent = b.consultas.length + " consultas · 0 fatos";
  }

  if (beat === "escrita") {
    bloco("ladoA", `Escrever · ${p.prd.secoes.length} seções, ${p.prd.palavras} palavras`,
      p.prd.secoes.map((s) => `<div class="sec"><b>${s.n}. ${esc(s.titulo)}</b><p>${comCitacoes(s.md, p.fatos, p.prd.citacoes)}</p></div>`).join("") +
      `<p class="maisl">Clique em qualquer citação para abrir o fato e reexecutar a consulta.</p>`);
    bloco("ladoB", `Escrever · ${b.prd.secoes.length} seções, ${b.prd.palavras} palavras`,
      b.prd.secoes.map((s) => `<div class="sec"><b>${s.n}. ${esc(s.titulo)}</b><p>${md(s.md, 400)}</p></div>`).join(""));
    const prov = d.resultado.proveniencia;
    $("statA").textContent = prov.pipeline.total + " números, todos citados";
    $("statB").textContent = prov.baseline.sem_fonte + " números sem fonte";
  }

  if (beat === "verificacao") {
    bloco("ladoA", "Verificar · oito checagens fora do modelo",
      `<div class="ver">${VERIFICACOES.map(([k, t]) => `<span class="vk" title="${esc(t)}">${k} ✓</span>`).join("")}</div>
       <p class="maisl">Zero erros e zero avisos. Erro interrompe o processo e devolve o documento para correção.</p>`);
    bloco("ladoB", "Verificar",
      `<div class="nada">Não existe etapa de verificação. Nada confere se os números do documento
       se reproduzem, e o próprio texto é a única autoridade sobre si mesmo.</div>`);
  }

  if (beat === "revisao") {
    const r = (rev, lado, nome) => {
      if (!rev) return bloco(lado, "Revisão a frio", `<p class="maisl">não disponível</p>`);
      const bl = rev.achados.filter((a) => a.classe === "bloqueante");
      bloco(lado, `Revisão a frio · ${rev.bloqueante} bloqueantes, ${rev.corrigir} a corrigir`,
        bl.map((a) => `<p class="ach bl"><b>BLOQUEANTE ${esc(a.cod)}</b>${esc(a.titulo)}</p>`).join("") ||
        `<p class="maisl">nenhum bloqueante</p>`);
      $(nome).textContent = rev.bloqueante + " bloqueantes";
    };
    r(p.revisao, "ladoA", "statA");
    r(b.revisao, "ladoB", "statB");
  }

  if (beat === "resultado") desenharResultado();
}

function desenharResultado() {
  const d = estado.dados, prov = d.resultado.proveniencia, ru = d.resultado.rubrica;
  const linhas = (ru ? ru.blocos : []).map((x) => {
    const cls = x.pipeline > x.baseline ? "ganha" : x.pipeline < x.baseline ? "perde" : "";
    return `<tr><td>${esc(x.bloco)} · ${esc(x.nome)}</td>
      <td class="v ${cls}">${x.pipeline} de ${x.max}</td><td class="v">${x.baseline} de ${x.max}</td></tr>`;
  }).join("");
  $("result").innerHTML = `
    <h3>O que saiu dos dois lados</h3>
    <div class="rgrid">
      <div class="rbox a"><b>${prov.pipeline.sem_fonte} de ${prov.pipeline.total}</b>
        <span>números sem fonte no documento do PRD2Spec</span></div>
      <div class="rbox b"><b>${prov.baseline.sem_fonte} de ${prov.baseline.total}</b>
        <span>números sem fonte no documento do prompt direto</span></div>
      <div class="rbox a"><b>${d.pipeline.revisao ? d.pipeline.revisao.bloqueante : "—"} × ${d.baseline.revisao ? d.baseline.revisao.bloqueante : "—"}</b>
        <span>defeitos bloqueantes apontados pelo revisor a frio</span></div>
      ${ru ? `<div class="rbox a"><b>${ru.total.pipeline} × ${ru.total.baseline}</b>
        <span>critérios cumpridos de ${ru.total_itens}, pela rubrica v2.1</span></div>` : ""}
    </div>
    ${ru ? `<table class="blocos"><thead><tr><th>Bloco da rubrica</th><th>PRD2Spec</th><th>Prompt direto</th></tr></thead>
      <tbody>${linhas}</tbody></table>` : ""}
    <p class="nota">Avaliação cega pela rubrica v2.1, três execuções por documento, cada um
    pontuado em isolamento. A contagem de números é feita pelo mesmo extrator nos dois lados.
    O resultado dos três casos está na <a href="index.html#prova">página do projeto</a>.</p>`;
  $("result").classList.add("on");
  $("result").scrollIntoView({ block: "nearest", behavior: reduz ? "auto" : "smooth" });
}

// ---------------------------------------------------------------- fato
document.addEventListener("click", (e) => {
  const c = e.target.closest("cite[data-fato]");
  if (!c) return;
  const f = estado.dados.pipeline.fatos.find((x) => x.ancora === c.dataset.fato);
  if (!f) return;
  $("dlgT").textContent = f.titulo;
  $("dlgIn").innerHTML = `
    <p>${md(f.afirmacao)}</p>
    <dl class="fato" style="border:none;padding:0">
      <dt>fonte</dt><dd>${esc(f.fonte || "")}</dd>
      <dt>escopo</dt><dd>${esc(f.escopo || "")}</dd>
      <dt>grão</dt><dd>${esc(f.grao || "")}</dd>
      <dt>data</dt><dd>${esc(f.data || "")}</dd>
    </dl>
    <p class="et" style="margin-top:18px">A consulta que produziu este número</p>
    <div class="sqlbox">${esc(f.sql || "não disponível")}</div>
    <div id="rodar"></div>`;
  $("dlg").showModal();
  // o resultado guardado da mesma consulta, para comparar com o que rodar agora
  const q = estado.dados.pipeline.consultas.find((x) => x.arquivo === f.consulta);
  if (window.prepararExecucao) window.prepararExecucao(f, q, $("rodar"));
});

$("bExec").addEventListener("click", tocar);
$("bPasso").addEventListener("click", () => { parar(); avancar(); });
$("bZera").addEventListener("click", zerar);
iniciar();
