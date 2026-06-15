# WhatsApp Gateway — Syntra Food

Gateway WhatsApp próprio, construído com Baileys. Substitui Z-API e Evolution API.

## Estrutura do projeto

```
whatsapp-gateway/
├── src/
│   ├── index.ts                          # Entry point — servidor Fastify
│   ├── types/index.ts                    # Tipos TypeScript compartilhados
│   ├── lib/
│   │   ├── logger.ts                     # Logger Pino
│   │   └── webhook.ts                    # Dispatcher de eventos para o CRM
│   ├── middlewares/
│   │   └── auth.ts                       # Autenticação por X-Gateway-Secret
│   ├── services/
│   │   └── sessionManager.ts             # Core: gerencia sessões Baileys
│   ├── routes/
│   │   ├── sessions.ts                   # CRUD de sessões
│   │   └── messages.ts                   # Envio de mensagens
│   └── crm-integration/                  # Arquivos para copiar no seu CRM
│       ├── fastify-webhook-route.ts      # Rota webhook no Fastify
│       ├── useWhatsAppSession.ts         # Hook React
│       └── WhatsAppConnect.tsx           # Componente de QR Code
```

## Instalação

```bash
cp .env.example .env
# Edite o .env com suas configurações

npm install
npm run dev
```

## Variáveis de ambiente

| Variável           | Descrição                                      | Padrão                                      |
|--------------------|------------------------------------------------|---------------------------------------------|
| `PORT`             | Porta do gateway                               | `3001`                                      |
| `GATEWAY_SECRET`   | Chave secreta compartilhada com o Fastify      | —                                           |
| `CRM_WEBHOOK_URL`  | URL do webhook no seu backend Fastify          | `http://localhost:3333/webhooks/whatsapp`   |
| `SESSIONS_DIR`     | Pasta para salvar sessões                      | `./sessions`                                |
| `LOG_LEVEL`        | Nível de log                                   | `info`                                      |

## Endpoints

### Sessões

| Método   | Rota                   | Descrição                          |
|----------|------------------------|------------------------------------|
| `POST`   | `/sessions/:tenantId`  | Inicia sessão e gera QR Code       |
| `GET`    | `/sessions/:tenantId`  | Retorna status atual da sessão     |
| `GET`    | `/sessions`            | Lista todas as sessões             |
| `DELETE` | `/sessions/:tenantId`  | Desconecta e remove sessão         |

### Mensagens

| Método | Rota               | Descrição                     |
|--------|--------------------|-------------------------------|
| `POST` | `/messages/text`   | Envia mensagem de texto        |
| `POST` | `/messages/media`  | Envia imagem/vídeo/áudio/doc  |

### Health check

| Método | Rota       | Descrição         |
|--------|------------|-------------------|
| `GET`  | `/health`  | Status do gateway |

## Autenticação

Todos os endpoints exigem o header:
```
X-Gateway-Secret: <seu-GATEWAY_SECRET>
```

## Integração com o CRM

### 1. No backend Fastify

Copie `src/crm-integration/fastify-webhook-route.ts` e registre a rota:

```typescript
// src/routes/index.ts
import { whatsappWebhookRoutes } from "./webhooks/whatsapp";

app.register(whatsappWebhookRoutes);
```

Adicione no `.env` do Fastify:
```
GATEWAY_SECRET=mesma-chave-do-gateway
GATEWAY_URL=http://localhost:3001
```

### 2. No frontend React

Nunca coloque `GATEWAY_SECRET` ou `VITE_GATEWAY_SECRET` no navegador.
O frontend deve chamar apenas as rotas autenticadas do backend CRM em `/api/whatsapp/gateway/*`.
O backend adiciona `X-Gateway-Secret` ao conversar com o gateway.
## Fluxo completo

```
Usuário clica "Conectar WhatsApp"
        ↓
React → POST /sessions/:tenantId (gateway)
        ↓
Gateway inicia Baileys → gera QR Code
        ↓
Gateway → POST /webhooks/whatsapp (Fastify) com event: "session.qr"
        ↓
React faz polling em GET /sessions/:tenantId
        ↓
QR Code aparece na tela → usuário escaneia
        ↓
Gateway → POST /webhooks/whatsapp com event: "session.connected"
        ↓
Mensagens chegam → Gateway → POST /webhooks/whatsapp com event: "message.received"
        ↓
Fastify salva no banco e notifica o React (WebSocket/SSE)
```

## Sessões persistentes

As sessões ficam salvas na pasta `sessions/`. Ao reiniciar o gateway, todas as sessões
anteriores reconectam automaticamente — sem precisar escanear o QR Code novamente.

## Próximos passos

- [ ] Integrar WebSocket/SSE no Fastify para push de mensagens em tempo real
- [ ] Salvar histórico de mensagens no Neon PostgreSQL
- [ ] Tela de chat no CRM consumindo as mensagens do banco
- [ ] Docker Compose (gateway + Fastify + Nginx)
- [ ] Deploy na VPS
