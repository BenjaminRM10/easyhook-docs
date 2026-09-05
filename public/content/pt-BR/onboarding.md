# Conectar canais

Easyhook oferece onboarding hospedado para WhatsApp, Messenger, Instagram Direct,
Telegram, Gmail, Outlook, e-mail IMAP/SMTP, Mercado Livre e TikTok Business.
As seções seguintes explicam as duas modalidades específicas do WhatsApp.

A Easyhook usa o login oficial da Meta. Escolha o modo de acordo com o que deve
acontecer com o número depois da conexão.

| | Coexistência do WhatsApp | API do WhatsApp Cloud |
|---|---|---|
| Aplicativo no telefone | Continua funcionando | Não é utilizado |
| Número | Número ativo e elegível no WhatsApp Business | Novo número da Meta ou número existente |
| Último passo | Ler um código QR | Registrar o número e seu PIN, quando aplicável |
| Quando usar | A equipe precisa manter o aplicativo | O número funcionará exclusivamente pela API |

> Antes de começar, confirme qual modo a empresa precisa. Migrar um número
> existente para a Cloud API faz com que ele deixe de funcionar no WhatsApp e no WhatsApp Business App.

## Coexistência do WhatsApp

Use a coexistência quando o negócio precisa manter o número em WhatsApp Business App.

- O número deve usar o WhatsApp Business, não o WhatsApp pessoal.
- Meta determina se o número é elegível.
- Você deve abrir o WhatsApp Business pelo menos uma vez a cada 14 dias.
- Um código QR é escaneado durante o registro.
- Você pode autorizar a sincronização inicial de contatos e histórico.

### Passo a passo da Coexistence

1. No Easyhook, abra **Conectar > WhatsApp Coexistence** e revise os requisitos.
2. Na janela oficial da Meta, selecione o portfólio, a conta e o número corretos.
3. Autorize contatos e histórico somente se quiser importá-los.
4. Abra o WhatsApp Business no telefone e leia o QR em **Dispositivos conectados**.
5. Volte ao Easyhook e confirme que o canal aparece ativo em **Organização**.

A disponibilidade de histórico e mídia depende do que a Meta fornece durante o
onboarding. Os eventos importados são históricos e não devem ativar respostas automáticas.

## API do WhatsApp Cloud

Use a API da nuvem quando o número funcionar exclusivamente pela plataforma oficial:

- Você pode solicitar um novo número fornecido pelo Meta.
- Você pode migrar um número existente.
- Um número migrado existente para de funcionar no WhatsApp e no WhatsApp Business App.

### Passo a passo da Cloud API

1. No Easyhook, abra **Conectar > WhatsApp API**.
2. Escolha um novo número fornecido pelo Meta ou um número existente.
3. Selecione o portfólio e a WABA corretos na Meta.
4. Complete o registro de números e defina o PIN quando solicitado.
5. Confirme que o canal está ativo no Easyhook antes de gerar uma chave de API.

## Material visual

As telas da Meta mudam com frequência. A Easyhook mantém diagramas de orientação
no portal, enquanto esta página documenta o contrato atual. Os tutoriais com
capturas reais serão publicados depois de serem gravados com uma conta de
demonstração. Nunca reutilize um QR, token ou número de produção de uma captura antiga.

## Onboarding hospedado para seus clientes

Uma chave de API pode criar uma sessão hospedada em `easyhook.dev`. O canal
concluído é registrado automaticamente na organização proprietária da chave.
O mesmo contrato conecta WhatsApp, Messenger, Instagram Direct, Telegram,
Gmail, Outlook, IMAP/SMTP correio, Mercado Livre e TikTok Negócios.

```bash
curl -X POST https://api.easyhook.dev/v1/onboarding/sessions \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "whatsapp",
    "signup_mode": "coexistence",
    "language": "es",
    "return_url": "https://app.example.com/channels"
  }'
```

Assine `onboarding.*` para receber o resultado sem consultar repetidamente a sessão.

Para criar a sessão e enviar o link em uma única chamada:

```bash
curl -X POST https://api.easyhook.dev/v1/onboarding/sessions/send \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "15550100002",
    "to": "15550100003",
    "provider": "gmail",
    "language": "es"
  }'
```

`provider` aceita `whatsapp`, `messenger`, `instagram`, `telegram`, `gmail`,
`outlook`, `imap_smtp`, `mercadolibre` ou `tiktok`. `signup_mode` é utilizado apenas com
WhatsApp e aceita `coexistence` ou `cloud_api`. O link expira em um máximo de
uma hora e é consumido ao concluir a conexão. Enviá-lo por um número do WhatsApp
exige uma janela de atendimento aberta.

O evento `onboarding.completed` entra na mesma fila durável dos outros webhooks
do cliente. A Easyhook preserva a tentativa, repete com backoff e registra cada
entrega para que uma falha temporária não faça o evento desaparecer.

### Messenger: Páginas disponíveis

No Messenger, a Easyhook lista somente as Páginas que o usuário autorizou
explicitamente para `pages_messaging`. Ter acesso administrativo à Página ou
autorizar outras permissões não é suficiente.
Se Meta completar o login, mas não entregar um token de página com essa permissão,
A Easyhook responde `meta_page_access_unavailable`. Repita a autorização e
selecione explicitamente a Página correta no Facebook Login for Business.

## Desconectar um canal API

Primeiro, obtenha o identificador canônico com `GET /v1/senders` e use seu
`account_id`:

```bash
curl -X DELETE https://api.easyhook.dev/v1/senders/ACCOUNT_ID \
  -H "Authorization: Bearer $EASYHOOK_API_KEY"
```

A operação só pode afetar os canais da organização proprietária da chave de API
e exige `onboarding:write`; chaves apenas com `messages:write` não podem
desconectar canais. A desconexão remove as credenciais da Easyhook, interrompe
renovações e webhooks administrados pela Easyhook e não exclui o histórico já
recebido. Use esta chamada somente após a confirmação explícita do usuário; ela
não é exposta como uma ferramenta destrutiva do MCP.

O TikTok abre o OAuth da conta empresarial e solicita apenas
`message.list.read`, `message.list.send` e `message.list.manage`. A conta deve
estar fora dos Estados Unidos, do EEE, da Suíça e do Reino Unido.
