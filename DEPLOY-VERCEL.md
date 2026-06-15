# Publicar o SIOU na Vercel

Esta configuracao publica:

- frontend React na Vercel;
- backend Fastify como funcoes serverless em `/api`;
- webhooks publicos em `/webhooks`;
- banco PostgreSQL externo, recomendado: Neon com URL pooled.

## Antes de subir

1. Use um repositorio privado no GitHub.
2. Nunca envie `.env`, logs ou sessoes do WhatsApp.
3. Troque qualquer chave que ja tenha sido compartilhada em conversa, imagem ou terminal.
4. Use a Meta WhatsApp Cloud API em producao.

O gateway Baileys/WhatsApp Web nao funciona de forma permanente na Vercel. Caso ainda precise dele, publique o gateway separadamente em um servidor persistente e configure `GATEWAY_URL` e `GATEWAY_SECRET`.

## GitHub

Envie o conteudo do ZIP limpo gerado para publicacao. Ele nao contem:

- `.env`;
- sessoes e `creds.json` do WhatsApp;
- logs;
- `node_modules`;
- arquivos compilados;
- banco local.

## Criar o projeto na Vercel

Importe o repositorio e use:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm ci
```

O arquivo `vercel.json` ja configura o frontend, API, cabecalhos de seguranca e webhooks.

## Variaveis obrigatorias na Vercel

Cadastre em `Project Settings > Environment Variables`, nos ambientes Production, Preview e Development conforme necessario:

```text
VITE_APP_URL=https://seu-dominio.com.br
VITE_API_URL=/api
NODE_ENV=production
APP_URL=https://seu-dominio.com.br
DATABASE_URL=URL_POOLED_DO_NEON
DIRECT_DATABASE_URL=URL_DIRETA_DO_NEON
JWT_SECRET=SEGREDO_ALEATORIO_COM_MAIS_DE_32_CARACTERES
REFRESH_TOKEN_SECRET=OUTRO_SEGREDO_ALEATORIO_COM_MAIS_DE_32_CARACTERES
WEBHOOK_SECRET=OUTRO_SEGREDO_ALEATORIO_COM_MAIS_DE_32_CARACTERES
INTEGRATION_ENCRYPTION_KEY=CHAVE_ALEATORIA_COM_MAIS_DE_32_CARACTERES
```

Nunca use prefixo `VITE_` em chaves privadas.

## Servicos opcionais

Cadastre somente os servicos realmente usados:

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
META_APP_SECRET=
```

As demais integracoes de pagamento estao listadas em `.env.production.example`.

## Banco de dados

Antes do primeiro acesso em producao, rode uma vez no seu computador usando as URLs do banco de producao:

```powershell
npm ci
npm run db:migrate
```

Nao rode migrations destrutivas automaticamente no build da Vercel.

## Webhooks

Depois que o dominio estiver ativo, configure:

```text
Stripe:   https://seu-dominio.com.br/webhooks/stripe
WhatsApp: https://seu-dominio.com.br/webhooks/whatsapp
```

O `vercel.json` encaminha `/webhooks/*` para o backend sem enviar a requisicao ao frontend.

## Validacao final

Abra:

```text
https://seu-dominio.com.br/health
```

Resultado esperado:

```json
{"ok":true,"service":"syntra-food-api"}
```

Depois valide:

1. cadastro e login;
2. atualizar a pagina com `F5` sem perder a sessao;
3. checkout e webhook do Stripe;
4. recebimento de mensagem pelo WhatsApp;
5. resposta da IA;
6. isolamento entre restaurantes.
