// Reexecucao ao vivo: o numero que esta no documento e recalculado no
// navegador, contra a mesma base, pela mesma consulta.
//
// A base esta em Parquet e e lida por HTTP range: o DuckDB baixa so os
// pedacos que a consulta toca, em vez do arquivo inteiro.
"use strict";

const TABELAS = ["pedidos", "avaliacoes", "itens", "produtos", "vendedores", "clientes", "categorias"];
const CDN = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";

let conexao = null;     // promessa da conexao pronta
let estadoBase = "frio"; // frio | carregando | pronto | erro

async function abrir() {
  if (conexao) return conexao;
  estadoBase = "carregando";
  conexao = (async () => {
    const duckdb = await import(CDN);
    const pacote = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    const worker = await duckdb.createWorker(pacote.mainWorker);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR), worker);
    await db.instantiate(pacote.mainModule, pacote.pthreadWorker);
    const con = await db.connect();
    const base = new URL("dados/", location.href).href;
    for (const t of TABELAS) {
      await con.query(`CREATE VIEW ${t} AS SELECT * FROM read_parquet('${base}${t}.parquet')`);
    }
    estadoBase = "pronto";
    return con;
  })().catch((e) => { estadoBase = "erro"; conexao = null; throw e; });
  return conexao;
}

// aquece em segundo plano, para o primeiro clique nao esperar o download
if ("requestIdleCallback" in window) requestIdleCallback(() => abrir().catch(() => {}), { timeout: 4000 });
else setTimeout(() => abrir().catch(() => {}), 2500);

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (v) => {
  if (v == null) return "";
  if (typeof v === "bigint") return String(v);
  if (typeof v === "number") return String(Math.round(v * 1e6) / 1e6);
  return String(v).trim();
};

function tabelaHTML(colunas, linhas, destaque) {
  const th = colunas.map((c) => `<th>${esc(c)}</th>`).join("");
  const tr = linhas.map((l, i) =>
    `<tr>${l.map((v) => `<td${destaque && destaque[i] === false ? ' class="dif"' : ""}>${esc(v)}</td>`).join("")}</tr>`
  ).join("");
  return `<table class="res"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

// Consulta livre, para a oficina do contrato. So aceita leitura: um SELECT
// ou WITH, uma instrucao. Nao e seguranca, e o navegador da propria pessoa;
// e para um CREATE ou DROP nao derrubar as views que o replay usa.
window.rodarSQL = async function (sql) {
  const limpo = String(sql || "").trim().replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(limpo)) throw new Error("só consultas de leitura: comece com SELECT ou WITH");
  if (/;/.test(limpo.replace(/'[^']*'/g, ""))) throw new Error("uma consulta por vez, sem ponto e vírgula no meio");
  const t0 = performance.now();
  const con = await abrir();
  const res = await con.query(limpo);
  const linhas = res.toArray().map((x) => x.toJSON());
  const colunas = linhas.length ? Object.keys(linhas[0]) : res.schema.fields.map((f) => f.name);
  return {
    colunas,
    linhas: linhas.slice(0, 50).map((l) => colunas.map((c) => norm(l[c]))),
    total: linhas.length,
    segundos: (performance.now() - t0) / 1000,
  };
};

// Monta o botao de reexecucao dentro do painel do fato.
// `consulta` e o resultado guardado no pacote, medido quando o documento foi escrito.
window.prepararExecucao = function (fato, consulta, el) {
  if (!fato || !fato.sql) { el.innerHTML = ""; return; }
  const dica = estadoBase === "pronto"
    ? "a base já está carregada"
    : estadoBase === "carregando" ? "a base está carregando em segundo plano" : "";
  el.innerHTML = `
    <button class="primario" id="bRodar">Rodar esta consulta agora</button>
    <span class="dicaRodar">${esc(dica)}</span>
    <div id="saidaRodar"></div>`;
  const saida = el.querySelector("#saidaRodar");
  const botao = el.querySelector("#bRodar");

  botao.addEventListener("click", async () => {
    botao.disabled = true;
    botao.textContent = "rodando…";
    saida.innerHTML = `<p class="maisl">abrindo a base e executando. Na primeira vez isso leva alguns segundos.</p>`;
    const t0 = performance.now();
    try {
      const con = await abrir();
      const res = await con.query(fato.sql);
      const linhas = res.toArray().map((x) => x.toJSON());
      const colunas = linhas.length ? Object.keys(linhas[0]) : [];
      const corpo = linhas.slice(0, 12).map((l) => colunas.map((c) => norm(l[c])));
      const seg = ((performance.now() - t0) / 1000).toFixed(1);

      // compara com o resultado guardado quando o documento foi escrito
      let veredito = "";
      if (consulta && consulta.linhas && consulta.linhas.length) {
        const antes = consulta.linhas.map((l) => l.map(norm));
        const agora = corpo;
        const n = Math.min(antes.length, agora.length);
        let iguais = 0, total = 0;
        const porLinha = [];
        for (let i = 0; i < n; i++) {
          const ok = antes[i].length === agora[i].length && antes[i].every((v, k) => v === agora[i][k]);
          porLinha.push(ok); total++; if (ok) iguais++;
        }
        veredito = iguais === total && total > 0
          ? `<p class="confere ok">Confere. ${total === 1 ? "A linha reproduz" : "As " + total + " linhas reproduzem"} exatamente o que está no documento.</p>`
          : `<p class="confere nao">${total - iguais} de ${total} linha(s) não reproduziram. Investigar antes de usar este número.</p>`;
        el.dataset.porLinha = JSON.stringify(porLinha);
      }

      saida.innerHTML = veredito +
        (colunas.length ? tabelaHTML(colunas, corpo, el.dataset.porLinha ? JSON.parse(el.dataset.porLinha) : null) : `<p class="maisl">sem linhas</p>`) +
        `<p class="maisl">executado no seu navegador em ${seg}s, sobre a base real. Nada foi enviado para nenhum servidor.</p>`;
      botao.textContent = "Rodar de novo";
      botao.disabled = false;
    } catch (e) {
      saida.innerHTML = `<p class="confere nao">Não consegui executar: ${esc(e && e.message ? e.message : e)}</p>
        <p class="maisl">A consulta continua visível acima e pode ser rodada em qualquer DuckDB sobre a mesma base.</p>`;
      botao.textContent = "Tentar de novo";
      botao.disabled = false;
    }
  });
};
