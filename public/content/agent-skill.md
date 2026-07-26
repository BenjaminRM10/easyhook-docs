# Skill de Easyhook para agentes

La skill oficial enseña a un agente a integrar la API, webhooks normalizados,
onboarding, consentimiento, History, n8n, Chatwoot y MCP sin inventar campos ni
usar identificadores internos.

Descarga oficial:

```text
https://docs.easyhook.dev/downloads/easyhook-skill.zip
```

## Codex

Instala la skill globalmente con:

```bash
curl -L https://docs.easyhook.dev/downloads/easyhook-skill.zip -o /tmp/easyhook-skill.zip
unzip -o /tmp/easyhook-skill.zip -d /tmp
mkdir -p ~/.agents/skills
cp -R /tmp/easyhook ~/.agents/skills/easyhook
```

También puedes instalarla dentro de un proyecto:

```bash
mkdir -p .agents/skills
unzip -o /tmp/easyhook-skill.zip -d /tmp
cp -R /tmp/easyhook .agents/skills/easyhook
```

Codex descubre skills bajo `.agents/skills`.

## Claude Code y Claude App

Para un proyecto:

```bash
mkdir -p .claude/skills
curl -L https://docs.easyhook.dev/downloads/easyhook-skill.zip -o /tmp/easyhook-skill.zip
unzip -o /tmp/easyhook-skill.zip -d /tmp
cp -R /tmp/easyhook .claude/skills/easyhook
```

Para usarla globalmente cambia `.claude/skills` por
`~/.claude/skills`.

## OpenCode

OpenCode también reconoce `.claude/skills` y `.agents/skills`. Su ruta nativa
por proyecto es:

```bash
mkdir -p .opencode/skills
curl -L https://docs.easyhook.dev/downloads/easyhook-skill.zip -o /tmp/easyhook-skill.zip
unzip -o /tmp/easyhook-skill.zip -d /tmp
cp -R /tmp/easyhook .opencode/skills/easyhook
```

## Uso

Después de instalarla, pide al agente:

```text
Usa la skill de Easyhook para integrar mensajes, webhooks y onboarding en esta aplicación.
```

La skill no contiene credenciales. Configura la API key mediante variables de
entorno y nunca la escribas en código cliente, logs o prompts compartidos.
