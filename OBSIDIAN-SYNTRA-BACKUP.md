# Backup do Syntra Food no Obsidian

## Arquivo principal para guardar

Guarde este ZIP no Obsidian, Google Drive, OneDrive ou pendrive:

`PACOTE-GITHUB-SYNTRA.zip`

Esse arquivo contém o projeto para subir no GitHub privado e recuperar depois da formatação.

## Importante

O ZIP não inclui o `.env` real por segurança.

Guarde as chaves reais em um lugar separado e seguro:

- Neon/PostgreSQL
- Stripe
- JWT secrets
- webhook secrets
- WhatsApp Gateway secret

## Como colocar no Obsidian

1. Abra o Obsidian.
2. Abra seu vault.
3. Crie uma pasta chamada `Syntra Food`.
4. Arraste o arquivo `PACOTE-GITHUB-SYNTRA.zip` para essa pasta.
5. Arraste também estes arquivos se quiser guardar as instruções:
   - `COMO-RODAR-LOCAL.md`
   - `COMO-SUBIR-GITHUB-PRIVADO.md`
   - `DEPLOY.md`
   - `DEPLOY-VERCEL.md`
   - `SECURITY.md`

## Depois de formatar

1. Baixe o ZIP salvo.
2. Extraia a pasta.
3. Crie o `.env` a partir do `.env.example`.
4. Preencha as chaves reais.
5. Rode `INSTALAR-E-ABRIR-SYNTRA.cmd`.

