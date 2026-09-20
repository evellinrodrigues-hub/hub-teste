/**
 * E2E-12 — A jornada real: o usuario erra o caminho inteiro e chega la assim mesmo.
 *
 * Branch: branch12-Victor
 *
 * FLUXO DO USUARIO
 * A jornada que de fato acontece, e nao a do roteiro. O morador toca em
 * "entrar" sem preencher a senha, erra a senha, tenta se cadastrar com um
 * e-mail que ja usou, fica com um token velho no aparelho, envia o formulario
 * de chamado pela metade, o app manda um corpo corrompido por causa da conexao
 * ruim, e ele ainda abre um link antigo de um chamado que ja nao existe.
 * Depois de tudo isso, ele consegue registrar o problema da rua dele.
 *
 * O QUE ESTA JORNADA PROTEGE
 * Duas promessas que so valem quando verificadas em conjunto:
 *
 *  1. ERRO DO CLIENTE NUNCA VIRA ERRO DO SERVIDOR. Um 5xx em entrada invalida
 *     e excecao nao tratada vazando para fora — alem de defeito, e superficie
 *     de ataque e ruido que esconde incidente de verdade no monitoramento.
 *  2. A RECUSA E ACIONAVEL. Um 400 sem `code` e sem o campo apontado obriga o
 *     app a interpretar mensagem em portugues para decidir onde pintar o erro
 *     de vermelho, e essa mensagem muda a cada ajuste de redacao.
 *
 * E a terceira, que so a jornada verifica: depois de sete recusas seguidas, a
 * API ainda esta sa e o caminho feliz conclui. Um servidor que degrada com
 * entrada invalida so aparece quando os erros vem em sequencia, e nao um por
 * teste.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e12-*.test.js"
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = require('../../api/smart-city');
const http = require('../../lib/http');
const { ROTAS } = require('../../lib/config');
const insp = require('../../lib/inspecao');
const contrato = require('../../data/contrato');
const demandas = require('../../data/demandas');
const usuarios = require('../../data/usuarios');

test('E2E-12 a API recusa todos os erros do usuario sem quebrar, e a jornada conclui', async () => {
  // Toda resposta da jornada entra aqui. A verificacao de 5xx no fim olha o
  // caminho inteiro, e nao so o ultimo passo.
  const trilha = [];
  const registrar = (rotulo, resposta) => {
    trilha.push([rotulo, resposta]);
    return resposta;
  };

  // ---- PASSO 1 — ele toca em "entrar" com o formulario pela metade ------
  const loginVazio = registrar('login sem senha', await api.login(usuarios.emailNovo(), undefined));

  assert.equal(
    loginVazio.status,
    400,
    `PASSO 1: campo obrigatorio ausente e erro de validacao (400), nao credencial ` +
    `invalida (401) nem erro interno. Recebido: ${insp.resumo(loginVazio)}`,
  );
  assert.equal(
    insp.codigoDeErro(loginVazio.body),
    contrato.ERROS.VALIDACAO,
    'PASSO 1: a recusa nao trouxe o codigo legivel por maquina. Sem ele o app precisa ' +
    'interpretar a mensagem em portugues para saber qual campo pintar de vermelho.',
  );
  assert.ok(
    insp.camposComErro(loginVazio.body).length > 0,
    'PASSO 1: a recusa nao apontou nenhum campo — a tela nao tem onde mostrar o erro',
  );

  // ---- PASSO 2 — ele cria a conta e erra a senha na primeira tentativa --
  const dados = usuarios.novo();
  const cadastro = registrar('cadastro valido', await api.registrar(dados));
  assert.equal(cadastro.status, 201, `PASSO 2: o cadastro respondeu ${insp.resumo(cadastro)}`);

  const senhaErrada = registrar('login com senha errada', await api.login(dados.email, `${dados.password}-errada`));
  assert.equal(
    senhaErrada.status,
    401,
    `PASSO 2: senha incorreta e 401. Recebido: ${insp.resumo(senhaErrada)}`,
  );

  // ---- PASSO 3 — e a resposta nao denuncia quais e-mails existem --------
  const emailInexistente = registrar(
    'login de e-mail inexistente',
    await api.login(usuarios.emailNovo(), dados.password),
  );
  assert.equal(
    emailInexistente.status,
    senhaErrada.status,
    'PASSO 3 — ENUMERACAO DE CONTAS: a API respondeu diferente para "e-mail nao existe" e ' +
    '"senha errada". A diferenca transforma a tela de login num verificador de quais ' +
    `moradores tem conta. Recebido: ${insp.resumo(emailInexistente)}`,
  );
  assert.equal(
    insp.codigoDeErro(emailInexistente.body),
    insp.codigoDeErro(senhaErrada.body),
    'PASSO 3 — ENUMERACAO DE CONTAS: os status coincidem, mas o codigo de erro entrega a ' +
    'diferenca do mesmo jeito',
  );

  // ---- PASSO 4 — ele tenta se cadastrar de novo com o mesmo e-mail ------
  const duplicado = registrar('cadastro com e-mail ja usado', await api.registrar(dados));
  assert.equal(
    duplicado.status,
    409,
    'PASSO 4: e-mail ja cadastrado e conflito com o estado do recurso (409), nao erro de ' +
    `formato (400). O app usa essa distincao para oferecer "recuperar senha" em vez de ` +
    `"corrija o campo". Recebido: ${insp.resumo(duplicado)}`,
  );

  // ---- PASSO 5 — o aparelho dele ainda tem um token velho ---------------
  const tokenVelho = registrar('chamada com token invalido', await api.meuPerfil('token-que-ja-expirou'));
  assert.equal(
    tokenVelho.status,
    401,
    `PASSO 5: token invalido e 401. Recebido: ${insp.resumo(tokenVelho)}`,
  );
  assert.ok(
    tokenVelho.ehJson,
    `PASSO 5: a resposta 401 nao e JSON: ${tokenVelho.raw.slice(0, 200)}. O app faz ` +
    'JSON.parse e quebra com uma mensagem que nao ajuda ninguem a diagnosticar nada.',
  );

  // ---- PASSO 6 — ele entra de verdade e envia o chamado pela metade ----
  const entrada = registrar('login valido', await api.login(dados.email, dados.password));
  assert.equal(entrada.status, 200, `PASSO 6: o login correto respondeu ${insp.resumo(entrada)}`);
  const token = api.extrairTokens(entrada.body).accessToken;
  assert.ok(token, 'PASSO 6: o login respondeu 200 sem access token');

  // Primeiro caso invalido da massa: o teste nao inventa o payload nem sabe
  // qual campo esta errado — a massa declara os dois.
  const [primeiroInvalido] = demandas.invalidas();
  const formularioIncompleto = registrar(
    `demanda invalida (${primeiroInvalido.nome})`,
    await api.criarDemanda(token, primeiroInvalido.corpo),
  );

  assert.equal(
    formularioIncompleto.status,
    400,
    `PASSO 6: "${primeiroInvalido.nome}" deveria ser recusado com 400. ` +
    `Recebido: ${insp.resumo(formularioIncompleto)}`,
  );
  assert.ok(
    insp.camposComErro(formularioIncompleto.body).includes(primeiroInvalido.campoEsperado),
    `PASSO 6: a recusa nao apontou o campo "${primeiroInvalido.campoEsperado}". Sem isso o ` +
    'teste passaria mesmo se a API recusasse o chamado pelo motivo errado, e o app nao ' +
    `sabe onde mostrar o erro. Campos apontados: ${insp.camposComErro(formularioIncompleto.body).join(', ') || '(nenhum)'}`,
  );

  // ---- PASSO 7 — a conexao ruim corrompe o corpo no caminho -------------
  const corpoCorrompido = registrar(
    'corpo JSON malformado',
    await http.requisitar('POST', ROTAS.demandas, { token, corpoBruto: '{"titulo": "Buraco",,,}' }),
  );
  assert.ok(
    corpoCorrompido.status >= 400 && corpoCorrompido.status < 500,
    `PASSO 7: corpo malformado deveria produzir 4xx. Um 500 aqui e excecao nao tratada ` +
    `vazando para o cliente. Recebido: ${insp.resumo(corpoCorrompido)}`,
  );

  // ---- PASSO 8 — o app antigo chama a rota com o metodo errado ---------
  const metodoErrado = registrar('metodo nao suportado', await http.get(ROTAS.login, { token }));
  assert.equal(
    metodoErrado.status,
    405,
    `PASSO 8: metodo errado em rota existente e 405, e nao 404. A distincao diz ao cliente ` +
    `se o problema e o endereco ou o verbo. Recebido: ${insp.resumo(metodoErrado)}`,
  );
  assert.ok(
    metodoErrado.headers.get('allow'),
    'PASSO 8: a resposta 405 nao trouxe o header Allow, que e quem informa quais metodos a rota aceita',
  );

  // ---- PASSO 9 — ele abre um link antigo de um chamado que nao existe --
  const linkAntigo = registrar(
    'chamado inexistente',
    await api.obterDemanda(token, '00000000-0000-0000-0000-000000000000'),
  );
  assert.equal(linkAntigo.status, 404, `PASSO 9: chamado inexistente e 404. Recebido: ${insp.resumo(linkAntigo)}`);

  const idMalformado = registrar('identificador malformado', await api.obterDemanda(token, 'nao-e-um-id'));
  assert.ok(
    [400, 404].includes(idMalformado.status),
    `PASSO 9: identificador malformado deveria responder 400 ou 404; respondeu ${insp.resumo(idMalformado)}`,
  );

  // ---- PASSO 10 — depois de tudo, o caminho certo funciona -------------
  const finalmente = registrar('registro valido apos os erros', await api.criarDemanda(token, demandas.valida()));
  assert.equal(
    finalmente.status,
    201,
    'PASSO 10: depois da sequencia de entradas invalidas, a jornada correta parou de ' +
    'funcionar. Um servidor que degrada com erro do cliente so aparece quando os erros ' +
    `vem em sequencia. Recebido: ${insp.resumo(finalmente)}`,
  );
  assert.equal(insp.carga(finalmente.body).status, contrato.STATUS_INICIAL);

  // ---- PASSO 11 — nenhum passo da jornada produziu erro interno --------
  const errosInternos = trilha
    .filter(([, r]) => r.status >= 500)
    .map(([rotulo, r]) => `${rotulo} -> ${r.status}`);

  assert.deepEqual(
    errosInternos,
    [],
    'PASSO 11: a API respondeu 5xx a entrada invalida do usuario. Excecao nao tratada e ' +
    'defeito, superficie de ataque e ruido que esconde incidente real no monitoramento:\n' +
    errosInternos.join('\n'),
  );

  // ---- PASSO 12 — e toda recusa foi acionavel pelo app -----------------
  const recusasSemCodigo = trilha
    .filter(([, r]) => r.status >= 400 && r.status < 500)
    .filter(([, r]) => !insp.codigoDeErro(r.body))
    .map(([rotulo, r]) => `${rotulo} (${r.status})`);

  assert.deepEqual(
    recusasSemCodigo,
    [],
    'PASSO 12: as recusas abaixo nao trouxeram um `code` legivel por maquina. Sem ele, o ' +
    'app e o proprio teste so podem depender da mensagem em portugues, que muda a cada ' +
    'ajuste de redacao:\n' + recusasSemCodigo.join('\n'),
  );
});
