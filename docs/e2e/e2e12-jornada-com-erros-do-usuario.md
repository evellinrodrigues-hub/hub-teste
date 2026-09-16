# E2E-12 — A jornada real: o usuário erra o caminho inteiro e chega lá assim mesmo

| | |
| :--- | :--- |
| **Branch** | `branch12-Victor` |
| **Responsável** | Victor |
| **Arquivo de teste** | [`tests/e2e/e2e12-jornada-com-erros-do-usuario.test.js`](../../tests/e2e/e2e12-jornada-com-erros-do-usuario.test.js) |
| **Nível** | End-to-End (jornada funcional completa, atravessando várias rotas e perfis) |
| **SUT** | API do ResolveAí / Smart City |

---

## 1. Cenário automatizado

A jornada que de fato acontece, e não a do roteiro. O morador toca em "entrar" sem preencher a senha, erra a senha, tenta se cadastrar com um e-mail que já usou, fica com um token velho no aparelho, envia o formulário pela metade, o app manda um corpo corrompido pela conexão ruim, e ele ainda abre um link antigo. Depois de tudo isso, ele consegue registrar o problema da rua dele.

## 2. Fluxo percorrido

1. "Entrar" com o formulário pela metade → 400 apontando o campo
2. Ele cria a conta e erra a senha → 401
3. A resposta não denuncia quais e-mails existem
4. Cadastro com e-mail já usado → 409, e não 400
5. O aparelho ainda tem um token velho → 401 em JSON
6. Ele entra e envia o chamado pela metade → 400 apontando o campo
7. A conexão ruim corrompe o corpo → 4xx, nunca 500
8. O app antigo chama a rota com o método errado → 405 com header `Allow`
9. Ele abre um link antigo → 404
10. Depois de tudo, o caminho certo funciona
11. Nenhum passo produziu erro interno
12. E toda recusa foi acionável pelo app

## 3. O que esta jornada protege

Duas promessas que só valem verificadas em conjunto: **erro do cliente nunca vira erro do servidor** (um 5xx em entrada inválida é exceção não tratada vazando para fora, além de ruído que esconde incidente real no monitoramento) e **a recusa é acionável** (um 400 sem `code` e sem o campo apontado obriga o app a interpretar mensagem em português para decidir onde pintar de vermelho).

E a terceira, que só a jornada verifica: depois de sete recusas seguidas a API ainda está sã e o caminho feliz conclui. Um servidor que degrada com entrada inválida só aparece quando os erros vêm em sequência.

## 4. Como executar

Nada a instalar: o runner e o cliente HTTP vêm do próprio Node (≥ 20.11.0).

```bash
# terminal 1 — sobe o alvo de referência (duplo do contrato)
npm run sut:referencia

# terminal 2 — confere contra quem a suíte vai falar e executa só esta jornada
npm run diagnostico
node --test "tests/e2e/e2e12-*.test.js"
```

Contra o back-end real do Projeto Integrador, **trocar de alvo é mudar uma variável** — nenhum arquivo de teste muda:

```bash
BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e12-*.test.js"
```

`npm test` também já executa esta jornada: o glob da suíte é `tests/**/*.test.js`.

### Pré-requisitos contra o back-end real

Os usuários de teste precisam existir no ambiente com os perfis `cidadao`, `gestor` e `admin` (ver seção 3 do [README](../../README.md)). `npm run diagnostico` diz qual está faltando. O cidadão desta jornada é **criado pelo próprio teste** — ela não depende de histórico de execução anterior.

## 5. Resultado esperado

| Alvo | Resultado |
| :--- | :--- |
| Duplo de referência (`npm run sut:referencia`) | **Verde.** Prova que a jornada funciona — não prova nada sobre o produto. |
| Back-end real | **Falha no passo 1.** Nenhuma resposta de erro do back-end real traz o campo `code`. |

> Divergência entre os dois alvos exige a pergunta de três vias: o defeito está no back-end, no teste ou no próprio contrato? Ver [`docs/tas.md`](../tas.md), seção 4.

## 6. Oráculo

Todo valor esperado vem de [`data/contrato.js`](../../data/contrato.js) e [`data/matriz-autorizacao.js`](../../data/matriz-autorizacao.js). Não há nenhum literal de domínio dentro do teste: se a especificação mudar, muda-se o oráculo em um lugar só e a jornada acompanha.
