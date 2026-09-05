# API pública Easyhook

Última atualização: 2026-08-27

Este documento é a fonte de verdade para o comportamento de API voltado para o cliente. Cada alteração de API deve atualizar este arquivo no mesmo conjunto de alterações.

## Telecom

O número, SMS/MMS e contrato de chamada é neutro. Veja [Telefonia](/telecom) para verificações de capacidade, esquemas, segurança e ciclo de vida de faturamento.

- `GET /v1/telecom/capabilities`
- `GET /v1/telecom/numbers`
- `GET /v1/telecom/numbers/available`
- `POST /v1/telecom/numbers/orders`
- `POST /v1/messages/text` com `channel: "sms"` quando necessário
- `POST /v1/calls`
- `POST /v1/consent` com `channel: "voice"` gravar opt-in/opt-out para a divulgação de IA
- `GET /v1/calls/{callId}`
- `POST /v1/calls/{callId}/actions/hangup`

O callback da transportadora é uma infraestrutura privada e não é um ponto final autenticado pelo cliente.

Retorno SMS e MMS `maximum_reserved_cost` em vez de um preço final citado.
O reserva é reduzido para a tarifa final Easyhook após a transportadora confirmar
o valor billable, e a porção não utilizada é devolvida. SMS/MMS inbound são
Reservados e liquidados a partir da assinatura `message.received` Transportador de chamada de retorno
custo porque não há nenhum pedido de cliente anterior e não mais tarde inbound
`message.finalized` evento.

A voz da operadora de entrada também reserva um máximo reembolsável de 60 minutos antes
tocando um endpoint do Easyhook. A carga final usa a assinatura `call.cost`
`total_cost` e duração faturada, aplica a atual tarifa de voz Easyhook,
e devolve o reserva não utilizado.

`POST /v1/calls` também aceita `handler: "ai"` para chamadas de saída.
usa o agente de saída do ElevenLabs explicitamente vinculado ao número Easyhook
(que também pode ser o seu agente de entrada), pontes-lo apenas após
o destino responde, e aceita um escalar limitado `context` objeto para
Variáveis por chamada. A extensão da IA requer consentimento explícito da voz gravado via
`POST /v1/consent` e é estrangulado para uma tentativa por hora e três por
rolando 24 horas por organização/número/contato. Uma chamada de IA bem sucedida retorna
`202` sem um token WebRTC; a mídia flui diretamente entre Telnyx e
Onze Labs.

O manipulador gerenciado do ElevenLabs aceita atualmente apenas `channel: "phone"`.
WebRTC humano chama suporte ambos `phone` e `whatsapp`. Um pedido que combina
`handler: "ai"` com `channel: "whatsapp"` falha explicitamente com
`voice_ai_phone_channel_required`; Easyhook não troca Meta de um organização
número de sinalização Graph/WebRTC para SIP pelas costas.

## URL base

URL da API de produção:

```text
https://api.easyhook.dev
```

## Autenticação

As chamadas da API do cliente usam uma chave da API da organização/tenant na `Authorization` Cabeçalho.

```http
Authorization: Bearer eh_live_xxx
```

### Isolamento da organização

Uma chave de API pertence exatamente a uma organização Easyhook. A organização é
sempre derivado da chave; as solicitações da API do cliente não devem enviar `tenant_id`.

Selectores de recursos são resolvidos apenas dentro dessa organização:

- `from` aceita um número de remetente próprio ou identificador de canal conectado.
- `phone_id` aceita um telefone Easyhook de propriedade UUID.
- `waba_id` aceita um ID de Easyhook WABA UUID ou Meta WABA.
- Quando for fornecido mais de um selector, cada selector deve resolver o
  o mesmo recurso.
- Easyhook nunca cai de volta para outro telefone ou WABA quando um seletor não pode ser
  Resolvido.
- `channel` é opcional quando `from` identifica exatamente um remetente compatível.
  Quando o mesmo valor pertence a mais de um canal, o Easyhook retorna
  `409 ambiguous_sender` com `available_channels`; tentar novamente com um explícito
  `channel` Em vez de adivinhar.

Erros de isolamento esperados:

| HTTP | Erro | Significado |
| --- | --- | --- |
| `400` | `tenant_id_not_allowed` | A solicitação do cliente tentou substituir a organização da chave de API. |
| `400` | `invalid_from` | O remetente não é um identificador válido suportado. |
| `404` | `phone_not_found` | O remetente está faltando a esta organização, inclusive quando pertence a outra organização. |
| `404` | `waba_not_found` | A WABA está faltando a esta organização, inclusive quando pertence a outra organização. |
| `409` | `sender_phone_mismatch` | `from` e `phone_id` identificar diferentes telefones próprios. |
| `409` | `sender_waba_mismatch` | O remetente selecionado não pertence ao WABA fornecido. |
| `409` | `ambiguous_sender` | O mesmo. `from` está ligado a vários canais compatíveis; enviar `channel`. |

Estas regras aplicam-se às mensagens, mídia, modelos, fluxos, consentimento, leitura/tipagem
ações, agendamento, conversas, webhooks e ativos reutilizáveis.

## MCP para agentes de IA

Easyhook fornece um servidor de protocolo de contexto de modelo independente para Codex, Claude e outros clientes MCP:

```text
easyhook-mcp-server
```

O servidor não expõe a chave ou o remetente da API como argumentos de ferramenta. Eles são corrigidos no ambiente de processo MCP, e cada destino lido ou de saída é verificado com uma lista de contatos necessária antes de uma solicitação de API Easyhook ser feita. Cada contato inclui um nome e descrição para que o agente saiba quem ele pode contatar e quando.

Instale-o no Codex:

```bash
codex mcp add easyhook \
  --env EASYHOOK_API_KEY=eh_live_xxx \
  --env EASYHOOK_FROM=15550100002 \
  --env EASYHOOK_CONTACTS='[{"phone":"15550100003","name":"QA Contact","description":"QA contact; use only for requested tests"}]' \
  -- npx -y easyhook-mcp-server
```

Equivalente `~/.codex/config.toml` configuração:

```toml
[mcp_servers.easyhook]
command = "npx"
args = ["-y", "easyhook-mcp-server"]
startup_timeout_sec = 90

[mcp_servers.easyhook.env]
EASYHOOK_API_KEY = "eh_live_xxx"
EASYHOOK_FROM = "15550100002"
EASYHOOK_CONTACTS = "[{\"phone\":\"15550100003\",\"name\":\"QA Contact\",\"description\":\"QA contact; use only for requested tests\"}]"
```

Ferramentas MCP disponíveis:

| Ferramenta | Objetivo |
| --- | --- |
| `list_contacts` | Lista contatos permitidos com seus nomes e descrições de uso. |
| `send_text` | Envie texto padrão, humanizado ou agendado. |
| `send_media` | Enviar mídia por nome reutilizável, ID de mídia Meta, ou URL público. |
| `send_template` | Envie um modelo WhatsApp aprovado. |
| `send_flow` | Envie um WhatsApp Flow publicado. |
| `send_consent_flow` | Envie o WABA opt-in ou opt-out Flow. |
| `list_templates` | Modelos de lista resolvidos a partir do remetente configurado. |
| `list_media` | Lista de mídia reutilizável resolvida a partir do remetente configurado. |
| `list_flows` | Fluxos de Lista resolvidos a partir do remetente configurado. |
| `list_conversations` | Lista conversas recentes para o remetente configurado, filtrado para contatos configurados. |
| `get_recent_messages` | Leia mensagens de entrada e saída com um contato autorizado. |
| `wait_for_message` | Aguarde até cinco minutos para a próxima mensagem de entrada de um contato autorizado. |

`EASYHOOK_CONTACTS` é um array JSON de `{ phone, name, description }`. As ferramentas de envio e leitura aceitam o nome configurado ou o telefone. Os telefones formatados são normalizados em dígitos. `EASYHOOK_ALLOWED_TO` A lista separada por vírgulas permanece suportada quando `EASYHOOK_CONTACTS` está ausente. A chave e o remetente da API nunca se tornam argumentos de ferramentas. As verificações da carteira, janela de serviço, consentimento, modelo e Meta política do Easyhook ainda se aplicam.

`list_conversations` e `get_recent_messages` use leituras de API do cliente billable.
`wait_for_message` um tempo de espera é um resultado normal e não deve
ser interpretado como permissão para que um agente continue indefinidamente.

Hosted onboarding suporta WhatsApp, Messenger, Instagram, Telegram, TikTok,
Gmail, Outlook, Mercado Libre e e-mail personalizado, quando aplicável. Desligar um remetente não é intencionalmente exposto como
uma ferramenta MCP porque é uma ação destrutiva do organização-administração.
Operação REST vigiada por organizações `DELETE /v1/senders/{account_id}` a partir de um aprovado
Fluxo de gestão.

## Chatwoot

Easyhook pode ser usado como transporte para uma Inbox API Chatwoot. Chatwoot permanece
o sistema de registro de agentes, equipes, contatos, atribuições, rótulos, notas,
automações e estado de conversação. Easyhook só recebe eventos de provedor e
envia respostas do agente.

### Configurar

1. No Chatwoot, abra as configurações de perfil ** > Access Token** e copie uma API do usuário
   token com acesso à conta alvo.
2. Copiar o ID numérico da conta a partir de um URL do Chatwoot como
   `/app/accounts/7/...`.
3. Em Easyhook, abra **Integrações > Chatwoot**.
4. Digite o URL do Chatwoot, ID de conta e token API, em seguida, selecione um, vários,
   ou todos os canais Easyhook disponíveis.
5. Easyhook cria um Chatwoot API Inbox independente por canal selecionado,
   usa o nome de exibição do canal como o nome da Inbox, e atribui o provedor
   Avatar.
6. No Chatwoot, abra as novas caixas de entrada, adicione os agentes que podem usá-las e
   opcionalmente renomeá-los.

Nuvem de Chatwoot (`https://app.chatwoot.com`) e instalações auto-lojadas
com um URL HTTPS público são suportados. Não crie a Inbox da API manualmente e
não copiar o seu URL Webhook, ID da Inbox, identificador de Inbox ou Webhook Secret para
Easyhook. Easyhook cria a Inbox da API com seu URL de retorno de chamada e seu próprio
assinatura de eventos já configurada. O URL de retorno de chamadas contém uma
segredo aleatório e o token Chatwoot é armazenado no organização criptografado do Easyhook
loja secreta. Se uma Inbox conectada existente não tiver nenhum avatar, Easyhook atribui
o avatar do provedor correspondente na próxima vez que suas integrações forem carregadas.
Chatwoot ainda exibe seu ícone padrão do canal API na barra lateral; Chatwoot
O Cloud não expõe uma configuração de API para substituir aquele pequeno ícone do tipo de canal.

O provisionamento do Chatwoot suporta o WhatsApp, Messenger, Instagram, Telegram,
Gmail, Outlook, contas genéricas IMAP/SMTP e Mercado Libre. Cada um selecionado
o remetente recebe sua própria Inbox Chatwoot para que contatos e conversas não possam
cruze os limites dos canais.

### Comportamento

- Live inbound texto e mídia criar ou reutilizar um contato Chatwoot e
  Conversa.
- Mensagens de agente de saída pública são enviadas através do Easyhook conectado
  O remetente.
- Gmail, Outlook, e respostas IMAP/SMTP preservar o assunto original e
  tópico do provedor sempre que esse contexto estiver disponível. Os anexos são obtidos
  privado de Chatwoot, validado, e enviado através da caixa de correio conectada.
- As respostas do Telegram são enviadas através do bot selecionado. Mercado Libre respostas
  seguir a pergunta ou a conversação pós-compra representada pela
  Identificador de contato Easyhook.
- WhatsApp entrega estados (`sent`, `delivered`, `read`, e `failed`) atualização
  a mensagem de saída correspondente no Chatwoot. A correlação de estado começa
  com mensagens enviadas após a versão de integração que armazena o provedor
  ID da mensagem.
- Enquanto um agente digita no Chatwoot, Easyhook envia o indicador de digitação do WhatsApp
  para a mensagem de entrada mais recente nessa conversa. Ele pára automaticamente
  quando a resposta é enviada ou quando o indicador da Meta expira.
- WhatsApp não fornece um webhook de digitação de clientes. Chatwoot, portanto
  não pode mostrar uma animação real "cliente está digitando" para contatos do WhatsApp.
- Notas privadas, ecos de Chatwoot webhook e conversas que pertencem
  para outras caixas de entrada são ignoradas.
- O tráfego do provedor de entrada é gratuito. As mensagens enviadas por um agente são cobradas como
  Operações normais de saída do Easyhook.
- As respostas de formulário livre do WhatsApp ainda requerem uma janela aberta de serviço ao cliente.
  Do lado de fora dessa janela, envie um modelo aprovado através do Easyhook.
- Email e Telegram não usam a janela de atendimento 24 horas ao cliente do WhatsApp.
  As políticas de entrega e antispam específicas do provedor ainda se aplicam.
- Contatos e história de coexistência só são importados quando uma organização
  administrador solicita-os de **Integrações > Chatwoot**.
- Entrega é idempotent por Easyhook evento ID e Chatwoot mensagem ID. Webhook
  as tentativas não criam uma segunda mensagem do Chatwoot.
- As entregas ao vivo usam uma caixa de saída persistente com tentativas automáticas.
  Chatwoot ou falha de rede não descarta o evento do provedor.
- Easyhook downloads mídia protegida dentro do limite do organização e uploads
  o arquivo para o servidor Chatwoot. A mídia armazenada nunca é tornada pública para
  Chatwoot para recuperá-lo.

Desligar limpa o retorno da chamada API Inbox, remove o evento Easyhook
assinatura e apaga o mapeamento Easyhook- to- Chatwoot. Ele não apaga
a Inbox do Chatwoot, contatos ou conversas.

### Importação de contato e histórico

Cada Inbox do WhatsApp conectada tem contatos independentes **Import** e **Import
histórico** ações. Contatos são upserted em Chatwoot por seu Easyhook estável
identificador. O histórico está disponível apenas para a coexistência do WhatsApp Business App
números cujo proprietário autorizou o compartilhamento do histórico durante a integração e cujos
histórico normalizado ainda está disponível em Easyhook.

A importação histórica tem as seguintes garantias:

- Easyhook reutiliza os dados de histórico normalizado durável e do estado do aplicativo Sync.
  O telefone não tem de ser reconectado.
- Os eventos são repetidos em lotes de no máximo 100 e processados assincronicamente.
  O portal mostra o progresso independente para contatos e mensagens.
- As pastilhas são processadas sequencialmente por importação. As solicitações de contato são programadas
  e respostas de limite de taxa são retentadas, por isso um livro de endereços grande não
  Overwhelm Chatwoot.
- As mensagens são idempotentes pelo seu ID de Meta mensagem original. Repetindo um
  a importação não cria outra cópia.
- A hora da mensagem original é enviada para Chatwoot como
  `external_created_at` e retido em
  `content_attributes.external_created_at`. Chatwoot Cloud ainda pode renderizar
  a bolha com seu tempo de importação interna porque sua API pública não
  permitir que o Easyhook sobreponha o banco de dados `created_at` valor.
- Novas conversas criadas pela importação permanecem resolvidas. Historical
  as mensagens contêm `content_attributes.easyhook_history: true`.
- Easyhook suprime toda a entrega de saída daquela Inbox Chatwoot enquanto um
  a importação está ativa. Isto previne bots de agentes e automações avaliadas por
  Chatwoot do envio de respostas históricas para o WhatsApp. Também temporariamente
  Bloqueia as respostas do agente legítimo a partir dessa Inbox até que a importação termine.
- Se a mídia histórica ainda estiver disponível, o Easyhook a liga. Se o Meta ou
  O Easyhook já não tem o arquivo, a mensagem de texto e o calendário original são
  importado sem o anexo em vez de deixar cair a mensagem.

A API pública do Chatwoot não expõe uma bandeira universal que desativa todos
avaliação de automação interna durante a criação de mensagens. Easyhook conseqüentemente
garante supressão de transporte, não que uma automação Chatwoot irá produzir
nenhuma atividade interna. Uma importação direta da base de dados seria necessária para alterar
Os timestamps internos do Chatwoot ou ignoram o seu oleoduto de eventos internos e não é
utilizado porque funcionaria apenas com instalações auto-hospedadas.

## n8n Nó comunitário

Easyhook verificou nós n8n:

```text
n8n-nodes-easyhook
```

Em n8n, adicione um nó e procure por **Easyhook**. Os nós verificados aparecem
diretamente na pesquisa de nó. Instalações auto- hospedadas que desabilitam
os nós da comunidade devem ativá-los antes que o Easyhook apareça.

Configuração da credencial:

| Campo | Valor |
| --- | --- |
| Chave da API | Sua chave de API Easyhook, por exemplo `eh_live_xxx`. |

O teste de credencial chama `GET /v1/me`, por isso só verifica se a chave de API é válida e pode identificar a organização.

Nós disponíveis:

| Nó | Objetivo |
| --- | --- |
| `Easyhook` | Envia mensagens, controla conversas, lida com ações somente por email, envia modelos/Flows do WhatsApp, gerencia mídia de organização, baixa mídia de entrada privada e cancela mensagens agendadas. |
| `Easyhook Trigger` | Recebe entregas do Webhook Easyhook. A ativação do fluxo de trabalho registra a URL de produção n8n automaticamente através `/v1/webhooks`. |

Principal `Easyhook` operações:

| Recurso | Operação | Endpoint da API usado |
| --- | --- | --- |
| ação da Mensagem | Enviar o Texto | `POST /v1/messages/text` |
| ação da Mensagem | Enviar texto + entrega humanizada | `POST /v1/messages/humanized-text` |
| Controle de mensagens | Marcar como Lido | `POST /v1/messages/read` |
| Controle de mensagens | Responder | `POST /v1/messages/reply` |
| Controle de mensagens | Mostrar a Digitação | `POST /v1/messages/typing` |
| Controle de mensagens | Reagir | `POST /v1/messages/reaction` |
| ação da Mensagem | Enviar mídia | `POST /v1/messages/media` |
| WhatsApp Only | Enviar Modelo | `POST /v1/messages/template` |
| WhatsApp Only | Enviar Fluxo | `POST /v1/messages/flow` |
| WhatsApp Only | Gravar o Opt-In ou Opt-Out | `POST /v1/consent` |
| Mídia | Enviar | `POST /v1/media` |
| Mídia | Lista | `GET /v1/media` |
| Mídia | Baixar | `GET /v1/media/{id}/download` |
| Mídia | Apagar | `DELETE /v1/media/{id}` |
| Modelo | Lista | `GET /v1/templates?from=...` |
| Modelo | Sincronizar de Meta | `POST /v1/templates/sync` |
| Cancelar a Mensagem Agendada | Cancelar | `DELETE /v1/scheduled-messages/{id}` |
| Apenas E-mail | Enviar / Responder | `POST /v1/messages/email` |
| Apenas E-mail | Avançar | `POST /v1/messages/email/forward` |
| Apenas E-mail | Arquivo / Marcar Leitura / Marcar Não- Lida | `POST /v1/email/actions` |

O envio do modelo em n8n é padrão para a entrada manual porque é o caminho mais confiável em ambientes n8n auto- hospedados:

1. Escolher `Resource: WhatsApp Only`.
2. Escolher `Operation: Send Template`.
3. Manter `Template Source: Enter Manually`.
4. Introduza o nome do modelo aprovado e o código do idioma.
5. Adicionar as variáveis Cabeçalho, Corpo ou Botão na ordem do modelo. `{{1}}`, linha 2 preenche `{{2}}`E assim por diante.

Se sua instância n8n pode carregar opções dinâmicas de Easyhook, mude `Template Source` para `Choose From Easyhook` para selecionar modelos e variáveis de Easyhook diretamente.

Para webhooks em n8n:

1. Adicionar `Easyhook Trigger` como o primeiro nó de fluxo de trabalho.
2. Selecione a credencial da API Easyhook.
3. Selecione um provedor; o evento e o escopo listam automaticamente.
4. Selecione um escopo e, quando aplicável, escolha uma conta WABA, número, Messenger Page ou Instagram conectada na lista filtrada.
5. Activar o fluxo de trabalho.

O nó registra e remove a assinatura automaticamente. Ele armazena o segredo HMAC de uma vez em n8n dados de fluxo de trabalho privado e valida cada entrega. Não é necessária nenhuma configuração secreta do portal ou manual.

Quando um webhook contém `message.media.url`, a URL é intencionalmente privada.
Adicionar um `Easyhook` nó com `Resource: Media` e `Operation: Download`, mapa
`{{$json.message.media.url}}` em `Media URL`, e escolher o binário de saída
campo (por omissão: `data`). O nó autentica o download com o mesmo
Credencial de Easyhook e emite dados binários n8n para arquivo, armazenamento ou
Nodos de IA.

Para uma importação do histórico do WhatsApp Business App, escolha `Provider: WhatsApp` e `Event: Coexistence history (history.*)`, em seguida, selecione a organização, WABA, ou escopo de número e ativar o fluxo de trabalho **antes** conectando o telefone de coexistência ou solicitando sincronização. `message.*` não inclui importações históricas. Easyhook envia lotes de no máximo 100 eventos; o gatilho n8n expande cada lote em um item de saída por evento normalizado.

Para WhatsApp, Easyhook expõe uma hierarquia consistente no portal, API webhooks e n8n: **Organização → WABA → Número**. Meta Business Portfólios permanecem metadados internos de integração. Modelos, Fluxos e configuração de consentimento pertencem a uma WABA; mídia reutilizável pertence à organização Easyhook e pode ser enviada através de qualquer canal conectado compatível; conversas e janelas cliente-serviço pertencem a um número; contatos e evidência de consentimento são isolados entre WABAs.

Não enviar `tenant_id` para os terminais públicos. Easyhook resolve o organização a partir da chave de API. Se um pedido incluir `tenant_id`, a API retorna:

```json
{ "error": "tenant_id_not_allowed" }
```

## Carteira e faturamento

O Easyhook é baseado no uso. Não há necessidade de plano de plataforma mensal. Os números de Telecom são uma exceção explícita: cada número comprado pode ter uma taxa de ativação única, um período de calendário-mês inicial, aluguel recorrente cobrado com antecedência no primeiro dia de meses posteriores, e mensagens calibradas ou uso de voz, conforme documentado em [Telefonia](/telecom).

As carteiras são exploradas pela organização/tenant. Cada organização tem seu próprio saldo, moeda de faturamento, registro de uso, top-ups, taxas de API e encargos de sobrecarga de mídia. Se o mesmo cliente cria várias organizações, cada organização é financiada separadamente. A moeda de faturamento é fixada pelo primeiro top-up financiado e não pode ser misturada enquanto a carteira tem saldo ou histórico pago.

Os clientes pagam Meta diretamente pelas taxas do modelo WhatsApp. A carteira Easyhook só paga pelo uso da plataforma Easyhook.

Facturável em V1:

| Utilização | Taxa |
| --- | --- |
| Chamada de API de cliente público que executa uma operação suportada | `0.01 MXN` ou `0.001 USD` |
| Operação Easyhook Inbox enviada para um provedor (enviar, responder, reação, digitar, ler recibo ou ação de e-mail) | `0.01 MXN` ou `0.001 USD` |
| Transferência de meios de comunicação para além da quota incluída | `3 MXN / GB` ou `0.20 USD / GB` |
| Armazenamento de mídia reutilizável além da quota incluída | `3 MXN / GB / month` ou `0.20 USD / GB / month` |
| Armazenamento de mídia de chat recebido além da quota incluída | `3 MXN / GB / month` ou `0.20 USD / GB / month` |

Não gera cobrança da Easyhook:

- Ações somente de UI do Portal, incluindo pesquisa de Inbox, filtros, navegação, pinos, atualizações em tempo real, gerenciamento de modelo, gerenciamento de fluxo, configuração de consentimento, logs, sincronização de conexão e testes manuais de ** API Probar**.
- Meta webhooks usados internamente para atualizar o estado do Easyhook.
- Recebendo mensagens e cada entrega Easyhook para as assinaturas do cliente webhook, incluindo mensagem, status, modelo, Flow, onboarding, conta e eventos de contato.
- Meta template/cargas de mensagem. Esses ficam entre o cliente e Meta.
- Carregamento de armazenamento de mídia em si.

`Probar API` é gratuito somente pelo fluxo autenticado do portal. O portal exige
uma verificação de uso único do Cloudflare Turnstile, aplica limites de rajada
compartilhados por IP, usuário e organização, e envia à API da Easyhook uma
declaração de curta duração assinada pelo servidor. Copiar a requisição da API
pública para um script não reproduz esses controles: a cobrança normal da API
se aplica. As sessões do portal exigem um novo login após 7 dias. Atualmente,
o portal não possui uma cota diária de operações gratuitas.

A entrega de webhooks ao cliente é gratuita como complemento ao uso da Easyhook,
não como um serviço independente e ilimitado de distribuição de eventos.
Organizações sem saldo na carteira, sem recarga bem-sucedida nos últimos 90 dias
e sem uso cobrado da Easyhook nesse período recebem até 10.000 eventos
**em tempo real** por mês-calendário. Organizações comercialmente ativas não
estão sujeitas a essa cota de avaliação. A sincronização de histórico em
Coexistence e os reenvios explícitos de History não consomem essa cota; continuam
sujeitos aos seus próprios limites de processamento e reenvio. A recepção de
eventos dos provedores e o Inbox da Easyhook continuam funcionando mesmo quando
a cota de entrega de eventos em tempo real ao cliente se esgota.

Incluiu quotas de mídia em V1:

| Contingente | Incluído |
| --- | --- |
| Transferência de mídia | `10 GB / month / tenant` |
| Armazenamento de mídia reutilizável | `1 GB / organization` |
| Armazenamento de mídia de chat recebido | `100 GB / tenant` |
| Retenção de mídia de chat recebida | `6 months` |

A transferência de mídia inclui downloads de API do cliente e mídia reutilizável hospedada em Easyhook servia para provedores quando um cliente envia `media_name`. Mídia de chat recebida é armazenada para até `6 months`; armazenamento está incluído até que o organização tem mais de `100 GB` de mídia ativa recebida. Mídia reutilizável não expira; o armazenamento está incluído até `1 GB` por organização. A mídia de modelo é gerenciada separadamente.

Os excessos de mídia são cobrados mensalmente da carteira da organização por um trabalho programado do cron Supabase. O cron é executado no primeiro dia de cada mês e fatura no mês anterior usando a função de faturamento do administrador idempotente:

```sql
select public.easyhook_bill_media_overages('2026-07-01');
```

A data identifica o mês de faturamento. Executando a função duas vezes para o mesmo mês não cobra o mesmo organização/categoria porque cada carga usa uma chave de idempotência estável.

Se a carteira não tiver saldo suficiente, as chamadas de API públicas passíveis de cobrança retornam:

```json
{
  "error": "insufficient_balance",
  "billing": {
    "amount_cents": 1,
    "balance_after_cents": 0,
    "currency": "MXN"
  }
}
```

Utilização `Idempotency-Key` no POST/DELETE solicita que seu sistema possa tentar novamente. Easyhook usa esta chave para evitar o carregamento duplo da mesma operação API. Para mensagens de texto, mídia e modelo agendadas, ele também impede a criação de uma segunda mensagem agendada e retorna o registro original com `idempotent_replay: true`.

```http
Idempotency-Key: order-123-send-confirmation
```

Em caso de não `Idempotency-Key` é enviado, Easyhook trata cada solicitação HTTP como uma operação billable separada.

As carteiras USD usam um acumulador fraccionado porque uma operação API custa `0.001 USD`, um décimo de um centavo. Easyhook deduz um centavo de USD a cada dez operações de faturamento, preservando os preços exatos do nível de operação. Um saldo zero USD bloqueia a primeira nova operação de faturamento; ele não concede chamadas fracionárias no crédito.

MXN manual ou USD top-ups devem ser realizados com o administrador local Easyhook CLI.
Resolve a referência da organização pública, verifica a carteira fixa
moeda, requer uma referência de pagamento e usa a carteira auditada, idempotent
função de crédito:

```bash
easyhook recharge 500 MXN to EH-130FF0EC \
  --reference "SPEI-20260729-001"
```

Executar o mesmo comando com `--dry-run` para validar a organização, projeto,
moeda e saldo resultante sem escrever. Configuração e detalhes de segurança
documentado no livro interno de administração da carteira. Os administradores devem
não editar `wallets.balance_cents` diretamente.

## Índice de endpoints

Endpoints recomendados da API do cliente:

| Método | Endpoint | Escopo da aplicação | Uso |
| --- | --- | --- | --- |
| `GET` | `/v1/me` | qualquer chave válida | Validar uma chave de API e inspecionar o seu organização / scopes. Útil para n8n testes credenciais. |
| `GET` | `/v1/senders` | qualquer chave válida | Listar os identificadores de remetentes nativos do fornecedor. Use `account_id` como `from`. |
| `GET` | `/v1/senders/{account_id}/health` | qualquer chave válida | Leia a saúde normalizada de um remetente proprietário sem expor credenciais de provedor. |
| `DELETE` | `/v1/senders/{account_id}` | `onboarding:write` | Desconectar um canal proprietário do locatário pelo seu identificador de remetente nativo do fornecedor. `messages:write` as chaves permanecem compatíveis. |
| `GET` | `/v1/conversations?from=...` | `messages:read` | Liste conversas recentes do WhatsApp para um remetente proprietário. `messages:write` as chaves permanecem compatíveis. |
| `GET` | `/v1/conversations/{contact}/messages?from=...` | `messages:read` | Leia mensagens recentes de entrada e saída do WhatsApp com um contato. `messages:write` as chaves permanecem compatíveis. |
| `GET` | `/v1/conversations/{contact}/messages/wait?from=...` | `messages:read` | Aguarde a próxima mensagem WhatsApp de entrada de um contato. Destinado a conversas limitadas MCP/agente. |
| `POST` | `/v1/messages/text` | `messages:write` | Endpoint de texto canônico para WhatsApp, Telefonia/SMS, Messenger, Instagram, Telegram, Mercado Libre e TikTok. Enviar `channel` apenas quando `from` é ambíguo. |
| `POST` | `/v1/messages/quick-replies` | `messages:write` | Envie um prompt de texto com 1-13 botões de resposta rápida através do Messenger ou Instagram. |
| `POST` | `/v1/messages/interactive` | `messages:write` | Envie os botões de resposta ou URL suportados através do WhatsApp, Messenger, Instagram, Telegram ou TikTok Business Messaging. TikTok aceita apenas os botões de resposta. |
| `POST` | `/v1/messages/email` | `messages:write` | Envie um novo e-mail ou resposta através do Gmail, Outlook ou uma conta IMAP/SMTP conectada. |
| `POST` | `/v1/messages/humanized-text` | `messages:write` | Texto humanizado para WhatsApp, Messenger, Instagram e Telegram. Os controles de presença são o melhor esforço e nunca substituem o envio real. |
| `POST` | `/v1/messages/read` | `messages:write` | Mark lê no WhatsApp, Messenger, Instagram ou TikTok Business Messaging. |
| `POST` | `/v1/messages/reply` | `messages:write` | Resposta contextual no WhatsApp, Messenger, Instagram, Telegram ou TikTok Business Messaging. |
| `POST` | `/v1/messages/typing` | `messages:write` | Mostrar digitação no WhatsApp, Messenger, Instagram, Telegram ou TikTok Business Messaging. |
| `POST` | `/v1/messages/reaction` | `messages:write` | Adicione ou remova uma reação no WhatsApp ou Telegram. |
| `POST` | `/v1/messages/media` | `messages:write` | Envie mídia compatível através do WhatsApp, Telefonia/MMS, Messenger, Instagram, Telegram ou TikTok Business Messaging. TikTok atualmente suporta imagens; MMS agendado ainda não é suportado. |
| `GET` | `/v1/telecom/capabilities` | `telephony:read` | Descubra os recursos normalizados de Telnyx e WhatsApp Chamando. |
| `GET` | `/v1/call-routing?phone_id={id}` | `telephony:read` | Leia a política de distribuição de chamadas de um número Telnyx proprietário; adicione `channel=whatsapp` para um telefone WhatsApp. |
| `PATCH` | `/v1/call-routing?phone_id={id}` | `telephony:write` | Configure os destinos ordenados para um número. O WhatsApp aceita apenas o portal/aplicativo; o Telnyx também aceita uma fase de telefone externo agrupada. |
| `POST` | `/v1/call-endpoints` | `telephony:write` | Registre-se ou batimento cardíaco em uma web, celular, API ou SIP respondendo ao endpoint. |
| `POST` | `/v1/call-endpoints/{id}/token` | `telephony:write` | Emitir um WebRTC JWT de curta duração para um endpoint existente. |
| `POST` | `/v1/whatsapp/calling/permissions` | `telephony:write` | Envie o pedido explícito de permissão de chamada iniciado pelo negócio da Meta. |
| `POST` | `/v1/calls` | `telephony:write` | Iniciar uma chamada pré-paga de telefonia ou WhatsApp com duração máxima obrigatória; `handler: "ai"` inicia uma chamada autorizada com o ElevenLabs. |
| `POST` | `/v1/consent` | `telephony:write` ou `messages:write` | Record locatário-escoberto voz opt-in/opt-out evidência (ou consentimento de mensagens existente). |
| `GET` | `/v1/calls/{id}` | `telephony:read` | Leia os detalhes normalizados do estado, duração, atribuição e falha. |
| `GET` | `/v1/calls/{id}/signaling` | `telephony:read` | Leia a resposta WhatsApp SDP quando estiver disponível. |
| `POST` | `/v1/calls/{id}/actions/claim` | `telephony:write` | Atomaticamente reivindicar uma chamada oferecida; exatamente um ponto final ganha. |
| `POST` | `/v1/calls/{id}/actions/pre-accept` | `telephony:write` | Pré-aceitar uma chamada WhatsApp com uma resposta SDP. |
| `POST` | `/v1/calls/{id}/actions/accept` | `telephony:write` | Aceite uma chamada WhatsApp reivindicada. |
| `POST` | `/v1/calls/{id}/actions/decline` | `telephony:write` | Rejeite este ponto final e dirija- se para o próximo agente disponível. |
| `POST` | `/v1/calls/{id}/actions/hangup` | `telephony:write` | Terminar através do fornecedor subjacente. |
| `POST` | `/v1/messages/template` | `messages:write` | Envie ou programe modelos aprovados do WhatsApp. |
| `POST` | `/v1/messages/flow` | `messages:write` | Envie um WhatsApp Flow publicado dentro da janela de 24 horas. |
| `GET` | `/v1/scheduled-messages/{id}` | `messages:read` | Reconcile uma mensagem agendada, seu WAMID, falha na execução e status Meta mais recente. Existing `messages:write` as chaves permanecem compatíveis. |
| `DELETE` | `/v1/scheduled-messages/{id}` | `messages:write` | Cancelar uma mensagem agendada que não tenha iniciado o processamento. |
| `POST` | `/v1/media` | `media:write` | Envie mídia reutilizável permanente para a organização API-key. |
| `GET` | `/v1/media` | `media:read` | Liste a biblioteca de mídia reutilizável da organização. |
| `GET` | `/v1/media/{id}/download` | `media:read` | Baixe bytes de mídia hospedados por Easyhook para CRMs/inboxes do cliente. |
| `DELETE` | `/v1/media/{id}` | `media:write` | Apagar a mídia reutilizável. |
| `GET` | `/v1/templates?from=...` | `templates:read` | Listar os modelos WhatsApp para o WABA por trás `from`. |
| `POST` | `/v1/templates/sync` | `templates:write` | Sincronizar modelos do Meta para o Easyhook. |
| `POST` | `/v1/templates/classify` | `templates:write` | Devolver conselhos de categoria sem bloqueio sem enviar ao Meta. |
| `POST` | `/v1/templates` | `templates:write` | Crie um modelo WhatsApp no Meta e armazene-o localmente. |
| `POST` | `/v1/templates/media` | `templates:write` | Envie imagens, vídeo ou mídia de cabeçalho do documento e obtenha o identificador de criação Meta. |
| `POST` | `/v1/templates/delete` | `templates:write` | Excluir um modelo do WhatsApp no Meta e localmente. |
| `GET` | `/v1/flows?from=...` | `flows:read` | Listar os fluxos de WhatsApp para o WABA por trás `from`. |
| `POST` | `/v1/flows/sync` | `flows:write` | Sincronize os Fluxos do WhatsApp do Meta. |
| `POST` | `/v1/flows` | `flows:write` | Crie um fluxo WhatsApp. |
| `POST` | `/v1/flows/{id}/publish` | `flows:write` | Publique um fluxo do WhatsApp. |
| `DELETE` | `/v1/flows/{id}` | `flows:write` | Excluir um fluxo do WhatsApp. |
| `GET` | `/v1/flows/{id}/submissions?from=...` | `flows:read` | Lista armazenada Submissões de fluxo. |
| `GET` | `/v1/consent/config?from=...` | `flows:read` | Leia a configuração do consentimento do WABA. Também aceita `waba_id` ou `phone_id`. |
| `PATCH` | `/v1/consent/config` | `flows:write` | Atualizar cópia de consentimento WABA e palavras-chave personalizadas. Aceita `from`, `phone_id`, ou `waba_id`. |
| `POST` | `/v1/consent/enable` | `flows:write` | Criar / publicar padrão opt-in e opt-out Fluxos e habilitar o consentimento WABA. Aceita `from`, `phone_id`, ou `waba_id`. |
| `POST` | `/v1/consent` | `messages:write` | Registro de evidência de consentimento, ou enviar o padrão opt-in/opt-out Flow quando `mode` é fornecido. |
| `GET` | `/v1/consent/status?from=...&contact=...` | `messages:read` ou legado `messages:write` | Leia o serviço e o consentimento de marketing para um contato na WABA por trás `from`. |
| `PUT` | `/v1/contacts` | `messages:write` | Atualizar os nomes de contato local do Easyhook para o WABA por trás `from`. |
| `POST` | `/v1/onboarding/sessions` | `onboarding:write` | Crie uma sessão de onboard de canal hospedado pertencente ao organização da chave da API. |
| `POST` | `/v1/onboarding/sessions/send` | `onboarding:write` | Crie uma sessão de onboard e envie sua URL de um número WhatsApp autorizado. |
| `GET` | `/v1/onboarding/sessions/{token}` | token de sessão opaca | Leia ou abra uma sessão de onboard hosted. |
| `POST` | `/v1/onboarding/sessions/{token}/complete` | token de sessão opaca | Completar o registro incorporado do WhatsApp. |
| `POST` | `/v1/onboarding/sessions/{token}/connect` | token de sessão opaca | Complete uma conexão direta do canal hospedado. |
| `POST` | `/v1/onboarding/sessions/{token}/oauth/start` | token de sessão opaca | Iniciar um fluxo de OAuth do provedor hospedado. |
| `GET` | `/v1/webhooks` | qualquer chave válida | Listar assinaturas webhook de propriedade da organização API-chave. |
| `GET` | `/v1/webhooks/options?provider=...&scope_type=...` | qualquer chave válida | Descubra provedores compatíveis, filtros de eventos, escopos e identificadores de remetentes públicos. |
| `POST` | `/v1/webhooks` | qualquer chave válida | Crie uma assinatura webhook; o seu segredo HMAC/auth é devolvido uma vez. |
| `GET` | `/v1/webhooks/{id}` | qualquer chave válida | Leia uma assinatura webhook própria sem expor o seu segredo. |
| `PATCH` | `/v1/webhooks/{id}` | qualquer chave válida | Substituir apenas o subscrito `events`; URL, secreto, autenticação, provedores e escopo permanecem inalterados. |
| `DELETE` | `/v1/webhooks/{id}` | qualquer chave válida | Remova uma assinatura webhook própria. |
| `POST` | `/v1/webhooks/{id}/replay` | qualquer chave válida | Repetir os lotes de entrega falhou, opcionalmente filtrados por `sync_id`. |
| `POST` | `/v1/webhooks/{id}/history-replays` | qualquer chave válida | Reenviar mensagens ou contatos armazenados para `phone_id` usando `replay_type`. |
| `GET` | `/v1/webhooks/{id}/history-replays/{replay_id}` | qualquer chave válida | Leia o progresso persistente da repetição do histórico. |
| `POST` | `/v1/messages/channel/text` | `messages:write` | Alias de compatibilidade desatualizado; novas integrações usam `/v1/messages/text`. |
| `POST` | `/v1/messages/sms` | `messages:write` | Alias de compatibilidade desatualizado para telefonia; novas integrações usam `/v1/messages/text` com `channel: "sms"` quando necessário. |
| `POST` | `/v1/messages/channel/media` | `messages:write` | Envie Messenger, Instagram, Telegram ou mídia TikTok por referência de provedor compatível ou link público. |
| `POST` | `/v1/messages/channel/media/upload` | `messages:write` | Envie mídia para o Easyhook temporariamente e envie-o através do Messenger ou Instagram. |

Endpoints Portal/admin existem para onboarding, gerenciamento de API-chave, gerenciamento de webhook e ingestão Meta webhook. Eles estão listados perto do final deste documento para que os clientes possam reconhecê-los, mas novas integrações de produto devem usar os endpoints recomendados acima.

Utilização `POST /v1/messages/reaction` com `from`, `to`, `message_id`, e `emoji`Um vazio `emoji` remove a reação actual.

## Respostas rápidas do Messenger e do Instagram

Easyhook expõe o contrato de resposta rápida de texto comum suportado pelo Messenger
e Instagram. `from` é o ID da conta do Page ou do Instagram conectado, e `to`
é o identificador de contato com o fornecedor recebido no Easyhook webhooks.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/quick-replies \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "17841400000000001",
    "to": "17841400000000002",
    "body": "Como podemos ajudar?",
    "quick_replies": [
      { "title": "Ventas", "payload": "sales" },
      { "title": "Soporte", "payload": "support" }
    ]
  }'
```

Regras:

- Enviar entre 1 e 13 respostas.
- `title` é visível para o contato e aceita, no máximo, 20 caracteres.
- `payload` é um valor estável definido pela aplicativo e aceita no máximo 1.000
  personagens.
- Apenas as respostas rápidas de texto são normalizadas em ambos os provedores.
  as variantes de telefone, e-mail e imagem não são intencionalmente parte deste endpoint.
- As respostas rápidas do Instagram não estão disponíveis na experiência do desktop.

Quando o contato escolhe uma opção, assine `message.quick_reply`:

```json
{
  "type": "message.received",
  "channel": "instagram",
  "message": {
    "type": "quick_reply",
    "text": "Ventas",
    "quick_reply": {
      "title": "Ventas",
      "payload": "sales"
    }
  }
}
```

Automatização da rota por `message.quick_reply.payload`; Utilização `message.text` ou
`message.quick_reply.title` apenas conforme o rótulo mostrado à pessoa.

## Botões Interativos Multicanal

Use um contrato para botões de conversação no WhatsApp, Messenger, Instagram,
e Telegram. Esta operação é tráfego de conversação de forma livre, não um WhatsApp
modelo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/interactive \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "123456789012345",
    "to": "15550100002",
    "body": "O que você deseja fazer?",
    "buttons": [
      { "type": "reply", "title": "Agendar", "payload": "schedule" },
      { "type": "reply", "title": "Hablar con alguien", "payload": "agent" }
    ]
  }'
```

Para abrir uma página como um mapa, use uma URL HTTPS pública:

```json
{
  "type": "url",
  "title": "Como chegar",
  "url": "https://example.com/map"
}
```

Regras comuns:

- `buttons` contém 1–3 itens e cada `title` tem no máximo 20 caracteres.
- `reply` requer uma estabilidade `payload` No máximo 64 bytes UTF-8.
- `url` requer uma URL HTTPS pública.
- O WhatsApp requer uma janela aberta de serviço ao cliente.
  modelo aprovado.
- WhatsApp aceita até três `reply` botões ou um `url` botão; ele
  não é possível misturar ambos os tipos na mesma mensagem. Easyhook rejeita essa combinação
  antes de contactar o Meta.
- Messenger, Instagram e Telegram podem misturar os botões de resposta e URL.
- Os cliques de URL não produzem um webhook de seleção. As seleções de resposta são
  normalizado como `message.quick_reply`.
- Os mais velhos `/v1/messages/quick-replies` endpoint permanece disponível para
  Menus Messenger e Instagram com até 13 opções de resposta temporária.

## Gmail

O Gmail é representado como um canal Easyhook normal. A chave de API da organização
seleciona a organização e `from` deve ser o endereço Gmail exacto ligado.
E-mail de entrada é armazenado na Inbox compartilhada e entregue através do cliente
Webhooks como `message.received`. Mensagens enviadas do Gmail fora Easyhook são
armazenados como eventos de saída sem criar uma segunda conversa com o cliente.

Enviar um novo E-mail de texto simples:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/email \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "soporte@example.com",
    "to": "cliente@exemplo.net",
    "subject": "Seguimiento",
    "body": "Olá, estamos acompanhando sua solicitação."
  }'
```

Utilização `html` quando for necessário um E-mail rico. `body` e `html`
cria uma mensagem multiparte com um texto simples:

```json
{
  "from": "soporte@example.com",
  "to": "cliente@exemplo.net",
  "subject": "Sua solicitação está pronta",
  "body": "Sua solicitação está pronta.",
  "html": "<p>Tu solicitud está <strong>lista</strong>.</p>"
}
```

Responder dentro de um tópico existente usando o normalizado `message.id` recebido em
o webhook de entrada:

```json
{
  "from": "soporte@example.com",
  "to": "cliente@exemplo.net",
  "subject": "Re: Seguimiento",
  "body": "Agradecemos pela confirmação.",
  "reply_to_message_id": "provider-message-id"
}
```

`reply_to_message_id` é o normalizado `message.id` do webhook de entrada.
O Easyhook usa-o para resolver a operação de resposta específica do fornecedor.
as integrações não devem enviar `thread_id`, `in_reply_to`, ou `references`; aqueles
os campos permanecem controles avançados opcionais para chamadas que já possuem o
Os valores do prestador.

Os campos normalizados da mensagem do Gmail são:

| Campo | Designação das mercadorias |
| --- | --- |
| `message.text` | Corpo de texto simples ou um recurso de texto seguro derivado do HTML. |
| `message.subject` | Assunto de e-mail. |
| `message.html` | Corpo HTML original quando presente. Trate-o como conteúdo não confiável. |
| `message.thread_id` | ID do tópico Gmail usado para respostas. |
| `message.message_id_header` | RFC Message- ID usado por `in_reply_to`. |
| `message.in_reply_to` | O cabeçalho de resposta RFC da mensagem recebida. |
| `message.references` | Cadeia de referências RFC. |
| `message.attachments` | Metadados de anexos privados com `media_asset_id`, nome do arquivo, tipo MIME, e tamanho. |
| `message.is_read` | O fornecedor leu o estado. |
| `message.label_ids` | Rótulos do Gmail usados para filtros de Inbox. |
| `message.inference_classification` | Outlook `focused` ou `other`. |
| `message.flags` | Parâmetros de IMAP, tais como `\Seen` e `\Flagged`. |

`POST /v1/messages/email` aceita até 10 anexos e 20 MB decodificados em
total. Os formatos suportados são JPEG, PNG, WebP, MP4, 3GPP, AAC, M4A, MP3, AMR,
OGG, PDF, texto simples, Word, Excel e PowerPoint:

```json
{
  "attachments": [
    {
      "filename": "report.pdf",
      "content_type": "application/pdf",
      "content_base64": "JVBERi0xLjc..."
    }
  ]
}
```

Rotas normalizadas adicionais:

| Método | Ponto final | Objetivo |
| --- | --- | --- |
| `POST` | `/v1/messages/email/forward` | Avançar `message_id` para outro endereço com um opcional `note`. |
| `POST` | `/v1/email/actions` | `mark_read`, `mark_unread`, ou `archive` Uma mensagem. |
| `POST` | `/v1/email/drafts` | Criar um rascunho. |
| `PUT` | `/v1/email/drafts/{draft_id}` | Substitua um rascunho. |
| `POST` | `/v1/email/drafts/{draft_id}/send` | Enviem um rascunho. |

Google envia alterações do Gmail através do Pub/Sub. Easyhook reconhece o Pub/Sub
request imediatamente, resolve alterações com `users.history.list`, deduplicados
mensagens pelo ID da mensagem do Gmail, e avança o cursor de histórico armazenado apenas depois
processamento bem sucedido. Gmail relógios expiram, então Easyhook programa um automático
renovação 24 horas antes de cada expiração.
`POST /v1/channels/gmail/watch/renew-all` endpoint permanece disponível para
operações e recuperação.

### Configuração do Google Cloud

1. Activar a API do Gmail e a API Pub/Sub.
2. Configurar o URI de redirecionamento OAuth como
   `https://api.easyhook.dev/v1/channels/gmail/oauth/callback`.
3. Criar um tópico Pub/Sub e conceder
   `gmail-api-push@system.gserviceaccount.com` o papel Pub/Sub Publisher sobre
   Esse tópico.
4. Criar uma assinatura push cuja URL é
   `https://api.easyhook.dev/v1/channels/gmail/webhook?token=YOUR_RANDOM_TOKEN`.
5. Definir `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
   `GOOGLE_OAUTH_STATE_SECRET`, `GMAIL_PUBSUB_TOPIC`, e
   `GMAIL_PUBSUB_VERIFICATION_TOKEN` na infraestrutura.
6. Verifique se as Tarefas da nuvem do Easyhook estão configuradas. Cada Gmail com sucesso
   A ligação programa automaticamente a sua próxima renovação do relógio.

Pedidos do Easyhook `openid`, `userinfo.email`, `userinfo.profile`, e
`gmail.modify`. O escopo restrito do Gmail é usado para receber e-mail, enviar
respostas, preservar threads e manter o estado da mensagem no Easyhook compartilhado
Inbox. Easyhook não usa dados do Gmail para publicidade. O primeiro Gmail
versão suporta texto simples, HTML, anexos, novas mensagens, threaded
respostas, mudanças de estado, encaminhamento e rascunhos.

Desligar um canal do Gmail de **Organização** pára o seu relógio do Gmail,
revoga a subvenção OAuth armazenada e remove a credencial criptografada de
Easyhook.

### Gravação da verificação do Google

Gravar uma captura de tela silencioso contínua com rótulos de tela curtos:

1. Entre em Easyhook e abra **Connect > Gmail**.
2. Clique em **Conecte o Gmail** e mostre a tela de consentimento do Google, incluindo o
   conta e pediu permissão do Gmail.
3. Complete o consentimento e mostre a conta Gmail conectada em Easyhook.
4. Enviar uma mensagem de um endereço externo para a conta Gmail conectada.
5. Mostrar o mesmo remetente, assunto e corpo chegando na Inbox Easyhook.
6. Responder de Easyhook e mostrar a resposta no mesmo tópico no Gmail.
7. Enviar um novo E-mail `POST /v1/messages/email` e mostrar-lhe chegar a
   O destinatário.

Justificação do âmbito restrito sugerida:

> Easyhook é uma API de mensagens multicanal e Inbox compartilhada.
> `gmail.modify` o escopo é necessário para que um proprietário de conta possa conectar o Gmail,
> receber e ler mensagens em Easyhook, enviar novas mensagens e threaded
> respostas, e manter o estado da mensagem. Os dados do Gmail são isolados pela organização,
> criptografado em trânsito e em repouso, e não é usado para publicidade.

## Outlook e IMAP/SMTP

Contas de e-mail do Outlook e genéricos usam o mesmo contrato público que o Gmail.
Conecte o Outlook com Microsoft OAuth ou conecte outro provedor com seu IMAP
e configurações de SMTP. Após a conexão, use o endereço de E-mail exato como `from`:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/email \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "support@company.com",
    "to": "customer@example.net",
    "subject": "Order update",
    "body": "Your order is ready."
  }'
```

O mesmo parâmetro de avaliação aceita `html`, `reply_to_message_id`, `thread_id`,
`in_reply_to`, e `references` para cada provedor de E-mail. Use
`reply_to_message_id` com o webhook de entrada `message.id` para o mais simples
Respostas com rosca. As respostas têm uma forma normalizada:

```json
{
  "ok": true,
  "provider": "outlook",
  "channel_id": "channel-id",
  "message_id": "provider-message-id",
  "thread_id": "provider-thread-id"
}
```

Mensagens recebidas de todos os provedores de E-mail `message.received` com
`message.subject`, `message.text`, opcional `message.html`, cabeçalhos de tópicos,
filtrar metadados e anexos armazenados em privado. O HTML não é confiável
input e deve ser higienizado ou renderizado dentro de uma caixa de areia.

As assinaturas do Outlook são protegidas com um gráfico aleatório da Microsoft
`clientState`, processado assíncrono, e renovado antes de expirar.
Configurar estes segredos da infraestrutura:

- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`
- `MICROSOFT_OAUTH_STATE_SECRET`
- `MICROSOFT_OAUTH_REDIRECT_URI` definir para
  `https://api.easyhook.dev/v1/channels/outlook/oauth/callback`

O aplicativo Microsoft precisa ser delegado `User.Read`, `Mail.ReadWrite`, e
`Mail.Send`, mais `openid`, `profile`, `email`, e `offline_access`.

As credenciais IMAP/SMTP são validadas no momento da ligação e armazenadas no
Cofre secreto encriptado do Easyhook. O Easyhook grava o UID actual da caixa de correio
cursor, em seguida, pesquisa apenas novas mensagens na Inbox. Use TLS, uma senha da aplicativo, ou uma
Credencial SMTP específico do provedor; nunca use uma senha pessoal quando o e-mail
provedor suporta senhas de aplicativo.

A API do cliente envia através do Gmail, Outlook e consumo de IMAP/SMTP
`message.email.send`. Operações do provedor da Inbox Easyhook usar o
equivalente `inbox.*` operação e o mesmo preço por operação. UI-only Inbox
O trabalho não consome saldo de carteira.

Iniciar uma chamada a partir da Inbox não cria uma carga de operação de API separada.
Para chamadas de Telnyx, a quantidade de operadora reservada é finalizada a partir do provedor assinado
os eventos de custo e o reserva não utilizado são devolvidos.
são faturados diretamente pela Meta para WABA do cliente; Easyhook cobra sua
`call.per.minute` taxa de plataforma apenas após a chamada se conectar.
chamada não respondida, portanto, não tem carga chamada Easyhook.

Um pedido de permissão de chamada WhatsApp coloca uma carteira reembolsável em primeiro lugar.
a operação só é cobrada após o Meta aceitar o pedido; uma rejeição do provedor
liberta o reserva completo.

A janela WhatsApp 24 horas cliente-serviço não se aplica a e-mail ou
Telegram. Esses canais podem enviar mensagens a qualquer momento permitido pelo provedor.

## Telegram

Conecte um bot Telegram de **Conectar > Telegram** usando o token criado por
BotPather. Easyhook valida o token, armazena-o no organização criptografado
cofre secreto, e configura um Webhook Telegram protegido pelo Telegram
`X-Telegram-Bot-Api-Secret-Token` Cabeçalho.

Após a conexão, use o endpoint de texto padrão:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "@my_easyhook_bot",
    "to": "123456789",
    "body": "Olá da Easyhook"
  }'
```

Imagens de Telegram, vídeo, áudio e documentos podem ser enviados através
`POST /v1/messages/media` com um público `link`. Recebendo atualizações de Telegram são
normalizado para o mesmo `message.received` contrato utilizado pelos outros canais.
A mídia que recebe atualmente inclui metadados de arquivos do Telegram; arquivo automático
armazenamento e uma URL pública de download Easyhook não fazem parte da primeira versão.

Desligar um canal de Telegram remove seu webhook de Telegram protegido antes
O Easyhook apaga o token de bot criptografado.

## Mensagens do TikTok Business

Conectar TikTok de **Connect > TikTok Mensagens de Negócios**. Easyhook usa
Fluxo de autorização do titular da conta do TikTok. Ele solicita
`message.list.read`, `message.list.send`, e `message.list.manage` em vez de
mensagens, mais `user.info.basic`, `user.account.type`, `user.info.username`,
e `user.info.profile` para identificar a conta de negócio conectada.
solicitar as permissões do anunciante, campanha, pixel, medição ou CTX.

O perfil TikTok seleccionado já deve ser uma ** Conta de Negócios**. Easyhook
verifica o tipo de conta durante o OAuth e retorna
`tiktok_business_account_required` sem armazenar a conexão quando TikTok
relata uma conta pessoal. Para as conexões criadas antes desta validação,
o mesmo erro é devolvido no envio em vez de solicitar incorretamente outro
reconexão. Mude o tipo de conta no TikTok e autorize- o novamente.

TikTok Business Messaging está atualmente indisponível para Contas de Negócios
Registado nos Estados Unidos, no Espaço Económico Europeu, na Suíça ou na
Reino Unido. Easyhook preserva esta restrição de provedor como
`tiktok_business_messaging_region_unsupported`; reconectar a mesma conta
não o resolve. Um negócio não pode iniciar uma nova conversa com o TikTok.
usuário mensagens do negócio, TikTok permite no máximo 10 respostas comerciais durante
as 48 horas seguintes. Easyhook retorna
`tiktok_messaging_window_closed_or_quota_reached` quando o prestador rejeita uma
enviar para esta política.

Use os identificadores nativos do provedor do webhook sem prefixos:

- `account.id` é o TikTok conta de negócios conectado ID aberto e é usado como
  `from`.
- `contact.id` é o identificador de usuário remoto estável. Preservar- o exactamente e
  use- o como `to` para chamadas posteriores.
- `message.thread_id` é o identificador de conversação do provedor. Easyhook também
  aceita- o como `to` para compatibilidade backward e depuração de nível de provedor.
- `message.id` é o ID da mensagem do provedor e a chave de idempotência da mensagem.

O texto padrão, resposta, digitação, leitura, botão de resposta interativo, imagem, e
endpoints de texto programado resolvem TikTok de `from`. Texto recebido, imagem,
eventos de vídeo, botão de resposta, leitura e privacidade usam o mesmo Easyhook normalizado
envelope como outros canais. Mídia armazenada usa um URL privado do Easyhook e deve
ser baixado com a chave de API da organização.

## Conversas e Mensagens Recentes

As leituras de conversação são vigiadas pela chave da API e por números `from`. As respostas públicas contêm números de telefone visíveis para o cliente, IDs de mensagem do provedor, conteúdo normalizado da mensagem, e status de entrega. Eles não expõem IDs de organização, IDs de linha Supabase, referências token, cargas Meta cruas, ou URLs de armazenamento privado.

Novas chaves de API incluem `messages:read`. Chaves criadas antes deste escopo foi introduzido pode usar estes terminais quando eles já têm `messages:write`.

### Listar conversas

```bash
curl "https://api.easyhook.dev/v1/conversations?from=15550100002&limit=20" \
  -H "Authorization: Bearer eh_live_xxx"
```

Parâmetros da consulta:

| Campo | Requerido | Designação das mercadorias |
| --- | --- | --- |
| `from` | Sim. | O remetente do WhatsApp. A formatação é normalizada para dígitos. |
| `limit` | Não | Entre 1 e 100, o padrão é 20. |
| `before` | Não | ISO 8601 `next_cursor` da resposta anterior. |

Resposta:

```json
{
  "from": "15550100002",
  "conversations": [
    {
      "contact": {
        "phone": "15550100003",
        "name": "Ana"
      },
      "last_message": {
        "id": "wamid...",
        "direction": "in",
        "type": "text",
        "text": "Olá",
        "media": null,
        "reaction": null,
        "status": null,
        "source": "webhook",
        "timestamp": "2026-07-18T16:00:00.000Z"
      },
      "message_count": 4,
      "service_window": {
        "open": true,
        "expires_at": "2026-07-19T16:00:00.000Z"
      }
    }
  ],
  "pagination": {
    "next_cursor": null,
    "has_more": false
  }
}
```

`message_count` é o número de mensagens encontradas na janela de resultados digitalizados, não um contador permanente de vida útil.

### Ler uma conversa

```bash
curl "https://api.easyhook.dev/v1/conversations/15550100003/messages?from=15550100002&limit=50" \
  -H "Authorization: Bearer eh_live_xxx"
```

As mensagens são devolvidas mais antigas para as mais novas dentro de cada página, o que permite que um agente ou Inbox processá-las em ordem conversacional.

```json
{
  "from": "15550100002",
  "contact": "15550100003",
  "messages": [
    {
      "id": "wamid...",
      "direction": "in",
      "type": "text",
      "text": "Meu pedido já está pronto?",
      "media": null,
      "reaction": null,
      "status": null,
      "source": "webhook",
      "timestamp": "2026-07-18T16:00:00.000Z"
    },
    {
      "id": "wamid...",
      "direction": "out",
      "type": "text",
      "text": "Sim, já está pronto.",
      "media": null,
      "reaction": null,
      "status": "read",
      "source": "api",
      "timestamp": "2026-07-18T16:01:00.000Z"
    }
  ],
  "pagination": {
    "next_cursor": null,
    "has_more": false
  }
}
```

Possíveis erros:

| Estado | Erro | Significado |
| --- | --- | --- |
| `400` | `missing_required_fields` | `from` ou o contato com o caminho está ausente/inválido. |
| `400` | `invalid_limit` | `limit` está fora do 1-100. |
| `400` | `invalid_before` | `before` não é uma marca de tempo ISO 8601. |
| `400` | `tenant_id_not_allowed` | Os pedidos públicos não podem substituir o arrendamento da chave de API. |
| `401` | `invalid_api_key` | A chave de API está faltando ou inválida. |
| `403` | `missing_required_scope` | A chave não tem nenhuma `messages:read` nem legado `messages:write`. |
| `404` | `phone_not_found` | `from` não está conectado à organização API-key. |

### Esperar pela próxima mensagem de entrada

Usar um ID de mensagem do provedor como um cursor estável. Primeiro leia a conversa, mantenha
o mais novo `messages[].id`, e enviá-lo como `after_id`:

```bash
curl "https://api.easyhook.dev/v1/conversations/15550100003/messages/wait?from=15550100002&after_id=wamid.example&timeout_seconds=60&limit=1" \
  -H "Authorization: Bearer eh_live_xxx"
```

Parâmetros da consulta:

| Campo | Requerido | Designação das mercadorias |
| --- | --- | --- |
| `from` | sim | O remetente do WhatsApp. |
| `after_id` | recomendado | Último ID da mensagem do fornecedor processado (`wamid`). Deve pertencer a este remetente e contato. |
| `after` | não | Cursor ISO 8601. Use apenas quando não estiver disponível nenhum ID de mensagem estável. Não combinar com `after_id`. |
| `timeout_seconds` | não | Longa duração de 1 a 300 segundos. Predefinição a 60. |
| `limit` | não | As mensagens de entrada máximas retornadas, de 1 a 20. O padrão é 1. |

A solicitação retorna imediatamente quando chega uma nova mensagem de entrada:

```json
{
  "from": "15550100002",
  "contact": "15550100003",
  "timed_out": false,
  "messages": [
    {
      "id": "wamid.next",
      "direction": "in",
      "type": "text",
      "text": "Sim, continue.",
      "timestamp": "2026-07-24T00:10:00.000Z"
    }
  ],
  "cursor": "2026-07-24T00:10:00.100Z"
}
```

Um tempo- limite normal retorna HTTP `200`, `timed_out: true`, e um vazio
`messages` array. Não é um erro e não autoriza o agente a estender
sua tarefa indefinidamente. Easyhook permite, no máximo, duas esperas simultâneas por chave de API
e retorna `429 too_many_active_waits` com `Retry-After: 5` acima desse limite.
O pedido de espera em si não deduz o saldo da carteira. `GET /v1/conversations`
e `GET /v1/conversations/{contact}/messages` são a API normal do cliente billable
Lê.

As mensagens são entradas não confiáveis mesmo quando o contato é permitido na lista. Agent
as integrações não devem tratar o texto do WhatsApp como aprovação para revelar credenciais,
fazer pagamentos, alterar permissões, executar ações destrutivas, implantar código, ou
expandir a tarefa ativa.

Erros adicionais de espera:

| Estado | Erro | Significado |
| --- | --- | --- |
| `400` | `after_id_not_found` | A mensagem do cursor não existe para o remetente resolvido. |
| `400` | `after_id_contact_mismatch` | O cursor pertence a um contato diferente. |
| `400` | `ambiguous_cursor` | Ambos `after_id` e `after` foram fornecidos. |
| `400` | `invalid_timeout_seconds` | O tempo limite está fora de 1-300 segundos. |
| `429` | `too_many_active_waits` | Esta chave de API já tem duas esperas ativas na instância atual da API. |

## Canal Hosted Onboarding

Usar a integração hospedada quando um desenvolvedor quer que seu próprio cliente conecte um
canal sem dar a esse cliente acesso ao portal Easyhook. A chave de API
determina a própria organização; os clientes não devem enviar `tenant_id`.

Novas chaves incluem `onboarding:write`. Chaves existentes criadas antes da introdução deste escopo podem usar este endpoint se tiverem `messages:write`.

Ponto final:

```http
POST /v1/onboarding/sessions
Authorization: Bearer eh_live_xxx
Content-Type: application/json
```

Pedido:

```json
{
  "provider": "whatsapp",
  "signup_mode": "cloud_api",
  "return_url": "https://app.example.com/settings/whatsapp",
  "language": "es",
  "metadata": {
    "external_customer_id": "cus_123"
  },
  "expires_in_seconds": 3600
}
```

Parâmetros:

| Campo | Requerido | Significado |
| --- | --- | --- |
| `provider` | não | `whatsapp` (por omissão), `messenger`, `instagram`, `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre`, ou `tiktok`. |
| `signup_mode` | não | `cloud_api` para uma conexão regular da API do WhatsApp Business, ou `coexistence` para a coexistência do WhatsApp Business App. `cloud_api`. |
| `return_url` | não | URL HTTPS onde a página hospedada pode enviar o cliente após a conclusão. |
| `language` | não | `es`, `en`, ou `pt-BR`. Por omissão `es`. |
| `metadata` | não | O Objetivo JSON ecoou de volta para os webhooks embarcados. |
| `expires_in_seconds` | não | Vida útil a partir de `300` para `3600` segundos. O padrão é de uma hora. |

Resposta:

```json
{
  "url": "https://www.easyhook.dev/connect/onboarding/onb_xxx",
  "session": {
    "id": "session_uuid",
    "status": "pending",
    "url": "https://www.easyhook.dev/connect/onboarding/onb_xxx",
    "organization": {
      "name": "appcreatorbr",
      "slug": "appcreatorbr",
      "logo_url": "https://project.supabase.co/storage/v1/object/public/organization-logos/tenant/logo.png"
    },
    "signup_mode": "cloud_api",
    "language": "es",
    "return_url": "https://app.example.com/settings/whatsapp",
    "metadata": {
      "external_customer_id": "cus_123"
    },
    "expires_at": "2026-07-11T18:00:00.000Z",
    "opened_at": null,
    "completed_at": null
  }
}
```

Quando o cliente completa a autorização na página hospedada, Easyhook armazena
o canal sob a organização que possui a chave de API.
`onboarding.*` webhooks para receber eventos de conclusão em seu aplicativo. Sessions
expirar após, no máximo, uma hora e são consumidos após o primeiro sucesso
conclusão. A entrega de conclusão é persistido na caixa de saída do Easyhook e
tentou com as mesmas garantias de indemnidade como eventos de mensagem.
inclui `onboarding.connection` com o canal conectado canônico
`account_id`, nome de exibição, provedor e sua referência de canal Easyhook quando
que o fornecedor utiliza um registro de canal.

Quando a organização tiver carregado um logotipo no portal Easyhook, `organization.logo_url`
está incluído automaticamente e a página hospedada exibe essa marca. Os clientes não enviam ou
sobrepor o logotipo ao criar uma sessão.

A página hospedada do Easyhook usa estes endpoints de suporte de token-scoped internamente:

| Método | Endpoint | Autenticação | Objetivo |
| --- | --- | --- | --- |
| `GET` | `/v1/onboarding/sessions/{token}` | Token de sessão pública opaca | Ler/abrir uma sessão de onboard não expirada. |
| `POST` | `/v1/onboarding/sessions/{token}/complete` | Token de sessão pública opaca | Troque o código de autorização Meta e complete a conexão para a própria organização. |
| `POST` | `/v1/onboarding/sessions/{token}/connect` | Token opaco da sessão pública | Concluir a autorização do Telegram, IMAP/SMTP, Messenger ou Instagram. |
| `POST` | `/v1/onboarding/sessions/{token}/oauth/start` | Token de sessão pública opaca | Iniciar o Gmail, Outlook, Mercado Libre, ou TikTok OAuth. |

Aplicações do cliente normalmente criam uma sessão e redirecionam o usuário para o Easyhook retornado `url`; eles não devem recriar o fluxo de conclusão do token da página hospedada.

Para o Messenger, o Easyhook corresponde à página seleccionada com o activo específico da Meta
`pages_messaging` Grant. Ele não substitui uma página diferente que foi apenas
concedido para comentários ou outra permissão. Se a conclusão retornar
`meta_page_access_unavailable`, Meta autorizou o login de negócios, mas não
expor uma credencial de mensagens utilizável para a Página seleccionada. Confirme que a
mesmo usuário do Facebook tem acesso total a essa página, selecione-o no Facebook Login para
Negócios, subsídios `pages_messaging`, e tente novamente a sessão hospedada. A resposta
inclui a mensagem de diagnóstico da Meta quando disponível.

Para criar a mesma sessão hospedada e enviar imediatamente sua URL a partir de um número WhatsApp de propriedade da organização chave de API, use:

```http
POST /v1/onboarding/sessions/send
```

Aceita `from`, `to`, `signup_mode`, `language`, `return_url`, `metadata`, e `expires_in_seconds`. Easyhook envia uma mensagem fixa localizada que sempre contém o URL gerado. `body` Os valores são rejeitados para evitar o envio de uma mensagem sem o link. O envio de texto em forma livre requer uma janela aberta de 24 horas de serviço ao cliente. A resposta contém tanto a sessão de integração como o resultado da mensagem enviada.

### Exemplos de integração hospedados

O que é isto?

```bash
curl -X POST https://api.easyhook.dev/v1/onboarding/sessions \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "signup_mode": "cloud_api",
    "return_url": "https://app.example.com/settings/whatsapp",
    "metadata": { "external_customer_id": "cus_123" }
  }'
```

TipoScript:

```ts
const res = await fetch("https://api.easyhook.dev/v1/onboarding/sessions", {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.EASYHOOK_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    signup_mode: "cloud_api",
    return_url: "https://app.example.com/settings/whatsapp",
    metadata: { external_customer_id: "cus_123" },
  }),
});

const { url } = await res.json();
```

Python:

```python
import requests

response = requests.post(
    "https://api.easyhook.dev/v1/onboarding/sessions",
    headers={
        "Authorization": f"Bearer {EASYHOOK_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "signup_mode": "cloud_api",
        "return_url": "https://app.example.com/settings/whatsapp",
        "metadata": {"external_customer_id": "cus_123"},
    },
)

url = response.json()["url"]
```

## Identificadores do remetente

Utilização `from` como identificador do remetente visível ao cliente. Não use IDs internos do Supabase nas integrações do cliente a menos que você esteja fazendo uma operação do portal/admin.

O valor canónico é o `account.id` entregues nos webhooks do Easyhook. O mesmo
o valor pode ser passado diretamente como `from`, independentemente do fornecedor. `GET /v1/senders`
retorna cada remetente disponível para a chave de API com seu canônico `account_id`.
Cada remetente também inclui um `health` objeto. Consultar um remetente diretamente com:

```http
GET /v1/senders/{account_id}/health
Authorization: Bearer eh_live_...
```

`health.status` é `connected`, `unreachable`,
`reauthorization_required`, ou `unknown`. `unreachable` representa um provedor
ou falha de rede que pode ser temporária. `reauthorization_required` significa que a
Credencial ou ativo provedor não é mais utilizável e o cliente deve reconectar
Aquele canal. `checked_at`, `code`, e o higienizado `message` estão incluídos para
diagnóstico; credenciais e tokens de provedor nunca são devolvidos.

Para monitoramento baseado em push, subscreva um webhook do cliente para
`channel.health_changed`Easyhook emite-o apenas quando a saúde normalizada
o estado muda, não depois de cada verificação periódica.

Para desconectar um remetente sem abrir o portal Easyhook, o URL-code que
Valor canónico e chamada:

```http
DELETE /v1/senders/{account_id}
Authorization: Bearer eh_live_...
```

Resposta do exemplo:

```json
{
  "ok": true,
  "provider": "instagram",
  "account_id": "17841400000000001",
  "disconnected": true,
  "secret_removed": true
}
```

A operação é vigiada pelo organização e idempotente. Repetindo-a após o remetente
já foi removido retorna `200` com `already_disconnected: true`.
Easyhook remove seu canal e credenciais armazenados; recursos do lado do provedor e
As contas de negócios não são apagadas.

Esta operação REST é o contrato de automação suportado. Também está disponível
no explorador da API do portal como uma requisição copiável, mas a execução permanece desactivada
ali para evitar um teste destrutivo acidental.

Para WhatsApp, use o ID do Meta Phone Number de `account.id`:

```json
{ "from": "123456789012345" }
```

O número de telefone de negócios conectado permanece aceito por conveniência:

```json
{ "from": "15550100001" }
```

Para Messenger, Instagram e Telegram, use o provedor-nativo `account.id`:

```json
{ "from": "123456789012346" }
```

```json
{ "from": "17841400000000001" }
```

```json
{ "from": "SELLER_ID" }
```

Regras:

- Para números de telefone WhatsApp, sempre incluir o código internacional de chamada de país. Easyhook aceita
  E.164 (`+57 300 000 0000`) e apenas de dígitos (`573000000000`) valores, mais comuns
  formatação com espaços, hífens, pontos, parênteses ou `00`
  prefixo internacional.
- Um receptor WhatsApp também pode ser o BSUID opaco recebido em `contact.user_id`,
  `message.from_user_id`, ou `status.recipient_user_id`. Passagem inalterada em
  Easyhook's `to`; não adicionar `+`, remover a pontuação, ou validá-la como E.164.
  Easyhook envia números de telefone para Meta em `to` e valores BSUID/parente-BSUID em
  Meta's dedicado `recipient` Campo.
- Não enviar números apenas nacionais. Easyhook não adivinha um país porque
  os mesmos dígitos principais podem identificar um código de chamada de país válido diferente.
- A `from` o remetente deve pertencer ao organização que possui a chave de API.
- Os nomes de usuário do Instagram são passados sem um líder `@`. Utilização `example_business`, não `@example_business`.
- Apelidos de legado, tais como `page_<PAGE_ID>`, `ig_<INSTAGRAM_ID>`, e
  `telegram_<BOT_ID>` continuar aceita, mas novas integrações devem mapear
  `account.id` diretamente.
- Se o locatário da chave de API não possui o remetente, o Easyhook retorna
  `channel_or_phone_not_found` ou `phone_not_found` sem expor outra
  Dados da organização.
- Legado `phone_id`, `waba_id`, e `channel_id` inputs de estilo ainda são aceitos quando documentados para compatibilidade interna/para trás, mas exemplos de clientes externos devem usar `from`.
- México: `+52 55 0000 0001`, `525500000001`, `+52 1 55 0000
  0001`, and `5215500000001` resolvem a mesma identidade do WhatsApp.
- Argentina: entrada móvel comum, como `+54 11 15 2345 6789` é normalizado
  à sua identidade móvel internacional (`5491100000000`).
- O mesmo analisador abrange os países e territórios NANP e o resto do latim
  América; nenhum padrão específico do país é aplicado.

Exemplos aceitos para o WhatsApp:

```json
{ "from": "+57 300 123 4567", "to": "00 54 9 11 2345-6789" }
```

```json
{ "from": "5511000000000", "to": "+56 9 0000 0000" }
```

## Janela de Serviço ao Cliente

Mensagens de forma livre (`text` e sessão `media`) são permitidos apenas dentro da janela de serviço ao cliente 24 horas WhatsApp.

Se a janela estiver fechada, o Easyhook retorna:

```json
{ "error": "customer_service_window_closed", "allowed_message_type": "template" }
```

Se o Easyhook não conseguir encontrar um contato correspondente ou um evento de entrada recente para o `to` valor, o mesmo erro inclui uma razão diagnóstica:

```json
{
  "error": "customer_service_window_closed",
  "allowed_message_type": "template",
  "reason": "recipient_not_found_or_no_recent_inbound_message",
  "hint": "Check the recipient country code or WhatsApp ID. Free-form text/media requires an inbound message in the last 24 hours; otherwise send an approved template."
}
```

Os modelos podem ser enviados para fora da janela de 24 horas quando o modelo é aprovado e os requisitos de opt-in são cumpridos.

### Janela gratuita de 72 horas do ponto de entrada

O WhatsApp pode abrir uma janela de 72 horas de ponto de entrada livre quando um cliente inicia a conversa a partir de um anúncio Click-to-WhatsApp elegível ou chamada à ação do Facebook Page e as respostas de negócios dentro do tempo necessário da Meta.

Esta janela é separada da janela de serviço ao cliente 24 horas:

- A janela de 24 horas controla se texto, mídia, mensagens interativas e Fluxos de forma livre podem ser enviados.
- A janela do ponto de entrada livre de 72 horas afeta o preço Meta. Ele não estende permissões de envio de formulário livre.
- Após as primeiras 24 horas, Easyhook continua a exigir um modelo aprovado e consentimento válido, mesmo quando a janela de ponto de entrada livre ainda está ativa.
- O Easyhook não abre a janela de 72 horas do encaminhamento de entrada sozinho. Ele espera por um webhook de meta- estado. Ele usa `conversation.expiration_timestamp` quando fornecido, e também suporta webhooks de preços atuais por mensagem identificados por `pricing.type = free_entry_point`.

Meta-referências oficiais: [Mensagens objeto webhook e contexto de referência](https://www.postman.com/meta/whatsapp-business-platform/folder/1dtuocp/messages-object) e [revogação do estado do ponto de entrada livre](https://www.postman.com/meta/whatsapp-business-platform/request/85iyhv5/status-message-sent-business-reply-to-user).

Quando um envio em forma livre é rejeitado enquanto esta janela de preços existe, a resposta inclui:

```json
{
  "error": "customer_service_window_closed",
  "allowed_message_type": "template",
  "window_expires_at": "2026-07-11T10:00:00.000Z",
  "free_entry_point": {
    "active": true,
    "expires_at": "2026-07-13T10:01:00.000Z",
    "conversation_id": "conversation_123",
    "note": "This window affects Meta pricing only. Approved templates are still required outside the 24-hour customer service window."
  }
}
```

## Entrega agendada

Os endpoints de envio da mensagem aceitam um opcional `at` campo:

- `POST /v1/messages/text`
- `POST /v1/messages/media`
- `POST /v1/messages/template`

`at` deve ser uma data/hora ISO 8601. Se incluir `Z` ou um offset, Easyhook respeita esse fuso horário. Se nenhum fuso horário estiver incluído, Easyhook trata o valor como UTC.

Exemplos:

```json
{ "at": "2026-07-02T18:30:00-06:00" }
```

```json
{ "at": "2026-07-03T00:30:00Z" }
```

```json
{ "at": "2026-07-03T00:30:00" }
```

Comportamento de agendamento:

- Sem `at`, o endpoint envia imediatamente.
- Com `at`, Easyhook armazena a mensagem e agenda um despacho de tarefas na nuvem para esse tempo.
- A resposta é `202 Accepted` com uma `scheduled_message.id`.
- `client_reference` é um identificador opcional de aplicativo de até 200 caracteres. Easyhook retorna-o no ciclo de vida programado e webhooks de status de entrega correlacionados.
- Enviar uma estabilidade `Idempotency-Key` cabeçalho ao criar uma mensagem agendada. Repetir a mesma operação retorna o registro original em vez de criar outra tarefa na nuvem.
- Forma livre programada `text` e `media` deve estar dentro da janela de serviço 24 horas do WhatsApp no horário programado.
- Os modelos programados podem estar fora da janela de serviço ao cliente 24 horas, mas ainda devem usar modelos aprovados e satisfazer os requisitos de opt-in.
- Se uma mensagem de formulário livre agendada estiver fora da janela, o Easyhook retorna `scheduled_customer_service_window_closed`.
- Expuser erros de programação `retryable`, `delivery_state`, e `fallback_allowed`. Use apenas um caminho de entrega alternativo quando `fallback_allowed` é `true`; a `unknown` o estado de entrega pode já ter atingido Meta.

Exemplo de resposta programada:

```json
{
  "ok": true,
  "scheduled": true,
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "kind": "whatsapp_text",
    "status": "scheduled",
    "scheduled_at": "2026-07-03T00:30:00.000Z",
    "attempt_count": 0,
    "created_at": "2026-07-02T18:00:00.000Z",
    "updated_at": "2026-07-02T18:00:00.000Z"
  }
}
```

### Reconciliar uma mensagem agendada

```http
GET /v1/scheduled-messages/{scheduled_message_id}
```

Requer `messages:read`; existente `messages:write` as teclas permanecem compatíveis. Use este endpoint após os timeouts, as repetições do trabalhador ou o tempo de inatividade do webhook.

```bash
curl https://api.easyhook.dev/v1/scheduled-messages/scheduled_message_uuid \
  -H "Authorization: Bearer eh_live_xxx"
```

Depois do Easyhook enviar a mensagem, `message_id` contém a WAMID de Meta. `provider_status` avança de forma independente à medida que o Meta relata `sent`, `delivered`, `read`, ou `failed`.

```json
{
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "client_reference": "crm-reminder-456",
    "kind": "whatsapp_template",
    "status": "sent",
    "scheduled_at": "2026-07-03T00:30:00.000Z",
    "attempt_count": 0,
    "message_id": "wamid.HBg...",
    "provider_status": "delivered",
    "provider_status_at": "2026-07-03T00:30:03.000Z",
    "sent_at": "2026-07-03T00:30:01.000Z",
    "created_at": "2026-07-02T18:00:00.000Z",
    "updated_at": "2026-07-03T00:30:03.000Z"
  }
}
```

Falhas finais de execução informam se a operação pode ser repetida e se é seguro
usar um modelo como alternativa:

```json
{
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "status": "failed",
    "error": {
      "code": "customer_service_window_closed",
      "retryable": false,
      "delivery_state": "not_sent",
      "fallback_allowed": true
    }
  }
}
```

`delivery_state: unknown` significa que o Easyhook não pode provar que o provedor rejeitou a tentativa. Não envie um retorno automaticamente. `fallback_allowed: true` é retornado somente quando Easyhook sabe que a mensagem original de formulário livre não foi enviada e um modelo aprovado pode ser tentado.

### Cancelar uma mensagem agendada

Ponto final:

```http
DELETE /v1/scheduled-messages/{scheduled_message_id}
```

Requer `messages:write`. O cancelamento é vigiado pela chave de API. Apenas as mensagens ainda em `scheduled` o status pode ser cancelado.

Exemplo:

```bash
curl -X DELETE https://api.easyhook.dev/v1/scheduled-messages/scheduled_message_uuid \
  -H "Authorization: Bearer eh_live_xxx"
```

Resposta de sucesso:

```json
{
  "ok": true,
  "scheduled_message": {
    "id": "scheduled_message_uuid",
    "status": "cancelled"
  }
}
```

## Metadados de contato do WhatsApp

Use este endpoint para criar ou atualizar um nome de contato armazenado pelo Easyhook para o
WABA resolvido de `from`:

```http
PUT /v1/contacts
```

```bash
curl -X PUT https://api.easyhook.dev/v1/contacts \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: crm-contact-15550100004-v3" \
  -d '{
    "from": "123456789012345",
    "contact": "15550100004",
    "full_name": "Ana Garcia",
    "preferred_name": "Ana",
    "target": "easyhook"
  }'
```

`from` aceita o telefone conectado ou Meta Phone Number ID. `contact` aceita
um identificador de telefone WhatsApp internacional ou um BSUID opaco. Easyhook
resolve o contato dentro da WABA por trás `from`; os contatos nunca são partilhados
entre organizações ou WABAs. Pelo menos uma das `full_name` ou
`preferred_name` é necessário.

`target` é necessário para que o chamador não possa confundir os dois tipos de escrita:

- `easyhook`: atualiza apenas os metadados de contato locais do Easyhook. Um valor alterado
  emite `contact.updated`; repetindo o mesmo estado é um no-op.
- `provider`: solicita uma gravação real no catálogo de endereços do WhatsApp Business App.
  Meta não expõe essa operação atualmente, então Easyhook retorna HTTP 422
  com `provider_contact_write_unsupported` e não muda nada localmente.

```json
{
  "ok": true,
  "changed": true,
  "target": "easyhook",
  "provider_contact_book_updated": false,
  "account": { "id": "123456789012345", "phone": "15550100002" },
  "contact": {
    "id": "15550100004",
    "phone": "15550100004",
    "user_id": null,
    "full_name": "Ana Garcia",
    "preferred_name": "Ana",
    "name": "Ana",
    "updated_at": "2026-08-12T18:30:00.000Z"
  }
}
```

Esta limitação é distinta de duas funcionalidades Meta suportadas: enviar uma
cartão de contato como uma mensagem WhatsApp e contato originado pelo provedor receptor
alterações através de `smb_app_state_sync`. Nem é uma API de nuvem escrever no
Livro de endereços do WhatsApp Business App. Veja a mensagem oficial da Meta [contact-message
request](https://www.postman.com/meta/whatsapp-business-platform/request/e9dulgq/send-contact-message)
e [SMB App State Sync referência webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync).

## Consentimento: Opt-In/Opt-Out

Para mensagens de modelo iniciadas por negócios, Easyhook requer o contato para ter
opt-in gravado em Easyhook. O opt-in pode vir do WhatsApp Flow gerenciado
ou de `POST /v1/consent` quando o cliente recolheu permissão auditável em
outro sistema. Habilitar o consentimento gerenciado WABA é necessário apenas para enviar o
Easyhook opt-in ou opt-out Flow; não é necessário para registro externo
autorização.

Se o contato não tiver optado e o fluxo gerenciado estiver habilitado, Easyhook
retorna:

```json
{ "error": "opt_in_required", "required_action": "send_consent_flow" }
```

Se o fluxo gerenciado estiver desativado, `required_action` é `record_opt_in`. API
clientes podem registrar o consentimento através `POST /v1/consent` ou habilitar o consentimento gerenciado
E enviai o fluxo. `consent_not_enabled` é retornado somente quando um cliente tenta
Envie o Easyhook consent Flow enquanto o recurso WABA está desativado.

O registro Easyhook é uma salvaguarda operacional, não um substituto para permissão válida. O cliente permanece responsável por coletar o consentimento verdadeiro, explícito e auditável sob Meta política e lei aplicável. Configure Meta faturamento separadamente em [WhatsApp Manager](https://business.facebook.com/latest/settings/whatsapp_account); a carteira Easyhook não paga as taxas de modelo da Meta. Veja [orientação opt-in](https://developers.facebook.com/docs/whatsapp/overview/getting-opt-in/) e [documentação de preços](https://developers.facebook.com/docs/whatsapp/pricing/).

Se um contato é optado para fora, Easyhook bloqueia modelo iniciado pelo negócio envia com `recipient_opted_out`. Texto de forma livre, mídia e mensagens Flow ainda são permitidas quando o contato tem uma janela aberta de serviço ao cliente 24 horas, porque o contato iniciou essa sessão.

Easyhook registra consentimento automaticamente quando uma submissão WhatsApp Flow inclui estes campos booleanos:

| Campo | Significado |
| --- | --- |
| `service_opt_in` | O contato optou por mensagens de serviço/utilidade. |
| `marketing_opt_in` | Contato optou por mensagens de marketing. |
| `service_opt_out` | O contato optou por fora de serviço/mensagens de utilidade. |
| `marketing_opt_out` | Contato optou por fora de mensagens de marketing. |

Limpar frases de opt-out como `Ya no quiero recibir mensajes`, `dame de baja`, `no me contactes`, `stop`, `unsubscribe`, ou o tipo de erro comum `unsuscribe` não cancelar imediatamente o contato. Se o consentimento WABA estiver ativo, o Easyhook registra uma solicitação de opt-out pendente e envia a publicação de opt-out do WhatsApp Flow para que o contato possa confirmar se eles querem parar as mensagens de serviço, mensagens de marketing ou ambas. O consentimento efetivo existente permanece inalterado até que o Flow seja enviado. Um pedido não confirmado expira após uma hora e pode então ser solicitado novamente. As frases fixas do Easyhook não podem ser removidas; `custom_keywords` apenas adiciona frases específicas para os negócios.

### Opt-in automático opcional

Definir `auto_opt_in_enabled` para `true` ao habilitar ou atualizar a configuração WABA para agendar o fluxo de opt-in 23 horas após a primeira interação ao vivo de um contato com esse número WhatsApp.

- A opção está desabilitada por padrão e se aplica por WABA.
- Uma solicitação automática é criada por contato e número do remetente.
- As importações de história nunca o agendam.
- No momento do envio Easyhook revidates que o consentimento permanece habilitado, o contato não optou nem optou por fora, ea janela de serviço de 24 horas ainda está aberta.
- Se alguma verificação falhar, o Easyhook cancela a tarefa sem enviar.
- Esta automação interna não conta como uma chamada de API do cliente. As próprias taxas de mensagens e políticas da Meta ainda se aplicam.

### Habilitar o consentimento do WABA

Ponto final:

```http
POST /v1/consent/enable
```

Requer `flows:write`.

Isso cria ou reutiliza dois Fluxos versionados para a WABA, publica-os e marca o consentimento da WABA como ativo:

| Nome do fluxo | Objetivo |
| --- | --- |
| `easyhook_consent_preferences_<revision>_opt_in` | Recolha serviço/utilidade e marketing opt-in. |
| `easyhook_consent_preferences_<revision>_opt_out` | Confirmar serviço/utilização e opt-out de marketing. |

Os dois Fluxos são ativos Meta separados, de modo que a experiência de opt-in só mostra as opções de opt-in, e a experiência de opt-out apenas mostra as opções de opt-out. Meta Fluxos são imutáveis após a publicação. Chamar este endpoint com cópia alterada cria uma nova revisão determinística; cópia inalterada reutiliza a revisão atual.

```bash
curl -X POST https://api.easyhook.dev/v1/consent/enable \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "copy": {
      "language": "es",
      "business_name": "Clínica Acme",
      "opt_in_message_body": "Revise quais mensagens deseja receber de {business_name}.",
      "opt_in_message_cta": "Confirmar preferencias",
      "opt_in_screen_title": "Preferências de comunicação",
      "opt_in_heading": "Confirma tus preferencias",
      "opt_in_body": "Escolha quais mensagens deseja receber.",
      "opt_out_message_body": "Gerencie as mensagens que recebe de {business_name}.",
      "opt_out_message_cta": "Administrar preferencias",
      "opt_out_screen_title": "Preferências de comunicação",
      "opt_out_heading": "Parar de receber mensagens",
      "opt_out_body": "Escolha quais mensagens deseja cancelar.",
      "footer": "Você pode alterar essas preferências depois."
    },
    "auto_opt_in_enabled": true,
    "custom_keywords": ["cancel my reminders"]
  }'
```

### Obter a configuração do consentimento da WABA

```http
GET /v1/consent/config?from=15550100001
```

Requer `flows:read`. Também aceita `waba_id` ou `phone_id` para uso legado/administrador.

### Atualizar a configuração do consentimento da WABA

```http
PATCH /v1/consent/config
```

Requer `flows:write`. Use isso para salvar cópia e adicionar palavras-chave opt-out específicas do cliente. palavras-chave fixas Easyhook opt-out ainda são aplicadas. `language` aceita `es`, `en`, ou `pt-BR` e controla etiquetas gerenciadas por Easyhook.

A mensagem e a cópia do formulário são intencionalmente separadas:

| Campos | Onde eles aparecem |
| --- | --- |
| `opt_in_message_body`, `opt_out_message_body` | Bubble de mensagem que abre o Fluxo. Suporta `{business_name}`. |
| `opt_in_message_cta`, `opt_out_message_cta` | Abotoa essa bolha de mensagem. |
| `opt_in_screen_title`, `opt_out_screen_title` | Barra superior do Flow aberto. |
| `opt_in_heading`, `opt_out_heading` | Entrando no formulário. |
| `opt_in_body`, `opt_out_body` | Explicação dentro do formulário. |
| `footer` | Legenda na parte inferior do formulário. |

Configurações mais antigas que só têm `opt_in_body` ou `opt_out_body` manter o seu comportamento de envio anterior até ser gravado com os novos campos de mensagem.

A gravação da configuração não altera um Meta Flow publicado. Call `POST /v1/consent/enable` após a mudança de cópia para criar e ativar a versão correspondente.

```bash
curl -X PATCH https://api.easyhook.dev/v1/consent/config \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "copy": {
      "language": "en",
      "business_name": "Acme Clinic",
      "opt_in_message_body": "Review the messages you want to receive from {business_name}.",
      "opt_in_message_cta": "Confirm preferences",
      "opt_in_screen_title": "Communication preferences",
      "opt_in_heading": "Confirm your preferences",
      "opt_in_body": "Choose which messages you want to receive.",
      "opt_out_message_body": "Manage the messages you receive from {business_name}.",
      "opt_out_message_cta": "Manage preferences",
      "opt_out_screen_title": "Communication preferences",
      "opt_out_heading": "Stop messages",
      "opt_out_body": "Choose which messages you no longer want to receive.",
      "footer": "You can change these preferences later."
    },
    "auto_opt_in_enabled": true,
    "custom_keywords": ["cancel reminders", "stop promos"]
  }'
```

### Enviar Fluxo de Consentimento

Ponto final:

```http
POST /v1/consent
```

Requer `messages:write`. Esta é uma mensagem WhatsApp Flow, por isso requer uma janela aberta de serviço ao cliente 24 horas.

```bash
curl -X POST https://api.easyhook.dev/v1/consent \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "to": "15550100002",
    "mode": "opt_in",
    "body": "Optional message override for this send",
    "cta": "Review"
  }'
```

Autorizado `mode` valores: `opt_in`, `opt_out`.

`body` e `cta` são sobreposições opcionais por envio. Se omitido, o Easyhook usa o correspondente `copy.opt_*_message_body` e `copy.opt_*_message_cta` valores da configuração de consentimento WABA. Eles não modificam o formulário de fluxo publicado.

`opt_in` envia `easyhook_consent_preferences_opt_in`. `opt_out` envia `easyhook_consent_preferences_opt_out`.

A WABA deve ter o consentimento ativado e a janela cliente-serviço deve estar aberta. `accepted: true`, `delivery_status: "pending"`, e a `wamid`: isto significa que o Meta aceitou o pedido Flow, não que o dispositivo o tenha exibido. `status.*` e correlacionar com `wamid` observar `sent`, `delivered`, `read`, ou `failed`.

### Registrar consentimento manualmente

Ponto final:

```http
POST /v1/consent
```

Requer `messages:write`.

Use isso quando o cliente recolheu evidências de opt-in/opt-out fora do Easyhook, por exemplo com seu próprio formulário de site, ação CRM ou WhatsApp Flow personalizado.

```bash
curl -X POST https://api.easyhook.dev/v1/consent \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "to": "15550100002",
    "scope": "marketing",
    "status": "opt_in",
    "source": "customer_form",
    "evidence": {
      "form_id": "form_123",
      "accepted_at": "2026-07-02T18:00:00.000Z"
    }
  }'
```

Autorizado `scope` valores: `service`, `marketing`.

Autorizado `status` valores: `opt_in`, `opt_out`, `pending_opt_out`.

An `opt_in` registro deve incluir não vazio `evidence`. Armazenar informações suficientes
demonstrar o que a pessoa aceitou e quando, por exemplo, uma versão de formulário,
timestamp, URL de origem ou ID de submissão externa. Easyhook armazena a evidência
e aplica o estado de consentimento resultante; não certifica que a recolha
método satisfaz Meta política ou lei local. A organização usando a API
continua a ser responsável pela obtenção de consentimento válido e pela honra de pedidos de opt-out.

### Obter o Status de Consentimento de Contato

```http
GET /v1/consent/status?from=123456789012345&contact=15550100002
```

Requer `messages:read`. Para compatibilidade backward, as chaves de API criadas antes
este escopo de leitura existiu pode usar `messages:write`. `from` aceita o WhatsApp conectado `account.id`,
ID do número de telefone, ou número de telefone comercial. O contato é resolvido dentro do
WABA por trás desse remetente; contatos e consentimento nunca são compartilhados entre WABAs.
`to` e `recipient` são aceites como apelidos para `contact`.

```bash
curl -X GET 'https://api.easyhook.dev/v1/consent/status?from=123456789012345&contact=15550100002' \
  -H "Authorization: Bearer eh_live_xxx"
```

```json
{
  "consent": {
    "contact": "15550100002",
    "account": { "id": "123456789012345" },
    "service": {
      "status": "opt_in",
      "updated_at": "2026-07-30T18:00:00.000Z",
      "source": "whatsapp_flow",
      "pending_opt_out": true,
      "pending_opt_out_at": "2026-08-01T05:30:00.000Z",
      "pending_opt_out_expires_at": "2026-08-01T06:30:00.000Z"
    },
    "marketing": {
      "status": "opt_out",
      "updated_at": "2026-07-31T18:00:00.000Z",
      "source": "customer_api"
    }
  }
}
```

Cada escopo retorna o status efetivo: `opt_in`, `opt_out`, ou `unknown`.
`unknown` significa que Easyhook não tem escolha gravada para esse escopo; não tem
significa que a pessoa optou por entrar. `pending_opt_out` é metadados separados e faz
não substituir um confirmado `opt_in`; permanece `true` durante no máximo uma hora enquanto
Easyhook espera pela confirmação do Flow. A evidência está intencionalmente excluída deste
ler o endpoint. `consent.updated` para receber alterações sem
A fazer sondagens.

## Erros

Erros comuns:

| Erro | Significado |
| --- | --- |
| `invalid_api_key` | Chave de API em falta, inválida, revogada ou insuficiente. |
| `tenant_id_not_allowed` | Pedido público de API incluído `tenant_id`; o organização vem da chave de API. |
| `missing_required_fields` | Faltam campos de carga necessários. |
| `phone_not_found` | A `from` o número não está conectado à organização que possui a chave de API. A resposta identifica `from` como o campo inválido e inclui uma dica corretiva. |
| `channel_or_phone_not_found` | Não foi possível resolver o endpoint de envio unificado `from` como um número WhatsApp ou alias de canal conectado à organização chave da API. |
| `channel_not_enabled` | `from` resolvido para um canal não- WhatsApp que ainda não está habilitado para envio público. |
| `unsupported_message_type` | O endpoint não suporta o tipo de mensagem solicitada. |
| `invalid_whatsapp_recipient` | O endpoint unificado resolveu o WhatsApp, mas `to` não é um telefone internacional válido nem um BSUID WhatsApp válido opaco. |
| `phone_or_template_not_found` | O modelo selecionado não pôde ser resolvido para o WABA por trás `from`. |
| `phone_or_flow_not_found` | O fluxo selecionado não pôde ser resolvido para o WABA atrás `from`. |
| `template_not_approved` | O modelo existe mas não é aprovado pela Meta. |
| `flow_not_published` | O Flow existe localmente, mas não é publicado no Meta, portanto não pode ser enviado. |
| `consent_not_enabled` | O consentimento gerenciado WABA Flow não foi ativado; habilite-o antes de tentar enviar esse Flow. |
| `opt_in_required` | Template send needs known opt-in gravado em Easyhook. |
| `recipient_opted_out` | Easyhook tem o destinatário marcado como optado para fora, assim que os modelos iniciados pelo negócio são bloqueados. |
| `customer_service_window_closed` | Texto/media de forma livre é bloqueado fora da janela de 24 horas. Se não existir nenhum contato correspondente ou evento de entrada recente, a resposta inclui `reason: "recipient_not_found_or_no_recent_inbound_message"`. |
| `scheduled_customer_service_window_closed` | O texto/media gratuito programado estaria fora da janela de 24 horas em `at`; a resposta tem `delivery_state: "not_sent"` e permite o retrocesso do modelo. |
| `conversation_policy_temporarily_unavailable` | O Easyhook não pôde verificar a janela de serviço do WhatsApp devido a uma falha temporária na base de dados. Nenhuma mensagem foi enviada. A resposta inclui `retryable: true`, `delivery_state: "not_sent"`, e `request_id`; tente de novo em breve usando o mesmo `Idempotency-Key`. |
| `insufficient_balance` | A carteira da organização não tem equilíbrio suficiente para a operação. Recarregue- a antes de tentar novamente. |
| `scheduled_message_create_failed` | O Easyhook não pôde persistir ou colocar a agenda; inspecione `retryable`, `delivery_state`, e `fallback_allowed` Antes de tentar novamente. |
| `scheduled_delivery_not_configured` | A entrega agendada não está configurada para esta implementação de infraestrutura. |
| `scheduled_message_not_cancellable` | A mensagem agendada já está processando, enviando, falhando ou cancelada. |
| `meta_send_failed` | Meta rejeitou o pedido de envio; a resposta inclui detalhes de Meta higienizados. |

## Alias legado para texto

Ponto final:

```http
POST /v1/messages/send
```

Esta alias de compatibilidade resolve `from` contra o organização chave de API e retorna
ed `Deprecation: true` cabeçalho de resposta. Novas integrações usam
`POST /v1/messages/text`.

Comportamento público atual:

- O texto do WhatsApp está ativado.
- O texto do Messenger e do Instagram estão habilitados quando `from` resolve-se para um canal ligado activo para o organização da chave de API.
- Os endpoints do WhatsApp existentes permanecem suportados para compatibilidade backward.

Campos necessários para o texto do WhatsApp:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from` | string | Número de telefone WhatsApp de propriedade do organização ou alias de canal Messenger/Instagram. |
| `to` | string | O número de destinatário do WhatsApp, o PSID do Messenger ou o IGSID do Instagram. |
| `type` | string | Opcional. Por omissão para `text`; actualmente apenas `text` é suportado. |
| `body` | string | Mensagem de texto. |

Exemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/send \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","type":"text","body":"Olá da Easyhook"}'
```

Resposta de sucesso:

```json
{ "ok": true, "wamid": "wamid..." }
```

## Exemplos comuns

Define estas variáveis uma vez:

```bash
export EASYHOOK_API_KEY="eh_live_xxx"
export EASYHOOK_FROM="15550100001"
export CUSTOMER_WA="15550100002"
```

### Enviar texto pelo WhatsApp

O que é isto?

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"body\": \"Olá da Easyhook\"
  }"
```

Python:

```python
import os
import requests

resp = requests.post(
    "https://api.easyhook.dev/v1/messages/text",
    headers={
        "Authorization": f"Bearer {os.environ['EASYHOOK_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "from": os.environ["EASYHOOK_FROM"],
        "to": os.environ["CUSTOMER_WA"],
        "body": "Olá da Easyhook",
    },
    timeout=20,
)
resp.raise_for_status()
print(resp.json())
```

TipoScript:

```ts
const res = await fetch("https://api.easyhook.dev/v1/messages/text", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.EASYHOOK_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: process.env.EASYHOOK_FROM,
    to: process.env.CUSTOMER_WA,
    body: "Olá da Easyhook",
  }),
});

if (!res.ok) throw new Error(await res.text());
console.log(await res.json());
```

### Agendar uma mensagem de texto

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"body\": \"Recordatorio programado\",
    \"at\": \"2026-07-07T13:10:00-06:00\"
  }"
```

Cancelar:

```bash
curl -X DELETE https://api.easyhook.dev/v1/scheduled-messages/scheduled_message_uuid \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

### Enviar um Modelo

```bash
curl -X POST https://api.easyhook.dev/v1/messages/template \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"template\": {
      \"name\": \"order_ready\",
      \"language\": \"en_US\"
    },
    \"parameters\": {
      \"body\": [\"Example User\"]
    }
  }"
```

### Enviar mídia reutilizável e enviar pelo nome

```bash
FILE_BASE64="$(base64 -w 0 ./promo.png)"

curl -X POST https://api.easyhook.dev/v1/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"name\": \"promo_july\",
    \"type\": \"image\",
    \"file_name\": \"promo.png\",
    \"file_type\": \"image/png\",
    \"file_base64\": \"$FILE_BASE64\"
  }"

curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"type\": \"image\",
    \"media_name\": \"promo_july\",
    \"caption\": \"Promo de julio\"
  }"
```

### Enviar cada tipo de mídia WhatsApp por nome reutilizável

```bash
# Image
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"image\",\"media_name\":\"promo_image\",\"caption\":\"Image caption\"}"

# Video
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"video\",\"media_name\":\"promo_video\",\"caption\":\"Video caption\"}"

# Audio
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"audio\",\"media_name\":\"intro_audio\"}"

# Document
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"document\",\"media_name\":\"price_list\",\"filename\":\"prices.pdf\",\"caption\":\"Price list\"}"

# Sticker
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$EASYHOOK_FROM\",\"to\":\"$CUSTOMER_WA\",\"type\":\"sticker\",\"media_name\":\"thanks_sticker\"}"
```

### Enviar um fluxo de consentimento

```bash
curl -X POST https://api.easyhook.dev/v1/consent \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"mode\": \"opt_in\"
  }"
```

### Enviar um fluxo personalizado do WhatsApp

```bash
curl -X POST https://api.easyhook.dev/v1/messages/flow \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"to\": \"$CUSTOMER_WA\",
    \"flow_name\": \"lead_capture\",
    \"body\": \"Complete your information.\",
    \"cta\": \"Open form\",
    \"flow_token\": \"lead_123\"
  }"
```

### Configuração mínima de uma requisição HTTP no n8n

Utilização:

| n8n campo | Valor |
| --- | --- |
| Método | `POST` |
| URL | `https://api.easyhook.dev/v1/messages/template` |
| Autenticação | Bearer Auth |
| Tipo de Conteúdo do Corpo | JSON |

Corpo:

```json
{
  "from": "15550100001",
  "to": "15550100002",
  "template": {
    "name": "hello_world",
    "language": "en_US"
  }
}
```

`template.language` é necessário a menos que o nome do modelo é único em que WABA e Easyhook pode resolvê-lo com segurança.

Na `n8n-nodes-easyhook` nó comunitário, `Choose From Easyhook` sincroniza os modelos do remetente selecionado e lista apenas definições aprovadas. `Enter Manually` resolve a mesma definição a partir do seu nome digitado e idioma selecionado. Ambas as fontes podem gerar automaticamente campos para texto de cabeçalho ou mídia, variáveis do corpo, botões dinâmicos de URL, cargas de resposta rápidas e valores de copy- code. Selecione `Custom Components (JSON)` para enviar componentes meta brutos.

O campo n8n personalizado aceita um array de componentes brutos ou `{ "components": [...] }`. Não incluir `from`, `to`, `template`, ou `language` porque o nó os fornece separadamente. Os links de mídia devem ser públicos URLs HTTPS, e os parâmetros do botão URL contêm apenas o valor da variável de modelo dinâmico. Veja o pacote README para exemplos completos de texto e mídia.

## Enviar mensagem de texto

Ponto final:

```http
POST /v1/messages/text
```

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from` | string | Proprietário `account.id`, WhatsApp telefone de negócios, ou backward-compatível canal alias. |
| `to` | string | WhatsApp receptor telefone ou BSUID, Messenger PSID, Instagram IGSID, Telegram chat id, ou Mercado Libre destinatário id. |
| `body` | string | Mensagem de texto. |

Campos opcionais:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `at` | string | ISO 8601 data/hora para entrega agendada. Suportado para WhatsApp, Messenger, Instagram, Telegram e Mercado Libre texto. |
| `phone_id` | string | Legado Easyhook telefone linha id. Preferir `from`. |

Exemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","body":"Olá da Easyhook"}'
```

Resposta de sucesso do WhatsApp:

```json
{ "ok": true, "wamid": "wamid..." }
```

Resposta de sucesso do Non-WhatsApp:

```json
{ "ok": true, "provider": "messenger", "channel_id": "channel_uuid", "message_id": "mid..." }
```

## Leitura, digitação, resposta, reação e texto humanizado

Easyhook expõe os mesmos objetivos entre os provedores e rejeita sem suporte
operações explicitamente com HTTP `422 operation_not_supported`. Não Suportado
As operações não são cobradas.

| Fornecedor | Ler | Indicador de digitação | Responder | Reação | Texto humanizado |
| --- | --- | --- | --- | --- | --- |
| WhatsApp | Sim. | Sim. | Sim. | Sim. | Sim. |
| Messenger | Sim. | Sim. | Sim. | Não | Sim. |
| Instagram | Sim. | Sim. | Sim. | Não | Sim. |
| Telegram | Não | Sim. | Sim. | Sim. | Sim. |
| Mensagens de Negócios TikTok | Sim. | Sim. | Sim. | Não | Sim. |
| Gmail, Outlook, IMAP/SMTP | Usar apenas ações de E-mail | Não | Sim. | Não | Não |
| Mercado Libre | Não | Não | Não | Não | Não |

WhatsApp ler recibos e indicadores de digitação exigem um WhatsApp inbound
ID da mensagem (`wamid`). Messenger e Instagram usam o ID da mensagem do provedor.
O indicador de digitação do Telegram requer o ID de chat de destino e as reações requerem o
ID da mensagem de Telegram.

Marque uma mensagem como lida:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/read \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "message_id": "wamid.HBg..."
  }'
```

Mostrar a digitação:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/typing \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "message_id": "wamid.HBg..."
  }'
```

O texto humanizado se aplica somente aos controles compatíveis com o provedor
selecionado. Por exemplo, o Telegram envia uma ação de digitação, mas não inventa
uma confirmação de leitura.
WhatsApp Cloud API não expõe um cliente digitando webhook em Easyhook V1.

### Histórico de coexistência

As chamadas de histórico de coexistência são aceitas rapidamente e processadas assíncronamente através de Tarefas na Nuvem. O Easyhook persiste com blocos normalizados antes de processar, funciona em lotes de no máximo 100 eventos e trata o Meta message ID como uma chave de idempotência. A sincronização é incluída sem custo adicional. Apenas uma sincronização ativa é aceita por número, enquanto uma organização pode processar dois números concomitantemente; números adicionais permanecem em fila e retomam automaticamente sem consumir tentativas de falha. Outra solicitação para o mesmo número retorna `409 coexistence_sync_in_progress` com o progresso atual.

Mensagens históricas não executam live consent keyword management ou replay Flow submission efeitos colaterais.

Mensagens de entrada históricas são entregues como `message.received`; mensagens de saída históricas são entregues como `message.echo`. Ambos expor `message.source: history`, `message.direction`, explícito `message.from` e `message.to`, e os metadados de sincronização disponíveis sob `message.history`.

O filtro de assinatura é `history.*`, mas cada evento dentro do lote usa o público normalizado `type` `message.received` ou `message.echo`. O corpo de entrega é `{ "type": "sync.batch", "sync": {...}, "events": [...] }`Os lotes contêm, no máximo, 100 eventos. O consumidor deve processar todos os elementos de `events` e desduplicar usando `message.id`.

Crie a assinatura webhook do cliente com o `history.*` filtrar antes de conectar o número de coexistência ou solicitar sincronização se a integração precisar da importação histórica. O endpoint do portal `POST /v1/meta/whatsapp/phones/coexistence-sync` inicia a sincronização meta inicial após o consentimento de integração. Não é uma exportação histórica irrestrita e deve ser usada durante a janela de elegibilidade de integração do Meta. Uma vez concluída, use a repetição do Easyhook em vez de solicitar a importação do Meta novamente.

Durante a coexistência, o negócio deve permitir o compartilhamento do histórico no aplicativo WhatsApp Business e manter o aplicativo aberto enquanto a sincronização inicial começa. `2593109` significa que o compartilhamento de histórico está desabilitado; Easyhook o normaliza como `type: sync.failed` em vez de `history.*` assinantes.

Os consumidores recebem um lote Easyhook em vez do callback bruto da Meta. Processe cada elemento normalizado em `events`. Construir a chave de conversação a partir `account.id + ":" + (contact.user_id ?? contact.id)`, deduplicar com `message.id`, ordenar uma conversa por `message.timestamp`, e prevenir a lógica de resposta automática ao vivo quando `message.source` é `history`. As entregas são pelo menos uma vez e tentar novamente até cinco vezes. WhatsApp pode fornecer um ID de usuário de negócios estável (BSUID) em vez de um telefone; Easyhook preserva-lo em `contact.id`/`contact.user_id` e armazena um apelido de telefone quando a Meta fornece um. O contrato de mapeamento completo está documentado em [Cliente Webhooks: Histórico de coexistência](/webhooks#coexistence-history).

O mesmo BSUID ou BSUID pai elegível pode ser usado como Easyhook's `to` para o WhatsApp normal envia. Easyhook mapeia-o para o Meta's dedicado `recipient` propriedade. Autenticação
templates que usam um tap, zero-tap ou entrega de código de cópia ainda requerem uma
número de telefone; Meta pode rejeitar um destino BSUID com erro `131062`.

Os meios históricos são assíncronos. A mensagem inicial pode conter `message.media.storage_status: pending`. Se Meta ainda expõe o arquivo, Easyhook emite `message.media_available` com o mesmo `message.id` e uma URL de download protegida do Easyhook. A meta- mídia ausente ou expirada nunca bloqueia a importação de texto/história.

Meta History cobre até aproximadamente 180 dias, exclui grupos e normalmente expõe mídia histórica para download apenas para mensagens recentes (aproximadamente 14 dias). Ele não espelha um backup completo para dispositivos móveis. Easyhook suporta `media_mode: metadata`, `recent_media` (por omissão, excluindo vídeo), e `all_recent_media`.

O corpo da requisição do portal é:

```json
{
  "tenant_id": "TENANT_UUID",
  "phone_id": "LOCAL_PHONE_UUID",
  "media_mode": "recent_media"
}
```

Assinantes para `history.*` também receber `sync.started`, `sync.progress`, `sync.completed`, e `sync.failed`. As entregas HTTP falhadas voltam a tentar até cinco vezes e respeitam uma válida `Retry-After`.

Duas operações de recuperação estão disponíveis e servem finalidades diferentes:

- `POST /v1/webhooks/{id}/replay` as tentativas falharam os lotes de entrega já criados para esse webhook. Ele aceita opcional `sync_id` e `limit` (máximo de 100 lotes falhados).
- `POST /v1/webhooks/{id}/history-replays` cria uma repetição persistente para um número do WhatsApp. Aceita `phone_id`, `replay_type` (`history` ou `contacts`), e facultativo `max_events` (máximo de 100.000). `history.*` para mensagens ou `smb_app_state_sync.*` para contatos.

Apenas uma repetição ativa de cada tipo é permitida por webhook e número.
`GET /v1/webhooks/{id}/history-replays/{replay_id}` retorna `pending`, `processing`,
`completed` ou `failed`. Lotes repetidos incluem `sync.replay: true`. Os consumidores
devem permanecer idempotentes, pois a entrega ocorre pelo menos uma vez.

### Sincronização do estado do aplicativo em coexistência

O mesmo pedido de sincronização de coexistência também pede Meta para WhatsApp Business App contact/state data. `smb_app_state_sync.*` antes da sincronização para receber cada registro importado como um normalizado `contact.updated` evento em baixo `contact_update`.

Sincronização do estado e história são complementares: `smb_app_state_sync.*` carrega atualizações de contato/aplicativo, enquanto `history.*` carrega mensagens históricas. Uma integração que reconstrua ambos os contatos e conversas deve se inscrever em ambos os filtros antes de iniciar a sincronização. Veja [Cliente Webhooks: Coexist App State Sync](/webhooks#coexistence-app-state-sync) para a carga útil e as regras de identidade.

### Reações e mensagens WhatsApp não suportadas

Easyhook recebe reações de ambas as direções:

- As reações do cliente chegam como webhook público `type: message.received`.
- Reações feitas a partir do WhatsApp Business App em coexistência chegam como webhook público `type: message.echo`.
- O evento de filtro/depuração preciso permanece no `X-Easyhook-Provider-Event` cabeçalho (`message.reaction` ou `smb_message_echo.reaction`).
- `message.reaction.message_id` é o fornecedor `wamid` da mensagem que está sendo reagida.
- `message.reaction.emoji` contém o emoji. Uma string vazia remove uma reação anterior.

Fragmento webhook normalizado:

```json
{
  "id": "event_uuid",
  "type": "message.echo",
  "channel": "whatsapp",
  "message": {
    "id": "wamid.reaction",
    "type": "reaction",
    "reaction": {
      "message_id": "wamid.HBg...",
      "emoji": "❤️"
    }
  }
}
```

Envie uma reação:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/reaction \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "message_id": "wamid...",
    "emoji": "👍"
  }'
```

Usar um vazio `emoji` para remover a reação actual.

Enviar uma resposta de texto contextual:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/reply \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "message_id": "wamid.HBg...",
    "body": "Resposta relacionada a esta mensagem"
  }'
```

`message_id` deve ser o ID original da mensagem WhatsApp. Easyhook verifica que
`from` pertence à organização API-key e envia o contexto de mensagem da Meta para
WhatsApp exibe a resposta citada.

Notas de vídeo circulares do WhatsApp chegam atualmente à Cloud API como
`message.unsupported`, com erro `131051` e `unsupported.type: video_note`. A Meta
não inclui um ID de mídia nem uma URL de download nesse payload. O Easyhook
preserva esse subtipo nos webhooks do cliente e mostra uma alternativa no portal,
mas não pode armazenar nem reproduzir o vídeo até que a Meta o exponha pela Cloud API.

O texto humanizado ainda é salvo e entregue como uma mensagem de texto normal do Easyhook. Ele só muda o comportamento do pré- envio:

1. Easyhook encontra a mensagem de entrada mais recente de `to`, a menos que `message_id` é fornecido.
2. O Easyhook tenta marcar a conversa como lida quando o provedor a suporta.
3. Easyhook espera um curto atraso de leitura estimado.
4. Easyhook tenta mostrar o indicador de digitação do provedor.
5. Easyhook espera um curto atraso estimado de digitação.
6. O Easyhook envia a mensagem de texto.

Messenger e Instagram usam suas ações de remetente, Telegram usa sua ação de digitação e WhatsApp usa indicadores de leitura e digitação. Esses controles de presença são o melhor esforço: se o provedor rejeitar um, Easyhook ainda envia o texto e relata o resultado em `controls.read` e `controls.typing` como `sent`, `failed`, ou `skipped`.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/humanized-text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "body": "Thanks, I just checked it and we can help with that."
  }'
```

Opcionalmente explícito `message_id`:

```json
{
  "from": "15550100002",
  "to": "15550100003",
  "body": "Thanks, I just checked it and we can help with that.",
  "message_id": "wamid.HBg..."
}
```

Se não existir uma mensagem de entrada recente, o Easyhook retorna:

```json
{
  "error": "latest_inbound_message_not_found",
  "hint": "Send message_id explicitly or wait until Easyhook receives an inbound message from this recipient."
}
```



## Alias legado para texto multicanal

Ponto final:

```http
POST /v1/messages/channel/text
```

Este endpoint permanece apenas para compatibilidade e retornos atrasados
`Deprecation: true`. Utilização `/v1/messages/text` e, apenas quando necessário, o
explícito `channel` discriminador.

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from` | string | Prestador próprio `account.id`. Os apelidos de legado e os nomes de usuário permanecem aceitos. |
| `to` | string | Identificador do destinatário do fornecedor. O Messenger usa o PSID. O Instagram usa o IGSID. |
| `body` | string | Mensagem de texto. |

Exemplo de envio pelo Messenger:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"123456789012346","to":"PSID_VALUE","body":"Hello from Easyhook"}'
```

Exemplo de envio do Instagram:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/text \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"17841400000000001","to":"IGSID_VALUE","body":"Hello from Easyhook"}'
```

Resposta de sucesso:

```json
{ "ok": true, "provider": "messenger", "channel_id": "channel_uuid", "message_id": "mid..." }
```

Notas:

- `/v1/messages/text` agora resolve tanto telefones WhatsApp quanto canais conectados Messenger/Instagram através `from`.
- Messenger e Instagram enviam as regras de mensagens normais da Meta, incluindo a janela de resposta do cliente.
- Os modelos WhatsApp permanecem apenas para WhatsApp.

## Enviar Mídia Multicanal

Ponto final:

```http
POST /v1/messages/channel/media
```

Requer `messages:write`. Suporta Messenger e mídia Instagram envia. `/v1/messages/media` é o endpoint padronizado preferido para os meios de canal `id` ou `link`.

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from` | string | Alias de canal proprietário, alias de ID de página, manusear, alias de ID de Instagram, nome de usuário do Instagram ou ID de canal conectado. |
| `to` | string | Identificador do destinatário do fornecedor. O Messenger usa o PSID. O Instagram usa o IGSID. |
| `type` | string | `image`, `video`, `audio`, ou `file`. `document` é normalizado para `file`. |
| `id` ou `link` | string | ID do anexo do provedor existente ou URL de mídia HTTPS público. |

Campos opcionais:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `filename` | string | Nome do arquivo para anexos de arquivo/documento. |

Exemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/channel/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "support-messenger",
    "to": "PSID_VALUE",
    "type": "image",
    "link": "https://example.com/promo.png"
  }'
```

### Fazer upload e enviar mídia do canal

Ponto final:

```http
POST /v1/messages/channel/media/upload
```

Requer `messages:write`. Easyhook armazena o arquivo temporariamente, cria um URL de curta duração, envia-lo para Messenger ou Instagram, e retorna o local `media_asset_id`.

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from` | string | Messenger ou alias/id de canal do Instagram. |
| `to` | string | Messenger PSID ou Instagram IGSID. |
| `type` | string | `image`, `video`, `audio`, ou `file`. |
| `file_name` | string | Nome original do arquivo. |
| `file_type` | string | Tipo MIME. |
| `file_base64` | string | bytes de arquivo codificados do Base64. |

Exemplo:

```bash
FILE_BASE64="$(base64 -w 0 ./promo.png)"

curl -X POST https://api.easyhook.dev/v1/messages/channel/media/upload \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"support-messenger\",
    \"to\": \"PSID_VALUE\",
    \"type\": \"image\",
    \"file_name\": \"promo.png\",
    \"file_type\": \"image/png\",
    \"file_base64\": \"$FILE_BASE64\"
  }"
```

## Enviar mídia reutilizável

Ponto final:

```http
POST /v1/media
```

Envia mídia privada gerenciada por Easyhook para a organização que possui a API
chave. Esta mídia é reutilizável, não expira, e é abordada por uma única
`name` dentro da organização. Canais conectados compatíveis podem reutilizar o
mesmo ativo sem enviá-lo novamente.

Cada organização inclui `1 GB` de armazenamento ativo de mídia reutilizável. Reutilizável
mídia sobre a quota incluída é faturado mensalmente em `3 MXN / GB / month`.
O envio de mídia reutilizável não expira e não bloqueia `1 GB`;
A resposta de upload inclui a estimativa de uso da organização atual quando
disponível:

```json
{
  "ok": true,
  "media": {
    "id": "media_asset_uuid",
    "name": "logo_easyhook"
  },
  "storage": {
    "included_bytes": 1073741824,
    "used_bytes": 143211,
    "overage_price_mxn_per_gb": 3,
    "billed_monthly": true
  }
}
```

Requer `media:write`.

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `name` | string | Nome de mídia único para esta organização. Use letras minúsculas, números, `_`, `.`, ou `-`. |
| `type` | string | `image`, `video`, `audio`, `document`, ou `sticker`. |
| `file_name` | string | Nome original do arquivo. |
| `file_type` | string | Tipo MIME. |
| `file_base64` | string | bytes de arquivo codificados do Base64. |

Limites de envio suportados:

| Tipo | Tipos MIME aceites | Tamanho máximo |
| --- | --- | --- |
| `image` | `image/jpeg`, `image/png`, `image/webp` | 5 MB |
| `sticker` | `image/webp` | 5 MB |
| `video` | `video/mp4`, `video/3gpp` | 25 MB |
| `audio` | Qualquer `audio/*` Tipo MIME | 25 MB |
| `document` | Qualquer documento tipo MIME | 25 MB |

Exemplo:

```bash
FILE_BASE64="$(base64 -w 0 ./logo.png)"

curl -X POST https://api.easyhook.dev/v1/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"logo_easyhook\",
    \"type\": \"image\",
    \"file_name\": \"logo.png\",
    \"file_type\": \"image/png\",
    \"file_base64\": \"$FILE_BASE64\"
  }"
```

Resposta de sucesso:

```json
{
  "ok": true,
  "media": {
    "id": "media_asset_uuid",
    "name": "logo_easyhook",
    "channel": "whatsapp",
    "type": "image",
    "mime_type": "image/png",
    "file_name": "logo.png",
    "size_bytes": 143211,
    "sha256": "abc...",
    "retention_policy": "permanent",
    "expires_at": null,
    "download_url": "https://api.easyhook.dev/v1/media/media_asset_uuid/download"
  }
}
```

## Listar mídia reutilizável

Ponto final:

```http
GET /v1/media
```

Requer `media:read`. Retorna a biblioteca de mídia reutilizável para a chave de API
organização. Cada item inclui `download_url`, que pode ser obtido com o
A mesma chave da API.

Exemplo:

```bash
curl -X GET "https://api.easyhook.dev/v1/media" \
  -H "Authorization: Bearer eh_live_xxx"
```

## Baixar mídia reutilizável

Ponto final:

```http
GET /v1/media/{media_asset_id}/download
```

Requer `media:read`. Transmite os bytes armazenados do armazenamento Easyhook. Esta solicitação não chama Meta e destina-se a caixas de entrada construídas pelo cliente ou CRMs que precisam renderizar mídia do Easyhook. Os downloads estão logados `media_access_logs` para a medição de transferência. `10 GB/month` de transferência de mídia; transferência adicional é faturada mensalmente em `3 MXN/GB`.

Exemplo:

```bash
curl -L "https://api.easyhook.dev/v1/media/media_asset_uuid/download" \
  -H "Authorization: Bearer eh_live_xxx" \
  --output logo.png
```

O mesmo padrão de download autenticado aplica- se aos URLs privados entregues
Webhooks de entrada:

```bash
curl -L "$EASYHOOK_MEDIA_URL" \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  --output inbound-media
```

Não expor a chave de API no HTML do navegador. Transferir através de uma infraestrutura de confiança,
n8n credencial, ou trabalhador do lado do servidor. Uma solicitação de navegador nua para o URL é
espera-se falhar porque a mídia do cliente que entra é privada.

## Excluir mídia reutilizável

Ponto final:

```http
DELETE /v1/media/{media_asset_id}
```

Requer `media:write`. Exclui o objeto armazenado e marca o ativo de mídia como excluído para que seu nome possa ser reutilizado para o mesmo WABA.

Exemplo:

```bash
curl -X DELETE https://api.easyhook.dev/v1/media/media_asset_uuid \
  -H "Authorization: Bearer eh_live_xxx"
```

## Enviar mídia reutilizável pelo nome

Ponto final:

```http
POST /v1/messages/media
```

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from` | string | WhatsApp Proprietário `account.id` (Meta número de telefone ID) ou número de telefone comercial. |
| `to` | string | Número do destinatário do WhatsApp. |
| `type` | string | Tipo de mídia: `image`, `video`, `audio`, `document`, ou `sticker`. |
| `media_name`, `id`, ou `link` | string | Easyhook nome de mídia reutilizável, ID de mídia Meta, ou URL de mídia pública. Exatamente um é necessário. |

Campos necessários para Messenger, Instagram e Telegram:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from` | string | Prestador próprio `account.id`. |
| `to` | string | Mensagem PSID, Instagram IGSID, ou Telegram chat ID. |
| `type` | string | `image`, `video`, `audio`, ou `file`. `document` é normalizado para `file` Se necessário. |
| `media_name`, `id`, ou `link` | string | Nome de mídia reutilizável da organização, id de anexos do provedor existente ou URL de mídia HTTPS pública. |

Campos opcionais:

| Campo | Aplica-se a | Designação das mercadorias |
| --- | --- | --- |
| `caption` | `image`, `video`, `document` | Legenda enviada com a mídia. |
| `filename` | `document` | Nome do arquivo do documento apresentado ao destinatário. |
| `at` | todos os tipos | ISO 8601 data/hora para a entrega programada. |
| `phone_id` | todos os tipos | Legado Easyhook telefone linha id. Preferir `from`. |

Notas:

- As mensagens de mídia WhatsApp são mensagens de sessão e requerem uma janela aberta de serviço ao cliente 24 horas.
- Os adesivos e o áudio não suportam legendas.
- Os adesivos WhatsApp devem ser arquivos WebP válidos medindo exatamente 512 x 512 px. Easyhook rejeita adesivos reutilizáveis com `invalid_sticker_dimensions` antes de enviar ou carregar a operação de envio. O erro inclui ambos `dimensions` e `expected_dimensions`.
- Preferir mídia reutilizável gerenciada por Easyhook para envios repetidos. A mídia de sessão ainda pode usar `id` ou `link`.
- Quando `media_name` é usado, o Easyhook cria uma URL assinada internamente de curta duração e envia essa URL para o Meta. As aplicações do cliente só precisam de conhecer a estabilidade `media_name`.
- `media_name` resolve um activo reutilizável em toda a organização. O mesmo nome pode
  ser usado a partir do WhatsApp, Messenger, Instagram ou Telegram quando esse provedor
  suporta o tipo de mídia selecionado.

Exemplo usando um link:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","type":"image","link":"https://example.com/image.png","caption":"Imagen de prueba"}'
```

Exemplo usando mídia reutilizável:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/media \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","type":"image","media_name":"promo_image","caption":"Promo"}'
```

## Fluxos do WhatsApp

Fluxos são ativos de nível WABA. Easyhook armazena metadados de fluxo por organização e WABA, em seguida, envia Flows publicados como mensagens interativas do WhatsApp.

Âmbito actual:

- Sincronizar/listar metadados de fluxo do Meta.
- Crie um registro básico do Flow no Meta quando o token WABA o permitir.
- Publique um Flow local chamando Meta.
- Envie um Flow publicado dentro da janela de serviço ao cliente 24 horas.
- Armazenagem Submissões de fluxo por `flow_token`.
- Entregue submissões completas do Flow aos webhooks do cliente como `flow.submitted`.
- Lidar com chamadas de troca de dados do WhatsApp Flow em `/v1/meta/whatsapp/flows/data`.

Troca de dados de fluxo de produção requer `WHATSAPP_FLOW_PRIVATE_KEY` na infraestrutura. A chave pode ser um valor PEM com linhas novas escapadas ou um PEM codificado com base64. Quando um Flow é criado com `endpoint_uri`, Easyhook deriva a chave pública correspondente e envia-a para Meta como `public_key`; clientes não precisam colar chaves manualmente por Flow. Easyhook descriptografa Meta `encrypted_aes_key` / `encrypted_flow_data`, armazena a submissão, e retorna uma resposta criptografada.

Para Fluxos estáticos enviados através do webhook de mensagem normal do WhatsApp, Easyhook analisa `interactive.nfm_reply.response_json`, armazena a submissão, e emite o mesmo `flow.submitted` evento webhook do cliente. Clientes não precisam analisar Meta's `nfm_reply` Carregam-se a si próprios.

Para chamadas de API do cliente nesta seção, o WABA pode ser resolvido com qualquer um de:

| Campo | Onde | Designação das mercadorias |
| --- | --- | --- |
| `from` | consulta/corpo | Número de telefone de negócios do WhatsApp. Preferido para integrações de clientes. |
| `phone_id` | consulta/corpo | ID da linha do telefone Easyhook. |
| `waba_id` | consulta/corpo | Easyhook WABA row id. |

### Sincronizar os Fluxos

Ponto final:

```http
POST /v1/flows/sync
```

Requer `flows:write`.

```bash
curl -X POST https://api.easyhook.dev/v1/flows/sync \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001"}'
```

Resposta de sucesso:

```json
{ "ok": true, "count": 2 }
```

### Fluxos de Lista

Ponto final:

```http
GET /v1/flows?from=15550100001
```

Requer `flows:read`.

```bash
curl -X GET "https://api.easyhook.dev/v1/flows?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

### Criar Fluxo

Ponto final:

```http
POST /v1/flows
```

Requer `flows:write`.

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `waba_id`, `phone_id`, ou `from` | string | Resolução WABA. Preferir `from` para integrações de clientes. |
| `name` | string | Nome do fluxo em Meta. |
| `categories` | string[] | Categorias Meta Flow. |

Campos opcionais:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `flow_json` | objeto | Flow definição JSON, passado para Meta. |
| `endpoint_uri` | string | Troca de dados URI quando o Flow precisa de backend callbacks. |

```bash
curl -X POST https://api.easyhook.dev/v1/flows \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "name": "communication_preferences",
    "categories": ["SIGN_UP"],
    "flow_json": {
      "version": "7.1",
      "screens": []
    }
  }'
```

### Publicar fluxo

Ponto final:

```http
POST /v1/flows/{local_flow_id}/publish
```

Requer `flows:write`.

```bash
curl -X POST https://api.easyhook.dev/v1/flows/local_flow_uuid/publish \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001"}'
```

### Apagar o Fluxo

Ponto final:

```http
DELETE /v1/flows/{local_flow_id}
```

Requer `flows:write`. Apaga o Fluxo em Meta e remove o registro local do Easyhook Flow. O WABA pode ser passado na string de consulta ou no corpo JSON.

```bash
curl -X DELETE "https://api.easyhook.dev/v1/flows/local_flow_uuid?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

### Enviar mensagem de fluxo

Ponto final:

```http
POST /v1/messages/flow
```

Requer `messages:write`. As mensagens de fluxo são mensagens de sessão interativas e requerem uma janela aberta de serviço ao cliente 24 horas.

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from` | string | Número de telefone de negócios do WhatsApp. |
| `to` | string | Número do destinatário do WhatsApp. |
| `flow_id`, `flow_name`, ou `flow_local_id` | string | Referência de fluxo. |
| `body` | string | Corpo da mensagem mostrado acima do CTA. |
| `cta` | string | Texto do botão de fluxo. |

Campos opcionais:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `flow_token` | string | O seu token de correlação. O Easyhook gera um, se omitido. |
| `flow_action` | string | Predefinições `navigate`. |
| `flow_action_payload` | objeto | A carga passou para a ação Flow. |
| `header` | objeto | Opcional Meta objeto de cabeçalho interativo. |
| `footer` | string | Texto opcional do rodapé. |

```bash
curl -X POST https://api.easyhook.dev/v1/messages/flow \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "to": "15550100002",
    "flow_name": "communication_preferences",
    "body": "Manage your communication preferences.",
    "cta": "Open preferences",
    "flow_token": "contact_123_preferences"
  }'
```

### Listar as Submissões de Fluxo

Ponto final:

```http
GET /v1/flows/{local_flow_id}/submissions?from=15550100001
```

Requer `flows:read`.

```bash
curl -X GET "https://api.easyhook.dev/v1/flows/local_flow_uuid/submissions?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

Resposta de sucesso:

```json
{
  "submissions": [
    {
      "id": "submission_uuid",
      "flow_token": "contact_123_preferences",
      "contact_wa_id": "15550100002",
      "action": "complete",
      "screen": "OPT_IN",
      "data": { "service_opt_in": true },
      "created_at": "2026-07-02T20:00:00.000Z"
    }
  ]
}
```

### Webhooks de submissão de fluxo

Para receber respostas da Flow em tempo real, crie um webhook do cliente subscrito:

```json
{
  "scope": { "type": "organization" },
  "events": ["flow.submission.*"],
  "providers": ["whatsapp"]
}
```

Utilização `scope: { "type": "phone", "from": "15550100002" }` quando apenas um número WhatsApp deve receber o retorno de chamada, ou usar `type: "waba"` com o mesmo `from` número para cada número conectado nesse WABA. Messenger e Instagram usam `type: "channel"` com um apelido de canal. Meta Business Portfolio IDs não são escopos públicos.

Easyhook envia `flow.submitted` após a apresentação ser armazenada. `flow.token` usado ao enviar o Flow, os identificadores Flow, o contato WhatsApp e o enviado `flow.data`.

Em caso de apresentação de propostas `data` contém `service_opt_in`, `marketing_opt_in`, `service_opt_out`, ou `marketing_opt_out` como `true`, Easyhook também atualiza o estado de consentimento de contato e armazena um evento de auditoria com a submissão da Flow como evidência.

```json
{
  "id": "event_uuid",
  "type": "flow.submitted",
  "channel": "whatsapp",
  "account": {
    "id": "123456789012345",
    "phone": "15550100002"
  },
  "contact": {
    "id": "15550100002"
  },
  "flow": {
    "submission_id": "submission_uuid",
    "name": "easyhook_consent_preferences_opt_in",
    "token": "contact_123_preferences",
    "action": "complete",
    "data": {
      "service_opt_in": true
    }
  }
}
```

### Endpoint de Troca de Dados de Fluxos

Configurar os Fluxos dinâmicos do WhatsApp para chamar:

```http
POST /v1/meta/whatsapp/flows/data
```

Este endpoint é chamado por Meta, não por clientes de API do cliente. Easyhook resolve o `flow_token` gerado ou fornecido quando `/v1/messages/flow` foi enviado, em seguida, armazena o enviado `data`.

## Endpoints da Meta e do portal

Esses endpoints fazem parte das operações do Easyhook, integração, recursos do portal ou compatibilidade atrasada. Eles são documentados para que os integradores entendam o que podem ver em logs, mas não são a superfície preferida para novas integrações de API do cliente.

### Ingestão Meta Webhook

Chamado apenas por Meta:

| Método | Ponto final | Objetivo |
| --- | --- | --- |
| `GET` | `/v1/meta/whatsapp/webhook` | Verificação Meta webhook para WhatsApp. |
| `POST` | `/v1/meta/whatsapp/webhook` | Recebe API do WhatsApp Cloud, coexistência, modelo, status e cargas úteis do Flow webhook. |
| `GET` | `/v1/meta/messaging/webhook` | Verificação Meta webhook para Mensagens Messenger/Instagram. |
| `POST` | `/v1/meta/messaging/webhook` | Recebe Messenger e Instagram Mensagens webhook cargas. |
| `POST` | `/v1/meta/whatsapp/flows/data` | Recebe chamadas de troca de dados criptografadas do WhatsApp Flow. |

Os clientes não chamam esses endpoints diretamente. Os sistemas de clientes recebem eventos normalizados através de webhooks de clientes.

### Operações Portal/Admin

Estes requerem o token de administrador Easyhook e são usados pelo portal ou operações:

| Método | Ponto final | Objetivo |
| --- | --- | --- |
| `POST` | `/v1/api-keys` | Crie uma chave de API de organização. |
| `GET` | `/v1/api-keys?tenant_id=...` | Listar chaves de API do organização. |
| `POST` | `/v1/api-keys/{key_id}/revoke` | Revogar uma chave de API de organização. |
| `GET` | `/v1/hooks?tenant_id=...` | Listar webhooks de clientes. |
| `POST` | `/v1/hooks` | Crie um webhook do cliente. |
| `POST` | `/v1/hooks/{hook_id}/pause` | Pausa um webhook do cliente. |
| `DELETE` | `/v1/hooks/{hook_id}` | Apagar um webhook do cliente. |
| `POST` | `/v1/hooks/{hook_id}/history-replays` | Reenviar mensagens de coexistência armazenadas ou contatos para um webhook ativo em lotes. |
| `GET` | `/v1/hooks/{hook_id}/history-replays/{replay_id}?tenant_id=...` | Leia o progresso da repetição. |
| `POST` | `/v1/channels/messenger/connect` | Conecte uma página do Facebook / canal Messenger a partir de um código Meta OAuth. |
| `POST` | `/v1/meta/whatsapp/signup/complete` | Completar o registro incorporado do WhatsApp. |
| `POST` | `/v1/meta/whatsapp/connections/adopt` | Adote uma conexão WhatsApp existente em um organização. |
| `POST` | `/v1/meta/whatsapp/phones/sync` | Sincronize os metadados de telefone do WhatsApp do Meta. |
| `POST` | `/v1/meta/whatsapp/phones/coexistence-sync` | Solicite o histórico de coexistência do WhatsApp Business App/state sync. |
| `GET` | `/v1/meta/whatsapp/phones/coexistence-sync/status?tenant_id=...&phone_id=...` | Leia o último estado de sincronização de coexistência para o portal. |
| `POST` | `/v1/meta/whatsapp/phones/coexistence-sync/resume` | Continuar tarefas falhadas persistentes a partir de uma sincronização parcial/falha sem reconectar o telefone. |
| `POST` | `/v1/meta/whatsapp/phones/register` | Registre um telefone WhatsApp provisado com um PIN de seis dígitos. Não use para um número de coexistência já funcionando. |
| `GET` | `/v1/integrations/chatwoot?tenant_id=...` | Lista integrações Chatwoot gerenciadas por portal. |
| `POST` | `/v1/integrations/chatwoot` | Forneça um Chatwoot API Inbox e sua assinatura Easyhook escopo. |
| `DELETE` | `/v1/integrations/chatwoot/{integration_id}` | Desconectar Chatwoot sem excluir sua Inbox/história existente. |
| `GET` | `/v1/integrations/chatwoot/{integration_id}/imports?tenant_id=...` | Leia o progresso da importação de contato/história. |
| `POST` | `/v1/integrations/chatwoot/{integration_id}/imports` | Iniciar uma `contacts` ou `history` Importação. |
| `POST` | `/v1/wallet/topups/stripe/checkout` | Criar um check-out hospedado no Stripe para recarga de carteiras MXN ou USD. Rota interna/administrativa. |
| `POST` | `/v1/billing/stripe/webhook` | Receba os eventos assinados Stripe Checkout e credite a carteira da organização correspondente. Chamado apenas por Stripe. |

Parâmetros chave da API de administração:

| Ponto final | Requerido | Opcional |
| --- | --- | --- |
| `POST /v1/api-keys` | `tenant_id`, `name` | `environment` (`test` ou `live`, por omissão a `test`), `scopes` array de string. Se omitido, o Easyhook concede os escopos padrão do cliente. |
| `GET /v1/api-keys` | consulta `tenant_id` | nenhum |
| `POST /v1/api-keys/{key_id}/revoke` | caminho `key_id`, corpo `tenant_id` | nenhum |

Parâmetros do portal do Chatwoot:

| Ponto final | Requerido | Opcional |
| --- | --- | --- |
| `GET /v1/integrations/chatwoot` | consulta `tenant_id` | nenhum |
| `POST /v1/integrations/chatwoot` | `tenant_id`, `base_url`, numérico `account_id`, `api_token`, `channels` array com um ou mais `{ sender, provider }` objetos | Por canal `label`; campos legados de um canal único `sender`, `provider`, e `name` permanecer aceite |
| `DELETE /v1/integrations/chatwoot/{integration_id}` | caminho `integration_id`, corpo `tenant_id` | nenhum |
| `GET /v1/integrations/chatwoot/{integration_id}/imports` | caminho `integration_id`, consulta `tenant_id` | nenhum |
| `POST /v1/integrations/chatwoot/{integration_id}/imports` | caminho `integration_id`, `tenant_id`, `import_type` (`contacts` ou `history`) | nenhum |

O tokenized `/v1/integrations/chatwoot/events/...` e
`/v1/integrations/chatwoot/webhook/...` callbacks são gerados e usados
servidor- a- servidor por Easyhook e Chatwoot. Os clientes não devem construir ou chamar
Eles manualmente.

Os parâmetros de administração do Webhook do cliente estão documentados em [Cliente Webhooks](/webhooks)Em suma, `POST /v1/hooks` aceita `tenant_id`, `name`, `url`, `events`, `providers`, `scope_type`, `scope_ref`, `auth_type`, e `auth_header_name`.

O roteamento do Webhook usa três filtros separados:

- `providers` escolhe a família de canais: `whatsapp`, `messenger`, `instagram`, ou `*`.
- `scope_type` escolhe o nível do activo: `tenant` para toda a organização, `waba` ou `phone` para WhatsApp, e `channel` para Messenger/Instagram.
- `events` escolhe a família do evento, por exemplo `message.*`, `status.*`, `template.*`, ou `flow.submission.*`.
- Messenger e Instagram mensagens de entrada podem chegar como `message.text`, `message.image`, `message.video`, `message.audio`, ou `message.file`. Subscrever `message.*` para todos os tipos de mensagem suportados, ou para um evento concreto se você só quiser um tipo específico.

O estilo recomendado é manter o fornecedor e o evento separados. Por exemplo, use `providers: ["messenger"]` com `events: ["message.*"]`, não um padrão de evento prefixado pelo provedor. Os padrões prefixados pelo provedor permanecem compatíveis com o backward, mas não são o estilo preferido para novas integrações.

Meta-inboarding/admin parâmetros:

| Ponto final | Requerido | Opcional |
| --- | --- | --- |
| `POST /v1/channels/messenger/connect` | `tenant_id`, `code`, `redirect_uri` | `page_id` |
| `POST /v1/meta/whatsapp/signup/complete` | `tenant_id`, `code`, `redirect_uri` | `waba_id`, `business_id`, `phone_number_id`, `event`, `signup_mode`, `code_received_at`, `backend_post_started_at`, `client_started_at`, `dialog_redirect_uri`, `oauth_redirect_uri` |
| `POST /v1/meta/whatsapp/connections/adopt` | `tenant_id`, `access_token` | `waba_id`, `business_id`, `phone_number_id`, `request_coexistence_sync` |
| `POST /v1/meta/whatsapp/phones/sync` | `tenant_id`, `phone_id` | nenhum |
| `POST /v1/meta/whatsapp/phones/coexistence-sync` | `tenant_id`, `phone_id` | `media_mode`: `metadata`, `recent_media`, ou `all_recent_media` |
| `POST /v1/meta/whatsapp/phones/coexistence-sync/resume` | `tenant_id`, `phone_id` | `sync_id`; se omitido, Easyhook usa a última sessão |
| `POST /v1/meta/whatsapp/phones/register` | `tenant_id`, `phone_id`, `pin` | `pin` deve conter exatamente seis dígitos |

As rotas da carteira não são autenticadas com as chaves da API do cliente. O portal verifica que o usuário conectado possui ou administra a organização, então chama a rota de saída com o token de administrador Easyhook. A saída aceita `tenant_id`, `amount_cents`, `currency`, opcional `customer_email`, `success_url`, e `cancel_url`. Os recargas MXN variam de `$100` para `$5,000 MXN`; USD top-ups variam de `$10` para `$500 USD`. créditos Easyhook exatamente o valor pago na moeda fixa da carteira e absorve taxas de processamento Stripe. O webhook verifica o corpo de pedido bruto com `Stripe-Signature` e `STRIPE_WEBHOOK_SECRET`, e apenas pago `checkout.session.completed` ou `checkout.session.async_payment_succeeded` os eventos podem creditar a carteira. O evento do provedor e os IDs do checkout fazem idempotent da entrega repetida.

### Alias legados de rotas do WhatsApp

Estas rotas permanecem implementadas para compatibilidade portal/regresso, mas não são recomendadas para novas integrações. `/v1/messages/*`, `/v1/templates*`, `/v1/flows*`, e `/v1/consent*` rotas em vez disso.

| Família de itinerários legados | Família de rotas preferidas |
| --- | --- |
| `/v1/whatsapp/messages/text` | `/v1/messages/text` |
| `/v1/whatsapp/messages/template` | `/v1/messages/template` |
| `/v1/whatsapp/templates`, `/sync`, `/delete` | `/v1/templates`, `/sync`, `/delete` |
| `/v1/whatsapp/flows`, `/sync`, `/{id}/publish`, `/{id}`, `/{id}/submissions` | `/v1/flows` equivalentes |
| `/v1/whatsapp/consent/config`, `/enable` | `/v1/consent/config`, `/enable` |

## Listar templates de um número

Ponto final:

```http
GET /v1/templates?from=15550100001
```

`from` é o número de negócio WhatsApp proprietário. Easyhook resolve o WABA por trás desse número e retorna apenas modelos para que WABA. Se a chave de API organização não possui o número, a solicitação retorna `phone_not_found`.

### Sender e isolamento WABA

A lista de modelos, sincronização, criação, upload de mídia e exclusão de operações usam o mesmo resolvedor restrito:

- A chave de API corrige o limite da organização.
- Quando `from` ou `phone_id` Está presente, o WABA registado pelo remetente é autoritário.
- Easyhook nunca cai de volta para outro WABA quando esse remetente não pode ser resolvido.
- Se `waba_id` é também fornecido, deve identificar o mesmo WABA que o remetente.
- Um conflito remetente/WABA retorna `409 sender_waba_mismatch` Antes que o Easyhook chame o Meta.
- Um remetente desconhecido retorna `404 phone_not_found`; não continua com `waba_id`.

As integrações de clientes devem enviar apenas `from`. Fornecer ambos os selectores é útil para a reconciliação, não
para substituir o WABA associado a um telefone.

Exemplo:

```bash
curl -X GET "https://api.easyhook.dev/v1/templates?from=15550100001" \
  -H "Authorization: Bearer eh_live_xxx"
```

`waba_id` ainda é aceito para uso legado/interno, mas as integrações do cliente devem preferir `from`.

A resposta sempre identifica explicitamente a conta do provedor:

```json
{
  "meta_waba_id": "123456789012345",
  "templates": [
    {
      "id": "easyhook-template-uuid",
      "template_id": "987654321098765",
      "meta_waba_id": "123456789012345",
      "name": "pedido_listo",
      "lang": "es_MX",
      "status": "APPROVED",
      "parameter_format": "POSITIONAL"
    }
  ]
}
```

`meta_waba_id` é o identificador WABA estável da Meta. `waba_id`, quando presente para trás
compatibilidade, é UUID interno do Easyhook e não deve ser enviado para Meta ou usado como o identificador do provedor.

## Sincronizar Modelos

Ponto final:

```http
POST /v1/templates/sync
```

Requer `templates:write`. Puxa modelos da Meta para um WABA e armazena o status atual, qualidade, idioma, categoria e componentes em Easyhook.

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from`, `phone_id`, ou `waba_id` | string | Resolução WABA. Preferir `from` para integrações de clientes. |

Exemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/templates/sync \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001"}'
```

A resposta inclui os modelos retornados pelo Meta após o status local ter sido atualizado:

```json
{
  "ok": true,
  "meta_waba_id": "123456789012345",
  "count": 1,
  "templates": [
    {
      "id": "1234567890",
      "meta_waba_id": "123456789012345",
      "name": "pedido_listo",
      "language": "es_MX",
      "category": "UTILITY",
      "status": "APPROVED",
      "parameter_format": "POSITIONAL",
      "components": []
    }
  ]
}
```

## Verificar a Categoria do Modelo

Ponto final:

```http
POST /v1/templates/classify
```

Requer `templates:write`. Enviar `category` e o `components`.
Easyhook retorna conselhos determinísticos e rápidos antes da submissão:

```json
{
  "category": "UTILITY",
  "components": [
    { "type": "BODY", "text": "Aprovecha 20% de descuento hoy." }
  ]
}
```

Quando o conteúdo aparece promocional, a resposta pode recomendar `MARKETING`
e incluir um aviso. Esta verificação é consultiva e nunca substitui Meta final
classificação.

## Criar um Modelo

Ponto final:

```http
POST /v1/templates
```

Requer `templates:write`. Cria um modelo WhatsApp no Meta e armazena o
cópia local. A resposta inclui `category_advice`; avisos não bloqueiam
Submissão.

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from`, `phone_id`, ou `waba_id` | string | Resolução WABA. Preferir `from` para integrações de clientes. |
| `name` | string | Nome do modelo. Use letras minúsculas, números e sublinhados. |
| `language` | string | Código do meta- idioma, por exemplo `es_MX` ou `en_US`. |
| `category` | string | Categoria do meta- modelo, por exemplo `UTILITY`, `MARKETING`, ou `AUTHENTICATION`. |
| `components` | array | Array de componentes de meta- modelo. |

Campos opcionais:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `parameter_format` | string | `POSITIONAL` (por omissão) ou `NAMED`. Easyhook valida e encaminha para Meta. |
| `message_send_ttl_seconds` | número | A meta- mensagem envia o TTL para categorias de modelos suportadas. |

Enviar uma estabilidade `Idempotency-Key` cabeçalho para criação segura de repetição. Repetindo a mesma tecla e retorna JSON
o resultado original com `idempotent_replay: true` e não chama o Meta novamente. Reutilizando uma chave com diferentes
retorna dados do modelo `409 idempotency_key_reused_with_different_request`. Mantenha a chave em 255 caracteres ou
Menos.

Exemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/templates \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Idempotency-Key: template-order-ready-en-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100001",
    "name": "order_ready",
    "language": "en_US",
    "category": "UTILITY",
    "parameter_format": "NAMED",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{customer_name}}, your order is ready.",
        "example": {
          "body_text_named_params": [
            {
              "param_name": "customer_name",
              "example": "Example User"
            }
          ]
        }
      }
    ]
  }'
```

Resposta:

```json
{
  "ok": true,
  "meta_waba_id": "123456789012345",
  "template_id": "987654321098765",
  "status": "PENDING",
  "parameter_format": "NAMED"
}
```

### Enviar a Mídia de Cabeçalho do Modelo

```http
POST /v1/templates/media
```

Requer `templates:write`. Easyhook faz upload do arquivo através da API de upload retomável da Meta e retorna o
`handle` exigido em `components[].example.header_handle` ao criar uma imagem, vídeo ou documento
modelo.

Identificar a WABA com `from`, `phone_id`, ou `waba_id`Forneça exatamente uma fonte:

- `file_base64` em conjunto com `file_name` e `file_type`.
- `source_url`, contendo um URL HTTPS público. Easyhook baixa e valida o arquivo antes de enviá-lo
  URLs de rede privada, credenciais em URLs, URLs não-HTTPS e redirecionamentos para esses destinos são
  rejeitada.

Utilização `source_url` Base64 aumenta o tamanho do pedido e destina-se a aprovação menor
Activos.

Para manter o exemplo de aprovação como o ativo de envio padrão, também fornecer `template_name`,
`template_language`, e `media_type` (`image`, `video`, ou `document`).

```bash
FILE_BASE64="$(base64 -w 0 ./promotion.jpg)"

curl -X POST https://api.easyhook.dev/v1/templates/media \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$EASYHOOK_FROM\",
    \"template_name\": \"monthly_offer\",
    \"template_language\": \"es_MX\",
    \"media_type\": \"image\",
    \"file_name\": \"promotion.jpg\",
    \"file_type\": \"image/jpeg\",
    \"file_base64\": \"$FILE_BASE64\"
  }"
```

A mesma operação usando um URL:

```json
{
  "from": "15550100002",
  "source_url": "https://cdn.example.com/monthly-offer.mp4",
  "template_name": "monthly_offer_video",
  "template_language": "es_MX",
  "media_type": "video"
}
```

Use o identificador devolvido nos componentes de criação:

```json
{
  "type": "HEADER",
  "format": "IMAGE",
  "example": {
    "header_handle": ["4::meta-upload-handle"]
  }
}
```

Enviando novamente para o mesmo WABA, nome do modelo e idioma substitui o ativo padrão Easyhook e
remove o objeto de armazenamento privado anterior.

## Excluir template

Ponto final:

```http
POST /v1/templates/delete
```

Requer `templates:write`. Apaga um modelo no Meta e remove o registro local do Easyhook.

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from`, `phone_id`, ou `waba_id` | string | Resolução WABA. Preferir `from` para integrações de clientes. |
| `template_id` | string | ID de linha de modelo local do Easyhook. |

Exemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/templates/delete \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","template_id":"template_uuid"}'
```

## Enviar uma mensagem de template

Ponto final:

```http
POST /v1/messages/template
```

Campos obrigatórios:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `from` | string | Número de telefone de negócios do WhatsApp. |
| `to` | string | Número do destinatário do WhatsApp. |
| `template` ou `template_id` | objeto/texto | Referência do modelo público ou identificador interno da linha do modelo legado. |

Campos opcionais:

| Campo | Tipo | Designação das mercadorias |
| --- | --- | --- |
| `parameters` | objeto | Formato variável amigável. Easyhook converte para Meta `components`. |
| `components` | array | Componentes de modelos de meta brutos. Sobrescreve `parameters` quando enviado. |
| `media` | objeto | Mídia de cabeçalho dinâmica. Use exatamente um dos `link`, `id`, ou meios reutilizáveis `name`Os documentos podem incluir: `filename`. |
| `at` | string | ISO 8601 data/hora para a entrega programada. |
| `phone_id` | string | Legado Easyhook telefone linha id. Preferir `from`. |

Referência do modelo recomendada por nome e idioma:

```json
{
  "template": {
    "name": "pedido_listo",
    "language": "es_MX"
  }
}
```

Referência do modelo apenas para o nome é aceite apenas quando o nome do modelo resolve exatamente um modelo no WABA atrás `from`:

```json
{
  "template": {
    "name": "welcome_template_test"
  }
}
```

Também é aceita a referência do meta- id do modelo:

```json
{
  "template": {
    "meta_template_id": "1234567890"
  }
}
```

Variáveis do modelo:

Utilização `parameters.body` e `parameters.header` para variáveis de texto. Easyhook converte estas em componentes do modelo Meta.

Forma de arranjo para variáveis posicionais:

```json
{
  "parameters": {
    "body": ["Example User", "12345"]
  }
}
```

Formulário de objeto para variáveis nomeadas ou numeradas:

```json
{
  "parameters": {
    "body": {
      "1": "Example User",
      "order_id": "12345"
    }
  }
}
```

Meta Manual `components` ainda pode ser enviado diretamente para casos avançados:

```json
{
  "components": [
    {
      "type": "body",
      "parameters": [{ "type": "text", "text": "Example User" }]
    }
  ]
}
```

### Mídia de Cabeçalho Predefinida e Dinâmica

Para modelos de cabeçalho de imagem, vídeo e documento, o Easyhook usa esta precedência:

1. Um cabeçalho de mídia fornecido em `components`.
2. O amigo `media` Objetivo.
3. O activo de aprovação armazenado pela Easyhook.

Os meios de comunicação apresentados para aprovação são um padrão reutilizável, não uma restrição. Podem ser substituídos de forma independente
em cada envio.

URL dinâmico:

```json
{
  "from": "15550100002",
  "to": "13125550199",
  "template": { "name": "monthly_offer", "language": "es_MX" },
  "media": { "link": "https://cdn.example.com/customer-specific-offer.jpg" },
  "parameters": { "body": ["Example User"] }
}
```

Anteriormente em Meta Media:

```json
{ "media": { "id": "123456789012345" } }
```

Mídia Easyhook reutilizável:

```json
{ "media": { "name": "july_catalog", "filename": "catalog-july.pdf" } }
```

Componente do meta- documento em bruto:

```json
{
  "components": [
    {
      "type": "header",
      "parameters": [
        {
          "type": "document",
          "document": {
            "link": "https://cdn.example.com/invoice.pdf",
            "filename": "invoice-123.pdf"
          }
        }
      ]
    }
  ]
}
```

O tipo de mídia dinâmica deve corresponder ao formato de cabeçalho aprovado. Easyhook rejeita referências ambíguas,
links não-HTTPS, mídia em modelos sem um cabeçalho de mídia, e imagens/vídeo/documento descompassos.

Os modelos agendados preservam a referência de mídia selecionada. A mídia reutilizável é resolvida e assinada quando o
o trabalho agendado executa, evitando URLs expiradas.

Depois de editar um modelo no Meta, chame `POST /v1/templates/sync`. Easyhook upserts o ID do provedor atual,
status, componentes, categoria e qualidade para o mesmo WABA/nome/língua. Não envie a definição editada
até que o estado sincronizado retorne para `APPROVED`.

Exemplo:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/template \
  -H "Authorization: Bearer eh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"15550100001","to":"15550100002","template":{"name":"pedido_listo","language":"es_MX"},"parameters":{"body":["Example User"]}}'
```

Resposta de sucesso:

```json
{ "ok": true, "wamid": "wamid..." }
```

## Conversa ao vivo do Easyhook

O chat ao vivo é um canal de propriedade do Easyhook para aplicações de navegador.
usá- lo sem operar uma infraestrutura separada e sem expor uma normal
Chave de API Easyhook. Crie e configure o widget no portal e, em seguida, copie o
Tecla publicável (`eh_chat_pk_...`) no site.

A chave publicável só identifica um elemento. Não concede acesso ao
organização, Inbox, Supabase, outros contatos ou outras conversas. Configurar
um allowlist de origem exata e renderize Cloudflare Turnstile antes de iniciar um
sessão de visitas.

Criar uma sessão:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions \
  -H 'Origin: https://shop.example' \
  -H 'Content-Type: application/json' \
  -d '{
    "public_key":"eh_chat_pk_xxx",
    "display_name":"Ada",
    "email":"ada@example.com",
    "turnstile_token":"TURNSTILE_RESPONSE"
  }'
```

Clientes anônimos não podem escolher `visitor_id`; Easyhook gera um fresco
`ehusr_...` identidade para que um navegador não possa reivindicar o histórico de outro visitante.
resposta também inclui `conversation_id` (`ehconv_...`), um acesso de 15 minutos
token e um token de atualização rotativo. Armazene os tokens apenas para este navegador.

Para um usuário de aplicativo conectado, a infraestrutura do cliente cria um
token de identidade de cinco minutos com sua chave de API Easyhook:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/identity-tokens \
  -H 'Authorization: Bearer eh_live_xxx' -H 'Content-Type: application/json' \
  -d '{"widget_id":"WIDGET_UUID","external_user_id":"usr_42","roles":["buyer"]}'
```

Passar o retornado `identity_token` para iniciar sessão. As funções são opacas
metadados do cliente; Easyhook impõe a identidade assinada, conversação
associação e permitido ação de bate-papo, enquanto o cliente permanece responsável por
as suas próprias regras de autorização de negócios.

Enviar uma mensagem de texto com um identificador de idempotência gerado pelo cliente:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions/current/messages \
  -H 'Origin: https://shop.example' \
  -H 'Authorization: Bearer eh_chat_session_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"body":"Preciso de ajuda","client_message_id":"web_01JABCDEF"}'
```

Utilizar o mesmo parâmetro de avaliação com `type` igual a `image`, `video`, `audio`,
`document`, ou `sticker` e fornecer `file_name`, `file_type`, e
`file_base64`. `reply_to` cita outra mensagem e `forwarded_from` conserva
O identificador de mensagem original quando a aplicativo encaminha o conteúdo.

Edições, exclusões, reações, leituras e digitação usam uma ação idempotente:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions/current/actions \
  -H 'Origin: https://shop.example' \
  -H 'Authorization: Bearer eh_chat_session_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"action":"reaction","message_id":"lc_xxx","emoji":"❤️","client_action_id":"action_01JABCDEF"}'
```

Leia novas mensagens:

```bash
curl 'https://api.easyhook.dev/v1/live-chat/sessions/current/messages?after=2026-08-18T20:00:00.000Z&limit=50' \
  -H 'Origin: https://shop.example' \
  -H 'Authorization: Bearer eh_chat_session_xxx'
```

Rodar a sessão antes do token de acesso expirar:

```bash
curl -X POST https://api.easyhook.dev/v1/live-chat/sessions/refresh \
  -H 'Origin: https://shop.example' \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"eh_chat_refresh_xxx"}'
```

Atualizar os tokens são de uso único. Uma atualização bem- sucedida invalida ambos os itens anteriores
tokens e retorna um novo par.

Para conversas e grupos diretos de propriedade de aplicativos, uma infraestrutura confiável usa
`POST /v1/live-chat/app/conversations` com `widget_id`, `from`, `kind`,
`members`, e (para grupos) `title`. Lista de clientes abrangidos
`/sessions/current/conversations`, em seguida, ler/enviar em
`/sessions/current/conversations/{ehconv_id}/messages` e usar o irmão
`actions` e `state` endpoints. O servidor sempre infere `from` do âmbito de aplicativo
sessão; os clientes enviam para um `ehconv_...` conversação e não pode forjar outra
O remetente.

O servidor valida a sessão e sua origem original em cada solicitação.
As operações de arranque e sessão têm limites sustentados independentes; limite de taxa
respostas são HTTP `429` com `Retry-After`. As sessões inválidas/expiradas retornam
`401`, uma origem inigualável retorna `403`, e verificação não disponível de catraca
falha ao fechar. Texto/media durável, adesivos, respostas, reencaminhamento de metadados,
reações, edições, marcadores de mensagem excluída e cursores de leitura por membro estão habilitados.
A digitação é um sinal de expiração exposto através `state`; agentes organizações também recebem
através do tópico privado de transmissão da Inbox.

O instalável `easyhook-chat.js` widget renderiza texto e mídia protegida,
adesivos, respostas, reações, edições, marcadores de mensagem excluída, estado de leitura e digitação.
Ele usa apenas os endpoints de sessão escopos; ele nunca incorpora uma API de organização
chave ou credencial Supabase.

As mensagens de visitante de entrada usam o normal `message.text` envelope webhook com
`channel: "live_chat"`, e aparecer na Inbox multicanal.
e ações duráveis usam o livro de registro de operação da carteira com idempotência do cliente
chaves. As sondagens de leitura/lista não são cobradas, impedindo as acusações duplicadas de
atualizar ou reconectar o comportamento.

## Regra da documentação

Ao alterar o comportamento público da API, atualize este documento antes de fundir/deploar a alteração. No mínimo, atualize:

- Endpoint caminho e método.
- Autenticação/escopes se eles mudarem.
- Campos obrigatórios e facultativos.
- Comportamento de erro.
- Pedido de exemplo.
- Conformidade importante ou restrições de meta-política.
