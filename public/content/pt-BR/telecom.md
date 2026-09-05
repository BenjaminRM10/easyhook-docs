# API de Telecom Easyhook

O Easyhook oferece um contrato estável para números, SMS, MMS e chamadas sem
expor objetos específicos da operadora. A disponibilidade depende dos recursos
do número, do país e dos requisitos regulatórios aplicáveis.

## Desenho

O Easyhook expõe recursos estáveis (`numbers`, `messages`, `calls`). Cada número
registra seus recursos para que o cliente consulte o que ele oferece sem criar
ramificações específicas para Telnyx, Infobip, DIDLogic, WhatsApp Calling ou
uma futura operadora.

As credenciais da operadora são segredos da plataforma. A autorização sempre
vem da chave da API Easyhook, e cada consulta de número ou chamada é limitada à
organização correspondente.

## Escopos da aplicação

- `telephony:read`: disponibilidade de números, números conectados e estado de chamada.
- `telephony:write`: SMS/MMS e comandos de chamada.
- As chaves existentes com `messages:read` / `messages:write` continuam aceitas durante o período de migração.

Novas chaves de API padrão incluem ambos os escopos de telefonia.

## Endpoints

### Capacidades

`GET /v1/telecom/capabilities`

Retorna os provedores configurados na implantação e nas versões de contrato estáveis.

### Números conectados

`GET /v1/telecom/numbers`

### Pesquisar no inventário da operadora

`GET /v1/telecom/numbers/available?country_code=MX&area_code=81&capabilities=sms.outbound&capabilities=voice.outbound`

A busca não compra um número. O inventário e os requisitos regulatórios podem mudar entre a busca e o pedido.

Os resultados expõem `activation_price`, `initial_period_price`, `monthly_price`, `due_today`, `initial_period`, `next_renewal_at` e `usage_estimates` na moeda da carteira. `activation_price` é uma cobrança única de ativação. `initial_period_price` calcula proporcionalmente o preço recorrente da Easyhook pelos dias corridos UTC, inclusive, entre a compra e o fim do mês. `due_today` soma a ativação e esse período inicial; `monthly_price` é o valor integral cobrado antecipadamente no primeiro dia dos meses seguintes. Payloads nativos da operadora, custos subjacentes e regras comerciais internas não são retornados. O inventário é omitido quando a Easyhook não consegue verificar e garantir um preço competitivo.

### Comprar um número

`POST /v1/telecom/numbers/orders`

```json
{
  "phone_number": "+15551234567",
  "country_code": "US",
  "messaging_profile_id": "<optional-easyhook-profile-uuid>",
  "expected_currency": "USD",
  "expected_activation_amount_millicents": 100000,
  "expected_initial_period_amount_millicents": 23371,
  "expected_monthly_amount_millicents": 103500,
  "expected_due_today_amount_millicents": 123371
}
```

Com `Idempotency-Key`, a Easyhook consulta novamente o número exato, rejeita preços desatualizados — inclusive uma cotação que atravessou a virada do mês em UTC —, verifica a conformidade regulatória, reserva na carteira o valor integral de `due_today` e só então envia o pedido à operadora. Uma cotação alterada retorna `409 telecom_price_changed` com os valores atuais de ativação, período inicial, mensalidade, total devido hoje, limite do período e renovação. Números que exigem um fluxo regulatório permanecem indisponíveis até que esse fluxo seja implementado.

Perfis de mensagens são recursos Easyhook escopos para uma organização e um programa de consentimento. Números com capacidade de SMS/MMS requerem um perfil ativo que suporte o país de destino; quando `messaging_profile_id` é omitido, Easyhook usa o perfil padrão único da organização e fornece-o automaticamente na primeira compra de número compatível quando nenhum existe. IDs de perfil do portador, estado de opt-out e configuração de palavra-chave nunca são globais ou aceitos a partir de pedidos de clientes. Números somente de voz não exigem um perfil de mensagens.

A compra de um número compatível com SMS/MMS também cria um canal Easyhook `sms` ativo, associado ao mesmo número dentro da organização. As mensagens recebidas ficam no Inbox compartilhado desse canal; as chamadas de voz usam o mesmo número e a mesma identidade de contato, mas mantêm um ciclo de vida separado. Um perfil de mensagens pode ser reutilizado pelos números da organização que compartilham o mesmo programa de consentimento; ele não é criado uma vez por número.

### SMS ou MMS

Endpoint canônico: `POST /v1/messages/text`.

```json
{
  "channel": "sms",
  "from": "+15551234567",
  "to": "+528441234567",
  "body": "Olá da Easyhook"
}
```

`channel` pode ser omitido quando o número identifica apenas Telefonia. Inclua
quando esse mesmo número também está conectado ao WhatsApp.
A rota `POST /v1/messages/sms` permanece temporariamente disponível e retorna um
cabeçalho de descontinuação. MMS usa o contrato canônico `/v1/messages/media` quando
a tarifa do destino e a capacidade do número estão habilitadas.

Ambos os números devem ser E.164. `from` deve ser um número ativo de propriedade da organização autenticada com a capacidade necessária. Use `Idempotency-Key` para cada comando.

Para SMS ou MMS, a Easyhook faz uma reserva conservadora e reembolsável na carteira antes
de contatar a operadora. Uma resposta `202` bem-sucedida expõe essa reserva como
`maximum_reserved_cost`; ela não é a cobrança final. Quando o evento
`message.finalized` chega, a Easyhook calcula a tarifa vigente para o cliente com base
na unidade de faturamento confirmada e devolve a parte não utilizada da reserva. Isso permite
preços dependentes do destino e da operadora sem presumir um custo antes da entrega.
Mensagens recebidas não geram um evento posterior `message.finalized`: a Easyhook cria
uma reserva determinística a partir do callback assinado `message.received`, liquida o valor
imediatamente com base no custo da operadora e devolve qualquer saldo não utilizado.

### Iniciar uma chamada

`POST /v1/calls`

```json
{
  "channel": "phone",
  "from": "+15551234567",
  "to": "+528441234567",
  "endpoint_id": "<registered-call-endpoint-uuid>",
  "max_duration_seconds": 1800
}
```

Para campanhas de IA de saída, selecione um agente do ElevenLabs para essa função.
Pode ser o mesmo agente utilizado para chamadas de entrada ou uma chamada diferente.
agente é útil quando a mensagem de abertura, prompt ou ferramentas diferem, mas Easyhook
não exige essa separação.
Easyhook origina a perna PSTN, espera até que a pessoa responde, e então
liga- o ao SIP ao agente de saída configurado; o áudio não é proxiado
através do Easyhook. O agente recebe a chamada opcional por chamada `context` como
higienizado `X-Easyhook-*` Cabeçalhos SIP (cordas escalares, números e booleanos)
somente; sem credenciais ou conteúdo de mensagem). Perguntas, vozes e ferramentas permanecem
Gerenciado no ElevenLabs.

```json
{
  "channel": "phone",
  "handler": "ai",
  "from": "+15551234567",
  "to": "+528441234567",
  "max_duration_seconds": 900,
  "context": { "customer_id": "crm-1842", "language": "es" }
}
```

Chamadas iniciadas por IA requerem um opt-in de voz explícito prévio para o exato
organização, número de Easyhook e destino. Grave-o com
`POST /v1/consent` usando `channel: "voice"`, `status: "opt_in"`, um não vazio
`evidence` objeto e `captured_at`; registro `opt_out` imediatamente quando a
Contato retira permissão. Easyhook obriga uma tentativa de IA por hora e
três por rolo 24 horas por número/contato, além da idempotência.
A API retorna `voice_ai_consent_required`, `voice_ai_contact_opted_out`,
`voice_ai_outreach_too_soon` ou `voice_ai_outreach_daily_limit` quando uma chamada é
bloqueado. Estas regras de voz complementam (e não substituem) a mensagem Telnyx
STOP/START handling.

`POST /v1/calls` nunca aceita um identificador arbitrário de agente do ElevenLabs.
`handler: "ai"`, Easyhook usa apenas o agente de saída que uma organização
proprietário ou administrador associado com esse número exato do Easyhook. Se estiver ausente,
a API retorna `409 voice_ai_outbound_agent_not_configured`- Nunca cai.
De volta ao agente de entrada.

`handler` por omissão a `human`. É válido apenas para `channel: "phone"` quando
definir como `ai`; o WhatsApp Calling não usa a ponte SIP do ElevenLabs.
resposta para uma chamada de IA é `202` com o recurso de chamada normal e sem WebRTC
token. A mesma chamada ainda pode ser lida e desligada através da chamada padrão
endpoints. A cobrança da carteira começa somente quando a chamada conecta e fixa o
uso arredondado de voz Telnyx; o cliente consome separadamente os minutos
incluído no seu plano do ElevenLabs.

Utilização `channel: "phone"` para PSTN e `channel: "whatsapp"` para WhatsApp
Chamando quando o mesmo `from` pode resolver para ambos. É opcional caso contrário.

`max_duration_seconds` é necessário (`30`–`14400`). Ele determina a reserva máxima de carteira. Easyhook inicia um prazo autenticado servidor-lado quando o provedor relata a chamada respondida; o prazo termina a perna do provedor e resolve a reserva, mesmo se o navegador, telefone ou processo do cliente permanece conectado ou é manipulado. Se um cliente obtém credenciais WebRTC, mas nenhuma chamada do provedor começa dentro de dois minutos, Easyhook cancela a chamada pendente e retorna a reserva completa.

O `webrtc.dial.client_state` da Telnyx é uma autorização assinada, válida por dois minutos e para uma única chamada, vinculada à organização, chamada, endpoint, destino e duração máxima exatos. A conexão por credenciais estaciona a perna WebRTC; a Easyhook valida a autorização e cria de forma idempotente uma perna PSTN pelo aplicativo de Call Control da Telnyx usando `link_to` e `bridge_on_answer`. Assim, as duas pernas são conectadas atomicamente quando o destino atende. A perna PSTN conserva a mesma autorização assinada e é armazenada como par da perna WebRTC canônica. A Easyhook rejeita e encerra imediatamente uma perna de saída da operadora quando essa autorização estiver ausente, expirada, alterada, reutilizada depois que outra perna venceu ou não corresponder ao webhook da Telnyx. Um JWT da Telnyx, por si só, nunca autoriza iniciar uma chamada de saída da Easyhook.

Para WhatsApp Calling, use um organização `phone_id` (ou o seu remetente configurado `from`) e enviar a oferta WebRTC:

```json
{
  "phone_id": "<easyhook_phone_uuid>",
  "from": "15551234567",
  "to": "528441234567",
  "max_duration_seconds": 1800,
  "session": { "sdp_type": "offer", "sdp": "v=0..." }
}
```

Chamadas do WhatsApp iniciadas pelo negócio requerem permissão do usuário. Meta retorna seu erro de chamada documentado quando a permissão está ausente. Mídia nunca atravessa Easyhook: o cliente negocia WebRTC com Meta ou Telnyx enquanto Easyhook lida com autorização, roteamento, estado, carteira e webhooks normalizados. Para Telnyx, a resposta contém `webrtc.token` e `webrtc.dial`; call `TelnyxRTC.newCall` com esses valores normalizados. `GET /v1/calls/{call_id}/signaling` até `session.ready` e instalar a resposta SDP retornada como a descrição remota da conexão por pares.

Solicitar permissão de chamada WhatsApp iniciada pelo negócio antes de discar:

Verifique primeiro a permissão atual e as ações atualmente permitidas pelo Meta:

`GET /v1/whatsapp/calling/permissions?from=15551234567&to=528441234567`

A resposta preserva o `permission_status` e os limites de ação da Meta. Use `start_call` quando permitido; envie uma solicitação de permissão somente quando `send_call_permission_request` estiver permitido.

`POST /v1/whatsapp/calling/permissions`

```json
{
  "phone_id": "<easyhook_phone_uuid>",
  "to": "528441234567",
  "body": "Podemos ligar para ajudar com sua solicitação?"
}
```

Meta controla os limites de elegibilidade, expiração e taxa. Easyhook normaliza a resposta de permissão como uma interação de entrada/webhook; ela nunca é inferida a partir de texto comum.

### Registrar um endpoint de atendimento

`POST /v1/call-endpoints`

```json
{
  "endpoint_key": "installation-or-worker-id",
  "kind": "android",
  "user_id": "<organization-member-user-id>",
  "status": "available",
  "metadata": { "mobile_device_id": "<mobile_devices.id>" }
}
```

Use exatamente um de `user_id` ou `external_agent_id`. Os endpoints Web, Android e iOS recebem um Telnyx WebRTC JWT de curta duração e um ID de endpoint estável. `POST /v1/call-endpoints/{endpoint_id}/token`; Easyhook nunca retorna uma senha SIP do cliente. Heartbeat por upserting o mesmo `endpoint_key`; um endpoint só pode ser roteado enquanto `available` e visto nos últimos 90 segundos.

Utilização de endpoints externos `external_agent_id`. A `sip` endpoint deve fornecer uma validação `provider_address` tais como `sip:agent@example.com`; uma chamada Telnyx é oferecida a um `api` endpoint somente quando ele também tem um endereço SIP do provedor, porque um webhook sozinho não pode transportar áudio. `api` Endpoint sem um endereço SIP: a reivindicação retorna a oferta SDP de curta duração e as respostas de integração através `pre-accept` e `accept`. Endpoints SIP não são selecionados para WhatsApp porque Meta usa seu contrato de chamada WebRTC/SDP em vez de uma perna cliente SIP.

O mesmo contrato de poderes clientes próprios da Easyhook e produtos construídos pelo cliente:

| Cliente | Mídia PSTN | WhatsApp Chamando mídia | Notificação recebida |
| --- | --- | --- | --- |
| Portal de navegação | `kind: "web"` e o retornado Telnyx WebRTC JWT | Navegador WebRTC com o SDP do Meta | Assinado `call.offered` webhook |
| Aplicativo móvel nativo | `kind: "android"` ou `"ios"` e o retornado Telnyx WebRTC JWT | WebRTC nativo com o SDP do Meta | Assinado `call.offered` webhook; entrega do push do cliente é sua responsabilidade |
| Infraestrutura/trabalhador de voz | `kind: "sip"`, ou `kind: "api"` com um SIP válido `provider_address` | `kind: "api"` com WebRTC/SDP | Assinado `call.offered` webhook |

Registro, batimento cardíaco ou leitura de um endpoint não começa em si um faturado
Cubro. `POST /v1/calls` e sua ação de hangup não adiciona operação de API separada
cobranças, quer sejam chamadas de um portal de clientes, aplicativo móvel ou
servidor. Chamadas conectadas são cobradas apenas através `call.per.minute`. Reservas PSTN
e resolve o uso da transportadora através do Easyhook. Meta contas WhatsApp Chamando diretamente
para WABA do cliente; Easyhook cobra apenas sua taxa de plataforma por minuto.
Chamadas rejeitadas e não respondidas a zero.

Um pedido de permissão de chamada WhatsApp coloca uma carteira reembolsável e fixa
a sua taxa de operação apenas após o Meta aceitar o pedido.
liberta o reserva completo.

### Contrato de resposta

- `POST /v1/calls/{call_id}/actions/claim` atomicamente ganha uma chamada para `endpoint_id`.
- Para o WhatsApp, reivindique retorna a oferta SDP da Meta. Gere uma resposta, ligue `pre-accept`, estabelecer WebRTC, em seguida, chamar `accept` com a mesma resposta SDP; isso evita áudio cortado no início e segue o contrato de sessão da Meta.
- `POST /v1/calls/{call_id}/actions/pre-accept` com `endpoint_id` e `sdp`.
- `POST /v1/calls/{call_id}/actions/accept` com `endpoint_id` e `sdp`.
- `POST /v1/calls/{call_id}/actions/decline` Oferece a chamada para o próximo objetivo elegível.
- `POST /v1/calls/{call_id}/actions/hangup` termina Telnyx ou WhatsApp através do provedor correto.

O roteamento padrão da equipe é deliberadamente silencioso: o agente disponível atribuído primeiro, em seguida, o agente que oferece menos recentemente; os proprietários/administradores são fallback. Exatamente um anel de endpoint por 20 segundos. As tarefas na nuvem expiram a locação e oferece o próximo endpoint compatível. Os endpoints API/SIP participam da mesma ordem, de modo que os aplicativos do cliente podem responder sem usar a Inbox Easyhook, mas o Easyhook nunca oferece uma perna de provedor para um endpoint que não pode transportar sua mídia.

Ler ou atualizar a política de um número com `GET /v1/call-routing` e
`PATCH /v1/call-routing`. Utilização `?phone_id={id}` para um número Telnyx comprado,
ou `?phone_id={id}&channel=whatsapp` para um telefone WhatsApp. O pedido legado
sem `phone_id` permanece apenas como uma alternativa de compatibilidade para números que
ainda não tem uma sobreposição; o portal configura sempre um número concreto.
A política por número controla as chamadas de entrada ordinárias, quando um agente de IA
não responde, e uma entrega humana requisitada pela IA. `destinations` é um ordenado
lista contendo, no máximo, um `web` destino, no máximo um `mobile` destino,
e qualquer lista de locatários `external_phone` destinos em formato E.164.
WhatsApp substitui rejeição `external_phone` destinos. Apenas um destino
endpoint é oferecido em um momento; o pool de telefone externo seleciona no máximo um
número antes de cair para a web / móvel na próxima tentativa.
na mesma utilização prioritária `external_phone_strategy: "round_robin"` ou `"random"`.

Estratégias são `assigned_then_round_robin` (por omissão), `round_robin`, e
`api_only`; limites configuráveis são de 8 a 30 segundos por tentativa e 1 a 20 tentativas.
`api_only` desativa deliberadamente as alternativas do portal, celular e telefone externo.
Múltiplos dispositivos pertencentes a um agente permanecem terminais separados, mas apenas
o endpoint selecionado recebe a oferta privada. Uma oferta declinada ou expirada
Avança para o próximo ponto de avaliação elegível em vez de tocar em todos os dispositivos.

```json
{
  "strategy": "assigned_then_round_robin",
  "ring_timeout_seconds": 20,
  "max_attempts": 6,
  "owner_admin_fallback": true,
  "external_phone_strategy": "round_robin",
  "destinations": [
    { "kind": "web", "label": "Portal", "priority": 10 },
    { "kind": "mobile", "label": "Aplicativo móvel", "priority": 20 },
    { "kind": "external_phone", "label": "Guardia", "phone_number": "+528441234567", "priority": 30 }
  ]
}
```

Uma perna PSTN externa é criada apenas quando sua vez chega. Easyhook primeiro
reserva a carteira do organização por sua duração máxima, assina o destino exato
na perna transportadora, liquida o uso real do provedor a partir do custo de chamada verificado
eventos, e retorna a reserva não utilizada. Um preço ou falha na carteira nunca
cai de volta para um número ou equilíbrio de outra organização.

Portal e celular usam o mesmo tempo de execução através de servidor autorizado `/admin/calls/*` rotas. O portal Vercel expõe apenas uma lista de permissões sob `/api/calls/*`, preserva a assinatura autenticada de organização / ator e nunca envia uma chave de API do cliente para o navegador ou telefone. Chamadas iniciadas a partir de uma Inbox usar a mesma política provedor-billing: custos de operador faturado para Easyhook usar uma reserva de carteira, enquanto WhatsApp Chamada é cobrado pela Meta diretamente para o cliente WABA e, portanto, não cria nenhuma Easyhook provedor-custo reserva.

### Agentes de voz do ElevenLabs (integração no portal)

As organizações podem conectar a própria chave de API do ElevenLabs no portal em
Integrações. O Easyhook valida a chave, armazena- a encriptada no locatário
cofre de segredos e expõe apenas o status da conexão e os agentes da organização
nomes. A chave nunca é devolvida a um navegador, aplicativo móvel ou webhook do cliente.

O portal atribui um agente de IA conversacional do ElevenLabs e,
opcionalmente, um agente de saída para um número Easyhook Telnyx ativo. Ambas as funções
pode usar o mesmo agente; Easyhook não seleciona um implicitamente para saída
Chamadas.
A Easyhook importa o número público para o encaminhamento de entrada e utiliza um privado,
identificador SIP não discável para roteamento de saída. Telnyx envia áudio diretamente
para o ElevenLabs; o Easyhook não atua como proxy nem transcreve o áudio. Cada número tem
A sua própria ligação:

- `ai_only`: o ElevenLabs atende; nenhum destino humano é oferecido.
- `ai_then_agents`: Onze Labs recebe a primeira tentativa, em seguida, humano normal
  O roteamento é utilizado se a tentativa de IA estiver indisponível ou expirar.

`human_transfer_enabled` é independente desses modos de resposta inicial.
habilitado, Easyhook instala um gerenciado `transfer_to_number` ferramenta de sistema na
um agente do ElevenLabs selecionado. Uma transferência solicitada durante uma IA ativa
conversação usa SIP REFER para um alvo Easyhook assinado HMAC opaco. Easyhook
verifica a ligação, organização, número e sessão de chamada ativa, em seguida, usa
a mesma política de destino por número descrita acima. O ElevenLabs nunca
recebe a lista de telefone externo real. Outras ferramentas de agente e transferência de cliente
As regras estão preservadas. `api_only` o roteamento deliberadamente desativa o humano gerenciado
Entrega.

As rotas Portal-Admin são:

- `GET /admin/integrations/elevenlabs`
- `POST /admin/integrations/elevenlabs` com `{ "tenant_id", "api_key" }`
- `GET /admin/integrations/elevenlabs/agents`
- `GET /admin/telecom/voice-ai`
- `PUT /admin/telecom/numbers/{number_id}/voice-ai` com entrada `agent_id`,
  opcional `outbound_agent_id` (que pode ser igual a `agent_id`), `mode`,
  opcional `answer_timeout_seconds` (`8`–`30`) e
  `human_transfer_enabled`
- `DELETE /admin/telecom/numbers/{number_id}/voice-ai`

O prompt de sistema do agente, voz, base de conhecimento e ferramentas permanecem gerenciados em
ElevenLabs. Webhooks ou ferramentas do n8n podem fornecer a lógica de negócios do cliente sem
colocando n8n no loop de áudio em tempo real.

Atualmente, essa conexão se aplica apenas aos números de telefonia Easyhook. O ElevenLabs
também suporta agentes de voz WhatsApp, e documenta um padrão SIP somente para voz
que pode manter mensagens com outro provedor. Esse padrão não é equivalente
para a atual ligação Easyhook: quando a sinalização SIP estiver ativada em um WhatsApp
número, Meta pára de enviar Chamando comandos do Graph API e chamar webhooks para
Ativando-o diretamente, ignoraria a normalização do Easyhook
`call.offered` ciclo de vida, endpoints da API, roteamento da Inbox/móvel, operação da carteira
até que o Easyhook opere uma borda SIP consciente de organizações
que preserva esses controlos, `handler: "ai"` com `channel: "whatsapp"`
retorna `voice_ai_phone_channel_required`; não reconfigurar silenciosamente
número de cliente para SIP.

### Ler ou desligar uma chamada

- `GET /v1/calls/{call_id}`
- `GET /v1/calls/{call_id}/signaling`
- `POST /v1/calls/{call_id}/actions/hangup`

## Webhooks

Inscrever-se com o fornecedor `sms`, `voice` ou `whatsapp`:

- `message.received`
- `message.status`
- `call.initiated`
- `call.answered`
- `call.hangup`
- `call.connect`
- `call.ringing`
- `call.accepted`
- `call.transfer_started`
- `call.terminate`
- `number.renewal_due`
- `number.renewed`
- `number.grace`
- `number.released`

Os webhooks do provedor são verificados com Ed25519 sobre o corpo bruto exato, rejeitam timestamps com mais de cinco minutos e são desduplicados antes do processamento. Easyhook em seguida, emite seu webhook cliente normal assinado.

## Contrato de faturamento

O faturamento de Telecom tem três componentes visíveis separadamente:

1. Aluguel recorrente do número, cobrado antecipadamente;
2. Uso da operadora (segmentos, mídia ou minutos de chamada arredondados);
3. Margem de serviço Easyhook.

As regras para o cliente são:

- A ativação é cobrada uma única vez;
- o período inicial do número é calculado proporcionalmente aos dias restantes do mês da compra, incluindo o dia da compra e usando o calendário UTC, e somado a `due_today`;
- o aluguel dos meses seguintes é renovado e cobrado antecipadamente às `00:00 UTC` do primeiro dia de cada mês;
- SMS/MMS recebidos e enviados são cobrados por segmento ou mensagem, conforme indicado na cotação;
- as chamadas são cobradas por minuto arredondado, com preços que variam conforme a direção e o destino;
- as cotações em MXN incluem proteção cambial: o valor exibido e confirmado é o valor cobrado do cliente;
- os números só ficam disponíveis para compra quando a Easyhook consegue verificar e garantir um preço competitivo.

Os custos da operadora, as fontes de comparação e a fórmula comercial interna da Easyhook não fazem parte do contrato público. A confirmação da compra e a resposta da API expõem apenas os valores que podem ser cobrados do cliente.

As tarifas têm versões e datas de verificação e validade, com acesso restrito ao serviço. Uma tarifa de exemplo fixa no código nunca habilita um país. A compra de números só é ativada quando o ambiente tem credenciais Telnyx, o preço exato e atual do número, dados cambiais recentes e uma referência de comparação verificada correspondente. A portabilidade permanece desativada até a conclusão do processo regulatório.

Os índices de referência dos concorrentes são armazenados separadamente das tarifas dos fornecedores vendíveis.
A API de preços Twilio fornece o público `base_price` valores; Easyhook deliberadamente
não faz referência em relação à conta específica `current_price` descontos. Para SMS,
O menor preço de base da transportadora/sender de um país é o valor de referência conservador.
Para voz, os benchmarks mantêm o mais longo detalhe de prefixo de destino retornado por
Twilio. Uma sincronização de benchmark bem sucedida nunca ativa um país por
por si só: ainda é necessário ter uma tarifa vigente correspondente da Telnyx ou um
preço exato e atual do inventário.

Pesquisa de referência de voz segue o prefixo E.164 de correspondência globalmente mais longo, não
o rótulo de país do ponto final de fixação de preços. Isto é necessário para NANP: Twilio
publica geral `+1` preços sob EUA e pode publicar mais tempo canadense
Excepções separadamente. Conflitos de benchmark de igual duração usam o preço mais baixo para
a comparação permanece conservadora.

Telnyx Global Conversational CSV importações são permitidas para países configurados,
hashed, auditado e substituído atomicamente por país.
os padrões são rejeitados. Quando o baralho de taxa contém preços dependentes da origem, o
importador armazena o custo máximo aplicável para cada prefixo de destino
A chamada nunca é reservada utilizando uma taxa de transporte otimista.

Decks de grande taxa são carregados em blocos delimitados e publicados apenas após o
a contagem de linhas declaradas está completa. Um aviso de portador com um futuro tempo efetivo
deve ser importado com esse exato `valid_from`; a versão anterior termina no
mesmo instante e permanece autoritário até então. Futuras linhas nunca afetam um
Citar cedo, e uma importação incompleta encenada nunca se torna passível de cobrança.

USD/MXN utiliza a série Banco de México SIE `SF43718` Cada observação tem um
O prazo de validade limitado e a margem de protecção cambial de 5% só são aplicados quando se converte o
USD valor do cliente em uma taxa de carteira MXN. Se Banxico ou Twilio não pode ser
verificado antes de expirar, o Easyhook falha ao fechar em vez de reutilizar dados obsoletos.

As rotas internas de sincronização não são endpoints da API do cliente:

- `POST /internal/telecom/pricing/fx/sync`
- `POST /internal/telecom/pricing/benchmarks/sync`
- `POST /internal/telecom/messages/reconcile`

Eles aceitam apenas a identidade configurada do OIDC para Programador de Nuvem ou a existente
token administrativo. As execuções são auditadas sem armazenar credenciais de origem ou
Cargas brutas de cliente/fornecedor. Tavily ou monitoramento de página pode alertar os mantenedores
sobre as mudanças de preços públicos, mas não pode escrever taxas de faturamento.

Produção atualiza Twilio diariamente às 05:30 e Banxico diariamente às 18:30
`America/Monterrey`. A voz de Telnyx CSV continua a ser uma importação verificada manualmente
uma vez que a Telnyx não documenta uma API de transferência de taxa de taxa de classificação contabilística;
a sua validade limitada faz com que os preços falhem se não for importado um novo baralho.

Antes de uma operação transportadora, Easyhook reserva o seu custo máximo estimado.
SMS/MMS de entrada assinado `message.received` callback cria o determinístico
reserva e seu custo de transporte incluído liquida-lo imediatamente, porque
Telnyx emite `message.finalized` apenas para mensagens de saída. Easyhook se aplica
a regra comercial, liquida a quantia exata e devolve reserva não utilizada
fundos. Fractional-cent reembolsos acumular em vez de ser arredondado. Chamadas
usar webhooks de custo/duração do provedor e um máximo reforçado pelo servidor. A pendente
chamada de saída que nunca atinge o provedor libera sua reserva após
dois minutos; um início tardio do provedor é encerrado e não pode reviver o cancelado
call. WhatsApp Calling reserva o máximo solicitado e fixa arredondada real
A taxa normal de operação da API do Easyhook continua a ser
item separado da carteira para operações de não chamada; iniciando e desligando uma chamada
não crie taxas de operação adicionais.

SMS/MMS de saída normalmente liquida a partir do assinado `message.finalized` Webhook.
Como defesa contra as tentativas esgotadas da transportadora webhook, o reconciliador interno
Controlos de detenção envelhecida e ligada ao prestador contra o registro de Detalhe de Mensagens de Telnyx e
resolve apenas quando a transportadora tiver publicado um custo USD autorizado. Desaparecido,
registros indisponíveis ou sem custos permanecem reservados para uma execução posterior; Easyhook nunca
Reembolso de uma operação transportadora apenas porque uma pesquisa falhou.
reconciliar a cada cinco minutos com o mesmo limite Cloud Scheduler OIDC.

O aluguel é cobrado antecipadamente por mês-calendário. A compra inclui a
ativação e o restante do mês UTC; as renovações seguintes vencem no primeiro dia
de cada mês. O Easyhook envia avisos 7, 3 e 1 dia antes. Se não houver saldo, o uso
é pausado e o número entra em carência por sete dias. Somente após esse período a
liberação junto à operadora é executada; se ela falhar, será repetida e nunca será
marcada localmente como concluída antes da confirmação. O job
`easyhook-telecom-renewals` roda diariamente às 06:15 em `America/Monterrey`.
O Cloud Scheduler assina uma solicitação OIDC para
`POST /internal/telecom/renewals/process`, e a infraestrutura aceita apenas a
conta de serviço e a audience configuradas (ou o token administrativo nas
operações controladas).

Inbound Telnyx chama reserva um máximo conservador de 60 minutos antes de um
anéis de extremidade. A assinatura `call.cost` Fornecimentos de eventos `total_cost` e
`billed_duration_secs`; Easyhook aplica a regra comercial de voz a isso
quantidade autorizada e retorna a espera não utilizada. A chamada não é roteada quando
a carteira não pode cobrir o máximo temporário. Outros fornecedores permanecem
tarifário. Isso impede Easyhook de silenciosamente estender o crédito da transportadora para
uma carteira vazia sem fingir que o reserva é o preço final.

## Adaptadores futuros

Infobip e DIDLogic podem implementar a mesma interface de adaptador. `easyhook` O provedor WebRTC pode reutilizar o recurso de chamada mais tarde, mas permanece fora desta versão porque também requer TURN, UX de chamada de entrada nativa, controles de abuso e operações QoS.

## Configuração de implantação necessária

- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY`
- `TELNYX_CLIENT_STATE_SECRET` (pelo menos 32 caracteres aleatórios; assina a autorização de saída do mostrador e deve ser armazenada no Gerenciador Secreto)
- `TELNYX_CALL_CONTROL_CONNECTION_ID`
- `TELNYX_CREDENTIAL_CONNECTION_ID` (Uma Ligação Credencial, não Controle de Chamadas)
- `TELNYX_HUMAN_TRANSFER_SIP_DOMAIN` (subdomínio SIP usado apenas nas transferências assinadas do ElevenLabs)
- `BANXICO_SIE_TOKEN` para a série oficial USD/MXN FIX `SF43718`
- `TWILIO_PRICING_API_KEY` e `TWILIO_PRICING_API_SECRET`, restrito à API de Preços oficial
- `TELECOM_PRICING_COUNTRIES` como uma lista de autorizações de país ISO explícita (inicialmente `US,CA,MX`)
- Um papel de serviço exclusivo `telecom_messaging_profiles` linha para cada programa de consentimento do organização; o ID de perfil Telnyx é armazenado lá, nunca como uma variável global Cloud Run
- Fila de tarefas em nuvem e URL de despacho autenticado para locações de roteamento duráveis, limpeza de início abandonado e terminação de duração máxima
- `CLOUD_SCHEDULER_SERVICE_ACCOUNT_EMAIL` e `CLOUD_SCHEDULER_OIDC_AUDIENCE` para as renovações de números
- Meta app subscrito `calls`, `whatsapp_business_messaging`, chamando habilitado em cada número de API da nuvem elegível e um método de pagamento válido para chamadas iniciadas por negócios
