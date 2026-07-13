# Controle Financeiro — MVP

## Como rodar

1. Copie `.env.local.example` para `.env.local` e preencha com a URL e a chave anon do seu projeto Supabase (Settings > API).
2. `npm install`
3. `npm run dev`
4. Acesse http://localhost:3000

## O que já funciona

- Cadastro (email + senha + CPF + nome) — cria automaticamente o perfil e a entidade PF padrão via trigger no banco.
- Login / logout.
- Dashboard: alterna entre entidades (PF e PJs), lança despesas manualmente (valor, categoria, descrição), lista os lançamentos, mostra o total.
- Adicionar CNPJ: cria uma nova entidade PJ vinculada ao usuário, sem afetar os dados já existentes.

## O que falta (próximas fases, ver PRD)

- Entrada por foto (upload + extração via IA) e por áudio (transcrição + interpretação).
- Confirmação de um toque com dados pré-preenchidos pela IA.
- Relatórios: comparativo PF vs PJ, fluxo de caixa, exportação.
- Deploy: `vercel` (adicionar as mesmas variáveis de ambiente no painel da Vercel).

## Observação sobre confirmação de email

Por padrão o Supabase Auth exige confirmação de email antes do primeiro login. Pra testar rápido em desenvolvimento, você pode desativar isso em Authentication > Providers > Email > "Confirm email" no painel do Supabase.
