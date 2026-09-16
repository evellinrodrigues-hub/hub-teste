# E2E-02 — Triagem com rejeição: o desfecho negativo também é um desfecho

| | |
| :--- | :--- |
| **Branch** | `branch2-Dayvid` |
| **Responsável** | Dayvid |
| **Arquivo de teste** | [`tests/e2e/e2e02-triagem-e-rejeicao.test.js`](../../tests/e2e/e2e02-triagem-e-rejeicao.test.js) |
| **Nível** | End-to-End (jornada funcional completa, atravessando várias rotas e perfis) |
| **SUT** | API do ResolveAí / Smart City |

---

## 1. Cenário automatizado

Um morador relata algo que a prefeitura decide não atender (endereço fora do município, duplicidade, competência de outro órgão). O gestor prioriza o caso, rejeita formalmente, e o morador vê a recusa no próprio histórico. A partir daí o caso está encerrado.

## 2. Fluxo percorrido

1. O morador registra o chamado
2. O gestor ajusta a prioridade antes de decidir
3. O gestor rejeita formalmente (PENDING → REJECTED)
4. O morador vê a recusa no próprio histórico
5. Nenhuma das transições proibidas a partir de REJECTED é aceita (todas devem responder 409)
6. Depois das tentativas recusadas, o estado continua sendo o da decisão

## 3. O que esta jornada protege

O caminho feliz costuma ser o único automatizado, e o desfecho negativo é onde mora o dano. Uma demanda rejeitada que volta sozinha para a fila, ou que pode ser reaberta por chamada direta, apaga o registro da decisão e distorce o indicador de atendimento. A ponta crítica não é a rejeição — é a **irreversibilidade** dela.

## 4. Como executar

Nada a instalar: o runner e o cliente HTTP vêm do próprio Node (≥ 20.11.0).

```bash
# terminal 1 — sobe o alvo de referência (duplo do contrato)
npm run sut:referencia

# terminal 2 — confere contra quem a suíte vai falar e executa só esta jornada
npm run diagnostico
node --test "tests/e2e/e2e02-*.test.js"
```

Contra o back-end real do Projeto Integrador, **trocar de alvo é mudar uma variável** — nenhum arquivo de teste muda:

```bash
BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e02-*.test.js"
```

`npm test` também já executa esta jornada: o glob da suíte é `tests/**/*.test.js`.

### Pré-requisitos contra o back-end real

Os usuários de teste precisam existir no ambiente com os perfis `cidadao`, `gestor` e `admin` (ver seção 3 do [README](../../README.md)). `npm run diagnostico` diz qual está faltando. O cidadão desta jornada é **criado pelo próprio teste** — ela não depende de histórico de execução anterior.

## 5. Resultado esperado

| Alvo | Resultado |
| :--- | :--- |
| Duplo de referência (`npm run sut:referencia`) | **Verde.** Prova que a jornada funciona — não prova nada sobre o produto. |
| Back-end real | **Falha no passo 5.** O back-end real aceita transições a partir de REJECTED: o estado final não é final. |

> Divergência entre os dois alvos exige a pergunta de três vias: o defeito está no back-end, no teste ou no próprio contrato? Ver [`docs/tas.md`](../tas.md), seção 4.

## 6. Oráculo

Todo valor esperado vem de [`data/contrato.js`](../../data/contrato.js) e [`data/matriz-autorizacao.js`](../../data/matriz-autorizacao.js). Não há nenhum literal de domínio dentro do teste: se a especificação mudar, muda-se o oráculo em um lugar só e a jornada acompanha.
