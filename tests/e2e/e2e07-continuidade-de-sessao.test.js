/**
 * E2E-07 — Continuidade de sessao: o app renova o acesso sem perder o trabalho.
 *
 * Branch: branch7-Luis
 *
 * FLUXO DO USUARIO
 * Um morador usa o ResolveAi ao longo do dia. Em algum momento o acesso dele
 * expira e o app renova a sessao em segundo plano, sem pedir a senha de novo —
 * ele nem percebe. No fim do dia, num aparelho que divide com a familia, ele
 * sai da conta. A jornada percorre a sessao inteira: entrada, trabalho,
 * renovacao, trabalho de novo, saida.
 *
 * O QUE ESTA JORNADA PROTEGE
 * Sessao e o unico assunto do produto em que o defeito aparece SEMPRE no
 * usuario, nunca no desenvolvedor: quem programa roda o app por cinco minutos
 * e nunca alcanca a renovacao. Dois defeitos classicos so aparecem aqui:
 *
 *  1. ACCESS ACEITO COMO REFRESH. Se a API nao distingue os dois tokens, o
 *     access — que trafega em toda chamada e vive no armazenamento do app —
 *     vira uma chave permanente. Quem o capturar renova a sessao para sempre,
 *     e a expiracao deixa de significar qualquer coisa.
 *  2. LOGOUT DECORATIVO. "Sair" que so limpa a tela e nao invalida o token no
 *     servidor e falha de seguranca em aparelho compartilhado, nao de
 *     usabilidade.
 *
 * COMO EXECUTAR
 *   Terminal 1:  npm run sut:referencia
 *   Terminal 2:  node --test "tests/e2e/e2e07-*.test.js"
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = require('../../api/smart-city');
const insp = require('../../lib/inspecao');
const contrato = require('../../data/contrato');
const demandas = require('../../data/demandas');
const usuarios = require('../../data/usuarios');

test('E2E-07 a sessao atravessa a renovacao e termina de verdade no logout', async () => {
  // ---- PASSO 1 — o morador entra -----------------------------------------
  const dados = usuarios.novo();
  const cadastro = await api.registrar(dados);
  assert.equal(cadastro.status, 201, `PASSO 1: cadastro respondeu ${insp.resumo(cadastro)}`);

  const entrada = await api.login(dados.email, dados.password);
  assert.equal(entrada.status, 200, `PASSO 1: login respondeu ${insp.resumo(entrada)}`);

  const { accessToken, refreshToken } = api.extrairTokens(entrada.body);

  assert.ok(accessToken, 'PASSO 1: o login nao devolveu access token');
  assert.ok(
    refreshToken,
    'PASSO 1: o login nao devolveu refresh token. Sem ele, ou a sessao expira e derruba ' +
    'o usuario no meio do uso, ou o access precisa ser eterno — e as duas saidas sao ruins.',
  );
  assert.notEqual(
    accessToken,
    refreshToken,
    'PASSO 1: access e refresh vieram iguais. Sao credenciais com tempos de vida e ' +
    'superficies de exposicao diferentes; emitir o mesmo valor anula a distincao.',
  );

  // ---- PASSO 2 — ele trabalha com o acesso corrente ---------------------
  const criacao = await api.criarDemanda(accessToken, demandas.valida());
  assert.equal(criacao.status, 201, `PASSO 2: registro respondeu ${insp.resumo(criacao)}`);
  const demanda = insp.carga(criacao.body);

  // ---- PASSO 3 — o access NAO serve para renovar ------------------------
  // Feito antes da renovacao legitima de proposito: se a API aceitasse, o
  // teste ainda teria um token valido em maos e o passo seguinte passaria
  // verde escondendo o defeito.
  const renovacaoIndevida = await api.renovarToken(accessToken, { refresh_token: accessToken });
  assert.equal(
    renovacaoIndevida.status,
    401,
    'PASSO 3 — CHAVE PERMANENTE: o access token foi aceito como refresh. O access viaja ' +
    'em toda chamada e mora no armazenamento do aparelho; se ele tambem renova a sessao, ' +
    `quem o capturar mantem acesso indefinidamente. Recebido: ${insp.resumo(renovacaoIndevida)}`,
  );

  // ---- PASSO 4 — o app renova em segundo plano --------------------------
  const renovacao = await api.renovarToken(refreshToken);
  assert.equal(
    renovacao.status,
    200,
    `PASSO 4: o refresh token legitimo deveria renovar a sessao; respondeu ${insp.resumo(renovacao)}`,
  );

  const novoAccess = api.extrairTokens(renovacao.body).accessToken;
  assert.ok(novoAccess, 'PASSO 4: a renovacao respondeu 200 mas nao devolveu access token novo');

  // ---- PASSO 5 — o trabalho dele continua acessivel na sessao renovada --
  const depoisDaRenovacao = await api.obterDemanda(novoAccess, demanda.id);
  assert.equal(
    depoisDaRenovacao.status,
    200,
    'PASSO 5: depois de renovar, o usuario perdeu acesso ao que registrou antes. A ' +
    'renovacao precisa preservar a identidade, e nao so devolver um token novo. ' +
    `Recebido: ${insp.resumo(depoisDaRenovacao)}`,
  );
  assert.equal(
    insp.carga(depoisDaRenovacao.body).id,
    demanda.id,
    'PASSO 5: a sessao renovada devolveu outro recurso',
  );

  const perfilRenovado = await api.meuPerfil(novoAccess);
  assert.equal(perfilRenovado.status, 200, `PASSO 5: /auth/me na sessao renovada respondeu ${insp.resumo(perfilRenovado)}`);
  assert.equal(
    insp.carga(perfilRenovado.body).email,
    dados.email,
    'PASSO 5 — TROCA DE IDENTIDADE: a renovacao devolveu um token que responde por outra conta',
  );
  assert.equal(insp.carga(perfilRenovado.body).role, contrato.PERFIS.CIDADAO);

  // ---- PASSO 6 — no fim do dia, ele sai da conta ------------------------
  const saida = await api.logout(novoAccess);
  assert.ok(
    saida.status >= 200 && saida.status < 300,
    `PASSO 6: o logout respondeu ${insp.resumo(saida)}`,
  );

  // ---- PASSO 7 — e a sessao acabou mesmo --------------------------------
  const depoisDoLogout = await api.meuPerfil(novoAccess);
  assert.equal(
    depoisDoLogout.status,
    401,
    'PASSO 7 — LOGOUT DECORATIVO: o token continuou valido depois de sair. Num aparelho ' +
    'compartilhado, a proxima pessoa continua dentro da conta anterior. ' +
    `Recebido: ${insp.resumo(depoisDoLogout)}`,
  );
  assert.equal(
    insp.codigoDeErro(depoisDoLogout.body),
    contrato.ERROS.NAO_AUTENTICADO,
    'PASSO 7: a recusa pos-logout nao trouxe o codigo de erro do contrato',
  );

  const escritaDepoisDoLogout = await api.criarDemanda(novoAccess, demandas.valida());
  assert.equal(
    escritaDepoisDoLogout.status,
    401,
    'PASSO 7: a leitura foi bloqueada depois do logout, mas a ESCRITA nao. Invalidar a ' +
    `sessao precisa valer para toda a API, nao so para /auth/me. Recebido: ` +
    insp.resumo(escritaDepoisDoLogout),
  );
});
