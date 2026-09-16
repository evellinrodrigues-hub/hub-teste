# E2E-07 — Continuidade de sessão: renovar o acesso sem perder o trabalho

| | |
| :--- | :--- |
| **Branch** | `branch7-Luis` |
| **Responsável** | Luis |
| **Arquivo de teste** | [`tests/e2e/e2e07-continuidade-de-sessao.test.js`](../../tests/e2e/e2e07-continuidade-de-sessao.test.js) |
| **Nível** | End-to-End (jornada funcional completa, atravessando várias rotas e perfis) |
| **SUT** | API do ResolveAí / Smart City |

---

## 1. Cenário automatizado

Um morador usa o ResolveAí ao longo do dia. Em algum momento o acesso expira e o app renova a sessão em segundo plano, sem pedir a senha de novo. No fim do dia, num aparelho que divide com a família, ele sai da conta.

## 2. Fluxo percorrido

1. O morador entra: access e refresh token, distintos entre si
2. Ele trabalha com o acesso corrente (registra um chamado)
3. O access **não** serve para renovar (401)
4. O app renova em segundo plano com o refresh
5. O trabalho dele continua acessível na sessão renovada, e a identidade é a mesma
6. No fim do dia, ele sai da conta
7. A sessão acabou mesmo — leitura **e** escrita respondem 401

## 3. O que esta jornada protege

Sessão é o único assunto do produto cujo defeito aparece sempre no usuário e nunca no desenvolvedor: quem programa roda o app por cinco minutos e nunca alcança a renovação. **Access aceito como refresh** transforma um token que trafega em toda chamada numa chave permanente. **Logout decorativo**, que só limpa a tela, é falha de segurança em aparelho compartilhado.

## 4. Como executar

Nada a instalar: o runner e o cliente HTTP vêm do próprio Node (≥ 20.11.0).

```bash
# terminal 1 — sobe o alvo de referência (duplo do contrato)
npm run sut:referencia

# terminal 2 — confere contra quem a suíte vai falar e executa só esta jornada
npm run diagnostico
node --test "tests/e2e/e2e07-*.test.js"
```

Contra o back-end real do Projeto Integrador, **trocar de alvo é mudar uma variável** — nenhum arquivo de teste muda:

```bash
BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e07-*.test.js"
```

`npm test` também já executa esta jornada: o glob da suíte é `tests/**/*.test.js`.

### Pré-requisitos contra o back-end real

Os usuários de teste precisam existir no ambiente com os perfis `cidadao`, `gestor` e `admin` (ver seção 3 do [README](../../README.md)). `npm run diagnostico` diz qual está faltando. O cidadão desta jornada é **criado pelo próprio teste** — ela não depende de histórico de execução anterior.

## 5. Resultado esperado

| Alvo | Resultado |
| :--- | :--- |
| Duplo de referência (`npm run sut:referencia`) | **Verde.** Prova que a jornada funciona — não prova nada sobre o produto. |
| Back-end real | **Falha no passo 3.** O back-end real aceita o access token como refresh: a distinção entre os dois não é verificada. |

> Divergência entre os dois alvos exige a pergunta de três vias: o defeito está no back-end, no teste ou no próprio contrato? Ver [`docs/tas.md`](../tas.md), seção 4.

## 6. Oráculo

Todo valor esperado vem de [`data/contrato.js`](../../data/contrato.js) e [`data/matriz-autorizacao.js`](../../data/matriz-autorizacao.js). Não há nenhum literal de domínio dentro do teste: se a especificação mudar, muda-se o oráculo em um lugar só e a jornada acompanha.
