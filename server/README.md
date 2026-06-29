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
FRONTEND_URL=https://www.sioucrm.com
BACKEND_URL=https://sua-api-na-render.onrender.com
DATABASE_URL=postgresql://...pooler.../neondb?sslmode=require&channel_binding=require
DIRECT_DATABASE_URL=postgresql://.../neondb?sslmode=require&channel_binding=require
JWT_SECRET=uma-chave-grande-com-mais-de-32-caracteres
REFRESH_TOKEN_SECRET=outra-chave-grande-com-mais-de-32-caracteres
WEBHOOK_SECRET=um-segredo-grande-para-validar-webhooks
ZOHO_SMTP_USER=siou@sioucrm.com
ZOHO_SMTP_PASS=sua-senha-de-app-do-zoho
RESEND_API_KEY=re_sua-chave-da-resend
EMAIL_FROM=SIOU <siou@sioucrm.com>
```

Use a URL pooled da Neon em `DATABASE_URL` e a URL direct em `DIRECT_DATABASE_URL`.

## Produção com Vercel + Render

Na Render ficam os segredos do backend: `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`,
`RESEND_API_KEY`, `EMAIL_FROM`, `ZOHO_SMTP_USER` e `ZOHO_SMTP_PASS`.

Para envio de email em producao, prefira `RESEND_API_KEY` com `EMAIL_FROM`. O Zoho SMTP fica como
fallback, mas pode falhar em hospedagens que bloqueiam conexoes SMTP de saida.

Na Vercel, configure `BACKEND_URL` apontando para a URL pública da Render. Assim o site continua
chamando `/api` no próprio domínio e a Vercel encaminha a requisição para o backend real.

Nao configure `VITE_BACKEND_URL` em producao. O frontend publicado deve chamar `/api` no proprio
dominio para manter o cookie de login no site.

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
