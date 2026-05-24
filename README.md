# Ad Takedown API

Mini-API em Node.js + TypeScript para processar notificações de violações em anúncios via webhook, enfileirando jobs de takedown com BullMQ e integrando com a Meta API (simulada via JSONPlaceholder).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20+ |
| Linguagem | TypeScript 5 (strict mode) |
| Framework HTTP | Express 4 |
| Validação | Zod |
| Fila | BullMQ 5 |
| Broker | Redis 7 (Docker ou Upstash) |

---

## Estrutura do Projeto

```
src/
├── config/
│   └── redis.ts              # Configuração de conexão e opções da fila
├── routes/
│   ├── webhook.route.ts      # POST /webhook/violation
│   └── jobs.route.ts         # GET /jobs/:id
├── schemas/
│   └── violation.schema.ts   # Zod schema + tipo ViolationPayload
├── services/
│   └── queue.service.ts      # Lógica de enqueue + idempotência + status
├── workers/
│   └── takedown.worker.ts    # BullMQ worker com retry + backoff exponencial
└── index.ts                  # Entry point Express
```

---

## Pré-requisitos

- Node.js 20+
- Docker (para o Redis local) **ou** conta no [Upstash](https://upstash.com/)
- npm

---

## Instalação

```bash
# Clone e entre no diretório
git clone <repo-url>
cd ad-takedown-api

# Instale as dependências
npm install

# Copie o arquivo de variáveis de ambiente
cp .env.example .env
```

---

## Configuração do Redis

### Opção A — Redis local via Docker (recomendado)

```bash
docker-compose up -d
```

O Redis ficará disponível em `localhost:6379`.

### Opção B — Upstash (Redis serverless gratuito)

1. Crie uma conta em [upstash.com](https://upstash.com/)
2. Crie um banco Redis
3. Copie as credenciais para o `.env`:

```env
REDIS_HOST=your-instance.upstash.io
REDIS_PORT=6380
REDIS_PASSWORD=your-upstash-password
```

---

## Rodando Localmente

O projeto precisa de **dois processos** rodando em paralelo: a API e o worker.

### Terminal 1 — API

```bash
npm run dev
# → http://localhost:3000
```

### Terminal 2 — Worker

```bash
npm run worker
```

### Ou ambos em paralelo

```bash
npm run dev:all
```

---

## Endpoints

### `POST /webhook/violation`

Recebe uma notificação de violação, valida o payload e enfileira um job de takedown.

**Body:**
```json
{
  "adId": "ad-123",
  "tenantId": "tenant-abc",
  "violationType": "PROHIBITED_TERM",
  "severity": "HIGH",
  "detectedAt": "2024-01-15T10:30:00.000Z"
}
```

**Resposta 202 — Job enfileirado:**
```json
{
  "message": "Takedown job enqueued successfully",
  "jobId": "takedown:tenant-abc:ad-123",
  "deduplicated": false
}
```

**Resposta 202 — Job duplicado (idempotência):**
```json
{
  "message": "Job already in queue for this adId + tenantId combination",
  "jobId": "takedown:tenant-abc:ad-123",
  "deduplicated": true
}
```

**Resposta 400 — Payload inválido:**
```json
{
  "error": "Invalid payload",
  "details": [
    { "field": "violationType", "message": "violationType must be one of: PROHIBITED_TERM, BRAND_VIOLATION, COMPLIANCE_FAIL" },
    { "field": "detectedAt", "message": "detectedAt must be a valid ISO 8601 datetime" }
  ]
}
```

---

### `GET /jobs/:id`

Retorna o status atual de um job na fila.

**Resposta 200:**
```json
{
  "jobId": "takedown:tenant-abc:ad-123",
  "status": "completed",
  "attempts": 1,
  "result": {
    "success": true,
    "statusCode": 200,
    "responseBody": { ... },
    "processedAt": "2024-01-15T10:30:05.000Z"
  },
  "error": null
}
```

**Status possíveis:** `waiting` | `active` | `completed` | `failed` | `delayed`

**Resposta 404:**
```json
{ "error": "Job 'takedown:tenant-abc:ad-123' not found" }
```

---

### `GET /health`

```json
{ "status": "ok", "timestamp": "2024-01-15T10:30:00.000Z" }
```

---

## Testando com cURL

```bash
# 1. Enfileirar um job
curl -X POST http://localhost:3000/webhook/violation \
  -H "Content-Type: application/json" \
  -d '{
    "adId": "ad-001",
    "tenantId": "tenant-xyz",
    "violationType": "PROHIBITED_TERM",
    "severity": "HIGH",
    "detectedAt": "2024-01-15T10:30:00.000Z"
  }'

# 2. Verificar o status (use o jobId retornado acima)
curl http://localhost:3000/jobs/takedown:tenant-xyz:ad-001

# 3. Testar idempotência (segunda chamada com mesmo adId+tenantId)
curl -X POST http://localhost:3000/webhook/violation \
  -H "Content-Type: application/json" \
  -d '{
    "adId": "ad-001",
    "tenantId": "tenant-xyz",
    "violationType": "BRAND_VIOLATION",
    "severity": "CRITICAL",
    "detectedAt": "2024-01-15T10:31:00.000Z"
  }'

# 4. Testar payload inválido (400)
curl -X POST http://localhost:3000/webhook/violation \
  -H "Content-Type: application/json" \
  -d '{ "adId": "ad-002", "violationType": "INVALID" }'
```

---

## Comportamento do Worker

- **Integração simulada:** chama `GET https://jsonplaceholder.typicode.com/posts/1`
- **Sucesso (2xx):** job marcado como `completed`, resultado salvo no job
- **Falha (4xx/5xx ou timeout):** job relançado automaticamente
- **Retry:** até **3 tentativas** com **backoff exponencial** (2s → 4s → 8s)
- **Timeout por request:** 5 segundos
- **Após 3 falhas:** job marcado como `failed` com a mensagem de erro

---

## Idempotência

O job ID é gerado como `takedown:{tenantId}:{adId}`. Antes de enfileirar, o serviço verifica se já existe um job com esse ID nos estados `waiting`, `active` ou `delayed`. Se sim, retorna `deduplicated: true` sem criar duplicata.

---

## Build para Produção

```bash
npm run build      # compila TypeScript → dist/
npm start          # roda a API compilada
```
