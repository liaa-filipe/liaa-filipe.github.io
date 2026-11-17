// Oficina do contrato: a pessoa escreve a propria consulta e so consegue
// transformar o resultado em fato se preencher os quatro campos e se o numero
// que ela escreve tiver saido da consulta. E a V1 do metodo, em miniatura.
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const EXEMPLOS = [
  {
    rot: "Quantos pedidos foram entregues",
    sql: `SELECT COUNT(*) AS pedidos,
       COUNT(*) FILTER (WHERE order_status = 'delivered') AS entregues,
       ROUND(100.0 * COUNT(*) FILTER (WHERE order_status = 'delivered') / COUNT(*), 2) AS pct_entregues
FROM pedidos`,
  },
  {
    rot: "Nota média, com e sem atraso",
    sql: `SELECT CASE WHEN p.order_delivered_customer_date > p.order_estimated_delivery_date
            THEN 'com atraso' ELSE 'no prazo' END AS entrega,
       COUNT(*) AS avaliacoes,
       ROUND(AVG(a.review_score), 2) AS nota_media
FROM pedidos p
JOIN avaliacoes a ON a.order_id = p.order_id
WHERE p.order_status = 'delivered'
  AND p.order_delivered_customer_date IS NOT NULL
GROUP BY 1
ORDER BY 1`,
  },
  {
    rot: "Frete médio por estado do cliente",
    sql: `SELECT c.customer_state AS uf,
       COUNT(*) AS itens,
       ROUND(AVG(i.freight_value), 2) AS frete_medio
FROM itens i
JOIN pedidos p  ON p.order_id = i.order_id
JOIN clientes c ON c.customer_id = p.customer_id
GROUP BY 1
ORDER BY frete_medio DESC
LIMIT 8`,
  },
];

let resultado = null; // ultimo resultado bem-sucedido

// ---------------------------------------------------------------- numeros
// Numero em portugues: 12.311 / 12,85 / 12,85% / R$ 15,10 / 95832.
function numerosDoTexto(t) {
  const achados = String(t).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g) || [];
  return achados
    .map((s) => ({ texto: s, valor: Number(s.replace(/\./g, "").replace(",", ".")), casas: (s.split(",")[1] || "").length }))
    // um ano solto na frase ("em 2017") nao e uma afirmacao numerica sobre o resultado
    .filter((n) => !(/^\d{4}$/.test(n.texto) && n.valor >= 1990 && n.valor <= 2035));
}

// O numero escrito confere se for igual a alguma celula do resultado,
// arredondada para as casas que a pessoa escreveu.
function saiuDaConsulta(n, linhas) {
  for (const l of linhas) for (const v of l) {
    const x = Number(v);
    if (!Number.isFinite(x)) continue;
    const f = Math.pow(10, n.casas);
    if (Math.round(x * f) / f === n.valor) return true;
  }
  return false;
}

// ---------------------------------------------------------------- checagens
function checar() {
  const af = $("ofAfirm").value.trim();
  const esc0 = $("ofEscopo").value.trim();
  const grao = $("ofGrao").value.trim();
  const data = $("ofData").value;
  const nums = numerosDoTexto(af);
  const fora = resultado ? nums.filter((n) => !saiuDaConsulta(n, resultado.linhas)) : nums;
  const palavras = (s) => s.split(/\s+/).filter(Boolean).length;

  const itens = [
    { ok: !!resultado, rot: "Fonte", falta: "não há consulta: rode uma antes de afirmar o número", det: resultado ? "a consulta acima, que roda de novo a qualquer momento" : "rode uma consulta primeiro" },
    { ok: nums.length > 0, rot: "Afirmação com número", falta: "a frase não tem número nenhum para verificar", det: nums.length ? nums.map((n) => n.texto).join(", ") : "escreva a frase que iria para o documento" },
    { ok: nums.length > 0 && fora.length === 0, rot: "O número saiu da consulta",
      falta: "o número escrito não aparece no resultado da consulta",
      det: !nums.length ? "—" : fora.length ? "não aparece no resultado: " + fora.map((n) => n.texto).join(", ") : "todos aparecem no resultado" },
    { ok: esc0.length >= 15 && palavras(esc0) >= 3, rot: "Escopo", falta: "falta o escopo, que é a população exata a que o número se refere", det: "a população exata a que o número se refere" },
    { ok: grao.length >= 4 && palavras(grao) >= 1, rot: "Grão", falta: "falta o grão, que é a unidade contada", det: "a unidade contada: pedido, item, cliente…" },
    { ok: /^\d{4}-\d{2}-\d{2}$/.test(data), rot: "Data da consulta", falta: "falta a data em que o número foi medido", det: data || "quando o número foi medido" },
  ];

  $("ofChecks").innerHTML = itens
    .map((i) => `<li class="${i.ok ? "ok" : "nao"}"><b>${i.ok ? "✓" : "·"} ${esc(i.rot)}</b><span>${esc(i.det)}</span></li>`)
    .join("");

  const aceito = itens.every((i) => i.ok);
  const motivo = itens.find((i) => !i.ok);
  desenharComparacao(af, aceito, motivo, { escopo: esc0, grao, data });
}

function desenharComparacao(af, aceito, motivo, campos) {
  if (!af) { $("ofSaida").innerHTML = ""; return; }
  const comum = `<div class="ofc comum"><p class="t">Num PRD comum</p>
    <p class="frase">${esc(af)}</p>
    <p class="pe">Entra assim. Ninguém pergunta de onde veio.</p></div>`;
  const metodo = aceito
    ? `<div class="ofc aceito"><p class="t">No PRD2Spec · aceito</p>
        <p class="frase">${esc(af)}<sup>1</sup></p>
        <p class="rodape"><b>[1]</b> fonte: consulta da oficina · escopo: ${esc(campos.escopo)} ·
        grão: ${esc(campos.grao)} · data: ${esc(campos.data)}</p>
        <p class="pe">Qualquer pessoa pode reexecutar a consulta e chegar ao mesmo número.</p></div>`
    : `<div class="ofc recusado"><p class="t">No PRD2Spec · recusado</p>
        <p class="frase">${esc(af)}</p>
        <p class="pe">A verificação interrompe o processo: ${esc(motivo ? motivo.falta : "o contrato está incompleto")}.
        Enquanto o contrato não fecha, o número não entra no documento.</p></div>`;
  $("ofSaida").innerHTML = comum + metodo;
}

// ---------------------------------------------------------------- consulta
async function rodar() {
  const b = $("ofRodar");
  b.disabled = true; b.textContent = "rodando…";
  $("ofRes").innerHTML = `<p class="maisl">executando no seu navegador. Na primeira vez a base leva alguns segundos para abrir.</p>`;
  try {
    if (!window.rodarSQL) throw new Error("o motor de consulta não carregou");
    resultado = await window.rodarSQL($("ofSql").value);
    const th = resultado.colunas.map((c) => `<th>${esc(c)}</th>`).join("");
    const tr = resultado.linhas.map((l) => `<tr>${l.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
    $("ofRes").innerHTML = resultado.total
      ? `<table class="res"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
         <p class="maisl">${resultado.total} linha(s) em ${resultado.segundos.toFixed(1)}s, sobre a base real${resultado.total > 50 ? ", mostrando as 50 primeiras" : ""}.</p>`
      : `<p class="maisl">a consulta não devolveu linhas.</p>`;
    $("ofFato").hidden = !resultado.total;
  } catch (e) {
    resultado = null;
    $("ofRes").innerHTML = `<p class="confere nao">${esc(e && e.message ? e.message : e)}</p>`;
    $("ofFato").hidden = true;
  }
  b.disabled = false; b.textContent = "Rodar";
  checar();
}

// ---------------------------------------------------------------- inicio
function iniciar() {
  $("ofExemplos").innerHTML = EXEMPLOS
    .map((x, i) => `<button type="button" class="ofex" data-i="${i}">${esc(x.rot)}</button>`).join("");
  $("ofExemplos").addEventListener("click", (e) => {
    const b = e.target.closest(".ofex"); if (!b) return;
    $("ofSql").value = EXEMPLOS[Number(b.dataset.i)].sql;
    resultado = null; $("ofRes").innerHTML = ""; $("ofFato").hidden = true; checar();
  });
  $("ofSql").value = EXEMPLOS[0].sql;
  $("ofData").value = new Date().toISOString().slice(0, 10);
  $("ofRodar").addEventListener("click", rodar);
  for (const id of ["ofAfirm", "ofEscopo", "ofGrao", "ofData"]) $(id).addEventListener("input", checar);
  checar();
}
iniciar();
