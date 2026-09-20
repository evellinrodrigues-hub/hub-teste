/**
 * E2E-09 — Governanca de perfis: so o administrador promove um gestor.
 *
 * Branch: branch9-Evellin
 *
 * FLUXO DO USUARIO
 * A prefeitura contrata um servidor novo. Ele se cadastra no ResolveAi pela
 * via publica, como qualquer morador, e — antes de ser promovido — nao
 * consegue triar chamado nenhum. O administrador entao o promove a gestor, e a
 * partir desse instante ele passa a trabalhar na fila. Ninguem mais na cidade
 * consegue fazer essa promocao, nem em si mesmo.
 *
 * O QUE ESTA JORNADA PROTEGE
 * Autorizacao nao e um estado, e uma transicao. O teste verifica a MESMA
 * operacao, pelo MESMO usuario, no MESMO recurso, antes e depois da promocao:
 *
 *   antes  -> 403, porque cidadao nao tria
 *   depois -> 200, porque gestor tria
 *
 * Verificar so o "depois" passa verde num sistema que nunca bloqueou ninguem.
 * Verificar so o "antes" passa verde num sistema que nunca promove. O par e o
 * que prova que a regra existe e que a promocao surte efeito de verdade.
 *
 * E o caso de maior consequencia do produto inteiro esta no ultimo passo: se
 * um cidadao comum conseguir se promover, ele passa a atuar sobre as demandas
 * de toda a cidade, e a matriz de autorizacao vira decoracao.
 *
 * ORACULO
 * data/matriz-autorizacao.js (celula A4, README secao 8: "ADMIN pode promover
 * usuarios para Gestor") e data/contrato.js (perfis e codigos de erro).
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e09-*.test.js"
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = require('../../api/smart-city');
const { USUARIOS } = require('../../lib/config');
const insp = require('../../lib/inspecao');
const contrato = require('../../data/contrato');
const demandas = require('../../data/demandas');
const usuarios = require('../../data/usuarios');
const matriz = require('../../data/matriz-autorizacao');

test('E2E-09 o admin promove o servidor novo a gestor e a permissao muda de verdade', async () => {
  // O oraculo desta jornada, lido da matriz e nao escrito a mao aqui.
  const regraDePromocao = matriz.MATRIZ.find(linha => linha.id === 'A4');
  assert.ok(regraDePromocao, 'pre-condicao: a celula A4 deveria existir na matriz de autorizacao');
  assert.equal(
    regraDePromocao.permissoes[contrato.PERFIS.ADMIN],
    true,
    'pre-condicao: pela matriz, o ADMIN e quem promove',
  );

  // ---- PASSO 1 — o servidor novo se cadastra como qualquer morador ------
  const dados = usuarios.novo();
  const cadastro = await api.registrar(dados);
  assert.equal(cadastro.status, 201, `PASSO 1: cadastro respondeu ${insp.resumo(cadastro)}`);

  const sessao = await api.autenticar({ email: dados.email, senha: dados.password });
  const tokenNovato = sessao.accessToken;

  assert.equal(
    insp.carga((await api.meuPerfil(tokenNovato)).body).role,
    contrato.PERFIS.CIDADAO,
    `PASSO 1: quem se cadastra pela via publica nasce ${contrato.PERFIS.CIDADAO}`,
  );

  // ---- PASSO 2 — ele registra um chamado, ainda como morador -----------
  // O chamado e dele de proposito: assim o teste isola a regra de PERFIL. Se
  // usassemos a demanda de outra pessoa, a recusa poderia vir da regra de
  // propriedade (404, recurso invisivel) e nao da regra de autorizacao (403),
  // e o teste estaria verificando outra coisa sem avisar.
  const criacao = await api.criarDemanda(tokenNovato, demandas.valida());
  assert.equal(criacao.status, 201, `PASSO 2: registro respondeu ${insp.resumo(criacao)}`);
  const demanda = insp.carga(criacao.body);

  // ---- PASSO 3 — ANTES da promocao, ele nao tria ------------------------
  const antes = await api.mudarStatus(tokenNovato, demanda.id, contrato.STATUS.EM_ANDAMENTO);
  assert.equal(
    antes.status,
    403,
    `PASSO 3: ${regraDePromocao.origem.split(':')[0]} — cidadao nao atualiza status, nem ` +
    `na propria demanda. Esperado 403; recebido ${insp.resumo(antes)}`,
  );
  assert.equal(
    insp.codigoDeErro(antes.body),
    contrato.ERROS.PROIBIDO,
    'PASSO 3: a recusa nao trouxe o codigo de erro do contrato',
  );

  // ---- PASSO 4 — ninguem se promove sozinho -----------------------------
  const autopromocao = await api.atualizarPerfil(tokenNovato, {
    email: dados.email,
    role: contrato.PERFIS.GESTOR,
  });
  assert.equal(
    autopromocao.status,
    403,
    'PASSO 4 — ESCALONAMENTO DE PRIVILEGIO: um cidadao alterou o proprio perfil. Com isso ' +
    'ele passa a atuar sobre as demandas de toda a cidade, e a matriz de autorizacao ' +
    `inteira deixa de valer. Esperado 403; recebido ${insp.resumo(autopromocao)}`,
  );

  const aindaCidadao = insp.carga((await api.meuPerfil(tokenNovato)).body);
  assert.equal(
    aindaCidadao.role,
    contrato.PERFIS.CIDADAO,
    'PASSO 4: a autopromocao foi recusada, mas o perfil mudou assim mesmo',
  );

  // ---- PASSO 5 — o administrador promove --------------------------------
  const tokenAdmin = await api.tokenDe(USUARIOS.admin);
  const promocao = await api.atualizarPerfil(tokenAdmin, {
    email: dados.email,
    role: contrato.PERFIS.GESTOR,
  });

  assert.equal(
    promocao.status,
    200,
    `PASSO 5: ${regraDePromocao.origem} — o admin deveria conseguir promover. ` +
    `Recebido: ${insp.resumo(promocao)}`,
  );
  assert.equal(
    insp.carga(promocao.body).role,
    contrato.PERFIS.GESTOR,
    'PASSO 5: a promocao respondeu 200 mas nao devolveu o novo perfil',
  );

  // ---- PASSO 6 — a sessao dele ja reflete o novo papel ------------------
  const perfilPromovido = await api.meuPerfil(tokenNovato);
  assert.equal(perfilPromovido.status, 200, `PASSO 6: /auth/me respondeu ${insp.resumo(perfilPromovido)}`);
  assert.equal(
    insp.carga(perfilPromovido.body).role,
    contrato.PERFIS.GESTOR,
    'PASSO 6: o usuario foi promovido no servidor mas a sessao dele continua respondendo ' +
    'o perfil antigo — ele vai ver a tela de morador ate sair e entrar de novo',
  );

  // ---- PASSO 7 — DEPOIS da promocao, a mesma operacao passa -------------
  const depois = await api.mudarStatus(tokenNovato, demanda.id, contrato.STATUS.EM_ANDAMENTO);
  assert.equal(
    depois.status,
    200,
    'PASSO 7: a promocao foi registrada mas nao surtiu efeito: a MESMA operacao, pelo ' +
    `MESMO usuario, no MESMO recurso, continua recusada. Recebido: ${insp.resumo(depois)}`,
  );
  assert.equal(
    insp.carga(depois.body).status,
    contrato.STATUS.EM_ANDAMENTO,
    'PASSO 7: a triagem respondeu 200 mas nao mudou o estado da demanda',
  );

  // ---- PASSO 8 — promover continua sendo exclusividade do admin --------
  // Agora ele e gestor. Pela matriz (A4), gestor tambem nao promove: a
  // permissao de triar nao arrasta a de conceder permissao.
  const outroCandidato = usuarios.novo();
  assert.equal((await api.registrar(outroCandidato)).status, 201, 'PASSO 8: cadastro do segundo candidato falhou');

  const promocaoPeloGestor = await api.atualizarPerfil(tokenNovato, {
    email: outroCandidato.email,
    role: contrato.PERFIS.GESTOR,
  });
  assert.equal(
    promocaoPeloGestor.status,
    403,
    'PASSO 8: um gestor promoveu outro usuario. Pela matriz A4 isso e exclusividade do ' +
    'ADMIN — caso contrario a concessao de acesso se propaga sozinha pela organizacao. ' +
    `Recebido: ${insp.resumo(promocaoPeloGestor)}`,
  );
});
