/**
 * E2E-11 — Integridade do registro: o servidor e quem carimba o chamado.
 *
 * Branch: branch11-Rhaldney
 *
 * FLUXO DO USUARIO
 * Um morador registra dois chamados por um cliente que nao e o app oficial —
 * um script, um Postman, um app modificado. Junto com os dados legitimos ele
 * manda tambem os campos que o servidor deveria controlar sozinho: o
 * identificador, o estado inicial, a autoria e as datas. A jornada verifica
 * que nada disso e obedecido, que o protocolo entregue ao cidadao e unico e no
 * formato combinado, e que o chamado guardado e o que a prefeitura consegue
 * auditar depois.
 *
 * O QUE ESTA JORNADA PROTEGE
 * Confiar no cliente e o defeito mais barato de cometer e o mais caro de
 * descobrir, porque o app oficial nunca manda esses campos — o sistema parece
 * correto durante todo o desenvolvimento. Tres consequencias concretas:
 *
 *  - AUTORIA FORJADA: quem manda `usuarioId` registra chamado em nome de
 *    outra pessoa. Denuncia atribuida a um morador que nao a fez e problema
 *    juridico, nao bug.
 *  - ESTADO FORJADO: quem manda `status` cria o chamado ja resolvido e some
 *    da fila sem nunca ter sido atendido.
 *  - DATA FORJADA: quem manda `createdAt` controla a posicao na fila e o
 *    tempo de atendimento medido.
 *
 * ORACULO
 * A lista de campos controlados pelo servidor, o formato do protocolo e os
 * campos proibidos em resposta vem de data/contrato.js.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e11-*.test.js"
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = require('../../api/smart-city');
const insp = require('../../lib/inspecao');
const contrato = require('../../data/contrato');
const demandas = require('../../data/demandas');
const usuarios = require('../../data/usuarios');

test('E2E-11 o servidor ignora os campos que so ele controla e o registro fica auditavel', async () => {
  const respostasDaJornada = [];

  // ---- PASSO 1 — dois moradores: o autor e a vitima da falsificacao -----
  const autorDados = usuarios.novo();
  assert.equal((await api.registrar(autorDados)).status, 201, 'PASSO 1: cadastro do autor falhou');
  const tokenAutor = (await api.autenticar({ email: autorDados.email, senha: autorDados.password })).accessToken;

  const vitimaDados = usuarios.novo();
  assert.equal((await api.registrar(vitimaDados)).status, 201, 'PASSO 1: cadastro da vitima falhou');
  const tokenVitima = (await api.autenticar({ email: vitimaDados.email, senha: vitimaDados.password })).accessToken;

  const autor = insp.carga((await api.meuPerfil(tokenAutor)).body);
  const vitima = insp.carga((await api.meuPerfil(tokenVitima)).body);
  assert.notEqual(autor.id, vitima.id, 'arranjo: as duas contas precisam ser distintas');

  // ---- PASSO 2 — o registro vem com os campos do servidor forjados ------
  // Tudo abaixo e o ataque. Um cliente honesto manda so os campos da massa.
  const dataForjada = '1999-01-01T00:00:00Z';
  const forjado = demandas.com({
    id: 'id-escolhido-pelo-cliente',
    status: contrato.STATUS.RESOLVIDA,
    usuarioId: vitima.id,
    createdAt: dataForjada,
    updatedAt: dataForjada,
  });

  const criacao = await api.criarDemanda(tokenAutor, forjado);
  respostasDaJornada.push(['POST /api/demandas', criacao]);

  assert.equal(
    criacao.status,
    201,
    `PASSO 2: o registro deveria ser aceito — os campos extras sao para serem IGNORADOS, ` +
    `nao para derrubar a chamada. Recebido: ${insp.resumo(criacao)}`,
  );
  const demanda = insp.carga(criacao.body);

  // ---- PASSO 3 — nada do que ele mandou foi obedecido -------------------
  assert.notEqual(
    demanda.id,
    forjado.id,
    'PASSO 3: a API aceitou o identificador escolhido pelo cliente. Quem escolhe o id ' +
    'colide com registro existente e sobrescreve o chamado de outra pessoa.',
  );
  assert.equal(
    demanda.status,
    contrato.STATUS_INICIAL,
    `PASSO 3 — ESTADO FORJADO: o chamado nasceu em "${demanda.status}" porque o cliente ` +
    `pediu. Um chamado que ja nasce resolvido some da fila sem nunca ter sido atendido.`,
  );
  // A autoria pode vir sob nomes diferentes; o contrato do produto nao fecha
  // qual. Procuramos todos antes de concluir qualquer coisa — acusar
  // falsificacao quando o campo simplesmente nao existe seria diagnosticar o
  // defeito errado, e mandaria o time procurar no lugar errado.
  const autoriaGravada = demanda.author ?? demanda.autor ?? demanda.usuarioId ?? demanda.userId ?? null;
  assert.ok(
    autoriaGravada !== null && autoriaGravada !== undefined,
    'PASSO 3 — CHAMADO SEM DONO: o registro gravado nao expoe autoria nenhuma. Sem ela ' +
    'nao ha como o app mostrar "meus chamados", nem como a prefeitura saber a quem ' +
    'responder, nem como auditar quem registrou o que. ' +
    `Campos presentes: ${Object.keys(demanda).join(', ')}`,
  );

  const idDoAutorGravado = String(autoriaGravada?.id ?? autoriaGravada);
  assert.equal(
    idDoAutorGravado,
    String(autor.id),
    'PASSO 3 — AUTORIA FORJADA: o chamado nao ficou no nome de quem estava autenticado. ' +
    'Denuncia atribuida a um morador que nao a registrou e problema juridico.',
  );
  assert.notEqual(
    idDoAutorGravado,
    String(vitima.id),
    `PASSO 3 — AUTORIA FORJADA: o chamado foi registrado em nome de ${vitimaDados.email}, ` +
    `que nao o abriu, porque ${autorDados.email} mandou o campo de autoria no corpo`,
  );
  assert.notEqual(
    String(demanda.createdAt),
    dataForjada,
    'PASSO 3 — DATA FORJADA: a API obedeceu a data de criacao enviada pelo cliente. Quem ' +
    'controla a data controla a posicao na fila e o tempo de atendimento medido.',
  );

  // ---- PASSO 4 — a vitima nao ve nada no historico dela -----------------
  const historicoDaVitima = await api.percorrerListagem(tokenVitima);
  assert.deepEqual(
    historicoDaVitima.filter(d => d.id === demanda.id).map(d => d.id),
    [],
    `PASSO 4: o chamado forjado apareceu no historico de ${vitimaDados.email}, que nunca ` +
    'o abriu',
  );

  // ---- PASSO 5 — o protocolo entregue ao cidadao e valido ---------------
  assert.match(
    String(demanda.protocol),
    contrato.FORMATO_PROTOCOLO,
    `PASSO 5: o protocolo "${demanda.protocol}" nao segue o formato do contrato. E o ` +
    'numero que o cidadao anota para cobrar o atendimento — sem ele, nao ha como referenciar o caso.',
  );

  // ---- PASSO 6 — e unico entre chamados diferentes ----------------------
  const segunda = insp.carga((await api.criarDemanda(tokenAutor, demandas.valida())).body);
  assert.notEqual(
    demanda.protocol,
    segunda.protocol,
    `PASSO 6: dois chamados receberam o mesmo protocolo (${demanda.protocol}). Um ` +
    'identificador que se repete deixa de identificar: o atendente abre o caso errado.',
  );

  // ---- PASSO 7 — o registro guardado e auditavel ------------------------
  const detalhe = await api.obterDemanda(tokenAutor, demanda.id);
  respostasDaJornada.push(['GET /api/demandas/{id}', detalhe]);
  assert.equal(detalhe.status, 200, `PASSO 7: o autor nao conseguiu reabrir o proprio chamado: ${insp.resumo(detalhe)}`);

  const ausentes = insp.camposAusentes(detalhe.body, [
    'id',
    'protocol',
    'category',
    'description',
    'status',
    'location',
    'createdAt',
  ]);
  assert.deepEqual(
    ausentes,
    [],
    `PASSO 7: o detalhe do chamado nao trouxe: ${ausentes.join(', ')}. Sao os campos que ` +
    'a prefeitura precisa para auditar o atendimento depois.',
  );

  // ---- PASSO 8 — os dados persistidos sao os que ele mandou de verdade --
  assert.equal(
    insp.carga(detalhe.body).category,
    forjado.categoria,
    'PASSO 8: ignorar os campos do servidor nao pode significar ignorar os campos do cliente — ' +
    'a categoria legitima se perdeu no caminho',
  );

  // ---- PASSO 9 — nenhuma resposta da jornada vazou credencial -----------
  const listagem = await api.listarDemandas(tokenAutor);
  respostasDaJornada.push(['GET /api/demandas', listagem]);

  for (const [rotulo, resposta] of respostasDaJornada) {
    const vazamentos = insp.camposProibidos(resposta.body, contrato.CAMPOS_PROIBIDOS_EM_RESPOSTA);
    assert.deepEqual(
      vazamentos,
      [],
      `PASSO 9: ${rotulo} expos credencial em ${vazamentos.join(', ')} — o bloco de autoria ` +
      'da demanda esta carregando o usuario inteiro, senha junto',
    );
  }
});
