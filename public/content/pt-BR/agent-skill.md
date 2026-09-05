# Skill da Easyhook para agentes

A skill oficial inclui a referência completa da API e dos webhooks da Easyhook.
Ela ensina um agente a integrar mensageria multicanal, mídia, templates, Flows,
consentimento, agendamento, onboarding, histórico, e-mail, Mercado Livre, n8n,
Chatwoot e MCP sem inventar campos nem usar identificadores internos.

O pacote inclui três referências versionadas junto com a skill:

- Endpoints, parâmetros e exemplos da API pública.
- Contratos de webhook, filtros, assinaturas e idempotência.
- Guia de integração para roteamento e decisões de agentes.

Download oficial:

```text
https://docs.easyhook.dev/downloads/easyhook-skill.zip
```

## Codex

Instale a skill globalmente com:

```bash
curl -L https://docs.easyhook.dev/downloads/easyhook-skill.zip -o /tmp/easyhook-skill.zip
unzip -o /tmp/easyhook-skill.zip -d /tmp
mkdir -p ~/.agents/skills
cp -R /tmp/easyhook ~/.agents/skills/easyhook
```

Você também pode instalá-la dentro de um projeto:

```bash
mkdir -p .agents/skills
unzip -o /tmp/easyhook-skill.zip -d /tmp
cp -R /tmp/easyhook .agents/skills/easyhook
```

O Codex encontra skills locais em `.agents/skills`.

## Claude Code e Claude App

Para um projeto:

```bash
mkdir -p .claude/skills
curl -L https://docs.easyhook.dev/downloads/easyhook-skill.zip -o /tmp/easyhook-skill.zip
unzip -o /tmp/easyhook-skill.zip -d /tmp
cp -R /tmp/easyhook .claude/skills/easyhook
```

Para instalar globalmente, substitua `.claude/skills` por `~/.claude/skills`.

## OpenCode

O OpenCode também reconhece `.claude/skills` e `.agents/skills`. O caminho
nativo por projeto é:

```bash
mkdir -p .opencode/skills
curl -L https://docs.easyhook.dev/downloads/easyhook-skill.zip -o /tmp/easyhook-skill.zip
unzip -o /tmp/easyhook-skill.zip -d /tmp
cp -R /tmp/easyhook .opencode/skills/easyhook
```

## Uso

Depois de instalar, peça ao agente:

```text
Use a skill da Easyhook para integrar mensagens, webhooks e onboarding neste aplicativo.
```

A skill não contém credenciais. Configure a chave de API por variáveis de
ambiente e nunca a escreva em código compartilhado do cliente, logs ou prompts.
