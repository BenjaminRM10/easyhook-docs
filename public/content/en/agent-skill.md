# Easyhook skill for agents

The official skill includes the complete Easyhook API and webhook reference. It
teaches an agent how to integrate multichannel messaging, media, templates,
Flows, consent, scheduling, onboarding, history, email, Mercado Libre, n8n,
Chatwoot, and MCP without inventing fields or using internal identifiers.

The package contains three versioned references along with the skill:

- Public API endpoints, parameters, and examples.
- Webhook contracts, filters, signatures, and idempotency.
- An integration guide for agent routing and decisions.

Official download:

```text
https://docs.easyhook.dev/downloads/easyhook-skill.zip
```

## Codex

Install the skill globally with:

```bash
curl -L https://docs.easyhook.dev/downloads/easyhook-skill.zip -o /tmp/easyhook-skill.zip
unzip -o /tmp/easyhook-skill.zip -d /tmp
mkdir -p ~/.agents/skills
cp -R /tmp/easyhook ~/.agents/skills/easyhook
```

You can also install it inside a project:

```bash
mkdir -p .agents/skills
unzip -o /tmp/easyhook-skill.zip -d /tmp
cp -R /tmp/easyhook .agents/skills/easyhook
```

Codex discovers local skills in `.agents/skills`.

## Claude Code and Claude App

For one project:

```bash
mkdir -p .claude/skills
curl -L https://docs.easyhook.dev/downloads/easyhook-skill.zip -o /tmp/easyhook-skill.zip
unzip -o /tmp/easyhook-skill.zip -d /tmp
cp -R /tmp/easyhook .claude/skills/easyhook
```

To install it globally, replace `.claude/skills` with `~/.claude/skills`.

## OpenCode

OpenCode also recognizes `.claude/skills` and `.agents/skills`. Its native
per-project path is:

```bash
mkdir -p .opencode/skills
curl -L https://docs.easyhook.dev/downloads/easyhook-skill.zip -o /tmp/easyhook-skill.zip
unzip -o /tmp/easyhook-skill.zip -d /tmp
cp -R /tmp/easyhook .opencode/skills/easyhook
```

## Usage

After installing it, ask the agent:

```text
Use the Easyhook skill to integrate messages, webhooks, and onboarding in this application.
```

The skill contains no credentials. Configure the API key through environment
variables, and never write it into shared client code, logs, or prompts.
