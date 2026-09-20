# E2E-09 — Governança de perfis: só o administrador promove um gestor

| | |
| :--- | :--- |
| **Branch** | `branch9-Evellin` |
| **Responsável** | Evellin |
| **Arquivo de teste** | [`tests/e2e/e2e09-promocao-de-perfil.test.js`](../../tests/e2e/e2e09-promocao-de-perfil.test.js) |
| **Nível** | End-to-End (jornada funcional completa, atravessando várias rotas e perfis) |
| **SUT** | API do ResolveAí / Smart City |

---

## 1. Cenário automatizado

A prefeitura contrata um servidor novo. Ele se cadastra pela via pública, como qualquer morador, e antes de ser promovido não consegue triar chamado nenhum. O administrador o promove a gestor, e a partir desse instante ele passa a trabalhar na fila.

## 2. Fluxo percorrido

1. O servidor novo se cadastra como qualquer morador
2. Ele registra um chamado, ainda como morador
3. **Antes** da promoção, ele não tria (403)
4. Ninguém se promove sozinho (403) e o perfil não muda
5. O administrador promove
6. A sessão dele já reflete o novo papel
7. **Depois** da promoção, a mesma operação passa (200)
8. Promover continua sendo exclusividade do admin: nem o novo gestor promove

## 3. O que esta jornada protege

Autorização não é um estado, é uma transição. O teste verifica a **mesma** operação, pelo **mesmo** usuário, no **mesmo** recurso, antes e depois da promoção. Verificar só o "depois" passa verde num sistema que nunca bloqueou ninguém; verificar só o "antes" passa verde num sistema que nunca promove. O par é o que prova que a regra existe e que a promoção surte efeito.

O chamado usado no teste é do próprio usuário de propósito: com a demanda de outra pessoa, a recusa poderia vir da regra de propriedade (404) e não da de autorização (403), e o teste estaria verificando outra coisa sem avisar.

## 4. Como executar

Nada a instalar: o runner e o cliente HTTP vêm do próprio Node (≥ 20.11.0).

```bash
# terminal 1 — sobe o alvo de referência (duplo do contrato)
npm run sut:referencia

# terminal 2 — confere contra quem a suíte vai falar e executa só esta jornada
npm run diagnostico
node --test "tests/e2e/e2e09-*.test.js"
```

Contra o back-end real do Projeto Integrador, **trocar de alvo é mudar uma variável** — nenhum arquivo de teste muda:

```bash
BASE_URL=http://localhost:5000 node --test "tests/e2e/e2e09-*.test.js"
```

`npm test` também já executa esta jornada: o glob da suíte é `tests/**/*.test.js`.

### Pré-requisitos contra o back-end real

Os usuários de teste precisam existir no ambiente com os perfis `cidadao`, `gestor` e `admin` (ver seção 3 do [README](../../README.md)). `npm run diagnostico` diz qual está faltando. O cidadão desta jornada é **criado pelo próprio teste** — ela não depende de histórico de execução anterior.

## 5. Resultado esperado

| Alvo | Resultado |
| :--- | :--- |
| Duplo de referência (`npm run sut:referencia`) | **Verde.** Prova que a jornada funciona — não prova nada sobre o produto. |
| Back-end real | **Falha no passo 3.** O 403 vem correto, mas sem o `code` do contrato. Na suíte de serviço, a autopromoção do cidadão (passo 4) também já foi registrada como escalonamento de privilégio no back-end real. |

> Divergência entre os dois alvos exige a pergunta de três vias: o defeito está no back-end, no teste ou no próprio contrato? Ver [`docs/tas.md`](../tas.md), seção 4.

## 6. Oráculo

Todo valor esperado vem de [`data/contrato.js`](../../data/contrato.js) e [`data/matriz-autorizacao.js`](../../data/matriz-autorizacao.js). Não há nenhum literal de domínio dentro do teste: se a especificação mudar, muda-se o oráculo em um lugar só e a jornada acompanha.
