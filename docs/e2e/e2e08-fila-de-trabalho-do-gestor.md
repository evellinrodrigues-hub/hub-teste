# E2E-08 — A fila de trabalho do gestor: achar o caso certo e tirá-lo da fila

| | |
| :--- | :--- |
| **Branch** | `branch8-Manuele` |
| **Responsável** | Manuele |
| **Arquivo de teste** | [`tests/e2e/e2e08-fila-de-trabalho-do-gestor.test.js`](../../tests/e2e/e2e08-fila-de-trabalho-do-gestor.test.js) |
| **Nível** | End-to-End (jornada funcional completa, atravessando várias rotas e perfis) |
| **SUT** | API do ResolveAí / Smart City |

---

## 1. Cenário automatizado

O gestor abre o painel no começo do expediente. A fila tem chamados de várias categorias. Ele filtra pelos que ninguém assumiu, restringe à categoria da equipe dele, encontra o caso, assume o atendimento — e o caso sai da fila de pendentes e entra na de em andamento.

## 2. Fluxo percorrido

1. O bairro abre três chamados de categorias diferentes
2. O gestor abre a fila do que ninguém assumiu (filtro por status)
3. Ele restringe à categoria da equipe dele
4. A fila vem paginada, e a paginação se declara
5. Ele assume o atendimento
6. O chamado troca de fila: sai de pendentes, entra em andamento
7. Os outros dois não foram arrastados junto

## 3. O que esta jornada protege

Filtro e paginação parecem conveniência e são, na verdade, o que decide se o chamado vai ser atendido. Um filtro que devolve o conjunto errado não quebra nada visível: a tela desenha, a lista tem itens, e um chamado fica meses parado porque nunca apareceu para a equipe certa. O teste verifica o filtro **nas duas direções** — o alvo aparece no recorte a que pertence e some do recorte a que deixou de pertencer. Nenhuma asserção é sobre quantidade: em ambiente compartilhado isso seria teste intermitente.

## 4. Como executar

Nada a instalar: o runner e o cliente HTTP vêm do próprio Node (≥ 20.11.0).

```bash
# terminal 1 — sobe o alvo de referência (duplo do contrato)
npm run sut:referencia

# terminal 2 — confere contra quem a suíte vai falar e executa só esta jornada
npm run diagnostico
node --test "tests/e2e/e2e08-*.test.js"
```

Contra o back-end real do Projeto Integrador, **trocar de alvo é mudar uma variável** — nenhum arquivo de teste muda:

```bash
BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e08-*.test.js"
```

`npm test` também já executa esta jornada: o glob da suíte é `tests/**/*.test.js`.

### Pré-requisitos contra o back-end real

Os usuários de teste precisam existir no ambiente com os perfis `cidadao`, `gestor` e `admin` (ver seção 3 do [README](../../README.md)). `npm run diagnostico` diz qual está faltando. O cidadão desta jornada é **criado pelo próprio teste** — ela não depende de histórico de execução anterior.

## 5. Resultado esperado

| Alvo | Resultado |
| :--- | :--- |
| Duplo de referência (`npm run sut:referencia`) | **Verde.** Prova que a jornada funciona — não prova nada sobre o produto. |
| Back-end real | **Falha no passo 2.** O filtro `status=PENDING` do back-end real devolve 12 registros quando existem 110 demandas nesse estado, e omite a recém-criada. Chamado que não aparece para a equipe certa não é atendido. |

> Divergência entre os dois alvos exige a pergunta de três vias: o defeito está no back-end, no teste ou no próprio contrato? Ver [`docs/tas.md`](../tas.md), seção 4.

## 6. Oráculo

Todo valor esperado vem de [`data/contrato.js`](../../data/contrato.js) e [`data/matriz-autorizacao.js`](../../data/matriz-autorizacao.js). Não há nenhum literal de domínio dentro do teste: se a especificação mudar, muda-se o oráculo em um lugar só e a jornada acompanha.
