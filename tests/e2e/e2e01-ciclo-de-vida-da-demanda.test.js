/**
 * E2E-01 — Ciclo de vida completo da demanda (caminho feliz ponta a ponta).
 *
 * Branch: branch1-Andre
 *
 * FLUXO DO USUARIO
 * Um morador que nunca usou o ResolveAi abre a conta, relata um problema na
 * rua, acompanha o andamento e ve o caso encerrado. Do outro lado, o gestor
 * publico recebe a demanda na fila, assume o atendimento e conclui o servico.
 *
 * POR QUE ESTE E UM TESTE E2E, E NAO UM TESTE DE API
 * Cada caso da suite de servico (tests/api/) verifica UMA regra isolada, com o
 * cenario montado por atalho. Aqui nada e montado por atalho: o estado de cada
 * passo e produzido pelo passo anterior, exatamente como acontece em producao.
 * O que este teste cobre e o que nenhum caso isolado cobre — a COSTURA entre
 * cadastro, sessao, autoria, visibilidade e maquina de estados. Um defeito de
 * integracao (o token do cadastro nao serve para criar demanda; a demanda do
 * cidadao nao chega na fila do gestor; resolver nao registra a data) passa
 * ileso por testes unitarios e por testes de rota, e e pego aqui.
 *
 * ORACULO
 * Todo valor esperado vem de data/contrato.js. Nenhum literal neste arquivo.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e01-*.test.js"
 *   Contra o back-end real:  BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e01-*.test.js"
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = require('../../api/smart-city');
const { USUARIOS } = require('../../lib/config');
const insp = require('../../lib/inspecao');
const contrato = require('../../data/contrato');
const demandas = require('../../data/demandas');
const usuarios = require('../../data/usuarios');

/**
 * Arranjo local, de proposito. A jornada precisa de um cidadao que NAO existia
 * antes dela: reaproveitar o usuario fixo do ambiente faria o teste herdar o
 * historico de execucoes anteriores, e "o historico tem a demanda que acabei
 * de criar" deixaria de significar alguma coisa.
 *
 * Fica no arquivo do teste, e nao em api/, porque cada uma das 12 branches de
 * E2E precisa ser executavel sozinha, sem depender de nenhuma outra. Depois do
 * merge das 12, promover para api/smart-city.js e o passo obvio.
 */
async function cidadaoRecemCadastrado() {
  const dados = usuarios.novo();

  const cadastro = await api.registrar(dados);
  assert.equal(
    cadastro.status,
    201,
    `PASSO 1 falhou: o cadastro do cidadao respondeu ${insp.resumo(cadastro)}`,
  );

  const sessao = await api.autenticar({ email: dados.email, senha: dados.password });
  return { dados, sessao };
}

test('E2E-01 do cadastro do cidadao ate a demanda resolvida pelo gestor', async () => {
  // ---- PASSO 1 — o morador abre a conta ----------------------------------
  const { dados, sessao } = await cidadaoRecemCadastrado();
  const tokenCidadao = sessao.accessToken;

  assert.ok(tokenCidadao, 'PASSO 1: o login do cidadao recem-cadastrado nao devolveu access token');
  assert.ok(sessao.refreshToken, 'PASSO 1: o login nao devolveu refresh token — a sessao nao se sustenta');

  // ---- PASSO 2 — a conta e reconhecida como dele -------------------------
  const perfil = insp.carga((await api.meuPerfil(tokenCidadao)).body);

  assert.equal(perfil.email, dados.email, 'PASSO 2: /auth/me devolveu o e-mail de outra conta');
  assert.equal(
    perfil.role,
    contrato.PERFIS.CIDADAO,
    `PASSO 2: quem se cadastra pela via publica nasce ${contrato.PERFIS.CIDADAO}; ` +
    `a API atribuiu "${perfil.role}"`,
  );

  // ---- PASSO 3 — ele relata o problema da rua ----------------------------
  const criacao = await api.criarDemanda(tokenCidadao, demandas.valida());
  assert.equal(criacao.status, 201, `PASSO 3: registro da demanda respondeu ${insp.resumo(criacao)}`);

  const demanda = insp.carga(criacao.body);
  const id = demanda.id;

  assert.ok(id, 'PASSO 3: a demanda criada nao trouxe identificador — nao ha como acompanha-la');
  assert.equal(
    demanda.status,
    contrato.STATUS_INICIAL,
    `PASSO 3: toda demanda nasce em ${contrato.STATUS_INICIAL}; nasceu em "${demanda.status}"`,
  );
  assert.match(
    String(demanda.protocol),
    contrato.FORMATO_PROTOCOLO,
    `PASSO 3: o protocolo "${demanda.protocol}" nao segue o formato do contrato — ` +
    'e o protocolo que o cidadao usa para cobrar a prefeitura',
  );
  // A autoria pode vir sob nomes diferentes; o contrato do produto nao fecha
  // qual. Procuramos todos antes de concluir.
  const autoria = demanda.author ?? demanda.autor ?? demanda.usuarioId ?? demanda.userId ?? null;
  assert.ok(
    autoria !== null && autoria !== undefined,
    'PASSO 3: o chamado gravado nao registra quem o abriu. Sem autoria nao ha "meus ' +
    `chamados" nem a quem responder. Campos presentes: ${Object.keys(demanda).join(', ')}`,
  );
  assert.equal(
    String(autoria?.id ?? autoria),
    String(perfil.id),
    'PASSO 3: a autoria nao foi atribuida a quem estava autenticado',
  );

  // ---- PASSO 4 — ela aparece no historico dele ---------------------------
  const historico = await api.percorrerListagem(tokenCidadao);
  assert.ok(
    historico.some(d => d.id === id),
    `PASSO 4: a demanda ${id} nao apareceu em NENHUMA pagina do historico de quem a registrou`,
  );

  // ---- PASSO 5 — ela chega na fila do gestor -----------------------------
  const tokenGestor = await api.tokenDe(USUARIOS.gestor);
  const naFila = await api.localizarNaListagem(tokenGestor, id);
  assert.ok(
    naFila,
    `PASSO 5: a demanda ${id} nao chegou a fila do gestor. Uma demanda que o cidadao ` +
    'registra e o gestor nao ve e uma demanda que nunca sera atendida.',
  );

  // ---- PASSO 6 — o gestor assume o atendimento ---------------------------
  const triagem = await api.mudarStatus(tokenGestor, id, contrato.STATUS.EM_ANDAMENTO);
  assert.equal(
    triagem.status,
    200,
    `PASSO 6: transicao ${contrato.STATUS_INICIAL} -> ${contrato.STATUS.EM_ANDAMENTO} ` +
    `e permitida pelo contrato, mas respondeu ${insp.resumo(triagem)}`,
  );
  assert.equal(insp.carga(triagem.body).status, contrato.STATUS.EM_ANDAMENTO);

  // ---- PASSO 7 — o gestor conclui o servico ------------------------------
  const conclusao = await api.mudarStatus(tokenGestor, id, contrato.STATUS.RESOLVIDA);
  assert.equal(
    conclusao.status,
    200,
    `PASSO 7: transicao ${contrato.STATUS.EM_ANDAMENTO} -> ${contrato.STATUS.RESOLVIDA} ` +
    `e permitida pelo contrato, mas respondeu ${insp.resumo(conclusao)}`,
  );

  const resolvida = insp.carga(conclusao.body);
  assert.equal(resolvida.status, contrato.STATUS.RESOLVIDA);
  assert.ok(
    resolvida.resolvedAt,
    'PASSO 7: a demanda foi resolvida sem registrar a data de conclusao. Sem ela, o ' +
    'indicador de tempo de atendimento da prefeitura nao existe.',
  );

  // ---- PASSO 8 — o morador ve o caso encerrado ---------------------------
  const detalhe = await api.obterDemanda(tokenCidadao, id);
  assert.equal(detalhe.status, 200, `PASSO 8: o autor nao conseguiu abrir a propria demanda: ${insp.resumo(detalhe)}`);
  assert.equal(
    insp.carga(detalhe.body).status,
    contrato.STATUS.RESOLVIDA,
    'PASSO 8: o cidadao nao enxerga o desfecho do proprio chamado',
  );

  // ---- PASSO 9 — ele encerra a sessao ------------------------------------
  const saida = await api.logout(tokenCidadao);
  assert.ok(
    saida.status >= 200 && saida.status < 300,
    `PASSO 9: o logout respondeu ${insp.resumo(saida)}`,
  );

  const depoisDoLogout = await api.meuPerfil(tokenCidadao);
  assert.equal(
    depoisDoLogout.status,
    401,
    'PASSO 9: o token continuou valido depois do logout. Em aparelho compartilhado, ' +
    `"sair" que nao invalida a sessao e falha de seguranca, nao de usabilidade. ` +
    `Recebido: ${insp.resumo(depoisDoLogout)}`,
  );
});
