# Segurança Syntra Food

Este projeto foi estruturado para produção real com dados de clientes de restaurantes.

## Regras essenciais

- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, chaves de WhatsApp, webhook ou pagamento no frontend.
- Nunca commite `DATABASE_URL` ou `DIRECT_DATABASE_URL` da Neon.
- Use a URL pooled da Neon apenas no backend em `DATABASE_URL`.
- Use a URL direct da Neon apenas para migrations em `DIRECT_DATABASE_URL`.
- Use somente variáveis `VITE_` para dados públicos.
- Ative confirmação de email no Supabase Auth antes de liberar produção.
- Configure rate limiting no Supabase Auth para no máximo 5 tentativas por minuto.
- Aplique e teste RLS com usuários de restaurantes diferentes.
- Configure `ALLOWED_ORIGIN` com o domínio real das Edge Functions.
- Use webhooks de pagamento com assinatura do provedor.
- Nunca processe cartão diretamente.
- Ative backup automático e PITR no Supabase Pro.

## Checklist antes do deploy

- [ ] RLS ativado em todas as tabelas.
- [ ] Políticas testadas por restaurante.
- [ ] `service_role` ausente do bundle frontend.
- [ ] `.env*` ignorados pelo Git.
- [ ] Headers de segurança ativos.
- [ ] Webhooks com HMAC e timestamp.
- [ ] Edge Functions sem stack trace para usuário.
- [ ] Logs sem senha, token, cartão ou mensagem completa.
- [ ] Assinatura validada server-side antes de recursos premium.
- [ ] Storage privado por pasta de `restaurant_id`.
- [ ] Backend Fastify publicado com HTTPS e cookies `secure`.
- [ ] `JWT_SECRET`, `REFRESH_TOKEN_SECRET` e `WEBHOOK_SECRET` rotacionados antes de produção.
