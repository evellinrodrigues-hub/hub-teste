# TAS ResolverAí — suíte automatizada de testes de API

Solução de automação de testes (**TAS**) da squad **ResolveAí** para a API do
**PI**, disciplina Testes Automatizados·
CESAR School.

---

## 1. O que este repositório é — e o que ele não é

| É | Não é |
| :--- | :--- |
| A solução de automação: testware, camadas, massa de dados, esteira e evidências. | O produto. Não há aqui uma linha de código de produção. |
| Testes de **API** (nível de serviço) contra a API do Projeto Integrador. | O app mobile ([PetersonNave/Smart-City](https://github.com/PetersonNave/Smart-City)), que é outro repositório. |
| Um duplo de referência do contrato, para a suíte rodar sem depender do back-end no ar. | O back-end Flask, que roda a partir do repositório dele. |

> **O SUT é a API Flask do Projeto Integrador.** O servidor em
> [`sut-referencia/`](sut-referencia/server.js) **não é o SUT**: é um duplo que
> implementa o contrato ao pé da letra. Suíte verde contra ele prova que a
> *suíte* funciona — **não prova nada sobre o produto**. Ver a seção 5.

---

## 2. Como executar

### 2.1 Pré-requisitos

- **Node.js ≥ 20.11.0** (validado em v24.20.0). Nenhuma dependência a instalar:
  o runner e o cliente HTTP vêm do próprio Node, por decisão registrada em
  [`docs/tas.md`](docs/tas.md).
- Git.

### 2.2 Contra o duplo de referência (roda hoje, em qualquer máquina)

```bash
git clone <url-deste-repositorio> tas-smart-city
cd tas-smart-city

# terminal 1 — sobe o alvo
npm run sut:referencia          # http://localhost:5000

# terminal 2 — confere contra quem a suíte vai falar, e executa
npm run diagnostico
npm test
```

### 2.3 Contra o back-end real do Projeto Integrador

Trocar de alvo é **mudar uma variável**. Nenhum arquivo de teste muda.

```bash
# 1. suba a API Flask a partir do repositório dela
# 2. garanta que os usuários de teste existem no ambiente (seção 3)
# 3. aponte a suíte para ela

BASE_URL=http://localhost:5000 npm run diagnostico
BASE_URL=http://localhost:5000 npm test
```

Se o back-end versionar as rotas, ajuste os prefixos sem tocar em teste algum:

```bash
BASE_URL=https://api.exemplo.com PREFIXO_API=/api/v1 npm test
```

### 2.4 Todos os comandos

| Comando | O que faz |
| :--- | :--- |
| `npm test` | Suíte completa (unidade da TAS + API). **Comando único da entrega.** |
| `npm run test:api` | Só o nível de serviço. Exige o alvo no ar. |
| `npm run test:unidade` | Só a verificação da própria TAS. Não usa rede. |
| `npm run test:relatorio` | Executa e grava `evidencias/resultado.xml` (JUnit). |
| `npm run diagnostico` | Diz **contra quem** a suíte vai falar e se os usuários existem. |
| `npm run sut:referencia` | Sobe o duplo de referência do contrato. |
| `npm run sensibilidade` | Injeta defeitos conhecidos e confere se a suíte os detecta. |

> **Rode `npm run diagnostico` antes de interpretar qualquer falha.** O valor
> padrão de `BASE_URL` é conveniência e é dívida técnica consciente: um dia
> alguém vai rodar contra o alvo errado sem perceber.

---

## 3. Configuração

Copie `.env.example` e ajuste. O `.env` **não é versionado**: segredo
versionado permanece no histórico mesmo depois de apagado.

```bash
cp .env.example .env
```

| Variável | Descrição | Padrão |
| :--- | :--- | :--- |
| `BASE_URL` | Endereço do SUT. | `http://localhost:5000` |
| `PREFIXO_AUTH` / `PREFIXO_API` | Prefixos das rotas. | `/auth` · `/api` |
| `TIMEOUT_MS` | Espera máxima por resposta. | `15000` |
| `USUARIO_CIDADAO` / `USUARIO_CIDADAO_2` | Dois cidadãos distintos — o segundo existe para verificar isolamento entre contas. | `ana@` · `bruno@` |
| `USUARIO_GESTOR` / `USUARIO_ADMIN` | Um `MANAGER` e um `ADMIN`. | `gestor@` · `admin@` |
| `SENHA_PADRAO` | Senha dos usuários de teste. | `senha123` |

Contra o back-end real, **os quatro usuários precisam existir** com os perfis
`CITIZEN`, `CITIZEN`, `MANAGER` e `ADMIN`. `npm run diagnostico` verifica isso e
diz qual está faltando.

---

## 4. Estrutura e regra de dependência

As setas apontam sempre para a direita. Um teste **nunca** chama a biblioteca
base diretamente.

```
tests/  ->  api/  ->  lib/
tests/  ->  data/
```

| Camada | Sabe | Não sabe | Nunca contém |
| :--- | :--- | :--- | :--- |
| `lib/` | fetch, cabeçalhos, status, JSON | o que é uma demanda | asserções |
| `api/` | caminhos e formatos do contrato | como HTTP funciona | asserções |
| `data/` | o contrato e a massa | como a chamada é feita | asserções |
| `tests/` | o comportamento esperado | como a chamada é feita | dados literais |

```
tas-smart-city/
├── docs/              tas.md · plano-de-testes.md · relatorio-qualidade.md · entrega.md
├── lib/               http.js · config.js · inspecao.js · diagnostico.js
├── api/               smart-city.js          logica de negocio do teste
├── data/              contrato.js (ORACULO) · demandas.js · usuarios.js · matriz-autorizacao.js
├── tests/
│   ├── unidade/       verificacao da propria TAS, sem rede
│   └── api/           nivel de servico, por historia de usuario
├── sut-referencia/    duplo do contrato — NAO e o SUT
├── scripts/           sensibilidade.js
└── evidencias/        saidas de execucao
```

**Onde colocar um arquivo novo**

- Precisa falar HTTP de um jeito que ainda não existe? → `lib/`
- Traduz vocabulário de domínio em caminho do contrato? → `api/`
- É valor esperado, regra ou massa? → `data/`
- Afirma alguma coisa? → `tests/`, e só ali.

---

## 5. Convenções

- **O oráculo vem da especificação, nunca do objeto testado.** Todo valor
  esperado mora em [`data/contrato.js`](data/contrato.js). Um teste que
  importasse a regra do SUT passaria mesmo com a regra errada, porque estaria
  comparando o código consigo mesmo.
- **Nome do caso começa pelo identificador da história**
  (`HU-13 C36 transicao ...`). Quando falhar na esteira daqui a dois meses, o
  nome sozinho dirá qual regra quebrou.
- **Asserção sobre `error.code`, nunca sobre a mensagem.** O código é legível
  por máquina e estável; a mensagem em português muda a cada ajuste de redação.
- **Cada teste prepara o que precisa e roda sozinho.** Se um teste só passa
  depois de outro, ele não está pronto.
- **Nenhum dado literal dentro de teste.** Tudo vem de `data/`.
- **Nenhuma espera por tempo fixo.** Espera é sempre por condição.

---

## 6. Estado do contrato — leia antes de confiar num valor esperado

O README do Smart-City documenta **endpoints, métodos e regras de autorização
por perfil**. Não documenta **payloads, códigos de erro, enum de status nem
limites de campo**, e a documentação oficial no Postman é renderizada por
JavaScript e não expõe o contrato.

Por isso `data/contrato.js` marca cada bloco com sua origem:

- **`[A]` confirmado** — README do Smart-City, seções 6 a 8.
- **`[B]` pendente** — transcrito do contrato do SUT didático *Cidade
  Conectada* (Material de Estudo ADS033), porque é a única fonte com tabela de
  transições e códigos de erro fechada.

**Todo item `[B]` é risco declarado, não verdade.** Divergências entre esta
suíte e o back-end real podem estar no back-end, no teste ou no próprio
contrato — e a pergunta de três vias precisa ser feita caso a caso. Ver
`docs/tas.md`, seção 4 (riscos R-02 a R-04).

---

## 7. Time e uso de IA

Ver [`docs/entrega.md`](docs/entrega.md), seções 8 e 9.
