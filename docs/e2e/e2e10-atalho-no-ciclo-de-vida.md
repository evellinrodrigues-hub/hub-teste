# E2E-10 — O atalho recusado: não se resolve o que nunca foi atendido

| | |
| :--- | :--- |
| **Branch** | `branch10-Peterson` |
| **Responsável** | Peterson |
| **Arquivo de teste** | [`tests/e2e/e2e10-atalho-no-ciclo-de-vida.test.js`](../../tests/e2e/e2e10-atalho-no-ciclo-de-vida.test.js) |
| **Nível** | End-to-End (jornada funcional completa, atravessando várias rotas e perfis) |
| **SUT** | API do ResolveAí / Smart City |

---

## 1. Cenário automatizado

Um gestor apressado tenta marcar como resolvido um chamado que ninguém chegou a assumir — o atalho que zera a fila sem zerar o problema. O sistema recusa, ele percorre o caminho de verdade, e depois de concluído o caso não volta mais para trás.

## 2. Fluxo percorrido

1. O chamado entra na fila
2. O contrato confirma que o atalho é proibido
3. O gestor tenta o atalho e é barrado (409), e o estado não muda
4. Status inexistente é 400, e não 409
5. O caminho de verdade: alguém assume
6. E só então conclui
7. Concluído não volta atrás (todas as transições de saída respondem 409)
8. O cidadão vê o desfecho correto

## 3. O que esta jornada protege

A máquina de estados é o que separa um indicador de atendimento de uma planilha de autodeclaração. Se der para pular de "ninguém assumiu" para "resolvido", o tempo médio de atendimento vira ficção.

O passo 4 separa dois erros que costumam ser confundidos: status que **não existe** no contrato é 400 (o cliente mandou lixo); status que existe mas cujo caminho não é permitido é 409 (conflito com o estado do recurso). Trocar um pelo outro manda o time procurar defeito de regra onde há erro de digitação.

## 4. Como executar

Nada a instalar: o runner e o cliente HTTP vêm do próprio Node (≥ 20.11.0).

```bash
# terminal 1 — sobe o alvo de referência (duplo do contrato)
npm run sut:referencia

# terminal 2 — confere contra quem a suíte vai falar e executa só esta jornada
npm run diagnostico
node --test "tests/e2e/e2e10-*.test.js"
```

Contra o back-end real do Projeto Integrador, **trocar de alvo é mudar uma variável** — nenhum arquivo de teste muda:

```bash
BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e10-*.test.js"
```

`npm test` também já executa esta jornada: o glob da suíte é `tests/**/*.test.js`.

### Pré-requisitos contra o back-end real

Os usuários de teste precisam existir no ambiente com os perfis `cidadao`, `gestor` e `admin` (ver seção 3 do [README](../../README.md)). `npm run diagnostico` diz qual está faltando. O cidadão desta jornada é **criado pelo próprio teste** — ela não depende de histórico de execução anterior.

## 5. Resultado esperado

| Alvo | Resultado |
| :--- | :--- |
| Duplo de referência (`npm run sut:referencia`) | **Verde.** Prova que a jornada funciona — não prova nada sobre o produto. |
| Back-end real | **Falha no passo 3.** O back-end real aceita PENDING → RESOLVED: o atalho existe. |

> Divergência entre os dois alvos exige a pergunta de três vias: o defeito está no back-end, no teste ou no próprio contrato? Ver [`docs/tas.md`](../tas.md), seção 4.

## 6. Oráculo

Todo valor esperado vem de [`data/contrato.js`](../../data/contrato.js) e [`data/matriz-autorizacao.js`](../../data/matriz-autorizacao.js). Não há nenhum literal de domínio dentro do teste: se a especificação mudar, muda-se o oráculo em um lugar só e a jornada acompanha.
