/**
 * E2E-05 — Arrependimento do cidadao: desfazer o chamado enquanto da tempo.
 *
 * Branch: branch5-Leticia
 *
 * FLUXO DO USUARIO
 * Um morador registra dois chamados, percebe que abriu um deles por engano
 * (endereco errado, problema ja resolvido pela vizinhanca) e desiste antes que
 * a prefeitura assuma o atendimento. Ele volta ao historico e apaga so aquele.
 *
 * O QUE ESTA JORNADA PROTEGE
 * Exclusao e a operacao mais destrutiva do produto, e a que menos perdoa erro
 * de escopo. Tres coisas precisam valer ao mesmo tempo, e nenhum caso isolado
 * verifica as tres juntas:
 *
 *  1. o chamado certo desaparece de verdade — some da listagem E do acesso
 *     direto, e nao apenas de uma das duas visoes (exclusao logica mal feita
 *     tira da lista mas mantem o GET respondendo 200);
 *  2. o OUTRO chamado, que ele quis manter, permanece intacto;
 *  3. repetir a exclusao nao explode: o dedo duplo no botao e o toque numa
 *     tela com cache velho sao o caso comum, nao a excecao.
 *
 * ORACULO
 * A janela de arrependimento e o estado inicial (README secao 8: o cidadao
 * "edita e exclui apenas as proprias, enquanto pendentes"). O valor vem de
 * data/contrato.js — o teste nao sabe o nome do estado, ele pergunta.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e05-*.test.js"
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = require('../../api/smart-city');
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

test('E2E-05 o cidadao desiste de um chamado pendente e o outro continua de pe', async () => {
  // ---- PASSO 1 — o morador abre dois chamados ---------------------------
  const { token } = await cidadaoRecemCadastrado();

  const criacaoEngano = await api.criarDemanda(token, demandas.valida());
  const criacaoValida = await api.criarDemanda(token, demandas.valida());

  assert.equal(criacaoEngano.status, 201, `PASSO 1: registro respondeu ${insp.resumo(criacaoEngano)}`);
  assert.equal(criacaoValida.status, 201, `PASSO 1: registro respondeu ${insp.resumo(criacaoValida)}`);

  const engano = insp.carga(criacaoEngano.body);
  const manter = insp.carga(criacaoValida.body);

  assert.notEqual(engano.id, manter.id, 'arranjo: as duas demandas precisam ser distintas');

  // ---- PASSO 2 — os dois aparecem no historico dele ---------------------
  const antes = (await api.percorrerListagem(token)).map(d => d.id);
  assert.deepEqual(
    [antes.includes(engano.id), antes.includes(manter.id)],
    [true, true],
    `PASSO 2: o historico deveria conter os dois chamados recem-abertos; contem: ${antes.join(', ')}`,
  );

  // ---- PASSO 3 — a janela de arrependimento esta aberta -----------------
  assert.equal(
    engano.status,
    contrato.STATUS_INICIAL,
    `PASSO 3: a exclusao pelo cidadao so vale enquanto a demanda esta em ` +
    `${contrato.STATUS_INICIAL}; esta em "${engano.status}"`,
  );

  // ---- PASSO 4 — ele desiste do chamado aberto por engano ---------------
  const exclusao = await api.excluirDemanda(token, engano.id);
  assert.ok(
    exclusao.status === 204 || exclusao.status === 200,
    `PASSO 4: o autor deveria poder excluir a propria demanda ainda pendente ` +
    `(README secao 8), mas a API respondeu ${insp.resumo(exclusao)}`,
  );

  // ---- PASSO 5 — ela sumiu do acesso direto -----------------------------
  const acessoDireto = await api.obterDemanda(token, engano.id);
  assert.equal(
    acessoDireto.status,
    404,
    'PASSO 5: a demanda foi excluida mas o acesso direto continua respondendo. Exclusao ' +
    'logica que some da listagem e sobrevive no GET deixa o dado acessivel a quem ja ' +
    `tinha o identificador. Recebido: ${insp.resumo(acessoDireto)}`,
  );

  // ---- PASSO 6 — e sumiu do historico, sem levar a outra junto ----------
  const depois = (await api.percorrerListagem(token)).map(d => d.id);

  assert.ok(
    !depois.includes(engano.id),
    `PASSO 6: a demanda excluida ${engano.id} continua na listagem do autor`,
  );
  assert.ok(
    depois.includes(manter.id),
    `PASSO 6 — ESCOPO DA EXCLUSAO: o chamado ${manter.id}, que o cidadao quis manter, ` +
    'desapareceu junto. Exclusao que passa do alvo e perda de dado do cidadao.',
  );

  // ---- PASSO 7 — o toque repetido no botao nao quebra nada --------------
  const repetida = await api.excluirDemanda(token, engano.id);
  assert.equal(
    repetida.status,
    404,
    'PASSO 7: excluir de novo o que ja nao existe deveria responder 404. Dedo duplo no ' +
    `botao e tela com cache velho sao o caso comum. Recebido: ${insp.resumo(repetida)}`,
  );
  assert.ok(
    repetida.status < 500,
    'PASSO 7: a segunda exclusao produziu erro interno — excecao nao tratada vazando para o cliente',
  );

  // ---- PASSO 8 — o chamado mantido segue integro ------------------------
  const mantida = await api.obterDemanda(token, manter.id);
  assert.equal(mantida.status, 200, `PASSO 8: o chamado mantido ficou inacessivel: ${insp.resumo(mantida)}`);
  assert.equal(
    insp.carga(mantida.body).status,
    contrato.STATUS_INICIAL,
    'PASSO 8: o chamado mantido mudou de estado por efeito colateral da exclusao do outro',
  );
});
