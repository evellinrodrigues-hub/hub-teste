/**
 * E2E-03 — Onboarding do cidadao: da tela de cadastro ao primeiro chamado.
 *
 * Branch: branch3-Deyvison
 *
 * FLUXO DO USUARIO
 * Alguem instala o ResolveAi, cria a conta, entra pela primeira vez, encontra
 * o historico vazio (porque nunca usou) e registra a primeira demanda. E o
 * primeiro minuto do usuario no produto — o trecho da jornada com maior taxa
 * de abandono e, normalmente, o menos testado.
 *
 * O QUE ESTA JORNADA PROTEGE
 * Dois riscos que so aparecem quando os passos sao encadeados:
 *
 *  1. ESCALADA NO CADASTRO. A tela publica de cadastro e a unica porta que um
 *     estranho atravessa sem credencial. Se o servidor obedecer a um campo
 *     `role` vindo do cliente, qualquer pessoa se cadastra como admin. O teste
 *     manda o perfil mais poderoso do contrato de proposito e exige que o
 *     servidor ignore.
 *
 *  2. HISTORICO DE OUTRA PESSOA. "Minhas demandas" precisa nascer vazio. Uma
 *     listagem que ignora o filtro de autoria so fica visivel quando alguem
 *     olha a conta de um usuario NOVO — num usuario antigo, o proprio
 *     historico dele disfarca o vazamento.
 *
 * ORACULO
 * Perfil inicial e campos proibidos em resposta vem de data/contrato.js.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e03-*.test.js"
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = require('../../api/smart-city');
const insp = require('../../lib/inspecao');
const contrato = require('../../data/contrato');
const demandas = require('../../data/demandas');
const usuarios = require('../../data/usuarios');

test('E2E-03 o cidadao se cadastra, entra pela primeira vez e registra o primeiro chamado', async () => {
  // Coleta TODAS as respostas da jornada para a verificacao de vazamento do
  // passo final. Checar so a ultima resposta deixaria passar o vazamento que
  // acontece exatamente onde a senha trafega: o cadastro.
  const respostasDaJornada = [];

  // ---- PASSO 1 — cadastro, tentando escolher o proprio perfil ------------
  // O `role` abaixo e o ataque: um cliente honesto nunca manda esse campo.
  let dados = usuarios.novo({ role: contrato.PERFIS.ADMIN });
  let cadastro = await api.registrar(dados);
  respostasDaJornada.push(['POST /auth/register (com perfil escolhido pelo cliente)', cadastro]);

  // Dois desfechos sao seguros, e o contrato nao escolhe entre eles: o
  // servidor pode IGNORAR o campo (e criar a conta como cidadao) ou RECUSAR o
  // corpo por trazer um campo que o cliente nao tem o direito de definir. O
  // desfecho inseguro e um so — criar a conta com o perfil que o cliente
  // pediu — e e ele que o passo verifica. Tratar a recusa como falha faria o
  // teste reprovar justamente a implementacao mais rigorosa das duas.
  if (cadastro.status >= 400 && cadastro.status < 500) {
    dados = usuarios.novo();
    cadastro = await api.registrar(dados);
    respostasDaJornada.push(['POST /auth/register (sem o campo de perfil)', cadastro]);
  }

  assert.equal(cadastro.status, 201, `PASSO 1: o cadastro respondeu ${insp.resumo(cadastro)}`);

  const criado = insp.carga(cadastro.body);
  assert.notEqual(
    criado.role,
    contrato.PERFIS.ADMIN,
    'PASSO 1 — ESCALADA DE PRIVILEGIO NO CADASTRO: a API obedeceu ao perfil enviado pelo ' +
    'cliente. A tela publica de cadastro e a unica porta sem credencial do sistema; ' +
    'quem atravessa ela escolhendo o proprio papel vira admin sem que ninguem aprove.',
  );
  assert.equal(
    criado.role,
    contrato.PERFIS.CIDADAO,
    `PASSO 1: quem se cadastra pela via publica nasce ${contrato.PERFIS.CIDADAO}; ` +
    `a API atribuiu "${criado.role}"`,
  );

  // ---- PASSO 2 — primeiro login, com a senha que ele acabou de escolher --
  const entrada = await api.login(dados.email, dados.password);
  respostasDaJornada.push(['POST /auth/login', entrada]);

  assert.equal(
    entrada.status,
    200,
    `PASSO 2: a conta foi criada mas nao consegue entrar. Cadastro que nao autentica e ` +
    `conta perdida no primeiro minuto de uso. Recebido: ${insp.resumo(entrada)}`,
  );

  const token = api.extrairTokens(entrada.body).accessToken;
  assert.ok(token, 'PASSO 2: o login respondeu 200 mas sem access token reconhecivel');

  // ---- PASSO 3 — o app carrega o perfil dele ----------------------------
  const meuPerfil = await api.meuPerfil(token);
  respostasDaJornada.push(['GET /auth/me', meuPerfil]);

  assert.equal(meuPerfil.status, 200, `PASSO 3: /auth/me respondeu ${insp.resumo(meuPerfil)}`);

  const perfil = insp.carga(meuPerfil.body);
  assert.equal(perfil.email, dados.email, 'PASSO 3: o app mostraria o e-mail de outra conta');
  assert.equal(perfil.role, contrato.PERFIS.CIDADAO, 'PASSO 3: o perfil retornado nao e o de cidadao');

  // ---- PASSO 4 — "minhas demandas" nasce vazio --------------------------
  const historicoInicial = await api.percorrerListagem(token);
  assert.deepEqual(
    historicoInicial.map(d => d.id),
    [],
    `PASSO 4 — VAZAMENTO DE HISTORICO: uma conta criada agora ja enxerga ` +
    `${historicoInicial.length} demanda(s). O filtro de autoria da listagem nao esta ` +
    'sendo aplicado, e num usuario antigo isso ficaria escondido atras do historico dele.',
  );

  // ---- PASSO 5 — o primeiro chamado da vida dele -------------------------
  const criacao = await api.criarDemanda(token, demandas.valida());
  respostasDaJornada.push(['POST /api/demandas', criacao]);

  assert.equal(criacao.status, 201, `PASSO 5: o primeiro registro respondeu ${insp.resumo(criacao)}`);
  const primeira = insp.carga(criacao.body);

  // ---- PASSO 6 — o historico passa a ter exatamente aquele chamado -------
  const historicoDepois = await api.percorrerListagem(token);
  assert.deepEqual(
    historicoDepois.map(d => d.id),
    [primeira.id],
    'PASSO 6: depois do primeiro registro, o historico deveria conter exatamente uma ' +
    `demanda — a dele. Contem: ${historicoDepois.map(d => d.id).join(', ') || '(nenhuma)'}`,
  );

  // ---- PASSO 7 — a senha dele nao trafegou de volta em nenhum ponto ------
  for (const [rotulo, resposta] of respostasDaJornada) {
    const vazamentos = insp.camposProibidos(resposta.body, contrato.CAMPOS_PROIBIDOS_EM_RESPOSTA);
    assert.deepEqual(
      vazamentos,
      [],
      `PASSO 7: ${rotulo} devolveu credencial em ${vazamentos.join(', ')}. Senha ou hash ` +
      'em corpo de resposta vaza para log de proxy, para o cache do app e para o ' +
      'dispositivo do usuario.',
    );
  }
});
