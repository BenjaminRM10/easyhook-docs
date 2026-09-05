# Primeiros passos com o Easyhook

Conecte o WhatsApp Business, o Telegram ou seu e-mail, gere uma chave de API e
envie a primeira mensagem sem manter uma infraestrutura separada para cada
provedor.

## 1. Criar uma organização

Acesse o [portal da Easyhook](https://easyhook.dev/portal) e crie uma organização. Uma organização reúne:

- Seus números e canais.
- Suas chaves de API.
- Sua carteira.
- Seus webhooks e integrações.

O saldo não expira. É necessário ter saldo disponível para enviar pela API pública.

## 2. Conecte o WhatsApp

Abra **Conectar** e escolha a modalidade correta:

- **WhatsApp Coexistence:** mantém o número no WhatsApp Business App e permite usá-lo também com o Easyhook.
- **WhatsApp Cloud API:** usa um novo número da Meta ou migra um número existente exclusivamente para a API.

O Easyhook mostra uma comparação visual antes de abrir a Meta. Leia o aviso completo: a coexistência termina com um QR e mantém o aplicativo; a Cloud API opera o número diretamente e uma migração deixa de usar os aplicativos do WhatsApp. Consulte o [guia completo](/onboarding).

## 3. Criar uma chave de API

Abra **API**, crie uma chave com um nome fácil de reconhecer e salve-a. A chave completa é exibida apenas uma vez.

## 4. Enviar uma mensagem

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "body": "Olá da Easyhook"
  }'
```

`from` identifica o canal conectado. O Easyhook resolve internamente a WABA e o ID do número corretos, sempre dentro da organização proprietária da chave de API.

## 5. Receba eventos

Abra **Webhooks** para cadastrar seu próprio endpoint ou instale o nó **Easyhook Trigger** no n8n. As entregas de webhooks são gratuitas e usam assinatura HMAC.

## Próxima etapa

- [Telegram, Gmail, Outlook ou outro e-mail](/channels).
- Veja a [referência completa da API](/api-reference).
- Consulte o [contrato padrão de webhooks](/webhooks).
- Instale a integração com [n8n](/n8n), [Chatwoot](/chatwoot) ou [MCP para agentes](/ai-agents).
