# Backend Syntra Food

Backend Node.js/Fastify para Neon Postgres.

## Como configurar

Crie um `.env.local` ou `.env` na raiz do projeto com:

```env
VITE_API_URL=http://127.0.0.1:3333/api
NODE_ENV=development
API_HOST=127.0.0.1
API_PORT=3333
APP_URL=http://127.0.0.1:5173
DATABASE_URL=postgresql://...pooler.../neondb?sslmode=require&channel_binding=require
DIRECT_DATABASE_URL=postgresql://.../neondb?sslmode=require&channel_binding=require
JWT_SECRET=uma-chave-grande-com-mais-de-32-caracteres
REFRESH_TOKEN_SECRET=outra-chave-grande-com-mais-de-32-caracteres
WEBHOOK_SECRET=um-segredo-grande-para-validar-webhooks
```

Use a URL pooled da Neon em `DATABASE_URL` e a URL direct em `DIRECT_DATABASE_URL`.

## Rodar banco

```bash
npm run db:migrate
```

Também existe a migration SQL em:

```text
server/migrations/0001_neon_initial.sql
```

## Rodar API

```bash
npm run dev:api
```

API local:

```text
http://127.0.0.1:3333/api
```

## Segurança

- Senhas com bcrypt.
- Access token curto em memória.
- Refresh token em cookie `httpOnly`.
- Bloqueio temporário após 5 falhas de login.
- `restaurant_id` vem do token validado, nunca do frontend.
- Toda busca, criação, edição e exclusão filtra por restaurante.
- Webhooks usam HMAC-SHA256 e timestamp anti-replay.
- Logs de auditoria sem senha, token ou cartão.
- Cartão nunca passa pelo backend.
