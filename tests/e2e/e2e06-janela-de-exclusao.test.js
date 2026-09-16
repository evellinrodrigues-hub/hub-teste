/**
 * E2E-06 — A janela de exclusao fecha quando a prefeitura assume o caso.
 *
 * Branch: branch6-Levi
 *
 * FLUXO DO USUARIO
 * Um morador abre dois chamados. O gestor assume os dois. A partir desse
 * momento o morador perde o direito de apagar — o caso deixou de ser so dele e
 * virou trabalho registrado da prefeitura. O gestor ainda pode descartar um
 * atendimento em andamento (duplicidade, engano de triagem), mas nao pode
 * apagar um que ja foi concluido: isso apagaria a propria evidencia do
 * servico prestado.
 *
 * POR QUE A JORNADA E A UNICA FORMA DE VERIFICAR ISTO
 * A regra nao e "quem pode excluir" — e "quem pode excluir, EM QUE MOMENTO".
 * Ela so existe no tempo, e so aparece quando o mesmo recurso e visitado
 * antes e depois de mudar de estado. Um teste de rota isolado montaria a
 * demanda ja no estado final por atalho e nunca veria a permissao mudando de
 * mao ao longo do caminho.
 *
 * TRES MOMENTOS, TRES DONOS DA DECISAO
 *   pendente       -> o cidadao manda (ver E2E-05)
 *   em andamento   -> o cidadao perde (403) e o gestor manda
 *   concluida      -> ninguem manda: o registro esta fechado
 *
 * ORACULO
 * Estado inicial, transicoes e lista de estados finais vem de data/contrato.js.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e06-*.test.js"
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

test('E2E-06 a triagem tira a exclusao do cidadao, e a conclusao tira de todo mundo', async () => {
  // ---- PASSO 1 — o morador abre dois chamados ---------------------------
  const { token: tokenCidadao } = await cidadaoRecemCadastrado();

  const emAndamento = insp.carga((await api.criarDemanda(tokenCidadao, demandas.valida())).body);
  const concluida = insp.carga((await api.criarDemanda(tokenCidadao, demandas.valida())).body);

  assert.ok(emAndamento?.id && concluida?.id, 'PASSO 1: os dois registros precisam ter identificador');

  // ---- PASSO 2 — a prefeitura assume os dois ----------------------------
  const tokenGestor = await api.tokenDe(USUARIOS.gestor);

  for (const alvo of [emAndamento, concluida]) {
    const triagem = await api.mudarStatus(tokenGestor, alvo.id, contrato.STATUS.EM_ANDAMENTO);
    assert.equal(
      triagem.status,
      200,
      `PASSO 2: triagem da demanda ${alvo.id} respondeu ${insp.resumo(triagem)}`,
    );
  }

  // ---- PASSO 3 — o morador perde o direito de apagar --------------------
  const tentativaDoCidadao = await api.excluirDemanda(tokenCidadao, emAndamento.id);
  assert.equal(
    tentativaDoCidadao.status,
    403,
    `PASSO 3 — A JANELA NAO FECHOU: o cidadao apagou um chamado que a prefeitura ja ` +
    'assumiu. O trabalho de triagem do gestor desaparece junto, e o indicador de ' +
    `atendimento perde o caso. Esperado 403; recebido ${insp.resumo(tentativaDoCidadao)}`,
  );
  assert.equal(
    insp.codigoDeErro(tentativaDoCidadao.body),
    contrato.ERROS.PROIBIDO,
    'PASSO 3: a recusa nao trouxe o codigo de erro do contrato',
  );

  // ---- PASSO 4 — e o chamado continua la, intocado ----------------------
  const aindaExiste = await api.obterDemanda(tokenGestor, emAndamento.id);
  assert.equal(
    aindaExiste.status,
    200,
    `PASSO 4: a exclusao foi recusada mas o recurso sumiu assim mesmo: ${insp.resumo(aindaExiste)}`,
  );
  assert.equal(
    insp.carga(aindaExiste.body).status,
    contrato.STATUS.EM_ANDAMENTO,
    'PASSO 4: a tentativa recusada mexeu no estado da demanda',
  );

  // ---- PASSO 5 — o gestor ainda pode descartar o que esta em andamento --
  const descarte = await api.excluirDemanda(tokenGestor, emAndamento.id);
  assert.ok(
    descarte.status === 204 || descarte.status === 200,
    `PASSO 5: o gestor deveria poder descartar um atendimento em andamento — a restricao ` +
    `do README secao 8 e sobre demandas JA CONCLUIDAS. Recebido: ${insp.resumo(descarte)}`,
  );

  // ---- PASSO 6 — o outro chamado chega ao fim ---------------------------
  const conclusao = await api.mudarStatus(tokenGestor, concluida.id, contrato.STATUS.RESOLVIDA);
  assert.equal(conclusao.status, 200, `PASSO 6: conclusao respondeu ${insp.resumo(conclusao)}`);
  assert.ok(
    contrato.ESTADOS_FINAIS.includes(insp.carga(conclusao.body).status),
    'PASSO 6: a demanda deveria estar num estado final depois de resolvida',
  );

  // ---- PASSO 7 — nem o gestor apaga o que ja foi concluido --------------
  const apagarConcluida = await api.excluirDemanda(tokenGestor, concluida.id);
  assert.equal(
    apagarConcluida.status,
    403,
    'PASSO 7 — REGISTRO APAGAVEL: o gestor excluiu uma demanda ja concluida. O README ' +
    'secao 8 diz que ele "nao pode excluir demandas ja concluidas": e o registro do ' +
    `servico prestado, e e o que sustenta o indicador da prefeitura. Recebido: ` +
    insp.resumo(apagarConcluida),
  );

  // ---- PASSO 8 — o historico do cidadao reflete os dois desfechos -------
  const historico = (await api.percorrerListagem(tokenCidadao)).map(d => d.id);

  assert.ok(
    !historico.includes(emAndamento.id),
    `PASSO 8: a demanda descartada pelo gestor (${emAndamento.id}) continua no historico do cidadao`,
  );
  assert.ok(
    historico.includes(concluida.id),
    `PASSO 8: a demanda concluida (${concluida.id}) sumiu do historico do cidadao — ele ` +
    'perdeu o comprovante do atendimento que recebeu',
  );
});
