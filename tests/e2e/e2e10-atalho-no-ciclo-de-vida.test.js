/**
 * E2E-10 — O atalho recusado: nao se resolve o que nunca foi atendido.
 *
 * Branch: branch10-Peterson
 *
 * FLUXO DO USUARIO
 * Um gestor apressado tenta marcar como resolvido um chamado que ninguem
 * chegou a assumir — o atalho que zera a fila sem zerar o problema. O sistema
 * recusa, ele percorre o caminho de verdade (assume, executa, conclui) e,
 * depois de concluido, o caso nao volta mais para tras.
 *
 * O QUE ESTA JORNADA PROTEGE
 * A maquina de estados e o que separa um indicador de atendimento de uma
 * planilha de autodeclaracao. Se der para pular de "ninguem assumiu" para
 * "resolvido", o tempo medio de atendimento da prefeitura vira ficcao: todo
 * chamado parece ter sido resolvido instantaneamente, e o cidadao continua com
 * o buraco na rua.
 *
 * DUAS RECUSAS QUE NAO SAO A MESMA COISA
 * O passo 4 separa dois erros que costumam ser confundidos na implementacao:
 *   - status que NAO EXISTE no contrato    -> 400 (o cliente mandou lixo)
 *   - status que existe mas o caminho ate ele nao e permitido -> 409 (conflito
 *     com o estado atual do recurso)
 * Responder 409 para um valor inexistente esconde erro de digitacao do cliente
 * atras de uma mensagem de regra de negocio, e o time perde tempo procurando
 * defeito onde nao ha.
 *
 * ORACULO
 * A tabela de transicoes vem de data/contrato.js. O teste nao carrega a regra:
 * ele pergunta ao contrato, par a par.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e10-*.test.js"
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

test('E2E-10 o atalho para resolvido e recusado, o caminho valido conclui e nao ha volta', async () => {
  // ---- PASSO 1 — o chamado entra na fila --------------------------------
  const { token: tokenCidadao } = await cidadaoRecemCadastrado();

  const criacao = await api.criarDemanda(tokenCidadao, demandas.valida());
  assert.equal(criacao.status, 201, `PASSO 1: registro respondeu ${insp.resumo(criacao)}`);
  const id = insp.carga(criacao.body).id;

  const tokenGestor = await api.tokenDe(USUARIOS.gestor);

  // ---- PASSO 2 — o atalho e mesmo proibido pelo contrato ----------------
  assert.equal(
    contrato.transicaoPermitida(contrato.STATUS_INICIAL, contrato.STATUS.RESOLVIDA),
    false,
    `pre-condicao do contrato: ${contrato.STATUS_INICIAL} -> ${contrato.STATUS.RESOLVIDA} ` +
    'deveria ser proibida; se a especificacao mudou, este teste precisa ser revisto junto',
  );

  // ---- PASSO 3 — o gestor tenta o atalho e e barrado --------------------
  const atalho = await api.mudarStatus(tokenGestor, id, contrato.STATUS.RESOLVIDA);
  assert.equal(
    atalho.status,
    409,
    `PASSO 3 — ATALHO ACEITO: o chamado foi de ${contrato.STATUS_INICIAL} direto para ` +
    `${contrato.STATUS.RESOLVIDA}, sem ninguem ter assumido o atendimento. O indicador de ` +
    `tempo medio da prefeitura passa a medir nada. Esperado 409; recebido ${insp.resumo(atalho)}`,
  );
  assert.equal(
    insp.codigoDeErro(atalho.body),
    contrato.ERROS.TRANSICAO_INVALIDA,
    'PASSO 3: a recusa nao trouxe o codigo de transicao invalida do contrato',
  );

  const naoMudou = await api.obterDemanda(tokenGestor, id);
  assert.equal(
    insp.carga(naoMudou.body).status,
    contrato.STATUS_INICIAL,
    'PASSO 3: a API respondeu 409 mas aplicou a mudanca assim mesmo — recusar e nao ' +
    'aplicar sao duas garantias distintas',
  );

  // ---- PASSO 4 — valor inexistente e 400, nao 409 -----------------------
  const statusInexistente = await api.mudarStatus(tokenGestor, id, 'CONCLUIDO_COM_LOUVOR');
  assert.equal(
    statusInexistente.status,
    400,
    'PASSO 4: um status fora da lista fechada e erro de ENTRADA do cliente (400), nao ' +
    'conflito de estado (409). Trocar um pelo outro manda o time procurar defeito de ' +
    `regra de negocio onde ha um erro de digitacao. Recebido: ${insp.resumo(statusInexistente)}`,
  );

  // ---- PASSO 5 — o caminho de verdade: alguem assume --------------------
  const assumir = await api.mudarStatus(tokenGestor, id, contrato.STATUS.EM_ANDAMENTO);
  assert.equal(
    assumir.status,
    200,
    `PASSO 5: ${contrato.STATUS_INICIAL} -> ${contrato.STATUS.EM_ANDAMENTO} e permitida ` +
    `pelo contrato; respondeu ${insp.resumo(assumir)}`,
  );

  // ---- PASSO 6 — e so entao conclui -------------------------------------
  const concluir = await api.mudarStatus(tokenGestor, id, contrato.STATUS.RESOLVIDA);
  assert.equal(
    concluir.status,
    200,
    `PASSO 6: ${contrato.STATUS.EM_ANDAMENTO} -> ${contrato.STATUS.RESOLVIDA} e permitida ` +
    `pelo contrato; respondeu ${insp.resumo(concluir)}`,
  );
  assert.equal(insp.carga(concluir.body).status, contrato.STATUS.RESOLVIDA);

  // ---- PASSO 7 — concluido nao volta atras ------------------------------
  const voltasAceitas = [];
  for (const destino of contrato.ESTADOS) {
    if (contrato.transicaoPermitida(contrato.STATUS.RESOLVIDA, destino)) continue;

    const tentativa = await api.mudarStatus(tokenGestor, id, destino);
    if (tentativa.status !== 409) voltasAceitas.push(`-> ${destino}: ${insp.resumo(tentativa)}`);
  }

  assert.deepEqual(
    voltasAceitas,
    [],
    'PASSO 7: um chamado concluido saiu do estado final. Reabrir por chamada direta apaga ' +
    'a conclusao e faz o mesmo caso ser contado duas vezes no indicador:\n' +
    voltasAceitas.join('\n'),
  );

  // ---- PASSO 8 — o cidadao ve o desfecho correto ------------------------
  const visaoDoCidadao = await api.obterDemanda(tokenCidadao, id);
  assert.equal(visaoDoCidadao.status, 200, `PASSO 8: o autor perdeu acesso: ${insp.resumo(visaoDoCidadao)}`);
  assert.equal(
    insp.carga(visaoDoCidadao.body).status,
    contrato.STATUS.RESOLVIDA,
    'PASSO 8: depois de todas as tentativas recusadas, o estado visto pelo cidadao nao e ' +
    'o desfecho real do chamado',
  );
});
