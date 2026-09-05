# Guia de Integração do Easyhook Agent

Última atualização: 2026-08-20

Este arquivo é o ponto de entrada para um agente de codificação que integra o Easyhook
outra aplicativo. É intencionalmente concisa. Os contratos normativos são:

1. [A API pública](/api-reference): endpoint de cada cliente, parâmetro de solicitação,
   resposta, erro, regra de faturamento, e exemplo.
2. [Cliente Webhooks](/webhooks): API de assinatura, filtros,
   cabeçalhos de segurança, nomes de campos JSON normalizados, lotes de histórico e repetições.

Não invente campos da documentação do provedor ou use exemplos antigos do Easyhook encontrados
em outro lugar. Easyhook aceita eventos provedor internamente, mas expõe seu próprio compacto,
Contrato público normalizado.

## Entradas de Integração

Obtenha-os do proprietário da organização Easyhook:

```text
EASYHOOK_API_KEY=eh_live_xxx
EASYHOOK_FROM=provider-native account ID or connected WhatsApp number
EASYHOOK_WEBHOOK_URL=https://your-app.example/webhooks/easyhook
```

A chave de API corrige a organização. Nunca envie `tenant_id` a um público
endpoint. `from` deve resolver para um canal conectado possuído por que
organização. Preferir o provedor-nativo `account.id` recebido em Easyhook
webhooks. WhatsApp também aceita seu número internacional conectado; não adicionar
`page_` ou `ig_` prefixos.

`channel` é normalmente opcional. Se um `from` está ligado a mais de um
canal compatível, Easyhook retorna `409 ambiguous_sender` e listas
`available_channels`; tentar novamente com o valor pretendido, tais como `whatsapp` ou
`sms`Nunca adivinhes, nem caias silenciosamente.

Para WhatsApp, sempre inclua o código internacional de chamada de país.
aceita E.164, valores internacionais apenas de dígitos, espaços, hífens, parênteses,
pontos e `00` prefixo internacional. Ele não infer um país de um
Número apenas nacional. Mexicano `52`/`521` variantes e celular argentino
`54`/`549` a notação é normalizada automaticamente.

## Envio Mínimo

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: customer-123-message-456" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "body": "Hola"
  }'
```

Usar uma estabilidade `Idempotency-Key` para cada escrita que o aplicativo pode tentar novamente.
Não reutilize a mesma chave para duas operações lógicas diferentes.

Para uma mensagem agendada, também envie uma aplicativo `client_reference`:

```json
{
  "from": "15550100002",
  "to": "15550100003",
  "body": "Recordatorio",
  "at": "2026-07-25T10:00:00-06:00",
  "client_reference": "appointment-reminder-456"
}
```

Persistir o retornado `scheduled_message.id`. Inscrever-se em ambos `scheduled.*`
e `status.*`. `scheduled.sent` fornece o ID da mensagem do provedor; status da mensagem posterior
os eventos incluem `scheduled_message_id` e `client_reference`. Reconciliar após uma
tempo limite ou falha do webhook com:

```http
GET /v1/scheduled-messages/{scheduled_message_id}
```

Nunca correlacione uma mensagem agendada com o destinatário, o nome do modelo ou o timestamp.
`client_reference` aceita no máximo 200 caracteres. Trate a resposta HTTP como
o reconhecimento de agendamento: uma referência gerada localmente sem um retorno
`scheduled_message.id` não prova que o Easyhook recebeu o pedido.

## Configuração Minimal do Webhook

Descubra primeiro as opções válidas:

```bash
curl "https://api.easyhook.dev/v1/webhooks/options?provider=whatsapp&scope_type=phone" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

Criar a assinatura:

```bash
curl -X POST https://api.easyhook.dev/v1/webhooks \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production app",
    "url": "https://your-app.example/webhooks/easyhook",
    "providers": ["whatsapp"],
    "events": ["message.*", "status.*", "scheduled.*"],
    "auth_type": "hmac",
    "scope": {
      "type": "phone",
      "from": "15550100002"
    }
  }'
```

Armazenar o retornado `secret` O Easyhook devolve-o apenas uma vez.

Validar o corpo HTTP em bruto:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function validEasyhookSignature(
  rawBody: Buffer,
  received: string,
  secret: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
```

Validar antes de processar o JSON. Responder com HTTP `2xx` rapidamente e processar
Assíncrona.

## Regras de Roteamento

- Utilização `type` para escolher o bloco de carga útil.
- Utilização `channel` para distinguir `whatsapp`, `messenger`, `instagram`, `telegram`,
  `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, e `tiktok`.
- Para WhatsApp, utilizar `account.id + ":" + (contact.user_id ?? contact.id)` como a
  Identidade da conversa. `contact.id`, `message.from`, `message.to`, e status
  os destinatários podem ser BSUIDs opacos em vez de números de telefone. Preservar
  `contact.phone` separadamente quando presente e nunca tirar letras ou pontuação
  de um BSUID.
  BSUIDs pai também podem aparecer como `contact.parent_user_id`; preservá-los como
  aliases opacos e enviá-los inalterados através do Easyhook `to` Campo.
- Utilização `message.id` como a chave de idempotência da mensagem.
- Para TikTok, preservar o opaco `account.id`, estável `contact.id`,
  `message.thread_id`, e `message.id`. Não adicionar prefixos ou tratá-los como
  Números de telefone. Use qualquer um `contact.id` ou `message.thread_id` como `to`. A
  o negócio pode enviar no máximo 10 respostas dentro de 48 horas após cada mensagem do usuário
  e não pode iniciar uma conversa.
- Usar o webhook `id` como a chave de idempotência para eventos de não-mensagem.
- Para `message.type: button`, automação de rota com `message.button.payload`
  e utilizar `message.button.text`/`message.text` como o rótulo visível.
- Para `message.type: interactive`, respostas rápidas de rota e listas com
  `message.interactive.button_reply.id` ou
  `message.interactive.list_reply.id`; não infer uma seleção do modelo
  ordem do botão ou título.
- Quando `message.type` é `edit`, atualizar a linha identificada por
  `message.edit.original_message_id` com `message.edit.text`; não inserir um
  segunda mensagem.
- Para WhatsApp, Messenger e Instagram, use as mesmas estruturas opcionais quando
  presente: `message.reply_to.message_id`, `message.reaction.message_id` mais
  `action`/`emoji`, e `message.edit.original_message_id` mais `text`.
  As capacidades diferem pelo fornecedor; nunca inferem uma reação em falta, editar, responder,
  ou exclusão de texto ou timing.
- Quando `message.type` é `revoke`, marcar a linha identificada por
  `message.revoke.original_message_id` como revogado e esconder o seu conteúdo; não
  inserir uma mensagem independente.
- Quando `message.type` é `system`, mostrar `message.system.body` como uma
  aviso informacional. `user_changed_number`, utilizar `message.system.wa_id`
  como a nova identidade do fornecedor de acordo com a fusão de contatos da aplicativo
  política.
- `message.direction: in` significa que o contato enviou a mensagem.
- `message.direction: out` significa que a conta conectada enviou a mensagem.
- `message.source: history` é uma importação, não uma ação de cliente ao vivo.
  responder automaticamente a ele por padrão.
- Campos desconhecidos, valores de enum desconhecidos, e `event.received` deve ser ignorado
  Em segurança.
- Blocos opcionais são omitidos em vez de enviados como `null`.

## História e contatos

Subscrever a ambos `history.*` e `smb_app_state_sync.*` antes de solicitar uma
sincronização da coexistência.

A história chega como:

```json
{
  "type": "sync.batch",
  "provider": "whatsapp",
  "sync": {
    "id": "sync-id",
    "source": "history",
    "count": 100,
    "total": 1000
  },
  "events": []
}
```

Circular por cima `events`. Um lote contém no máximo 100 eventos normalizados.
pelo menos uma vez, mensagens tão upsert por `message.id` e contatos do prestador
identidade. Ordenar as mensagens importadas por `message.timestamp`, não é hora de chegada.

`message.media_available` atualiza a mensagem existente com a mesma
`message.id`; não é uma mensagem de conversação nova. `sync.failed` não contém
invalidar os eventos importados com sucesso.

## Seleção da API

| Objetivo | Ponto final |
| --- | --- |
| Validar a chave | `GET /v1/me` |
| Senderistas de listas | `GET /v1/senders` |
| Desconectar um remetente após confirmação explícita | `DELETE /v1/senders/{account_id}` |
| Enviar texto | `POST /v1/messages/text` |
| Enviar respostas rápidas do Messenger/Instagram | `POST /v1/messages/quick-replies` |
| Enviar texto multicanal humanizado | `POST /v1/messages/humanized-text` (WhatsApp, Messenger, Instagram ou Telegram; controles de presença são o melhor esforço) |
| Enviar mídia | `POST /v1/messages/media` |
| Enviar modelo | `POST /v1/messages/template` |
| Enviar a mídia de cabeçalho do modelo | `POST /v1/templates/media` |
| Enviar Fluxo | `POST /v1/messages/flow` |
| Marcar leitura / mostrar digitação | `POST /v1/messages/read`, `/v1/messages/typing` |
| Listar/ler conversas | `GET /v1/conversations...` |
| Aguarde a resposta de entrada | `GET /v1/conversations/{contact}/messages/wait...` |
| Reconciliar/cancelar a mensagem agendada | `GET`, `DELETE /v1/scheduled-messages/{id}` |
| Enviar/listar mídia reutilizável | `POST /v1/media`, `GET /v1/media?from=...` |
| Modelos de lista/sincronização | `GET /v1/templates?from=...`, `POST /v1/templates/sync` |
| Gerenciar Fluxos | `/v1/flows` |
| Gerenciar o consentimento | `/v1/consent` e `/v1/consent/*` |

A configuração do consentimento é por WABA. Suportes de cópia `language: "es" | "en" | "pt-BR"`, editável opt-in/opt-out cabeçalhos e corpos, e um rodapé. Porque Meta Fluxos são imutáveis após a publicação, salvar cópia com `PATCH /v1/consent/config` e aplicá-lo com `POST /v1/consent/enable`; Easyhook cria uma versão determinística e encaminha futuros envios para ele. `auto_opt_in_enabled: true` Opcionalmente agenda o fluxo de entrada do Easyhook 23 horas após a primeira interação de entrada ao vivo. Não recrie esse temporizador em um agente ou fluxo de trabalho. O Easyhook revida a janela de serviço e o estado atual de opt-in/opt-out antes do despacho. `POST /v1/consent` Devem incluir provas auditáveis fornecidas pelo cliente.
| Cliente hospedado onboarding | `POST /v1/onboarding/sessions` |
| Gerenciar assinaturas do webhook | `/v1/webhooks`; atualizar apenas eventos com `PATCH /v1/webhooks/{id}` |
| Criar uma identidade de chat ao vivo assinada | `POST /v1/live-chat/identity-tokens` |

## Inbox, equipes, celular e bate-papo ao vivo

O aplicativo de entrada da Easyhook e Android usam as mesmas conversas normalizadas,
biblioteca de mídia, estados de entrega, reações, respostas, modelos, recibos de leitura,
digitando sinais, pinos, estado não lido e registro de carteira como API pública. A
A ação do provedor enviada de qualquer uma das caixas de entrada está disponível na operação normal
preço; navegação, filtros, cache local, atualizações em tempo real e notificação
A entrega não é cobrada.

Organizações podem convidar membros como `administrator`, `developer`, ou `agent`.
Os papéis são abrangidos por organização: uma pessoa pode administrar uma organização
e agir como um agente em outro. atribuição, presença, conversas em equipe, e
a atribuição do agente é mostrada somente quando uma organização tem vários membros.
O aplicativo Android admite proprietários, administradores e agentes; conexão de canal,
o gerenciamento de carteiras, chaves e webhooks permanecem no portal web.

O Easyhook Live Chat é um canal próprio, sem um provedor externo de mensagens.
Clientes no navegador usam uma chave publicável do widget e sessões de curta duração;
aplicativos autenticados emitem tokens de identidade de cinco minutos por meio da
própria infraestrutura. Nunca incorpore uma chave comum da API Easyhook em um
navegador ou cliente móvel. O Live Chat oferece conversas individuais e em grupo,
texto, mídia, stickers, respostas, encaminhamento, reações, edições, exclusões,
cursores de leitura e indicadores de digitação. Consulte o contrato completo de
sessões e ações na Referência da API.

Para cabeçalhos de modelos multimídia, faça upload do exemplo de aprovação com
`POST /v1/templates/media`. Fornecimento `template_name`, `template_language`, e
`media_type` guarda- o como activo predefinido. No momento do envio,
`POST /v1/messages/template` pode omitir `media` para usar esse padrão ou fornecer
exatamente uma dinâmica `media.link`, `media.id`, ou reutilizável `media.name`. A
A sobreposição dinâmica deve corresponder ao tipo de cabeçalho aprovado da imagem, vídeo ou documento;
mídia de documentos também pode definir `filename`.

Use o endpoint interativo padronizado quando o fluxo de trabalho precisar de até três
botões de resposta ou URL em WhatsApp, Messenger, Instagram ou Telegram:

```json
{
  "from": "<ACCOUNT_ID>",
  "to": "<CONTACT_ID>",
  "body": "O que você deseja fazer?",
  "buttons": [
    { "type": "reply", "title": "Agendar", "payload": "schedule" },
    { "type": "url", "title": "Como chegar", "url": "https://example.com/map" }
  ]
}
```

Enviar este corpo para `POST /v1/messages/interactive`O WhatsApp aceita qualquer um dos dois
para três respostas ou um URL e não pode misturar ambos os tipos.
evento de seleção. Responder seleções de todos os quatro provedores usar
`message.quick_reply.payload`.

Messenger e Instagram também compartilham um menu maior de resposta rápida temporária
através `POST /v1/messages/quick-replies`:

```json
{
  "from": "<ACCOUNT_ID>",
  "to": "<CONTACT_ID>",
  "body": "O que você precisa?",
  "quick_replies": [
    { "title": "Ventas", "payload": "sales" },
    { "title": "Soporte", "payload": "support" }
  ]
}
```

Subscrever `message.quick_reply` e rota por
`message.quick_reply.payload`Continue. `message.text` apenas para exibição.

Leia a seção correspondente em `public-api.md` Antes de implementar uma
endpoint. Esse documento define todos os parâmetros aceitos e mutuamente exclusivos
Campos.

Lista de modelos, sincronização e criação de respostas incluem `meta_waba_id`Tratar isso como
o identificador WABA do fornecedor; nunca substitua o Easyhook interno `waba_id`
UUID. A criação de modelos aceita `parameter_format` como `POSITIONAL` ou `NAMED`.
Integraçãos de segurança de repetição devem enviar um estável `Idempotency-Key`.

Para cada operação de modelo, prefira `from` como o único seletor de conta.
chave de API fixa a organização e Easyhook deriva o WABA exato de que
telefone proprietário. Se um pedido inclui ambos `from` e `waba_id`, devem
resolver para o mesmo WABA; caso contrário Easyhook retorna
`409 sender_waba_mismatch`. Um desconhecido `from` retorna `404 phone_not_found`
sem cair para trás para o WABA fornecido. Nunca tente novamente qualquer erro contra um
WABA diferente automaticamente.

## Agentes de voz com ElevenLabs

O ElevenLabs é uma integração opcional para números Easyhook com voz. A
organização conecta a própria chave de API em **Portal > Integrações** e atribui
um agente às chamadas recebidas. Também pode atribuir outro agente às chamadas
realizadas, pois as instruções e a primeira mensagem normalmente são diferentes.

O Easyhook mantém o número, o roteamento, o consentimento e a cobrança. O áudio
trafega diretamente entre a operadora e o ElevenLabs; o n8n pode executar as
ferramentas do agente sem entrar no fluxo de áudio. Campanhas de saída usam
`POST /v1/calls` com `handler: "ai"` e exigem consentimento explícito para voz
nesse número e contato. Consulte [Telefonia](/telecom) para conhecer o contrato
e os limites.

## Lista de Verificação de Aceitação

- A chave de API permanece do lado do servidor.
- Não `tenant_id`, Supabase UUID, meta token de acesso, WABA ID, ou número de telefone ID
  é hardcoded a menos que o endpoint normativo o requeira explicitamente.
- Todos os números de remetente e destinatário usam dígitos internacionais.
- Cada escrita reexperimentável tem um estável `Idempotency-Key`.
- O HMAC é verificado em relação a bytes brutos usando comparação de tempo constante.
- O manipulador retorna `2xx` antes do trabalho lento do banco de dados/automatização.
- Mensagens e eventos são deduplicados.
- Os envios agendados persistem `scheduled_message.id`, `client_reference`, e o
  final `message_id`; correlação webhook/status não depende de timestamps.
- Eventos de History não acionam os bots destinados às conversas em tempo real.
- Erro nos eventos de estado e `sync.failed` são retidos com os seus detalhes de erro.
- Meta `status.pricing.billable` descreve Meta preço, não Easyhook faturamento.
  Uma operação de API de saída pública bem-sucedida é cobrada de acordo com o
  carteira Easyhook mesmo quando Meta etiqueta a conversa `free_customer_service`.
- Logs redact API chaves, segredos webhook, códigos de autorização e provedor
  fichas.
- Testes cobrem entrada, saída/eco, mídia, reação, status de falha, e em
  Pelo menos uma entrega duplicada.
