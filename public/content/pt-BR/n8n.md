# n8n-nodes-easyhook

Node de comunidade n8n verificado para usar Easyhook.

Easyhook é uma API de mensagens multicanal leve para WhatsApp, Messenger,
Instagram, Telegram, TikTok Business, Gmail, Outlook, e-mail genérico IMAP/SMTP,
e Mercado Libre.

- `Message Action` Grupos texto entre canais e mídia envia.
- `Message Control` grupos ler, digitar, responder e ações de reação e somente
  lista os remetentes que suportam o controle selecionado.
- `Email Only` funciona da mesma forma com Gmail, Outlook, e IMAP/SMTP: enviar,
  responder, avançar, marcar ler/não ler, arquivar, e criar/editar/enviar rascunhos.
- `Onboarding` cria links de conexão hospedados para qualquer canal suportado.
- `WhatsApp Only` Grupos WhatsApp envia, templates, Fluxos e consentimento.
- `Template` listas, sincroniza, verifica categorias, cria e apaga modelos.
- Use entrega padrão ou humanizada com WhatsApp, Messenger, Instagram e Telegram.
- Agendar mensagens com Easyhook's `at` parâmetro
- Enviar mídia reutilizável e enviá-lo mais tarde `media_name`
- Modelos de lista/sincronização e mídia
- Cancelar as mensagens agendadas antes do início do processamento
- Criar links hospedados para canais suportados
- Enviar Fluxos de opt-in e opt-out Easyhook
- Receba eventos Easyhook webhook em n8n com o nó Easyhook Trigger

## Instalar

Em n8n, abra **Configurações > Nós comunitários** e instale:

```text
n8n-nodes-easyhook
```

Para n8n self-hosted, você também pode instalá-lo manualmente em sua pasta n8n nós personalizados.

## Credenciais

Criar uma API **Easyhook** credencial:

- Chave da API: sua `eh_live_...` chave de Easyhook
n8n valida a credencial com `GET /v1/me`, então nenhum número WhatsApp é necessário apenas para testar a chave de API.

## Exemplos comuns

### Receber webhooks

Use **Easyhook Trigger** como o primeiro nó em um fluxo de trabalho.

1. Adicionar o nó Easyhook Trigger.
2. Selecione sua credencial de API Easyhook.
3. Escolha um provedor. Easyhook filtra os eventos e tipos de escopo disponíveis automaticamente.
4. Escolha um escopo. Para WABAs, números do WhatsApp, Pages do Messenger ou contas do Instagram, selecione uma conta conectada na lista carregada com sua credencial da API.
5. Activar o fluxo de trabalho.

n8n registra sua URL de produção em Easyhook automaticamente e armazena o segredo de assinatura HMAC nos dados estáticos privados do fluxo de trabalho. Desativar ou excluir o fluxo de trabalho remove a assinatura Easyhook. Nenhuma configuração do portal ou cópia/cola secreta é necessária.

WhatsApp usa os mesmos três níveis do portal Easyhook: **Organização inteira → WABA → WhatsApp Number**. Selecionando um WABA recebe eventos correspondentes de todos os números conectados a ele. Meta Business Portfólios permanecem internos e nunca aparecem como escopos n8n.

O gatilho produz o Easyhook webhook normalizado JSON diretamente.

### Mercado Libre

Escolher `Mercado Libre` no Easyhook Trigger para receber perguntas sobre produtos
e mensagens pós-venda. Para responder, use **Message Action > Send Text**, selecione
vendedor conectado como **De **, e mapa `contact.id` do gatilho para
** Para**. O valor será `question:<id>` ou `pack:<id>`.

Não substitua esse destino por um ID de comprador. Mercado Libre requer o
Questionar ou vender pacote contexto e não permite conversas arbitrárias.

### Enviar texto

- Recurso: `Message Action`
- Operação: `Send Text`
- Canal: selecione um canal conectado
- Para: `15550100003`
- Corpo: `Hello from n8n`

O seletor de canais armazena o mesmo identificador nativo do provedor fornecido como
`account.id` por Easyhook webhooks. Mapeá-lo diretamente sem adicionar `page_` ou
`ig_`. O WhatsApp também aceita o ID do número de telefone da Meta.

Escolha **Entrega: Humanizada** quando você quiser que Easyhook aplique a leitura/tipagem
sequência suportada pelo provedor selecionado antes de enviar. WhatsApp pode usar
a última entrada `wamid`; Telegram usa digitação sem fabricar uma leitura
recibo.

Para os modelos de texto, mídia ou WhatsApp agendados, adicione:

- `Schedule At`: Tempo de execução ISO 8601
- `Options > Client Reference`: identificador opcional da sua aplicativo
- `Options > Idempotency Key`: chave estável opcional usada apenas quando tentar novamente o mesmo envio agendado

O agendamento de texto e mídia funciona com WhatsApp, Messenger, Instagram e
Telegram. TikTok e Mercado Libre suportam o texto agendado. O agendamento de E-mail não faz parte
do actual contrato público.

Use recurso **Cancelar mensagem agendada** quando você precisa cancelar um envio antes de iniciar o processamento. A reconciliação permanece disponível através da API e webhooks do Easyhook.

Em ** Onboarding** você pode criar um link de onboarding ou criar e enviar que
link, então escolha o provedor de destino. WhatsApp adicionalmente pede
Coexistência ou API em nuvem. Sob **WhatsApp Only** você pode enviar o consentimento Flow
ou registar as provas de opt-in/opt-out recolhidas por um Site ou CRM.

### Enviar um E-mail

- Recurso: `Email Only`
- Operação: `Send Email`
- E-mail: selecione um Gmail conectado, Outlook, ou IMAP/SMTP endereço
- Para o E-mail: E-mail destinatário
- Assunto: assunto da mensagem
- Mensagem: conteúdo de texto simples
- Mensagem HTML: corpo rico opcional

Para responder a um E-mail existente, selecione `Reply to Email` e mapa `message.id` de
o Easyhook Trigger em **Original Email ID**. Easyhook resolve o Gmail
thread, resposta nativa do Outlook ou cabeçalhos IMAP automaticamente. O nó não
pedir `Thread ID`, `In-Reply-To`, ou `References`.

A lista de E-mail contém apenas contas de E-mail ligadas à chave da API
organização; Os números do WhatsApp e outros canais estão excluídos. Todos os três
uso de provedores `POST /v1/messages/email`, então um fluxo de trabalho não precisa
As sucursais específicas do prestador.

Para anexar arquivos, adicione entradas em **Anexos** e selecione em cada uma o
campo binário. Easyhook usa o nome do arquivo binário e tipo MIME automaticamente;
as sobreposições opcionais só são necessárias quando os metadados binários recebidos são
incompleta.

Outras operações de E-mail:

- `Forward Email`: mapear o gatilho `message.id`, escolher o destino, e
  opcionalmente adicione uma nota.
- `Update Email`: mapa `message.id` e escolha ler, não ler ou arquivar.
- `Create Email Draft`: insira destinatário, assunto, mensagem, HTML opcional, e
  Anexos.
- `Edit Email Draft`: fornecer o Rascunho de ID devolvido e conteúdo de substituição.
- `Send Email Draft`: fornecer o ID do Rascunho e conectado de e-mail.

### Leitura, digitação, resposta ou reação

- Recurso: `Message Control`
- Operação: `Mark as Read`, `Show Typing`, `Reply`, ou `React`
- Canal: selecione um remetente compatível conectado
- ID da mensagem: mapear o webhook normalizado `message.id`

WhatsApp suporta todos os quatro controles. Messenger, Instagram e suporte TikTok
ler, digitar e responder. O Telegram suporta digitação, resposta e reação.
os pares provedor/operação são omitidos da lista de remetentes e rejeitados pela
API sem faturamento.

### TikTok Business

Escolher `TikTok Business` no gatilho e mapa `account.id` diretamente para
**De **. Mapeie o identificador de conversação/contato opaco do item recebido
para **Para **. Não adicione um prefixo ou converta-o para um número de telefone. TikTok não
permitir conversas iniciadas por negócios e limitar o negócio a 10 respostas
dentro de 48 horas após cada mensagem do usuário.

### Enviar mídia reutilizável

Primeira mídia de envio:

- Recurso: `Media`
- Operação: `Upload`
- Nome: `promo_image`
- Tipo: `Image`
- Fonte: `Binary Property`
- Propriedade binária: `data`

O ativo pertence à organização Easyhook e pode ser reutilizado por cada
canal conectado compatível. Em seguida, envie- o:

- Recurso: `Message Action`
- Operação: `Send Media`
- Canal: selecione um canal conectado compatível
- Para: cliente WhatsApp ID
- Tipo: `Image`
- Tipo de referência de mídia: `Reusable Media Name`
- Nome da mídia: `promo_image`

### Baixar mídia recebida

Os URLs do Webhook que estão a chegar são privados. Adicionar:

- Recurso: `Media`
- Operação: `Download`
- URL da mídia: `{{$json.message.media.url}}`
- Campo Binário de Saída: `data`

O nó autentica com a credencial Easyhook e devolve o binário n8n
dados. Abrindo a URL diretamente em um navegador sem autorização é esperado
Falhar.

### Enviar Modelo

- Recurso: `WhatsApp Only`
- Operação: `Send Template`
- Fonte do Modelo: `Enter Manually`
- Nome do modelo: o nome do modelo aprovado em Easyhook/Meta
- Idioma: selecione o código de meta-linguagem da lista, por exemplo `es_MX` ou `en_US`
- Dados do Modelo: escolher `Map Automatically` carregar a definição do modelo por nome e idioma, ou `Custom Components (JSON)` Fornecer componentes brutos.

Ambas as fontes de modelos suportam os mesmos modos de dados. `Choose From Easyhook` seleciona um modelo aprovado em uma lista; `Enter Manually` encontra o modelo aprovado pelo nome digitado e pelo idioma selecionado. Em seguida, `Map Automatically` cria apenas os campos necessários no momento do envio:

- Variáveis de texto do cabeçalho
- Cabeçalho imagem, vídeo ou URL do documento e nome de arquivo do documento opcional
- Campos de localização do cabeçalho
- Variáveis corporais, incluindo variáveis nomeadas
- Valores dinâmicos dos botões de URL
- Resposta rápida de cargas úteis
- Valores dos cupões de código de cópia

Para cabeçalhos de imagem, vídeo ou documento, o URL do cabeçalho mapeado substitui o exemplo de aprovação para isso
Envio individual. Deixe-o vazio apenas quando o modelo tiver um ativo de aprovação padrão armazenado em Easyhook.
O tipo de mídia dinâmica deve corresponder ao tipo de cabeçalho aprovado pelo modelo. `Custom Components (JSON)` pode
em vez disso, forneça um cabeçalho de meta- mídia em bruto usando qualquer um `id` ou um HTTPS `link`.

Utilização `Custom Components (JSON)` quando você precisa fornecer meta bruto `components`. O valor pode ser um array de componentes ou `{ "components": [...] }`. O próprio texto do modelo permanece fixo pelo modelo Meta aprovado.

Cabeçalho de texto, variáveis do corpo e botão de URL dinâmico:

```json
[
  {
    "type": "header",
    "parameters": [{ "type": "text", "text": "PED-1048" }]
  },
  {
    "type": "body",
    "parameters": [
      { "type": "text", "text": "Example User" },
      { "type": "text", "text": "15 July" }
    ]
  },
  {
    "type": "button",
    "sub_type": "url",
    "index": "0",
    "parameters": [{ "type": "text", "text": "PED-1048" }]
  }
]
```

Cabeçalho de mídia e variável de corpo nomeada:

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
            "filename": "invoice.pdf"
          }
        }
      ]
    },
    {
      "type": "body",
      "parameters": [
        {
          "type": "text",
          "parameter_name": "customer_name",
          "text": "Example User"
        }
      ]
    }
  ]
}
```

Os links de mídia devem usar HTTPS e ser baixados pelo Meta sem autenticação. Um valor dinâmico do botão URL é o sufixo da variável, não o URL completo. Use `[]` quando o modelo não tiver componentes em tempo de execução.

### Enviar o Fluxo do WhatsApp

- Recurso: `WhatsApp Only`
- Operação: `Send Flow`
- De: seu número de remetente do WhatsApp
- Para: cliente número WhatsApp
- Nome do fluxo: o nome do fluxo Easyhook
- Corpo da Mensagem: o texto acima do botão de fluxo
- Texto do Botão: a etiqueta do botão de fluxo
- Dados de fluxo: campos de valor/chave opcionais enviados como carga útil de fluxo

### Consentimento e onboarding

Em ** WhatsApp Only**:

- **Enviar Opt-In ou Opt-Out** envia o consentimento WABA Flow para um contato WhatsApp.
- ** Obtenha o consentimento Status** retorna o serviço e o consentimento de marketing para um
  contato sob o remetente selecionado do WhatsApp.

Em ** Onboarding**:

- ** Get Onboarding URL** cria um link hospedado Easyhook para WhatsApp,
  Messenger, Instagram, Telegram, Gmail, Outlook, IMAP/SMTP, ou Mercado Libre.
  A conexão está registrada sob a organização que possui a API
  Credencial.
- **Enviar Link Onboard** cria a mesma sessão e envia a sua
  URL em uma mensagem WhatsApp localizada.

Em **Template**:

- **Verifique Categoria** retorna aconselhamento de categoria não-bloqueando antes da submissão.
- **Criar** envia o modelo solicitado e retorna o mesmo aviso quando
  sua classificação selecionada pode ser inconsistente.

### Chamadas de IA de voz

Versão `0.2.39` adiciona ** Chamada de Voz**:

- **Record consent** armazena evidências explícitas de opt-in ou opt-out para uma
  Número e contato do Easyhook.
- **Iniciar chamada de IA** inicia o agente ElevenLabs explicitamente selecionado para chamadas de saída
  Exige uma máxima duração e uma chave de idempotência estável.
- **Get Call** lê estado normalizado; **Hang Up** termina.

Easyhook ainda impõe a propriedade do organização, consentimento, frequência de divulgação, número
capacidades, reserva de carteira e liquidação final do transportador. n8n fornece
as ferramentas de automação e agente; não é colocado no caminho de áudio em tempo real.

### Automação do Webhook

Easyhook webhooks são manipulados com **Easyhook Trigger**. Não é um nó de votação: ativação cria um `/v1/webhooks` a assinatura da URL de produção n8n e a desactivação remove- a. As entregas são autenticadas automaticamente com `X-Easyhook-Signature: sha256=<hex>`.

O gatilho começa sem nenhum provedor ou eventos selecionados. Escolha um provedor e
pelo menos um evento compatível. Os nomes e valores correspondem ao portal e
`GET /v1/webhooks/options`; `All events` deve ser selecionado por si mesmo.

Âmbitos de eventos úteis:

- `message.*`: mensagens WhatsApp/Messenger/Instagram recebidas
- `message.quick_reply`: WhatsApp, Messenger, Instagram, ou Seleções de botão de resposta de Telegram com `message.text` e `message.quick_reply.payload`
- `status.*`: mensagem de entrega/leitura/estado de falha
- `template.*`: alterações do estado do modelo
- `flow.submission.*`: WhatsApp Flow responses
- `smb_message_echo.*`: WhatsApp Business App mensagem de coexistência ecoa
- `smb_app_state_sync.*`: WhatsApp Business App coexistition contact/app state sync
- `history.*`: história de coexistência sincronizar eventos
- `account_update.*`: Atualizações da conta do WhatsApp
- `media.*`: eventos de ciclo de vida de mídia, quando habilitado em Easyhook
- `message.text`, `message.image`, `status.failed`: filtros de eventos mais estreitos que correspondem ao portal Easyhook

Para os fluxos de trabalho de E-mail, selecionar `Gmail`, `Outlook`, ou `Email (IMAP/SMTP)` como a
fornecedor de gatilhos e `message.*`. E-mail de entrada expõe `message.subject`,
`message.text`, opcional `message.html`, `message.thread_id`, e resposta RFC
cabeçalhos. Uma requisição do webhook cria uma execução n8n; eventos normais sem sincronização
Produzir um item.

Os webhooks do Messenger e do Instagram estão configurados no portal Easyhook com o filtro do provedor. No n8n, você também pode rotular um gatilho como `messenger.message.*` ou `instagram.message.*` para clareza do fluxo de trabalho.

Para um contrato comum em WhatsApp, Messenger, Instagram e Telegram, use
**Message Action > Send Buttons** e adicionar três botões de resposta ou URL.
O WhatsApp aceita até três respostas ou uma URL sem misturar ambos os tipos.
Messenger e Instagram adicionalmente expor **Enviar respostas rápidas** para menus de
até 13 opções de texto. Seleções de resposta de rota usando
`{{$json.message.quick_reply.payload}}`; o rótulo visível está disponível em
`{{$json.message.text}}`.

### Receber histórico de coexistência

Configure o **Easyhook Trigger** antes de conectar o número do WhatsApp Business App ou solicitar sincronização de coexistência:

1. selecionar `Provider: WhatsApp`.
2. selecionar `Event: Coexistence history (history.*)`.
3. Escolha a organização, WABA, ou WhatsApp escopo número.
4. Activar o fluxo de trabalho.
5. Permitir o compartilhamento de histórico no aplicativo WhatsApp Business e manter o aplicativo aberto enquanto a sincronização começa.

Easyhook cria a assinatura webhook e armazena seu segredo HMAC em n8n automaticamente. Não crie um segundo portal webhook. `message.*` apenas abrange mensagens ao vivo; não inclui as importações de história.

O Easyhook fornece dados de sincronização em lotes de, no máximo, 100 eventos.
Cada lote inicia uma execução do workflow, e o gatilho o expande para um item do
n8n por evento. Mensagens históricas recebidas usam `type: message.received`;
mensagens históricas enviadas usam `type: message.echo`. Ambas incluem
`message.source: history`. Cada item expandido também inclui `_sync` com os
metadados de sessão, cursor e progresso:

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

Utilização `message.id` como a chave de idempotência. Um destino falhado é tentado até cinco vezes, então os fluxos de trabalho devem tolerar receber o mesmo item novamente. As mensagens são ordenadas dentro de cada conversa, mas conversas diferentes podem progredir simultaneamente.

A mídia histórica não atrasa a importação da mensagem. O primeiro item pode conter `message.media.storage_status: pending`; uma vez que Easyhook termina de baixar um ativo Meta disponível, o gatilho recebe um segundo item com `type: message.media_available` e o mesmo `message.id`.

Se o negócio desabilitar o compartilhamento de histórico, o Meta pode retornar o erro `2593109`; o gatilho recebe-o como `type: sync.failed` debaixo do mesmo `history.*` selecção.

## Desenvolvimento

```bash
cd packages/n8n-nodes-easyhook
npm install
npm run build
npm pack --dry-run
```

Antes de enviar para a verificação n8n, publique através do GitHub Actions com procedência npm conforme exigido pelas diretrizes atuais do nó da comunidade n8n.
