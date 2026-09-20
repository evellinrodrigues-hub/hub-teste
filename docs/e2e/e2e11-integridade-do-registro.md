# E2E-11 — Integridade do registro: o servidor é quem carimba o chamado

| | |
| :--- | :--- |
| **Branch** | `branch11-Rhaldney` |
| **Responsável** | Rhaldney |
| **Arquivo de teste** | [`tests/e2e/e2e11-integridade-do-registro.test.js`](../../tests/e2e/e2e11-integridade-do-registro.test.js) |
| **Nível** | End-to-End (jornada funcional completa, atravessando várias rotas e perfis) |
| **SUT** | API do ResolveAí / Smart City |

---

## 1. Cenário automatizado

Um morador registra chamados por um cliente que não é o app oficial — um script, um Postman, um app modificado. Junto com os dados legítimos ele manda os campos que o servidor deveria controlar sozinho: identificador, estado inicial, autoria e datas.

## 2. Fluxo percorrido

1. Dois moradores: o autor e a vítima da falsificação
2. O registro vem com os campos do servidor forjados
3. Nada do que ele mandou foi obedecido (id, status, autoria e data)
4. A vítima não vê nada no histórico dela
5. O protocolo entregue ao cidadão é válido
6. E é único entre chamados diferentes
7. O registro guardado é auditável
8. Os dados legítimos que ele mandou foram preservados
9. Nenhuma resposta da jornada vazou credencial

## 3. O que esta jornada protege

Confiar no cliente é o defeito mais barato de cometer e o mais caro de descobrir, porque o app oficial nunca manda esses campos — o sistema parece correto durante todo o desenvolvimento. **Autoria forjada:** quem manda `usuarioId` registra denúncia em nome de outra pessoa, o que é problema jurídico. **Estado forjado:** o chamado nasce resolvido e some da fila sem ter sido atendido. **Data forjada:** quem controla `createdAt` controla a posição na fila e o tempo medido.

## 4. Como executar

Nada a instalar: o runner e o cliente HTTP vêm do próprio Node (≥ 20.11.0).

```bash
# terminal 1 — sobe o alvo de referência (duplo do contrato)
npm run sut:referencia

# terminal 2 — confere contra quem a suíte vai falar e executa só esta jornada
npm run diagnostico
node --test "tests/e2e/e2e11-*.test.js"
```

Contra o back-end real do Projeto Integrador, **trocar de alvo é mudar uma variável** — nenhum arquivo de teste muda:

```bash
BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e11-*.test.js"
```

`npm test` também já executa esta jornada: o glob da suíte é `tests/**/*.test.js`.

### Pré-requisitos contra o back-end real

Os usuários de teste precisam existir no ambiente com os perfis `cidadao`, `gestor` e `admin` (ver seção 3 do [README](../../README.md)). `npm run diagnostico` diz qual está faltando. O cidadão desta jornada é **criado pelo próprio teste** — ela não depende de histórico de execução anterior.

## 5. Resultado esperado

| Alvo | Resultado |
| :--- | :--- |
| Duplo de referência (`npm run sut:referencia`) | **Verde.** Prova que a jornada funciona — não prova nada sobre o produto. |
| Back-end real | **Falha no passo 3.** O registro do back-end real não expõe autoria nenhuma — não há como o app montar "meus chamados" nem como auditar quem registrou o quê. O campo `protocol` também não existe. |

> Divergência entre os dois alvos exige a pergunta de três vias: o defeito está no back-end, no teste ou no próprio contrato? Ver [`docs/tas.md`](../tas.md), seção 4.

## 6. Oráculo

Todo valor esperado vem de [`data/contrato.js`](../../data/contrato.js) e [`data/matriz-autorizacao.js`](../../data/matriz-autorizacao.js). Não há nenhum literal de domínio dentro do teste: se a especificação mudar, muda-se o oráculo em um lugar só e a jornada acompanha.
