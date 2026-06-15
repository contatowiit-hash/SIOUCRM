# LEIA ANTES - pacote com .env real

Este pacote inclui o arquivo .env real do Syntra Food.

Nao suba este ZIP em repositorio GitHub, mesmo privado.
Nao compartilhe em grupos.
Envie apenas para o socio por canal seguro.

Depois que o socio confirmar que recebeu, o ideal e rotacionar/renovar chaves sensiveis em producao:

- Neon/PostgreSQL
- Stripe
- JWT_SECRET
- REFRESH_TOKEN_SECRET
- WEBHOOK_SECRET
- GATEWAY_SECRET

Para rodar localmente:

1. Instale Node.js LTS.
2. Extraia o ZIP.
3. Clique em INSTALAR-E-ABRIR-SYNTRA.cmd.
4. Se o banco ainda precisar de migrations, rode APLICAR-MIGRACAO-PLANOS.cmd.
