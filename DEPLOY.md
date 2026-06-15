# Publicar o Syntra Food sem rodar local

> Caminho recomendado agora: usar a Vercel para o site e para o backend em `/api`.
>
> Siga primeiro o arquivo `DEPLOY-VERCEL.md`.
>
> Este arquivo fica como referencia caso voce queira separar backend em Railway depois.

## O que vai ficar online

- Neon: banco de dados.
- Railway: backend/API.
- Vercel: site React.
- Dominio proprio: site e API com endereco profissional.

O `127.0.0.1` some para usuarios finais.

Exemplo recomendado:

```text
https://seudominio.com.br      -> site do Syntra Food
https://api.seudominio.com.br  -> backend/API
```

Tambem pode usar:

```text
https://app.seudominio.com.br  -> site do Syntra Food
https://api.seudominio.com.br  -> backend/API
```

## 1. Comprar ou configurar o dominio

Compre um dominio em um provedor como Registro.br, Cloudflare, GoDaddy, Hostinger ou Namecheap.

Depois, escolha quem vai controlar o DNS. A opcao mais limpa costuma ser Cloudflare, mas tambem funciona direto no provedor onde comprou.

## 2. Backend na Railway

Crie um projeto na Railway conectado ao repositorio do Syntra Food.

Use estas configuracoes:

```text
Build command: npm run build:api
Start command: npm run start:api
Healthcheck path: /health
```

Variaveis na Railway:

```text
NODE_ENV=production
APP_URL=https://seu-site.vercel.app
DATABASE_URL=sua-url-pooled-da-neon
DIRECT_DATABASE_URL=sua-url-direct-da-neon
JWT_SECRET=uma-chave-grande-e-secreta
REFRESH_TOKEN_SECRET=outra-chave-grande-e-secreta
WEBHOOK_SECRET=um-segredo-hmac-grande
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
```

Depois de salvar as variaveis, rode a migration uma vez na Railway:

```text
npm run db:migrate
```

Teste:

```text
https://seu-backend.up.railway.app/health
```

Tem que aparecer:

```json
{"ok":true,"service":"syntra-food-api"}
```

## 3. Colocar dominio proprio no backend

Na Railway, abra o servico do backend e adicione um Custom Domain:

```text
api.seudominio.com.br
```

A Railway vai mostrar um destino CNAME. Copie esse valor.

No DNS do seu dominio, crie:

```text
Tipo: CNAME
Nome: api
Valor: valor mostrado pela Railway
Proxy: desligado, se estiver usando Cloudflare
```

Depois teste:

```text
https://api.seudominio.com.br/health
```

Tem que aparecer:

```json
{"ok":true,"service":"syntra-food-api"}
```

## 4. Site na Vercel

Crie um projeto na Vercel conectado ao mesmo repositorio.

Use:

```text
Framework: Vite
Build command: npm run build
Output directory: dist
```

Variaveis na Vercel:

```text
VITE_APP_URL=https://seudominio.com.br
VITE_API_URL=https://api.seudominio.com.br/api
```

Nunca coloque `DATABASE_URL`, `JWT_SECRET` ou chaves privadas na Vercel.

## 5. Colocar dominio proprio no site

Na Vercel, abra o projeto e adicione o dominio:

```text
seudominio.com.br
www.seudominio.com.br
```

No DNS, normalmente fica assim:

```text
Tipo: A
Nome: @
Valor: 76.76.21.21
```

```text
Tipo: CNAME
Nome: www
Valor: cname.vercel-dns.com
```

A Vercel tambem pode mostrar um CNAME especifico no painel. Se mostrar, use exatamente o valor que ela pedir.

## 6. Ajustar seguranca do dominio da API

No arquivo `vercel.json`, o `Content-Security-Policy` precisa permitir a API oficial.

Procure por `connect-src` e garanta que o dominio da API esteja ali:

```text
https://api.seudominio.com.br
```

Depois faca novo deploy na Vercel.

## 7. Voltar na Railway

Quando a Vercel der o link final do site, volte na Railway e confira:

```text
APP_URL=https://seudominio.com.br
```

Se mudar o dominio do site, atualize esse campo e redeploy o backend.

## 8. Como saber se esta tudo certo

- Site abre em `https://seudominio.com.br`
- Backend responde em `https://api.seudominio.com.br/health`
- Cadastro cria usuario no Neon
- Login entra no dashboard
- Clientes, reservas, pedidos e automacoes aparecem nas tabelas da Neon

## Registros DNS resumidos

```text
@    A      76.76.21.21
www  CNAME  cname.vercel-dns.com
api  CNAME  valor-gerado-pela-railway
```

Se usar Cloudflare, deixe o `api` sem proxy no começo para o SSL da Railway validar sem dor de cabeca.
