# Como rodar o Syntra Food localmente

## Jeito mais simples

1. Abra a pasta do projeto.
2. Clique duas vezes em `INSTALAR-E-ABRIR-SYNTRA.cmd`.
3. Se ele criar um arquivo `.env`, preencha as chaves e rode o arquivo de novo.
4. Deixe as janelas pretas abertas.
5. Acesse `http://127.0.0.1:5174/login`.

## O que precisa estar instalado

- Node.js LTS.
- Internet liberada para instalar dependências.
- Um banco Neon/PostgreSQL configurado no `.env`.

## Arquivos que não vêm no pacote

Por segurança, o pacote não inclui:

- `.env` real.
- `node_modules`.
- `dist`.
- logs.
- sessões do WhatsApp.
- qualquer cache local.

## Depois de preencher o `.env`

Rode:

```bat
INSTALAR-E-ABRIR-SYNTRA.cmd
```

Esse arquivo instala as dependências, compila o site e abre:

- backend local
- site local
- WhatsApp Gateway

## Banco de dados

Se o banco ainda não tiver as tabelas novas, rode:

```bat
APLICAR-MIGRACAO-PLANOS.cmd
```

Esse comando usa as URLs do banco que estiverem no `.env`.
