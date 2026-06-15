# Como subir o Syntra Food em um GitHub privado

## O que subir

Suba o código do projeto, incluindo:

- `src`
- `server`
- `supabase`
- `whatsapp-gateway`
- `api`
- arquivos `.cmd`
- `package.json`
- `package-lock.json`
- configs do Vite, Tailwind, TypeScript, ESLint, Vercel e Railway
- `.env.example`

## O que nunca subir

Não suba estes arquivos/pastas:

- `.env`
- `.env.local`
- `.env.production`
- `node_modules`
- `dist`
- `.logs`
- arquivos `.log`
- pasta `sessions`
- sessões do WhatsApp
- qualquer chave real do Stripe, Neon, JWT ou webhook

Esses itens já estão no `.gitignore`.

## Antes de formatar o PC

O código pode ir para o GitHub privado.

Os segredos reais não devem ir para o GitHub. Eles ficam no arquivo `.env` local e precisam ser guardados em um local seguro separado, como um gerenciador de senhas ou backup privado.

## Depois de baixar em outro PC

1. Instale o Node.js LTS.
2. Abra a pasta do projeto.
3. Crie o `.env` usando o `.env.example` como modelo.
4. Preencha as chaves reais.
5. Rode `INSTALAR-E-ABRIR-SYNTRA.cmd`.

## Comandos Git, se preferir pelo terminal

```bat
git init
git add .
git commit -m "Syntra Food"
git branch -M main
git remote add origin URL_DO_SEU_REPOSITORIO_PRIVADO
git push -u origin main
```

