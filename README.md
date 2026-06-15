# Syntra Food

CRM para restaurantes com React, TypeScript, Vite, Fastify, Drizzle, Neon Postgres, Stripe, WhatsApp e Groq.

## Rodar localmente

1. Instale as dependencias:

```bash
npm install
```

2. Copie `.env.example` para `.env` e configure:

- `DATABASE_URL` e `DIRECT_DATABASE_URL`
- `JWT_SECRET` e `REFRESH_TOKEN_SECRET`
- credenciais Stripe, WhatsApp e Groq usadas pelo backend
- `VITE_API_URL`, que e a unica URL de API publica usada pelo frontend

3. Prepare o banco e abra o sistema:

```bash
npm run db:migrate
npm run start:local
```

A demonstracao em `/demo/dashboard` usa apenas dados ficticios. As rotas em `/app` usam o backend proprio e o banco Neon.

## Autenticacao

- O refresh token fica em cookie `HttpOnly`, `Secure` em HTTPS e `SameSite=Lax`.
- O access token fica somente em memoria e desaparece ao fechar ou recarregar a aba.
- O frontend restaura a sessao chamando `/api/auth/refresh`.
- Segredos nunca devem usar prefixo `VITE_`.

## Permissoes

- `owner`: acesso total, incluindo cobranca.
- `admin`: administracao sem cobranca critica.
- `manager`: clientes, pedidos, reservas, campanhas e relatorios.
- `agent`: conversas e consulta basica de clientes.

## Seguranca

- Isolamento por `restaurant_id`.
- RBAC validado no backend.
- Webhooks com assinatura HMAC e protecao contra replay.
- Rate limiting nas rotas sensiveis.
- Logs e erros publicos sanitizados.
- Payloads de clientes, pedidos e conversas paginados.
- PDF/base64 do cardapio nao e devolvido pelo GET normal.

## Verificacoes

```bash
npm run build
npm run build:api
npm run test:security
```
