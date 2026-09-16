# E2E-06 — A janela de exclusão fecha quando a prefeitura assume o caso

| | |
| :--- | :--- |
| **Branch** | `branch6-Levi` |
| **Responsável** | Levi |
| **Arquivo de teste** | [`tests/e2e/e2e06-janela-de-exclusao.test.js`](../../tests/e2e/e2e06-janela-de-exclusao.test.js) |
| **Nível** | End-to-End (jornada funcional completa, atravessando várias rotas e perfis) |
| **SUT** | API do ResolveAí / Smart City |

---

## 1. Cenário automatizado

Um morador abre dois chamados e o gestor assume os dois. A partir daí o morador perde o direito de apagar — o caso virou trabalho registrado da prefeitura. O gestor ainda pode descartar um atendimento em andamento, mas não pode apagar um já concluído.

## 2. Fluxo percorrido

1. O morador abre dois chamados
2. A prefeitura assume os dois
3. O morador perde o direito de apagar (403)
4. E o chamado continua lá, intocado
5. O gestor ainda pode descartar o que está em andamento
6. O outro chamado chega ao fim (RESOLVED)
7. Nem o gestor apaga o que já foi concluído (403)
8. O histórico do cidadão reflete os dois desfechos

## 3. O que esta jornada protege

A regra não é "quem pode excluir" — é "quem pode excluir, **em que momento**". Ela só existe no tempo, e só aparece quando o mesmo recurso é visitado antes e depois de mudar de estado. Um teste de rota isolado montaria a demanda já no estado final por atalho e nunca veria a permissão mudando de mão ao longo do caminho.

## 4. Como executar

Nada a instalar: o runner e o cliente HTTP vêm do próprio Node (≥ 20.11.0).

```bash
# terminal 1 — sobe o alvo de referência (duplo do contrato)
npm run sut:referencia

# terminal 2 — confere contra quem a suíte vai falar e executa só esta jornada
npm run diagnostico
node --test "tests/e2e/e2e06-*.test.js"
```

Contra o back-end real do Projeto Integrador, **trocar de alvo é mudar uma variável** — nenhum arquivo de teste muda:

```bash
BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e06-*.test.js"
```

`npm test` também já executa esta jornada: o glob da suíte é `tests/**/*.test.js`.

### Pré-requisitos contra o back-end real

Os usuários de teste precisam existir no ambiente com os perfis `cidadao`, `gestor` e `admin` (ver seção 3 do [README](../../README.md)). `npm run diagnostico` diz qual está faltando. O cidadão desta jornada é **criado pelo próprio teste** — ela não depende de histórico de execução anterior.

## 5. Resultado esperado

| Alvo | Resultado |
| :--- | :--- |
| Duplo de referência (`npm run sut:referencia`) | **Verde.** Prova que a jornada funciona — não prova nada sobre o produto. |
| Back-end real | **Falha no passo 3.** O status 403 vem correto, mas a resposta não traz o `code` legível por máquina que o contrato exige. |

> Divergência entre os dois alvos exige a pergunta de três vias: o defeito está no back-end, no teste ou no próprio contrato? Ver [`docs/tas.md`](../tas.md), seção 4.

## 6. Oráculo

Todo valor esperado vem de [`data/contrato.js`](../../data/contrato.js) e [`data/matriz-autorizacao.js`](../../data/matriz-autorizacao.js). Não há nenhum literal de domínio dentro do teste: se a especificação mudar, muda-se o oráculo em um lugar só e a jornada acompanha.
