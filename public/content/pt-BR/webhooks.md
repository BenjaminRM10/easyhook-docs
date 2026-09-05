# Webhooks Easyhook

Última atualização: 2026-08-28

O Easyhook envia um Objetivo JSON compacto por evento. O formato é partilhado por
WhatsApp, Messenger, Instagram, Telegram, Gmail, Outlook, IMAP/SMTP e-mail,
Mercado Libre, TikTok Mensagens de Negócios, SMS/MMS e chamadas de voz.

Os eventos do ciclo de vida de números de telecomunicações usam `number.*`, incluindo `number.renewal_due`,
`number.renewed`, `number.grace` e `number.released`. Assine pelo provedor
`sms`, `voice` ou `*` Se for caso disso.

As assinaturas de telecomunicações usam o provedor `sms` ou `voice`. Os seletores compatíveis incluem
`message.*` e `call.*`; eventos concretos incluem `message.received`,
`message.status`, `call.initiated`, `call.answered`, `call.hangup`, e
`call.transfer_started`.

## Princípios

- `id` é o único UUID Easyhook exposto. Use- o para desduplicar eventos.
- `channel` identifica o provedor: `whatsapp`, `messenger`, `instagram`,
  `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, `tiktok`, `sms`,
  ou `voice`.
- Os identificadores de conta, contato e mensagem vêm do provedor, e não de IDs internos do banco de dados da Easyhook.
- Em telefonia, `account.id` é sempre o número empresarial adquirido, tanto nos eventos recebidos quanto enviados. SMS/MMS usa `channel: "sms"`, e o ciclo de vida das chamadas usa `channel: "voice"`. A modalidade não altera a identidade da conexão.
- Blocos que não se aplicam são omitidos. A Easyhook não envia campos de preenchimento com `null`.
- Os detalhes específicos do provedor usados no diagnóstico permanecem no cabeçalho `X-Easyhook-Provider-Event`.
- As cargas brutas Meta permanecem internas e não são encaminhadas.

### Telefonia

```json
{
  "id": "event_uuid",
  "type": "call.initiated",
  "channel": "voice",
  "account": { "id": "+13125550100" },
  "contact": { "id": "+13125550999", "phone": "+13125550999" },
  "call": {
    "id": "call_uuid",
    "direction": "inbound",
    "from": "+13125550999",
    "to": "+13125550100",
    "status": "ringing",
    "occurred_at": "2026-08-26T20:00:00.000Z"
  }
}
```

Os tipos de chamada incluem `call.initiated`, `call.answered`, `call.ended` e
`call.cost_updated`. SMS/MMS reutiliza o bloco normalizado `message.*` e o mesmo
Número de negócios em `account.id`.

## Mensagens de texto

```json
{
  "id": "7ef9509d-8dc2-43d5-9887-1eb7abe3a12e",
  "type": "message.received",
  "channel": "whatsapp",
  "account": {
    "id": "123456789012345",
    "phone": "15550100002"
  },
  "contact": {
    "id": "15550100004",
    "name": "webgeoapm"
  },
  "message": {
    "id": "wamid.HBg...",
    "type": "text",
    "text": "como estas",
    "timestamp": "2026-07-10T23:03:40.000Z"
  }
}
```

O mesmo evento do Messenger ou Instagram altera apenas `channel` e os identificadores do provedor:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "instagram",
  "account": { "id": "17841400000000001" },
  "contact": { "id": "IGSID_VALUE", "name": "Customer" },
  "message": {
    "id": "mid...",
    "type": "text",
    "text": "hello",
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

TikTok usa o mesmo envelope normalizado. `account.id` é o conectado
ID aberto da conta comercial, `contact.id` é o identificador de usuário TikTok estável,
e `message.thread_id` é o identificador de conversa exigido pelo TikTok.
Todos os três valores e IDs de mensagens são opacos e não devem ser reformatados.
A Easyhook aceita `contact.id` ou `message.thread_id` como `to` para uma
conversa existente do TikTok. A seleção de um botão de resposta do TikTok usa o
mesmo bloco `message.quick_reply` que os demais canais compatíveis. As restrições
de privacidade do provedor são emitidas como um evento que não é de mensagem, em
vez de fabricar dados indisponíveis.

Os provedores de e-mail usam o mesmo evento com campos específicos de e-mail:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "outlook",
  "account": { "id": "support@example.com", "name": "Support" },
  "contact": { "id": "customer@example.net", "name": "Customer" },
  "message": {
    "id": "provider-message-id",
    "type": "text",
    "text": "I need help",
    "subject": "Order 1048",
    "html": "<p>I need <strong>help</strong></p>",
    "thread_id": "provider-thread-id",
    "message_id_header": "<message@example.net>",
    "is_read": false,
    "inference_classification": "focused",
    "attachments": [{
      "media_asset_id": "asset_uuid",
      "filename": "invoice.pdf",
      "content_type": "application/pdf",
      "size": 48210
    }],
    "timestamp": "2026-07-27T16:37:02.000Z"
  }
}
```

`channel` também pode ser `gmail` ou `imap_smtp`. Trate `message.html` como
entrada não confiável e renderize-o somente após sanitização ou em um ambiente isolado.

Mercado Libre perguntas e mensagens pós-venda usam o mesmo envelope:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "mercadolibre",
  "account": { "id": "123456789", "name": "EASYHOOK_STORE" },
  "contact": { "id": "question:987654321", "name": "Comprador 456789" },
  "message": {
    "id": "question:987654321",
    "direction": "in",
    "type": "text",
    "text": "Ainda está disponível?",
    "from": "question:987654321",
    "to": "123456789",
    "timestamp": "2026-07-28T04:00:00.000Z"
  }
}
```

Use `contact.id` ou `message.from` como `to` ao responder. Perguntas sobre produtos
chegam como `question:<id>` e conversas pós-venda como `pack:<id>`.

## API de Assinatura Pública

A chave de API determina a organização. Nunca enviar `tenant_id`.

Os escopos do WhatsApp seguem a mesma hierarquia de três níveis mostrada no portal Easyhook e n8n:

1. **Organização**: cada WABA conectado e número de propriedade da chave de API.
2. **WABA**: cada número dentro de uma conta de negócios do WhatsApp.
3. **Telefone**: um número de remetente específico do WhatsApp.

Os portfólios empresariais da Meta são mantidos internamente como metadados do
onboarding. Eles não são um escopo público da Easyhook e nunca são necessários
nas chamadas da API do cliente. A identidade da WABA usa o `waba_id` da Meta,
e não o nome de exibição.

| Método | Ponto final | Objetivo |
| --- | --- | --- |
| `GET` | `/v1/webhooks` | Lista de assinaturas. |
| `GET` | `/v1/webhooks/options` | Lista eventos, escopos e contas conectadas compatíveis com a organização da chave de API. |
| `POST` | `/v1/webhooks` | Crie uma assinatura e devolva seu segredo uma vez. |
| `GET` | `/v1/webhooks/{id}` | Leia uma assinatura. |
| `PATCH` | `/v1/webhooks/{id}` | Substitua os eventos subscritos sem alterar o URL, segredo, autenticação, provedor ou escopo. |
| `DELETE` | `/v1/webhooks/{id}` | Excluir uma assinatura. |
| `POST` | `/v1/webhooks/{id}/replay` | Recoloca na fila as entregas com falha ou esgotadas desta assinatura. |
| `POST` | `/v1/webhooks/{id}/history-replays` | Reenviar mensagens de histórico armazenadas ou contatos do estado da aplicativo. |
| `GET` | `/v1/webhooks/{id}/history-replays/{replay_id}` | Leia o progresso de repetição persistente. |

Criar uma assinatura em toda a organização:

```bash
curl -X POST https://api.easyhook.dev/v1/webhooks \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production CRM",
    "url": "https://crm.example.com/webhooks/easyhook",
    "providers": ["whatsapp"],
    "events": ["message.*", "status.*"],
    "auth_type": "hmac",
    "scope": { "type": "organization" }
  }'
```

Campos de criação:

| Campo | Requerido | Significado |
| --- | --- | --- |
| `name` | sim | Nome da assinatura legível por pessoas. |
| `url` | sim | Destino público do HTTPS. URLs HTTP e inválidos são rejeitados. |
| `providers` | sim | Um ou mais provedores: `whatsapp`, `messenger`, `instagram`, `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, `tiktok`, `sms`, `voice` ou `*`. Use `*` sozinho. Chamadas usam `voice` mesmo quando `data.provider` é `whatsapp`. |
| `events` | sim | Um ou mais filtros compatíveis de `/v1/webhooks/options`. Vazio é rejeitado. Selecione `*` sozinho para cada evento. |
| `scope` | não | Objeto de escopo aninhado público. Predefinições para toda a organização. |
| `auth_type` | não | `hmac` (por omissão), `bearer`, `custom_header`, ou `none`. |
| `auth_header_name` | Apenas para `custom_header` | Nome de cabeçalho personalizado seguro. `Authorization`, cabeçalhos de transporte, e `X-Easyhook-*` são reservados. |

Atualizar apenas os eventos subscritos após a criação:

```bash
curl -X PATCH https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": ["message.*", "status.*", "consent.updated"]
  }'
```

`events` substitui a seleção anterior e deve conter pelo menos um evento
compatível com os provedores atuais do webhook. Esta operação não gira nem
devolve o segredo e também não recria a assinatura.

A criação bem-sucedida retorna HTTP `201`. Salve `secret` imediatamente; as
operações de listagem e consulta nunca voltam a exibi-lo:

```json
{
  "webhook": {
    "id": "webhook_uuid",
    "name": "Production CRM",
    "url": "https://crm.example.com/webhooks/easyhook",
    "providers": ["whatsapp"],
    "events": ["message.*", "status.*"],
    "scope": { "type": "organization", "ref": null },
    "auth": { "type": "hmac", "header_name": null },
    "status": "active"
  },
  "secret": "whsec_..."
}
```

Âmbitos disponíveis:

```json
{ "type": "organization" }
```

```json
{ "type": "phone", "from": "15550100002" }
```

```json
{ "type": "waba", "from": "15550100002" }
```

```json
{ "type": "channel", "from": "instagram_alias" }
```

Para `phone` e `waba`, a Easyhook resolve o escopo interno a partir do número
do WhatsApp. Uma assinatura da WABA recebe eventos correspondentes de todos os
números conectados atualmente àquela WABA. Para `channel`, use o alias público
devolvido para o canal do Messenger, Instagram, Telegram, Gmail, Outlook,
IMAP/SMTP ou Mercado Libre. IDs internos de escopo e de portfólio empresarial
da Meta nunca são necessários.

Os números de escopo do WhatsApp usam a mesma normalização internacional da API
de mensagens: E.164 ou apenas dígitos com código do país, separadores visuais
comuns, México `52`/`521` e celulares da Argentina `54`/`549`. A Easyhook não
infere o país de números escritos apenas no formato nacional.

Descubra as opções válidas sem identificadores de código rígido:

```bash
curl "https://api.easyhook.dev/v1/webhooks/options?provider=whatsapp&scope_type=phone" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

`provider` aceita `whatsapp`, `messenger`, `instagram`, `telegram`, `gmail`,
`outlook`, `imap_smtp`, `mercadolibre`, `tiktok`, `sms`, `voice`, ou `*`.
`scope_type` aceita `organization`, `waba`,
`phone`, ou `channel`. Os filtros de resposta combinações incompatíveis e
retorna `providers`, `events`, `scope_types`, e `scope_identifiers`.
Os valores da conta conectada são números públicos ou apelidos que podem ser enviados como
`scope.from`.

Repetir até 100 entregas mal- sucedidas. Omit `sync_id` para repetir as entregas falhadas mais antigas para o webhook:

```bash
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/replay \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "sync_id": "SYNC_ID", "limit": 100 }'
```

Replay nunca cria um novo evento lógico. Ele reinicia as tentativas de entrega e mantém a chave de idempotência original.

## Filtros

Fornecedores:

- `whatsapp`
- `messenger`
- `instagram`
- `telegram`
- `gmail`
- `outlook`
- `imap_smtp`
- `mercadolibre`
- `tiktok`
- `*`

Filtros comuns de eventos:

| Filtro | Recebe |
| --- | --- |
| `*` | Cada evento no provedor selecionado e escopo. |
| `message.*` | Mensagens/reações ao vivo recebidas. Não inclui ecoes WhatsApp Business App ou importação de histórico. |
| `message.text`, `message.image`, `message.audio`, `message.video` | Um tipo de mensagem concreta ao vivo. |
| `message.document` | WhatsApp documentar eventos. |
| `message.reaction` | Reações do WhatsApp, Messenger ou Instagram quando o provedor as emite. |
| `message.edit` | WhatsApp, Messenger ou Instagram edita quando o provedor os emite. |
| `message.button`, `message.interactive` | WhatsApp template-botão, resposta rápida, lista, e Flow interações. |
| `message.quick_reply` | Seleções de botões de resposta normalizadas em WhatsApp, Messenger, Instagram e Telegram. |
| `message.file` | Eventos de arquivos Messenger/Instagram. |
| `status.*` | WhatsApp entrega, leitura e status de falha. |
| `status.failed` | Só falhou o estado da mensagem do WhatsApp. |
| `scheduled.*` | Criação de mensagens agendadas, aceitação bem-sucedida do provedor, falha na execução do terminal e cancelamento. |
| `template.*` | Atualização do modelo WhatsApp. |
| `flow.submission.*` | Respostas WhatsApp Flow. |
| `smb_message_echo.*` | Mensagens/reações enviadas do WhatsApp Business App em coexistência. |
| `smb_app_state_sync.*` | atualizações de contatos/aplicações de coexistência. |
| `user_preferences.*` | A preferência de marketing WhatsApp muda. |
| `history.*` | Sincronização do histórico de coexistência. |
| `account_update.*` | Atualizações de conexão de conta do WhatsApp. |
| `onboarding.*` | Hospedado onboarding do ciclo de vida. |
| `consent.updated` | Um serviço de contato ou estado de consentimento de marketing alterado. |
| `contact.updated` | Os metadados de contato do WhatsApp foram alterados através da API pública. |

Os provedores de E-mail usam o mesmo `message.*` assinatura como os outros canais.
O seu normalizado `message` bloco adiciona `subject`, opcional `html`, `thread_id`,
`message_id_header`, `in_reply_to` e `references`. Use `message.id` como
`reply_to_message_id` ao responder através de `POST /v1/messages/email`. Render
`html` como conteúdo não confiável e usar os valores de thread/header quando necessário.

A filtragem usa o nome do evento do provedor. O público fornecido `type` Restos
padronizado. Use `smb_message_echo.*` para mensagens enviadas do WhatsApp
aplicativo de Negócios. Use `message.*` apenas para mensagens de entrada. Use `history.*`
separadamente para conversas importadas. Estas famílias nunca se sobrepõem.

## Tipos de Eventos

| Público `type` | Bloco principal |
| --- | --- |
| `message.received` | `message` |
| `message.echo` | `message` |
| `message.media_available` | `message`; atualizar a mensagem existente com a mesma `message.id` |
| `message.edit` / normalizado `message.received` | `message.edit.original_message_id`; atualizar a mensagem original em vez de inserir outra |
| `message.revoke` / normalizado `message.received` | `message.revoke.original_message_id`; marque a mensagem original como apagada |
| `message.system` / normalizado `message.received` | `message.system`; evento informacional WhatsApp, como um número de telefone alterado |
| `message.sent` | `status` |
| `message.delivered` | `status` |
| `message.read` | `status` |
| `message.failed` | `status` |
| `message.status_updated` | `status` para um status de provedor futuro/desconhecido |
| `scheduled.created` | `scheduled_message` |
| `scheduled.sent` | `scheduled_message`; Easyhook recebeu um WAMID de Meta |
| `scheduled.failed` | `scheduled_message`; falha na execução do terminal |
| `scheduled.cancelled` | `scheduled_message` |
| `flow.submitted` | `flow` |
| `template.status_changed` | `template` |
| `template.quality_changed` | `template` |
| `template.category_changed` | `template` |
| `template.components_changed` | `template` |
| `account.updated` | `account_update` |
| `contact.updated` | `contact_update` |
| `user.preference_updated` | `user_preference` |
| `consent.updated` | `consent` |
| `onboarding.created` | `onboarding` |
| `onboarding.completed` | `onboarding` |
| `sync.failed` | `sync` para falhas do ciclo de vida ou `error` para uma falha terminal de item ou provedor |
| `sync.started` | `sync` |
| `sync.progress` | `sync` |
| `sync.completed` | `sync` |
| `event.received` | Retalho dependente do provedor; ignore com segurança se não for suportado |

Eventos futuros de provedores desconhecidos são entregues como `event.received`Consumidores
deve ignorar blocos de topo desconhecidos e valores de enum desconhecidos em vez de
Rejeitar todo o pedido.

## Contrato JSON completo

Cada entrega não-batch tem esta forma lógica. Blocos opcionais e opcional
campos são omitidos; eles não são enviados como `null`.

```json
{
  "id": "easyhook_event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": {},
  "contact": {},
  "message": {},
  "status": {},
  "template": {},
  "flow": {},
  "onboarding": {},
  "scheduled_message": {},
  "sync": {},
  "account_update": {},
  "contact_update": {},
  "error": {}
}
```

Apenas `id`, `type`, e `channel` são comuns. Os blocos restantes dependem
`type`.

### Correlação agendada da mensagem

Subscrever `scheduled.*` em conjunto com `status.*` quando uma aplicativo programa mensagens.

`scheduled.created`, `scheduled.sent`, `scheduled.failed`, e `scheduled.cancelled` transportar:

```json
{
  "id": "easyhook_event_uuid",
  "type": "scheduled.sent",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "kind": "whatsapp_template",
    "status": "sent",
    "scheduled_at": "2026-07-03T00:30:00.000Z",
    "attempt_count": 0,
    "message_id": "wamid.HBg...",
    "provider_status": "accepted",
    "delivery_state": "accepted"
  }
}
```

Eventos posteriores de meta- estado permanecem padrão `message.sent`, `message.delivered`, `message.read`, ou `message.failed`. Os seus `status` O bloco inclui a mesma correlação:

```json
{
  "type": "message.delivered",
  "status": {
    "message_id": "wamid.HBg...",
    "scheduled_message_id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "recipient_id": "13125550199",
    "timestamp": "2026-07-03T00:30:03.000Z"
  }
}
```

Eventos de estado com falha preservam o array `errors` da Meta e adicionam um erro normalizado
`status.error` quando Easyhook pode identificar a causa:

```json
{
  "type": "message.failed",
  "status": {
    "message_id": "wamid.HBg...",
    "recipient_id": "13125550199",
    "errors": [{
      "code": 131053,
      "title": "Media upload error",
      "error_data": {
        "details": "Sticker with dimensions 406x379 has incorrect dimensions, expected dimension: 512x512"
      }
    }],
    "error": {
      "code": "invalid_sticker_dimensions",
      "message": "Sticker must be exactly 512x512 pixels. Received 406x379.",
      "provider_code": 131053,
      "retryable": false,
      "details": {
        "width": 406,
        "height": 379,
        "expected_width": 512,
        "expected_height": 512
      }
    }
  }
}
```

Use `status.error.code` na lógica do aplicativo e preserve o array original `errors`
para diagnóstico. Um evento `message.failed` é terminal, a menos que o erro
normalizado informe explicitamente `retryable: true`.

Para falhas comuns de entrega do WhatsApp, `status.error.details` também inclui
uma `category` e uma `action` práticas. Quando a Meta publica um período seguro
para nova tentativa, a Easyhook inclui `retry_after_seconds` no mesmo objeto:

| Código da Meta | `category` | Ação recomendada |
| --- | --- | --- |
| `130472` | `recipient_experiment` | Não tente novamente de forma automática. Use outro canal ou aguarde até que o destinatário não participe mais do experimento da Meta. |
| `131026` | `recipient_unreachable` | Confirme que o destinatário pode enviar mensagens à empresa, não a bloqueou, aceitou os termos atuais do WhatsApp e usa uma versão recente do aplicativo. |
| `131049` | `marketing_frequency_limit` | Não tente enviar novamente o template de marketing por pelo menos `86400` segundos. |

Esses campos orientam somente sobre a entrega que falhou; eles não autorizam
usar outra categoria de mensagem, destinatário, remetente ou organização como fallback.

Trate a entrega de webhooks como pelo menos uma vez. Remova duplicidades dos eventos
de ciclo de vida pelo `id` superior e dos estados por `status.message_id` junto com
o `type` público. Após uma interrupção, reconcilie com `GET /v1/scheduled-messages/{id}`.

### `account`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | string | WhatsApp Phone Number ID, Facebook Page ID, ou Instagram conta ID. Um evento WhatsApp sem um ID de telefone pode voltar para WABA ID. |
| `phone` | string | WhatsApp telefone comercial em dígitos internacionais, quando conhecido. |
| `name` | string | Nome de exibição do canal Messenger Page ou Instagram, quando conhecido. |

### `contact`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | string | ID remoto do provedor usado para endereçar mensagens. No WhatsApp pode ser um telefone ou um ID de usuário limitado à empresa (BSUID); não contém necessariamente apenas dígitos. |
| `phone` | string ou null | Telefone do WhatsApp em formato internacional, quando fornecido pela Meta. Pode estar ausente em conversas identificadas por nome de usuário. |
| `user_id` | string ou null | BSUID do WhatsApp, como `MX.EXAMPLE_CONTACT_ID`. Prefira-o como chave estável do contato quando estiver presente. |
| `parent_user_id` | string ou null | BSUID pai opcional, como `MX.ENT.EXAMPLE_PARENT_ID`, quando a Meta habilita identidade entre portfólios vinculados. |
| `username` | string ou null | Nome de usuário opcional do WhatsApp, sem `@`. |
| `country_code` | string ou null | Código opcional do país fornecido pelo WhatsApp. |
| `name` | string | Nome de contato/perfil fornecido pelo fornecedor, quando disponível. |

### `message`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | string | ID da mensagem do provedor (`wamid`/`mid`). É a chave principal de idempotência da mensagem. |
| `direction` | `in` ou `out` | Direção da mensagem quando Easyhook pode determinar. |
| `source` | string | `history`, `whatsapp_business_app`, ou outra fonte de provedor quando relevante. |
| `from` | string | Identificador do fornecedor do remetente. |
| `to` | string | Identificador do fornecedor do destinatário. |
| `type` | string | `text`, `button`, `edit`, `interactive`, `image`, `audio`, `video`, `document`, `file`, `sticker`, `reaction`, `unsupported`, ou um futuro tipo de provedor. |
| `text` | string | Corpo de texto para mensagens de texto/edição e o título visível selecionado no botão, resposta rápida e interações lista. |
| `subject` | string | Assunto de e-mail para Gmail, Outlook e IMAP/SMTP. |
| `html` | string | HTML de E-mail original quando presente. Trate-o como conteúdo não confiável. |
| `thread_id` | string | Identificador de linha de E-mail do fornecedor. |
| `message_id_header` | string | Cabeçalho RFC ID da Mensagem. |
| `in_reply_to` | string | Mensagem- ID pai RFC. |
| `references` | string | Cadeia de referências RFC. |
| `attachments` | array | Anexos de e-mail normalizados, incluindo IDs de mídia protegidos do Easyhook. |
| `media` | objeto | Metadados de mídia normalizados descritos abaixo. |
| `reaction` | objeto | Mensagem do alvo e emoji. |
| `button` | objeto | Resposta do botão do modelo WhatsApp com `text` e provedor `payload`. |
| `interactive` | objeto | Resposta interativa do WhatsApp com `type` e um bloco `button_reply` ou `list_reply`. |
| `edit` | objeto | ID da mensagem original, tipo de substituição e texto de substituição. |
| `referral` | objeto | Click-to-WhatsApp/provider contexto de referência. |
| `unsupported` | objeto | Tipo e erros de provedor não suportados. |
| `timestamp` | string ISO 8601 | Data e hora original do provedor após a normalização. |
| `history` | objeto | Metadados de thread, status e lote do History. |

`message.media` pode conter:

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | string | ID da mídia na Meta, quando disponível. |
| `mime_type` | string | Tipo MIME. |
| `url` | string | URL de download autenticado por Easyhook ou URL de provedor utilizável. |
| `caption` | string | Legenda dos media. |
| `filename` | string | Documento/nome do arquivo original. |
| `sha256` | string | Hash do provedor ou do arquivo, quando disponível. |
| `size` | número | Tamanho em bytes. |
| `expires_at` | string ISO 8601 | Expiração da URL ou do recurso, quando aplicável. |

`message.reply_to.message_id` identifica a mensagem original para uma mensagem em linha
responder. `message.reaction` contém `message_id`, `action`, e opcional `emoji`
ou nome da reação do fornecedor. `action: "unreact"` remove a reação anterior.
`message.edit` contém `original_message_id`, `type`, `text`, e opcional
`num_edit`; atualizar a mensagem original em vez de inserir uma segunda mensagem.
`message.unsupported` contém `type` e opcional
`errors[]`. `message.history` pode conter `thread_id`, `status`, `phase`,
`chunk_order`, e `progress`.

Para respostas a botões do WhatsApp, nunca deduza a ação selecionada a partir da
definição do template. A Easyhook preserva os valores fornecidos pela Meta:

```json
{
  "message": {
    "type": "button",
    "text": "Confirmar asistencia",
    "button": {
      "text": "Confirmar asistencia",
      "payload": "confirm_attendance"
    }
  }
}
```

Respostas rápidas interativas e seleções de lista usam o campo visível
`message.text` por conveniência e preservam o identificador estruturado:

```json
{
  "message": {
    "type": "interactive",
    "text": "Preciso alterá-la",
    "interactive": {
      "type": "button_reply",
      "button_reply": {
        "id": "change_attendance",
        "title": "Preciso alterá-la"
      }
    }
  }
}
```

Para uma nova automação multicanal, prefira `message.quick_reply.payload`.
Easyhook também preserva os campos WhatsApp específicos do provedor
`message.button.payload`, `message.interactive.button_reply.id`, e
`message.interactive.list_reply.id` por compatibilidade. Use `message.text` apenas
como o rótulo humano. Se um provedor omite um identificador, Easyhook o deixa
ausente em vez de adivinhar.

### Respostas rápidas multicanais

Os botões de resposta selecionados no WhatsApp, Messenger, Instagram ou Telegram usam o
filtro de eventos `message.quick_reply`. O evento público é normalizado como:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "instagram",
  "account": { "id": "17841400000000001" },
  "contact": { "id": "17841400000000002" },
  "message": {
    "id": "mid...",
    "direction": "in",
    "type": "quick_reply",
    "text": "Ventas",
    "quick_reply": {
      "title": "Ventas",
      "payload": "sales"
    }
  }
}
```

Use `message.quick_reply.payload` como valor estável de roteamento. Uma assinatura
de `message.*` também recebe esse evento; não assine os dois filtros em
automações separadas, a menos que o processamento duplicado seja intencional.

### Respostas, reações e edições de canais cruzados

Easyhook usa os mesmos campos normalizados quando WhatsApp, Messenger ou Instagram
fornece o evento subjacente:

- Resposta em linha: `message.reply_to.message_id`.
- Reação: `message.reaction.message_id`, `action`, e opcional `emoji`.
- Editar: `message.edit.original_message_id`, `text`, e opcional `num_edit`.

Os recursos dos provedores não são idênticos. A Meta atualmente expõe reações e
edições do Messenger e do Instagram, além de referências de resposta no Instagram.
A Meta não expõe exclusão ou cancelamento de envio do Messenger ou Instagram como
webhook equivalente; por isso, a Easyhook não deduz nem fabrica esses eventos.
Ignore campos opcionais desconhecidos e processe somente eventos realmente entregues.

### Exclusões WhatsApp e avisos de sistema

Assine os eventos do provedor `message.revoke` e `message.system`. Eles são eventos
de mensagem normalizados, portanto o `type` superior entregue é `message.received`;
encaminhe a operação por `message.type`:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": { "id": "123456789012347", "phone": "15550100005" },
  "contact": { "id": "15550100006" },
  "message": {
    "id": "wamid.edit-event",
    "type": "edit",
    "text": "Texto corregido",
    "edit": {
      "original_message_id": "wamid.original",
      "type": "text",
      "text": "Texto corregido"
    },
    "timestamp": "2026-07-31T13:33:03.000Z"
  }
}
```

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid.revoke-event",
    "type": "revoke",
    "revoke": { "original_message_id": "wamid.original" },
    "timestamp": "2026-07-31T11:28:57.000Z"
  }
}
```

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid.system-event",
    "type": "system",
    "system": {
      "type": "user_changed_number",
      "body": "User A changed from 15550100007 to 15550100008",
      "wa_id": "15550100008"
    },
    "timestamp": "2026-07-30T02:34:03.000Z"
  }
}
```

Regras relativas aos consumidores:

- Para `edit`, encontrar a linha existente por `message.edit.original_message_id`,
  substituir o seu texto por `message.edit.text` (ou `message.text`), e marcá-lo como
  editado. Não insira uma segunda mensagem de chat.
- Para `revoke`, encontrar a linha existente por
  `message.revoke.original_message_id`, marcá-lo como revogado, e esconder ou limpar
  seu conteúdo. Não insira uma mensagem de chat autônoma.
- Para `system`, exiba `message.system.body` como aviso informativo. Em
  `user_changed_number`, use `message.system.wa_id` como a nova identidade do
  WhatsApp conforme a política de contatos do aplicativo.
- Remova duplicidades de cada webhook pelo `id` superior. Use o WAMID original
  para atualizar a mensagem; `message.id` identifica o evento de edição,
  revogação ou sistema.
- Nunca renderize esses eventos como mensagem vazia genérica quando o bloco
  especializado estiver presente.

### `status`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `message_id` | string | ID da mensagem do fornecedor cujo status foi alterado. |
| `recipient_id` | string | Número de telefone do destinatário, quando o Meta o fornecer. |
| `recipient_user_id` | string | BSUID do destinatário. A Meta o inclui em eventos de status do WhatsApp. |
| `parent_recipient_user_id` | string | BSUID pai opcional para portfólios vinculados compatíveis. |
| `timestamp` | string ISO 8601 | Data e hora do status do provedor. |
| `conversation` | objeto | Metadados de conversa e janela de preços da Meta. |
| `pricing` | objeto | Campos de preços da Meta preservados como objeto compacto. |
| `errors` | array | Objetos de erro da Meta, quando fornecidos. |

`status.conversation` pode conter `id`, `expires_at`, `origin`, e
`free_entry_point`. Uma entrega com falha deve ser tratada por `status.errors`
sem assumir um esquema de erro de provedor fixo.

### `template`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | string | ID do template na Meta. |
| `name` | string | Nome do modelo. |
| `language` | string | Código de linguagem do modelo. |
| `status` | string | Status informado pelo evento de atualização da Meta. |
| `quality` | string | Novo valor de qualidade. |
| `category` | string | Novo valor de categoria. |
| `reason` | string | Código ou texto do motivo informado pela Meta. |
| `description` | string | Descrição do fornecedor. |

### `flow`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `submission_id` | string | Identidade de submissão Easyhook/fornecedor estável. |
| `id` | string | Meta Flow ID. |
| `name` | string | Nome do fluxo. |
| `token` | string | Token de correlação de aplicativos fornecido ao enviar o Fluxo. |
| `action` | string | Ação de fluxo, comumente `complete`. |
| `screen` | string | ID de tela último/submetido. |
| `data` | objeto | Campos de fluxo apresentados. Trate as teclas como dados dinâmicos definidos por fluxo. |

### `onboarding`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | string | Identificador da sessão de bordo hospedado. |
| `status` | string | Situação da sessão. |
| `url` | string | Alojado em URL de bordo, quando aplicável. |
| `expires_at` | string ISO 8601 | Expiração da sessão. |
| `organization` | objeto | Possuindo dados de exibição de organização Easyhook: `name`, `slug`, e facultativo público `logo_url`. |
| `signup_mode` | string | `cloud_api` ou `coexistence`. |
| `customer_name`, `customer_email` | string | Referências opcionais fornecidas pelo cliente. |
| `return_url` | string | URL para a qual o navegador retorna ao concluir. |
| `metadata` | objeto | Metadados de correlação fornecidos pelo cliente. |
| `waba`, `phone` | objeto | Detalhes do ativo Meta conectado após a conclusão. |

### `call`

Os eventos de voz usam o provedor público `voice` para o roteamento normalizado
e mantêm o provedor subjacente (`telnyx` ou `whatsapp`) em `data.provider`.

| Campo | Tipo | Significado |
| --- | --- | --- |
| `call_id` | string UUID | Identidade estável da chamada na Easyhook. |
| `provider` | string | `telnyx` ou `whatsapp`. |
| `direction` | string | `inbound` ou `outbound`. |
| `from`, `to` | string | Participantes normalizados da chamada. |
| `endpoint_id` | string UUID | Endpoint que recebeu a oferta ou mantém a chamada atualmente. |
| `external_agent_id` | string | Identidade do agente API/SIP definida pelo cliente, quando aplicável. |
| `sequence` | inteiro | Número de tentativa de roteamento. |
| `lease_until` | string ISO 8601 | Momento em que a Easyhook avança para outro endpoint. |
| `conversation_type`, `conversation_id` | string | Conversa vinculada da Inbox, quando disponível. |
| `transfer_destination` | E.164 string | Destino externo configurado quando `call.transfer_started` é emitido. |

Assine `call.offered` para fazer um aplicativo do cliente tocar e reivindique a
chamada de forma atômica com `POST /v1/calls/{id}/actions/claim`.
`call.claimed` confirma o endpoint vencedor. Eventos do provedor como
`call.ringing`, `call.answered`, `call.connect`, `call.hangup` e
`call.terminate` reconciliam o estado final. Não faça tocar um endpoint ausente
do evento `call.offered` atual. `call.transfer_started` confirma que a Easyhook
reservou saldo da organização e aceitou uma transferência gerenciada para o
número externo configurado; o uso final é reconciliado pelo ciclo de vida
assinado da Telnyx.

As respostas à permissão de chamada do WhatsApp chegam como uma mensagem
interativa `message.interactive.call_permission_reply`, com a resposta da Meta,
validade, horário de expiração e origem da resposta.

### `sync`

Os eventos do ciclo de vida podem conter `id`, `status`, `media_mode`, `progress`,
`history_events`, `state_events`, `media_pending`, `media_completed`, `phase`,
`chunk_order`, `error`, e `updated_at`.

### Atualizar e blocos de erro

- `account_update`: `event`, `phone_number`, e provedor `details`.
- `contact_update`: `type`, `action`, `provider_id`, `user_id`, `name`, e
  `timestamp`.
- `error`: `code`, `title`, `message`, e opcionalmente
  `provider_message_id`.

Não necessita de todos os campos opcionais documentados.
canal, tipo de mensagem, permissões de conta e caminho de geração de eventos.

## Histórico de coexistência

O histórico do WhatsApp Business App em Coexistence é normalizado com os mesmos
eventos públicos de mensagem usados no tráfego ao vivo:

- Mensagens recebidas de um contato usam `type: message.received` e `message.direction: in`.
- Mensagens enviadas anteriormente pela empresa usam `type: message.echo` e `message.direction: out`.
- Ambas incluem `message.source: history` para distinguir o histórico sincronizado dos eventos ao vivo.
- Ambas incluem `message.from` e `message.to`, sem exigir que o consumidor deduza os participantes pela direção.
- `message.history` pode incluir `thread_id`, `status`, `phase`, `chunk_order`, e `progress` quando o Meta os fornece.

As cargas do histórico são confirmadas e persistidas antes do processamento
assíncrono. A Easyhook processa e entrega no máximo 100 eventos por lote. IDs
de mensagem duplicados da Meta não criam mensagens armazenadas duplicadas.

O histórico inicial e a sincronização do App State estão incluídos sem custo
adicional. Apenas uma sincronização pode ser executada por número do WhatsApp
por vez. Uma organização pode processar até dois números simultaneamente; esse
é um limite de equidade, não de números conectados nem de importações totais.
Assine `history.*` e `smb_app_state_sync.*` antes de conectar ou solicitar a
sincronização, mantenha o endpoint disponível e considere que contas grandes
podem continuar importando em segundo plano após o onboarding.

A Meta documenta o histórico como uma importação de até aproximadamente 180
dias, sem conversas em grupo. Ele não é um backup completo do iCloud ou Google
Drive do telefone. Consulte as referências oficiais da Meta para
[History](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/history)
e [SMB App State Sync](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync).

Importações históricas nunca acionam palavras-chave de consentimento em tempo
real nem repetem os efeitos de uma submissão de Flow. Elas apenas reconstroem o
histórico e emitem os eventos `history.*` assinados.

Assine `history.*` antes de conectar ou solicitar uma sincronização de
Coexistence quando o destino precisar da importação completa. Mensagens
recebidas em tempo real usam `message.*`; ecos em tempo real do WhatsApp
Business App usam `smb_message_echo.*`.

O seletor de assinatura usa o evento do provedor (`history.*`). A Easyhook envia
`{ "type": "sync.batch", "sync": {...}, "events": [...] }`, com no máximo
100 eventos normalizados em `events`. Cada evento mantém o `type` público padrão
(`message.received` ou `message.echo`). Nem `message.*` nem
`smb_message_echo.*` recebem a importação histórica.

Envelope completo em lote:

```json
{
  "id": "sync_batch_abc123",
  "type": "sync.batch",
  "provider": "whatsapp",
  "sync": {
    "id": "sync_session_uuid",
    "source": "history",
    "phase": 1,
    "chunk_order": 2,
    "progress": 80,
    "cursor": 300,
    "count": 100,
    "total": 1200
  },
  "events": [
    {
      "id": "event_uuid",
      "type": "message.received",
      "channel": "whatsapp",
      "account": { "id": "123456789012345", "phone": "15550100002" },
      "contact": { "id": "15550100004" },
      "message": {
        "id": "wamid...",
        "direction": "in",
        "source": "history",
        "from": "15550100004",
        "to": "15550100002",
        "type": "text",
        "text": "Previous message",
        "timestamp": "2026-07-01T10:00:00.000Z"
      }
    }
  ]
}
```

O lote externo utiliza `provider` para compatibilidade para trás enquanto cada
usos de eventos internos normalizados `channel`. Replay lotes contêm adicionalmente
`sync.replay: true`; os seus `sync.id` é o ID de repetição e `phase`,
`chunk_order`, ou `progress` pode estar ausente.

O mesmo. `history.*` A assinatura recebe Objetivos do ciclo de vida separadamente dos lotes:

```json
{
  "id": "event_uuid",
  "type": "sync.progress",
  "channel": "whatsapp",
  "sync": {
    "id": "sync_uuid",
    "status": "progress",
    "media_mode": "recent_media",
    "progress": 100,
    "history_events": 1200,
    "state_events": 430,
    "media_pending": 8,
    "media_completed": 12
  }
}
```

`sync.progress.progress` É o progresso de ingestão relatado pela Meta. `history_events` e `state_events` são os contadores processados do Easyhook. A conclusão é explícita através de `sync.completed`; não inferi-lo apenas a partir de `progress: 100`.

O negócio deve permitir o compartilhamento do histórico no aplicativo WhatsApp Business durante a coexistência e deve manter o aplicativo aberto enquanto a sincronização inicial começa. Se o compartilhamento do histórico está desativado, Meta pode retornar o erro `2593109`; Easyhook entrega-o para o mesmo `history.*` assinatura como `type: sync.failed`.

```json
{
  "id": "event_uuid",
  "type": "message.echo",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004" },
  "message": {
    "id": "wamid...",
    "direction": "out",
    "source": "history",
    "from": "15550100002",
    "to": "15550100004",
    "type": "text",
    "text": "Previous reply",
    "history": {
      "thread_id": "15550100004",
      "status": "READ",
      "phase": 1,
      "chunk_order": 2,
      "progress": 80
    }
  }
}
```

### Regras de mapeamento dos consumidores

Tratar cada elemento de `events` como uma mensagem normalizada. O objeto externo é um lote de entrega do Easyhook, não o do Meta em bruto `messages[]`, `contacts[]`, ou `history[]` Carga útil.

- Use `account.id + ":" + (contact.user_id ?? contact.id)` como chave da conversa. O ID da conta é necessário porque um BSUID tem escopo empresarial e a mesma pessoa pode falar com mais de um número conectado.
- Use `message.id` (o `wamid` da Meta) como chave de deduplicação. O processamento do webhook e do fluxo de trabalho deve ser idempotente.
- Ordenar as mensagens importadas por `message.timestamp`, não por hora de chegada webhook. Conversas separadas podem ser processadas simultaneamente, então a ordem de entrega global não é significativa.
- Para `message.direction: in`, `contact` é o remetente e `account` é o número Easyhook que recebe.
- Para `message.direction: out`, `account` é o remetente e `contact` é o destinatário.
- Os nomes de usuário do WhatsApp podem ocultar o número de telefone da pessoa. Meta, em seguida, identifica o contato com um ID de usuário Comercializado (BSUID), como `MX.EXAMPLE_CONTACT_ID`. Easyhook armazena telefone / BSUID aliases quando Meta fornece tanto e preserva o BSUID em `contact.user_id`; as carteiras ligadas elegíveis também recebem `contact.parent_user_id`. `contact.phone` e status `recipient_id` pode estar ausente, enquanto normalizado `message.from`/`message.to` permanecer routable com o telefone ou BSUID. Nunca exigir dígitos, inventar um telefone, ou strip letras e pontuação a partir destes identificadores.
- Durante a janela de transição do Meta, um webhook pode conter ambos `contact.phone` e `contact.user_id`; armazenar ambos. Um webhook posterior pode conter apenas o BSUID e ainda pertence ao mesmo contato.
- Em registros históricos raros, o Meta pode omitir cada campo de contato remoto. Easyhook emite `type: sync.failed` com `error.code: missing_remote_contact` e `error.provider_message_id` em vez de publicar um inutilizável `message.received` ou `message.echo`. Mantenha o resto da importação e grave este item como terminal, a menos que a Meta mais tarde forneça a identidade que falta.
- Não desencadeie respostas automáticas ao vivo, detecção de palavra-chave de consentimento ou outras automações de entrada em tempo real quando `message.source === "history"` a menos que o comportamento de repetição seja explicitamente pretendido.
- Uma assinatura do histórico pode ser recebida `sync.failed`; manuseá-lo separadamente de eventos de mensagem e manter o fluxo de trabalho retry-safe.
- Entrega é pelo menos uma vez. Easyhook retries falhou lotes até cinco vezes com backoff; sempre deduplicar por `message.id`.
- O Easyhook processa uma sincronização por número do WhatsApp e até dois números simultaneamente por organização. Números adicionais permanecem em fila e retomam automaticamente; o tempo gasto à espera da capacidade não consome tentativas de falha de entrega ou sincronização.
- Os meios históricos são importados de forma independente. Uma mensagem pode chegar primeiro com
  metadados de mídia ou um placeholder e mais tarde chegar como
  `message.media_available` com o mesmo `message.id` e um URL de download. Do
  não atrasar a importação da conversa enquanto espera pela mídia ou tratar o
  evento de disponibilidade como uma nova mensagem do cliente.
- Easyhook honra um destino válido `Retry-After` valor, então usa `30s`, `2m`, `10m`, `1h`, e `6h` Tente novamente as janelas. Após cinco tentativas falhadas, a entrega permanece na fila lógica de letras mortas até ser reproduzida.

### Repetindo o histórico armazenado

Repetir as entregas HTTP mal- sucedidas e repetir a importação armazenada são operações separadas:

```bash
# Retry failed batches that already exist in the outbox.
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/replay \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"sync_id":"SYNC_ID","limit":100}'

# Re-read stored messages and send them to this active history webhook.
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/history-replays \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"phone_id":"LOCAL_PHONE_UUID","replay_type":"history"}'

# Re-read stored contacts and send them to an active smb_app_state_sync webhook.
curl -X POST https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/history-replays \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"phone_id":"LOCAL_PHONE_UUID","replay_type":"contacts"}'
```

A segunda resposta contém `replay.id`. Verificar o progresso com:

```bash
curl https://api.easyhook.dev/v1/webhooks/WEBHOOK_ID/history-replays/REPLAY_ID \
  -H "Authorization: Bearer eh_live_xxx"
```

Replay lotes usar o mesmo `sync.batch` contrato e adicionar `sync.replay: true`. Replays de mensagens definidos `sync.source: history`; contact replays set `sync.source: smb_app_state_sync`. Mensagens preservar `message.id`, enquanto os contatos preservam sua identidade de evento normalizada. Apenas uma repetição ativa de cada tipo é permitida para o mesmo webhook e número.

### Política de mídia histórica

Escolha a política ao solicitar uma sincronização:

| `media_mode` | Comportamento |
| --- | --- |
| `metadata` | Importa metadados de mensagens e mídias sem baixar arquivos. |
| `recent_media` | Transferências de imagens recentes, áudio, documentos e autocolantes disponíveis; ignora o vídeo. Este é o padrão. |
| `all_recent_media` | Também downloads disponíveis de vídeo recente. |

Meta geralmente expõe IDs de mídia para download apenas para mídias históricas recentes (aproximadamente os últimos 14 dias). Mensagens antigas podem permanecer como metadados ou `media_placeholder`; mídia ausente nunca falha na importação da mensagem. Armazenamento e transferência usam as cotas de mídia normais do Easyhook.

Quando o Meta envia `media_placeholder` sem um ID de mídia, Easyhook emite `message.media.storage_status: "unavailable"` e `placeholder: true`. Nenhum arquivo existe para baixar nesse caso. Os consumidores devem mostrar um placeholder e esperar por `message.media_available`; eles não devem tratá-la como uma mensagem de texto vazia.

Para `edit`, atualizar a linha existente identificada por
`message.edit.original_message_id`. Para `revoke`, utilizar
`message.revoke.original_message_id` Marcar a mensagem existente como apagada.
Para `system`, exibir `message.system.body` como um aviso informativo e fazer
não tratá- la como uma nova mensagem do cliente ou abrir uma janela de serviço.
regras de mapeamento aplicam-se quando esses registros chegam dentro de um lote histórico.

## Sincronização do estado do aplicativo em coexistência

A `smb_app_state_sync.*` filtro recebe contato e app-state registros importados do WhatsApp Business App. Easyhook emite um evento normalizado por registro:

```json
{
  "id": "event_uuid",
  "type": "contact.updated",
  "channel": "whatsapp",
  "account": {
    "id": "123456789012345",
    "phone": "15550100002"
  },
  "contact": {
    "id": "15550100004",
    "user_id": "MX.EXAMPLE_CONTACT_ID",
    "parent_user_id": "MX.ENT.EXAMPLE_PARENT_ID",
    "name": "Customer"
  },
  "contact_update": {
    "type": "contact",
    "action": "update",
    "provider_id": "15550100004",
    "user_id": "MX.EXAMPLE_CONTACT_ID",
    "parent_user_id": "MX.ENT.EXAMPLE_PARENT_ID",
    "name": "Customer",
    "timestamp": "2026-07-18T15:20:00.000Z"
  }
}
```

`contact_update.type` e `contact_update.action` preservar a classificação de registros do Meta. Os consumidores não devem codificar uma lista fechada de valores. Manter `contact_update.provider_id`, `contact_update.user_id`, e opcional `contact_update.parent_user_id`, e processar atualizações repetidas idempotently. BSUIDs são opacos e não devem ser reformatados como números de telefone.

## Preferências do usuário do WhatsApp

Subscrever `user_preferences.*` para receber alterações Meta marketing-preferência como `user.preference_updated`. A normalização `contact` retém telefone, BSUID, BSUID pai, e nome de usuário quando fornecido; `user_preference` contém `category`, `detail`, `value`, e `timestamp`. Os campos do telefone podem estar ausentes para usuários habilitados pelo nome de usuário.

Consulte a documentação da Meta sobre [IDs de usuário com escopo empresarial](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids) e [o anúncio dos nomes de usuário do WhatsApp](https://about.fb.com/news/2026/06/its-time-to-reserve-your-whatsapp-username/) para acompanhar a transição do provedor.

Subscrever a ambos `smb_app_state_sync.*` e `history.*` antes de iniciar a sincronização de coexistência quando o destino precisa tanto do estado de contato importado quanto de conversas históricas. Os eventos de sincronização de estado não contêm mensagens históricas; os eventos de histórico não substituem as atualizações de estado de contato.

## Metadados de contato local atualizados

Subscrever `contact.updated` para receber alterações feitas através de `PUT /v1/contacts`. Estes eventos descrevem metadados locais do Easyhook e são separados do provedor-originado `smb_app_state_sync.*` eventos.

```json
{
  "id": "event_uuid",
  "type": "contact.updated",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": {
    "id": "15550100004",
    "phone": "15550100004",
    "name": "Ana",
    "full_name": "Ana Garcia",
    "preferred_name": "Ana"
  },
  "contact_update": {
    "type": "contact",
    "action": "update",
    "provider_id": "15550100004",
    "name": "Ana Garcia",
    "preferred_name": "Ana",
    "source": "easyhook_api",
    "write_target": "easyhook",
    "provider_contact_book_updated": false,
    "timestamp": "2026-08-12T18:30:00.000Z"
  }
}
```

Este evento não significa **** que o livro de endereços WhatsApp Business App mudou. Meta atualmente expõe sincronização de contato/estado de aplicativo para provedores, mas nenhuma operação da API da nuvem para escrever um nome de contato de volta para esse livro de endereços.

## Consentimento atualizado

Subscrever `consent.updated` para reagir ao opt-in, opt-out e pendente opt-out
muda sem pesquisar o ponto final do estado. O Easyhook emite o evento apenas quando
as mudanças de estado armazenadas. Evidências permanecem no registro de auditoria da organização
e nunca está incluído no webhook do cliente.

```json
{
  "id": "event_uuid",
  "type": "consent.updated",
  "channel": "whatsapp",
  "account": { "id": "123456789012345" },
  "contact": { "id": "15550100002" },
  "consent": {
    "contact": "15550100002",
    "scope": "marketing",
    "status": "opt_out",
    "previous_status": "opt_in",
    "source": "whatsapp_flow",
    "updated_at": "2026-07-31T18:00:00.000Z"
  }
}
```

Usar o nível superior `id` como a chave de idempotência. `scope` é `service` ou
`marketing`; `status` é `opt_in`, `opt_out`, ou `pending_opt_out`. Consultar
estado atual completo com `GET /v1/consent/status` Ao reconciliar um CRM.
`pending_opt_out` apenas informa que o Easyhook enviou um fluxo de confirmação.
não revogar um opt-in existente. O pedido pendente expira após uma hora se
O contato não envia o fluxo.

## Mensagem de mídia

Os campos de mídia são normalizados entre os canais. `url` está incluído quando Easyhook armazenou a mídia ou Meta forneceu uma URL utilizável.

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004", "name": "Customer" },
  "message": {
    "id": "wamid...",
    "type": "image",
    "media": {
      "id": "META_MEDIA_ID",
      "mime_type": "image/jpeg",
      "url": "https://api.easyhook.dev/v1/media/asset_uuid/download",
      "caption": "Photo",
      "size": 48231,
      "expires_at": "2027-01-11T00:00:00.000Z"
    },
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

A URL pode conter um ativo interno UUID porque é um recurso de download opaco. Nenhum ativo separado UUID é exposto no JSON.

As notas de vídeo circulares do WhatsApp atualmente chegam do Meta como mensagens não suportadas sem um ID de mídia ou URL:

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid...",
    "type": "unsupported",
    "unsupported": {
      "type": "video_note",
      "errors": [{ "code": 131051, "message": "Message type unknown" }]
    }
  }
}
```

## Reações

```json
{
  "id": "event_uuid",
  "type": "message.received",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004" },
  "message": {
    "id": "wamid.reaction",
    "type": "reaction",
    "reaction": {
      "message_id": "wamid.target",
      "emoji": "❤️"
    },
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

Um vazio `emoji` remove a reação anterior. Reações enviadas do aplicativo WhatsApp Business conectado usam o tipo público `message.echo`.

## Estado da entrega

```json
{
  "id": "event_uuid",
  "type": "message.delivered",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004" },
  "status": {
    "message_id": "wamid...",
    "timestamp": "2026-07-11T16:37:02.000Z"
  }
}
```

Status de falha incluem `errors` Só quando o Meta os fornece.

### Click-to-WhatsApp e o ponto de entrada livre de 72 horas

Uma mensagem de entrada que se originou de um ponto de entrada elegível do Click-to-WhatsApp pode incluir o contexto de referência da Meta:

```json
{
  "type": "message.received",
  "channel": "whatsapp",
  "message": {
    "id": "wamid...",
    "type": "text",
    "text": "Quiero informacion",
    "referral": {
      "source_type": "ad",
      "source_id": "ad_123",
      "source_url": "https://fb.me/...",
      "headline": "Oferta",
      "ctwa_clid": "clid_123"
    }
  }
}
```

O objeto de referência identifica o ponto de entrada, mas não prova por si só que a janela de 72 horas foi aberta. Meta confirma a conversa de ponto de entrada livre ativa em um evento de estado de saída:

```json
{
  "type": "message.sent",
  "channel": "whatsapp",
  "status": {
    "message_id": "wamid...",
    "conversation": {
      "id": "conversation_123",
      "expires_at": "2026-07-13T10:01:00.000Z",
      "origin": "referral_conversion",
      "free_entry_point": true
    },
    "pricing": {
      "billable": false,
      "model": "PMP",
      "category": "referral_conversion"
    }
  }
}
```

A janela de 72 horas descreve o preço Meta. As mensagens de formulário livre ainda requerem a janela de serviço ao cliente 24 horas separada.

Com o preço atual por mensagem, a Meta pode omitir o legado `conversation` bloquear e, em vez disso, voltar `pricing.model = PMP` com `pricing.type = free_entry_point`. Easyhook reconhece ambos os formatos.

## Submissão de Fluxo

```json
{
  "id": "event_uuid",
  "type": "flow.submitted",
  "channel": "whatsapp",
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": { "id": "15550100004" },
  "flow": {
    "submission_id": "submission_uuid",
    "id": "META_FLOW_ID",
    "name": "lead_capture",
    "token": "customer_123",
    "action": "complete",
    "screen": "LEAD",
    "data": {
      "name": "Example User",
      "service_opt_in": true
    }
  }
}
```

Os campos de consentimento em um Flow submetido continuam a atualizar o estado de consentimento do Easyhook antes da entrega.

## Hosted Onboarding

Subscrever `onboarding.*` para receber eventos de ciclo de vida de inscrição hospedados:

```json
{
  "id": "event_uuid",
  "type": "onboarding.completed",
  "channel": "whatsapp",
  "onboarding": {
    "id": "session_uuid",
    "status": "completed",
    "signup_mode": "coexistence",
    "return_url": "https://app.example.com/settings/whatsapp",
    "metadata": { "external_customer_id": "cus_123" },
    "connection": {
      "channel_id": "channel_uuid",
      "account_id": "123456789012345",
      "display_name": "Support",
      "provider": "whatsapp"
    },
    "waba": { "id": "123456789012348", "name": "Business" },
    "phone": {
      "id": "123456789012345",
      "display_phone": "+1 312 555 0100",
      "quality": "GREEN"
    }
  }
}
```

`onboarding.completed` é escrita na mesma caixa de saída persistente usada por outros
eventos webhook do cliente. Use o ID/idempotência de entrega normal do Easyhook
contrato: as repetições não representam uma conexão de segundo canal.

## Cabeçalhos e Segurança

Cada entrega inclui:

```http
Content-Type: application/json
User-Agent: Easyhook-Webhooks/1.0
X-Easyhook-Delivery: <delivery_uuid>
X-Easyhook-Event: <public_type>
X-Easyhook-Provider-Event: <filter/debug_event>
X-Easyhook-Timestamp: <unix_seconds>
```

Modos de autenticação:

| Modo | Cabeçalho |
| --- | --- |
| `hmac` | `X-Easyhook-Signature: sha256=<hex>` |
| `bearer` | `Authorization: Bearer <secret>` |
| `custom_header` | Cabeçalho configurado e segredo gerado |
| `none` | Sem autenticação; testes apenas |

Cálculo do HMAC:

```text
hex_hmac_sha256(secret, raw_request_body)
```

O segredo é devolvido apenas quando a assinatura é criada.

## Saúde dos canais

Subscrever `channel.health_changed` para aprender quando um WhatsApp conectado,
Messenger, Instagram, e-mail ou outro remetente suportado altera o estado de saúde.
O evento é emitido apenas em uma transição de estado:

```json
{
  "id": "event_uuid",
  "type": "channel.health_changed",
  "channel": "messenger",
  "account": { "id": "123456789012346", "name": "Easyhook" },
  "channel_health": {
    "status": "reauthorization_required",
    "previous_status": "connected",
    "action_required": true,
    "checked_at": "2026-08-22T09:19:07.211Z",
    "code": "meta_asset_unavailable",
    "message": "Provider asset is unavailable to the current credential"
  }
}
```

Tratar `unreachable` como potencialmente temporário e `reauthorization_required` como
um prompt de reconexão explícito. Os consumidores podem conciliar o estado atual a qualquer momento
com `GET /v1/senders` ou `GET /v1/senders/{account_id}/health`.

## n8n

Instalar:

```text
n8n-nodes-easyhook
```

Adicione **Easyhook Trigger**, selecione a credencial e o provedor e escolha um
dos eventos compatíveis e escopos conectados carregados pela Easyhook. Ative o
workflow para registrar automaticamente a Production URL e o segredo HMAC. Ao
desativá-lo, o n8n remove a assinatura gerenciada.

Para o histórico de Coexistence:

1. Escolher `Provider: WhatsApp`.
2. Escolher `Event: Coexistence history (history.*)`.
3. selecionar `Organization`, `WABA`, ou `WhatsApp number` e a conta correspondente, quando necessário.
4. Ative o fluxo de trabalho antes de conectar o telefone ou pressionar a sincronização de coexistência em Easyhook.
5. No aplicativo WhatsApp Business, permita o compartilhamento de histórico e mantenha o aplicativo aberto enquanto a sincronização começa.

Cada lote da Easyhook inicia uma execução do n8n e se expande em até 100 itens
de saída. Use `message.direction` para distinguir entrada (`in`) e saída (`out`),
`message.source === "history"` para identificar mensagens importadas e os
metadados `sync` copiados em cada item para consultar sessão, cursor, reenvio e
progresso. A Easyhook cria e assina a assinatura gerenciada pelo n8n; não é
necessário criar um segundo webhook no portal.

Se um fluxo de trabalho estiver inativo ou seu mapeamento antigo rejeitar parte de uma importação, ative o fluxo de trabalho corrigido e use **Reenviar histórico** no correspondente Easyhook no portal. Isto reutiliza a importação armazenada; ele não reconecta o telefone ou solicita outra exportação Meta.

Se o Meta não conseguir iniciar a importação, o gatilho pode, em vez disso, receber:

```json
{
  "type": "sync.failed",
  "channel": "whatsapp",
  "error": {
    "code": "2593109",
    "message": "History sync is turned off by the business from the WhatsApp Business App"
  }
}
```

O gatilho obtém essas escolhas a partir de `GET /v1/webhooks/options`. O endpoint está restrito ao organização da chave de API e retorna rótulos de exibição e aliases públicos, nunca tokens de provedor ou IDs internos de organização.

## Cobrança e entrega

- Meta ingestão e atualizações do portal não são cobradas.
- As mensagens recebidas e cada entrega para um endpoint subscrito são gratuitas.
- O saldo da carteira nunca bloqueia a entrega do webhook do cliente.
- As tentativas de auditoria são registadas.
- As entregas usam uma caixa de saída persistente e voltam a tentar requisições falhadas até cinco vezes com o backoff. Easyhook honra uma válida `Retry-After` resposta e suporta replay controlado através `POST /v1/webhooks/{id}/replay`.

Os meios de comunicação de entrada são retidos por até seis meses. `10 GB/month` transferência e `100 GB` armazenamento activo de meios de comunicação social recebidos; o excesso documentado aplica-se para além dessas quotas.

## Endpoints internos da Meta

Os clientes não chamam a estes objectivos:

```http
GET  /v1/meta/whatsapp/webhook
POST /v1/meta/whatsapp/webhook
GET  /v1/meta/messaging/webhook
POST /v1/meta/messaging/webhook
```

Easyhook verifica Meta assinaturas, armazena cada evento, atualiza o portal e, em seguida, fornece apenas assinaturas correspondentes ao cliente.
