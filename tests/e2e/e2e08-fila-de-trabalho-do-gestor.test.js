/**
 * E2E-08 — A fila de trabalho do gestor: achar o caso certo e tira-lo da fila.
 *
 * Branch: branch8-Manuele
 *
 * FLUXO DO USUARIO
 * O gestor publico abre o painel no comeco do expediente. A fila tem chamados
 * de varias categorias. Ele filtra pelos que ainda ninguem assumiu, restringe
 * a categoria da equipe dele, encontra o caso, assume o atendimento — e o caso
 * sai da fila de pendentes e entra na de em andamento.
 *
 * O QUE ESTA JORNADA PROTEGE
 * Filtro e paginacao parecem assunto de conveniencia e sao, na verdade, o que
 * decide se o chamado do cidadao vai ser atendido. Um filtro que devolve o
 * conjunto errado nao quebra nada visivel: a tela desenha, a lista tem itens,
 * e um chamado fica meses parado porque nunca apareceu para a equipe certa.
 *
 * O teste verifica o filtro nas DUAS direcoes, e essa e a parte que um caso
 * isolado costuma deixar passar:
 *   - o alvo APARECE no recorte a que pertence;
 *   - o alvo SOME do recorte a que deixou de pertencer.
 * Verificar so a primeira metade passa verde com um filtro que ignora o
 * parametro e devolve tudo.
 *
 * NOTA SOBRE AMBIENTE COMPARTILHADO
 * O gestor enxerga a fila inteira, que inclui o que outras execucoes deixaram
 * para tras. Por isso nenhuma assercao aqui e sobre QUANTIDADE — e sempre
 * sobre a presenca ou a ausencia dos identificadores que esta jornada criou.
 * Assercao sobre contagem em ambiente compartilhado e teste intermitente.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e08-*.test.js"
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = require('../../api/smart-city');
const { USUARIOS } = require('../../lib/config');
const insp = require('../../lib/inspecao');
const contrato = require('../../data/contrato');
const demandas = require('../../data/demandas');
const usuarios = require('../../data/usuarios');

/** Ver a nota em e2e01: arranjo local para a branch rodar sozinha. */
async function cidadaoRecemCadastrado() {
  const dados = usuarios.novo();
  const cadastro = await api.registrar(dados);
  assert.equal(cadastro.status, 201, `arranjo falhou: cadastro respondeu ${insp.resumo(cadastro)}`);
  const sessao = await api.autenticar({ email: dados.email, senha: dados.password });
  return { dados, token: sessao.accessToken };
}

test('E2E-08 o gestor filtra a fila, assume o chamado e ele muda de recorte', async () => {
  // ---- PASSO 1 — o bairro abre tres chamados de tipos diferentes --------
  const { token: tokenCidadao } = await cidadaoRecemCadastrado();

  // Tres categorias distintas da lista fechada do contrato. O teste nao sabe
  // os nomes: ele pega as tres primeiras do oraculo. Se a lista mudar na
  // especificacao, o teste acompanha sozinho.
  assert.ok(
    contrato.CATEGORIAS.length >= 3,
    'pre-condicao do contrato: a jornada precisa de pelo menos tres categorias',
  );
  const [categoriaAlvo, outraA, outraB] = contrato.CATEGORIAS;

  const alvo = insp.carga((await api.criarDemanda(tokenCidadao, demandas.com({ categoria: categoriaAlvo }))).body);
  const vizinhaA = insp.carga((await api.criarDemanda(tokenCidadao, demandas.com({ categoria: outraA }))).body);
  const vizinhaB = insp.carga((await api.criarDemanda(tokenCidadao, demandas.com({ categoria: outraB }))).body);

  for (const [rotulo, d] of [['alvo', alvo], ['vizinhaA', vizinhaA], ['vizinhaB', vizinhaB]]) {
    assert.ok(d?.id, `PASSO 1: o registro "${rotulo}" nao devolveu identificador`);
    assert.equal(
      d.status,
      contrato.STATUS_INICIAL,
      `PASSO 1: todo chamado entra na fila em ${contrato.STATUS_INICIAL}; "${rotulo}" entrou em "${d.status}"`,
    );
  }

  // ---- PASSO 2 — o gestor abre a fila do que ninguem assumiu ------------
  const tokenGestor = await api.tokenDe(USUARIOS.gestor);
  const pendentes = await api.percorrerListagem(tokenGestor, { status: contrato.STATUS_INICIAL });

  const foraDoRecorte = pendentes.filter(d => d.status !== contrato.STATUS_INICIAL);
  assert.deepEqual(
    foraDoRecorte.map(d => `${d.id}:${d.status}`),
    [],
    `PASSO 2: o filtro status=${contrato.STATUS_INICIAL} devolveu itens em outro estado. ` +
    'Um filtro que ignora o parametro devolve a fila inteira e faz o gestor trabalhar no caso errado.',
  );

  const idsPendentes = pendentes.map(d => d.id);
  for (const d of [alvo, vizinhaA, vizinhaB]) {
    assert.ok(
      idsPendentes.includes(d.id),
      `PASSO 2: o chamado ${d.id}, recem-aberto, nao apareceu na fila de pendentes do gestor`,
    );
  }

  // ---- PASSO 3 — ele restringe a categoria da equipe dele ---------------
  const daEquipe = await api.percorrerListagem(tokenGestor, { categoria: categoriaAlvo });

  assert.ok(
    daEquipe.some(d => d.id === alvo.id),
    `PASSO 3: o filtro categoria=${categoriaAlvo} nao trouxe o chamado ${alvo.id}, que e ` +
    'exatamente dessa categoria. Chamado que nao aparece para a equipe certa nao e atendido.',
  );

  const categoriasEstranhas = [...new Set(daEquipe.map(d => d.category).filter(c => c !== categoriaAlvo))];
  assert.deepEqual(
    categoriasEstranhas,
    [],
    `PASSO 3: o filtro categoria=${categoriaAlvo} devolveu tambem: ${categoriasEstranhas.join(', ')}`,
  );
  for (const vizinha of [vizinhaA, vizinhaB]) {
    assert.ok(
      !daEquipe.some(d => d.id === vizinha.id),
      `PASSO 3: o chamado ${vizinha.id} (categoria ${vizinha.category}) vazou para o recorte de ${categoriaAlvo}`,
    );
  }

  // ---- PASSO 4 — a fila vem paginada, e a paginacao se declara ----------
  // O gestor nao rola uma lista infinita: ele navega. Se o bloco de paginacao
  // nao vier, o app nao tem como saber que existe uma proxima pagina — e os
  // chamados a partir da segunda simplesmente nunca sao vistos.
  const primeiraPagina = await api.listarDemandas(tokenGestor, { page: 1, pageSize: 1, per_page: 1 });
  assert.equal(primeiraPagina.status, 200, `PASSO 4: a listagem respondeu ${insp.resumo(primeiraPagina)}`);

  const pag = insp.paginacao(primeiraPagina.body);
  assert.ok(
    pag,
    `PASSO 4: a listagem nao trouxe bloco de paginacao: ${primeiraPagina.raw.slice(0, 200)}`,
  );
  assert.equal(
    insp.lista(primeiraPagina.body).length,
    1,
    'PASSO 4: o limite de itens por pagina foi ignorado — a API devolveu mais do que foi pedido',
  );

  // ---- PASSO 5 — ele assume o atendimento -------------------------------
  const triagem = await api.mudarStatus(tokenGestor, alvo.id, contrato.STATUS.EM_ANDAMENTO);
  assert.equal(
    triagem.status,
    200,
    `PASSO 5: o gestor deveria poder assumir o chamado (README secao 8); respondeu ${insp.resumo(triagem)}`,
  );

  // ---- PASSO 6 — o chamado troca de fila --------------------------------
  const pendentesDepois = (await api.percorrerListagem(tokenGestor, { status: contrato.STATUS_INICIAL })).map(d => d.id);
  const emAndamento = (await api.percorrerListagem(tokenGestor, { status: contrato.STATUS.EM_ANDAMENTO })).map(d => d.id);

  assert.ok(
    !pendentesDepois.includes(alvo.id),
    `PASSO 6: o chamado ${alvo.id} foi assumido mas continua na fila de pendentes. Dois ` +
    'gestores vao trabalhar no mesmo caso.',
  );
  assert.ok(
    emAndamento.includes(alvo.id),
    `PASSO 6: o chamado ${alvo.id} saiu dos pendentes e nao apareceu em ` +
    `${contrato.STATUS.EM_ANDAMENTO}. Sumiu das duas filas: ninguem vai atende-lo.`,
  );

  // ---- PASSO 7 — os outros dois nao foram arrastados junto --------------
  for (const vizinha of [vizinhaA, vizinhaB]) {
    assert.ok(
      pendentesDepois.includes(vizinha.id),
      `PASSO 7: assumir ${alvo.id} tirou tambem ${vizinha.id} da fila de pendentes — a ` +
      'atualizacao passou do alvo',
    );
  }
});
