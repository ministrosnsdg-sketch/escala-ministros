# Escala de Ministros — React + Supabase — v3.0

## Variáveis (.env.local)
Crie `.env.local` com:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Rodar
```bash
npm i
npm run dev
```
Abra http://localhost:5173

## Migração do Banco (v3.0)
Execute no SQL Editor do Supabase o arquivo:
```
supabase/migration_swap_requests.sql
```

## Changelog v3.0

### Correções
- **Versão 3.0** — Identificação visual da versão no rodapé e login
- **Menu rodapé azul** — Barra inferior do usuário comum agora em azul (gradiente)
- **Botão Sair** — Adicionado ao menu inferior do usuário comum (mobile)
- **Permanecer conectado** — Corrigido: usa sessionStorage quando desmarcado (expira ao fechar navegador)
- **Biometria** — Suporte a desbloqueio por Face ID / Touch ID / Biometria via Web Authentication API
- **Segurança** — Headers de segurança (CSP, HSTS, X-Frame-Options, etc.) adicionados ao vercel.json
- **Cobertura de horários** — Barra de rolagem adicionada à tabela (max-height 60vh)
- **Bloqueio de missas** — Ao bloquear horário:
  - Horário fica indisponível em Disponibilidade/Escala/Exportar/Relatórios
  - Mensagem discreta "Não haverá missa" exibida
  - Seleções existentes dos ministros são automaticamente removidas (disponibilidade + escala)
  - Correção do offset de data no calendário (timezone fix com T00:00:00)
- **Missas Solenes** — Prioridade sobre missas regulares no mesmo horário (regulares ficam ocultas)
- **Exportar** — Títulos de missas solenes maiores e em ROXO (#7c3aed)

### Novidades
- **Troca de Escala** — Novo módulo para solicitar e aceitar trocas:
  - Até 30 minutos antes da missa, o ministro pode solicitar troca
  - Outros ministros podem aceitar a troca pelo app
  - Troca é realizada automaticamente no banco de dados
  - Rota: `/troca` — disponível no menu para todos os usuários