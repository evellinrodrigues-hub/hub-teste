/**
 * E2E-02 — Triagem com rejeicao: o desfecho negativo tambem e um desfecho.
 *
 * Branch: branch2-Dayvid
 *
 * FLUXO DO USUARIO
 * Um morador relata algo que a prefeitura decide nao atender (endereco fora do
 * municipio, duplicidade, competencia de outro orgao). O gestor prioriza o
 * caso, rejeita formalmente, e o morador ve a recusa no proprio historico. A
 * partir dai o caso esta encerrado: ninguem reabre uma demanda rejeitada sem
 * abrir uma nova.
 *
 * POR QUE ESTA JORNADA EXISTE
 * O caminho feliz costuma ser o unico automatizado, e o desfecho negativo e
 * onde mora o dano reputacional: uma demanda rejeitada que volta sozinha para
 * a fila, ou que pode ser reaberta por qualquer chamada, corrompe o indicador
 * de atendimento da prefeitura e some com o registro da decisao. A ponta
 * critica aqui nao e a rejeicao — e a IRREVERSIBILIDADE dela.
 *
 * ORACULO
 * A lista de estados finais e a tabela de transicoes vem de data/contrato.js.
 * O teste nao sabe, por si, quais transicoes sao proibidas: ele pergunta ao
 * contrato, par a par. Se a maquina de estados mudar na especificacao, este
 * teste acompanha sozinho.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e02-*.test.js"
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
  return { dados, sessao: await api.autenticar({ email: dados.email, senha: dados.password }) };
}

test('E2E-02 o gestor rejeita a demanda e a decisao nao pode ser desfeita', async () => {
  // ---- PASSO 1 — o morador registra o chamado ----------------------------
  const { sessao } = await cidadaoRecemCadastrado();
  const tokenCidadao = sessao.accessToken;

  const criacao = await api.criarDemanda(tokenCidadao, demandas.valida());
  assert.equal(criacao.status, 201, `PASSO 1: registro respondeu ${insp.resumo(criacao)}`);
  const id = insp.carga(criacao.body).id;

  // ---- PASSO 2 — o gestor prioriza antes de decidir ----------------------
  const tokenGestor = await api.tokenDe(USUARIOS.gestor);

  // Prioridade e campo do gestor, nao do cidadao: quem classifica a urgencia
  // e a prefeitura. Pegamos a ultima da lista fechada para garantir que o
  // valor mudou em relacao ao que a massa usa na criacao (a primeira).
  const prioridadeNova = contrato.PRIORIDADES[contrato.PRIORIDADES.length - 1];
  const priorizacao = await api.atualizarDemanda(tokenGestor, id, { prioridade: prioridadeNova });

  assert.equal(
    priorizacao.status,
    200,
    `PASSO 2: o gestor deveria poder ajustar a prioridade (README secao 8), mas a API ` +
    `respondeu ${insp.resumo(priorizacao)}`,
  );
  assert.equal(
    insp.carga(priorizacao.body).priority,
    prioridadeNova,
    'PASSO 2: a API aceitou a priorizacao mas nao persistiu o novo valor',
  );

  // ---- PASSO 3 — o gestor rejeita formalmente ----------------------------
  const rejeicao = await api.mudarStatus(tokenGestor, id, contrato.STATUS.REJEITADA);
  assert.equal(
    rejeicao.status,
    200,
    `PASSO 3: ${contrato.STATUS_INICIAL} -> ${contrato.STATUS.REJEITADA} e transicao ` +
    `permitida pelo contrato, mas respondeu ${insp.resumo(rejeicao)}`,
  );
  assert.equal(insp.carga(rejeicao.body).status, contrato.STATUS.REJEITADA);

  // ---- PASSO 4 — o morador ve a recusa no proprio historico --------------
  const naListagem = await api.localizarNaListagem(tokenCidadao, id);
  assert.ok(naListagem, `PASSO 4: a demanda rejeitada sumiu do historico do autor (id ${id})`);
  assert.equal(
    naListagem.status,
    contrato.STATUS.REJEITADA,
    'PASSO 4: o cidadao nao enxerga que o chamado dele foi recusado — ele vai abrir outro igual',
  );

  // ---- PASSO 5 — estado final e final: nenhuma saida ---------------------
  assert.ok(
    contrato.ESTADOS_FINAIS.includes(contrato.STATUS.REJEITADA),
    'pre-condicao do contrato: REJEITADA deveria ser estado final',
  );

  const reaberturasAceitas = [];
  for (const destino of contrato.ESTADOS) {
    // Consulta o oraculo, par a par: o teste nao carrega a regra, ele pergunta.
    if (contrato.transicaoPermitida(contrato.STATUS.REJEITADA, destino)) continue;

    const tentativa = await api.mudarStatus(tokenGestor, id, destino);
    if (tentativa.status !== 409) {
      reaberturasAceitas.push(`${destino} -> ${insp.resumo(tentativa)}`);
    }
  }

  assert.deepEqual(
    reaberturasAceitas,
    [],
    'PASSO 5: uma demanda rejeitada saiu do estado final. Reabrir por chamada direta ' +
    'apaga o registro da decisao e distorce o indicador de atendimento:\n' +
    reaberturasAceitas.join('\n'),
  );

  // ---- PASSO 6 — depois de tudo, o estado continua sendo o da decisao ----
  const detalhe = await api.obterDemanda(tokenGestor, id);
  assert.equal(detalhe.status, 200);
  assert.equal(
    insp.carga(detalhe.body).status,
    contrato.STATUS.REJEITADA,
    'PASSO 6: as tentativas recusadas ainda assim alteraram o estado da demanda — ' +
    'recusar com 409 e nao aplicar a mudanca sao duas coisas, e as duas precisam valer',
  );
});
