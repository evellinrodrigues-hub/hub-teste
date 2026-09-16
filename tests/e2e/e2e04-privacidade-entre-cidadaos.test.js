/**
 * E2E-04 — Privacidade entre cidadaos: o chamado do vizinho nao e meu.
 *
 * Branch: branch4-Jennifer
 *
 * FLUXO DO USUARIO
 * Dois moradores da mesma cidade usam o ResolveAi ao mesmo tempo, cada um com
 * o seu problema. A jornada verifica o que cada um consegue — e o que nao
 * consegue — enxergar e fazer com o chamado do outro.
 *
 * POR QUE ISTO E VERIFICADO NO NIVEL DE SERVICO, E NAO PELA TELA
 * Pela tela, "nao aparece na lista" e indistinguivel de "aparece, mas a tela
 * nao desenhou". E, sobretudo: pela tela, 403 e 404 produzem a mesma mensagem
 * generica para o usuario — e a diferenca entre os dois e justamente a regra
 * de maior consequencia aqui. Responder 403 a um recurso de terceiro CONFIRMA
 * que ele existe; repetindo a chamada com um identificador por vez, um curioso
 * mapeia todas as denuncias da cidade sem nunca ler nenhuma. A resposta correta
 * e 404: para quem nao e dono, o recurso simplesmente nao existe.
 *
 * DETALHE QUE O TESTE NAO PODE ERRAR
 * A ausencia e verificada percorrendo a LISTAGEM INTEIRA, nao a primeira
 * pagina. "Nao esta na pagina 1" passa verde tanto com isolamento correto
 * quanto com vazamento na pagina 2 — e falso negativo em teste de privacidade
 * e pior do que teste nenhum, porque produz confianca.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e04-*.test.js"
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

test('E2E-04 dois cidadaos usam o sistema e nenhum alcanca o chamado do outro', async () => {
  // ---- PASSO 1 — dois moradores, duas contas novas ----------------------
  const ana = await cidadaoRecemCadastrado();
  const bruno = await cidadaoRecemCadastrado();

  assert.notEqual(ana.dados.email, bruno.dados.email, 'arranjo: as duas contas precisam ser distintas');

  // ---- PASSO 2 — cada um registra o proprio problema --------------------
  const criacaoA = await api.criarDemanda(ana.token, demandas.valida());
  const criacaoB = await api.criarDemanda(bruno.token, demandas.valida());

  assert.equal(criacaoA.status, 201, `PASSO 2: registro de A respondeu ${insp.resumo(criacaoA)}`);
  assert.equal(criacaoB.status, 201, `PASSO 2: registro de B respondeu ${insp.resumo(criacaoB)}`);

  const demandaDeA = insp.carga(criacaoA.body);
  const demandaDeB = insp.carga(criacaoB.body);

  // ---- PASSO 3 — o historico de A tem o de A, e so ele -------------------
  const historicoDeA = await api.percorrerListagem(ana.token);

  assert.ok(
    historicoDeA.some(d => d.id === demandaDeA.id),
    `PASSO 3: A nao enxergou a propria demanda ${demandaDeA.id} — o isolamento nao pode ` +
    'ser tao apertado que esconda do dono',
  );
  assert.deepEqual(
    historicoDeA.filter(d => d.id === demandaDeB.id).map(d => d.id),
    [],
    `PASSO 3 — VAZAMENTO ENTRE CIDADAOS: a listagem de ${ana.dados.email} incluiu a ` +
    `demanda ${demandaDeB.id}, registrada por ${bruno.dados.email}. Verificado em TODAS ` +
    'as paginas, nao so na primeira.',
  );

  // ---- PASSO 4 — A tenta abrir o chamado de B pelo identificador --------
  const leitura = await api.obterDemanda(ana.token, demandaDeB.id);
  assert.equal(
    leitura.status,
    404,
    'PASSO 4 — ENUMERACAO: recurso de terceiro deve responder 404, nunca 403. Um 403 ' +
    'confirma que a demanda existe, e confirmar existencia um identificador por vez e ' +
    `como um curioso mapeia as denuncias da cidade inteira. Recebido: ${insp.resumo(leitura)}`,
  );
  assert.equal(
    insp.codigoDeErro(leitura.body),
    contrato.ERROS.NAO_ENCONTRADO,
    'PASSO 4: a recusa nao trouxe o codigo de erro do contrato',
  );

  // ---- PASSO 5 — A tenta apagar o chamado de B --------------------------
  const exclusao = await api.excluirDemanda(ana.token, demandaDeB.id);
  assert.equal(
    exclusao.status,
    404,
    `PASSO 5: A conseguiu alcancar a exclusao da demanda de B. Esperado 404 (invisivel); ` +
    `recebido ${insp.resumo(exclusao)}`,
  );

  // ---- PASSO 6 — o chamado de B continua intacto para B -----------------
  const deB = await api.obterDemanda(bruno.token, demandaDeB.id);
  assert.equal(
    deB.status,
    200,
    `PASSO 6: depois das tentativas de A, B perdeu acesso a propria demanda: ${insp.resumo(deB)}`,
  );
  assert.equal(
    insp.carga(deB.body).status,
    contrato.STATUS_INICIAL,
    'PASSO 6: a demanda de B mudou de estado por causa das tentativas de A — recusar a ' +
    'chamada e nao aplicar o efeito sao duas garantias, e as duas precisam valer',
  );

  // ---- PASSO 7 — o historico de B tambem nao tem nada de A --------------
  const historicoDeB = await api.percorrerListagem(bruno.token);
  assert.deepEqual(
    historicoDeB.filter(d => d.id === demandaDeA.id).map(d => d.id),
    [],
    `PASSO 7: o isolamento vale nas duas direcoes; a listagem de ${bruno.dados.email} ` +
    `incluiu a demanda ${demandaDeA.id}`,
  );
});
