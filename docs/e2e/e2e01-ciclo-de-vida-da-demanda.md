# E2E-01 — Ciclo de vida completo da demanda

| | |
| :--- | :--- |
| **Branch** | `branch1-Andre` |
| **Responsável** | André |
| **Arquivo de teste** | [`tests/e2e/e2e01-ciclo-de-vida-da-demanda.test.js`](../../tests/e2e/e2e01-ciclo-de-vida-da-demanda.test.js) |
| **Nível** | End-to-End (jornada funcional completa, atravessando várias rotas e perfis) |
| **SUT** | API do ResolveAí / Smart City |

---

## 1. Cenário automatizado

Um morador que nunca usou o ResolveAí abre a conta, relata um buraco na rua, acompanha o andamento e vê o caso encerrado. Do outro lado, o gestor público recebe a demanda na fila, assume o atendimento e conclui o serviço.

## 2. Fluxo percorrido

1. O morador se cadastra pela via pública
2. A conta é reconhecida como dele (`/auth/me`), com perfil de cidadão
3. Ele registra a demanda: status inicial, protocolo no formato, autoria dele
4. A demanda aparece no histórico dele
5. A demanda chega à fila do gestor
6. O gestor assume o atendimento (PENDING → IN_PROGRESS)
7. O gestor conclui o serviço (IN_PROGRESS → RESOLVED) e a data de conclusão é registrada
8. O morador vê o caso encerrado
9. Ele sai da conta e o token deixa de valer

## 3. O que esta jornada protege

A costura entre cadastro, sessão, autoria, visibilidade e máquina de estados. Um defeito de integração — o token do cadastro não serve para criar demanda, a demanda do cidadão não chega na fila do gestor, resolver não registra a data — passa ileso por teste de unidade e por teste de rota, e é pego aqui.

## 4. Como executar

Nada a instalar: o runner e o cliente HTTP vêm do próprio Node (≥ 20.11.0).

```bash
# terminal 1 — sobe o alvo de referência (duplo do contrato)
npm run sut:referencia

# terminal 2 — confere contra quem a suíte vai falar e executa só esta jornada
npm run diagnostico
node --test "tests/e2e/e2e01-*.test.js"
```

Contra o back-end real do Projeto Integrador, **trocar de alvo é mudar uma variável** — nenhum arquivo de teste muda:

```bash
BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e01-*.test.js"
```

`npm test` também já executa esta jornada: o glob da suíte é `tests/**/*.test.js`.

### Pré-requisitos contra o back-end real

Os usuários de teste precisam existir no ambiente com os perfis `cidadao`, `gestor` e `admin` (ver seção 3 do [README](../../README.md)). `npm run diagnostico` diz qual está faltando. O cidadão desta jornada é **criado pelo próprio teste** — ela não depende de histórico de execução anterior.

## 5. Resultado esperado

| Alvo | Resultado |
| :--- | :--- |
| Duplo de referência (`npm run sut:referencia`) | **Verde.** Prova que a jornada funciona — não prova nada sobre o produto. |
| Back-end real | **Falha no passo 3.** O back-end real não expõe o campo `protocol`: o cidadão fica sem o número que usaria para cobrar o atendimento. |

> Divergência entre os dois alvos exige a pergunta de três vias: o defeito está no back-end, no teste ou no próprio contrato? Ver [`docs/tas.md`](../tas.md), seção 4.

## 6. Oráculo

Todo valor esperado vem de [`data/contrato.js`](../../data/contrato.js) e [`data/matriz-autorizacao.js`](../../data/matriz-autorizacao.js). Não há nenhum literal de domínio dentro do teste: se a especificação mudar, muda-se o oráculo em um lugar só e a jornada acompanha.
