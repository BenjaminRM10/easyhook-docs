# Canais

A Easyhook reúne WhatsApp, Messenger, Instagram, Telegram, TikTok Business,
e-mail e Mercado Livre em uma só organização, chave de API, carteira, Inbox e
sistema de webhooks. O e-mail pode ser conectado pelo Gmail, Outlook ou
IMAP/SMTP. Cada envio usa `from` para resolver o canal correto dentro da
organização proprietária da chave de API.

## TikTok Business

A conexão do TikTok usa OAuth em **Conectar > TikTok Business**. A Easyhook
solicita apenas `message.list.read`, `message.list.send` e
`message.list.manage`; não solicita acesso a campanhas, anúncios, pixels,
medição ou CTX.

O TikTok não permite que a empresa inicie conversas. Depois que o usuário
escreve, a empresa pode enviar até 10 respostas nas 48 horas seguintes. A API
atualmente não aceita contas empresariais registradas
nos Estados Unidos, EEE, Suíça ou Reino Unido para esta API.

Use o `account.id` do webhook como `from` e preserve exatamente o identificador
opaco da conversa ou contato como `to`. A Easyhook normaliza texto, respostas,
indicador de digitação, leitura, botões de resposta e imagens. A mídia recebida
é armazenada em uma URL privada que exige a chave de API para download.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "tiktok-business-open-id",
    "to": "tiktok-conversation-id",
    "body": "Agradecemos por entrar em contato."
  }'
```

## Mercado Livre

O Mercado Livre é conectado por OAuth. A Easyhook solicita apenas leitura da
conta e acesso de leitura e escrita às comunicações de pré e pós-venda.

1. Na Easyhook, abra **Conectar > Mercado Livre**.
2. Selecione o país da conta.
3. Entre no Mercado Livre e autorize o Easyhook.
4. Quando você retorna ao portal, a conta aparece como um canal disponível na Inbox,
   API e Webhooks.

A Easyhook recebe perguntas de anúncios, mensagens pós-venda iniciadas pelo
comprador e notificações de leitura. Não é possível iniciar conversas. Para
responder, use o destino normalizado incluído no evento:

- `question:<id>` responde a uma pergunta.
- `pack:<id>` responde a uma conversa pós-venda.

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "ml_123456789",
    "to": "question:987654321",
    "body": "Sim, ainda está disponível."
  }'
```

Mensagens pós-venda aceitam até 350 caracteres. A Easyhook renova
automaticamente o refresh token e criptografa as credenciais. O Mercado Livre
não usa a janela de atendimento de 24 horas do WhatsApp. A versão inicial do
canal processa texto; anexos ainda não são expostos como mídia reutilizável da Easyhook.

### Configuração do aplicativo

Cadastre estes valores exatos:

- Redirecionar URI:
  `https://api.easyhook.dev/v1/channels/mercadolibre/oauth/callback`
- URL da chamada de notificações:
  `https://api.easyhook.dev/v1/channels/mercadolibre/webhook`
- Fluxos OAuth: **Código de Autorização** e **Refresh Token**.
- PKCE: ativado.
- Negócios: **Mercado Livre**.
- Usuários: leitura.
- Comunicações pré e pós-venda: leitura e escrita.
- Tópicos: `questions`, `messages.created` e `messages.read`.

Não habilite Client Credentials, anúncios, publicidade, faturamento, métricas,
promoções, vendas, envios ou outros tópicos se a Easyhook será usada apenas
para mensageria. Não marque o aplicativo como certificado antes de receber a
certificação formal do Mercado Livre.

## Telegram

O Telegram funciona por bots.

1. Abra o [@BotFather](https://t.me/BotFather) no Telegram.
2. Crie um bot e copie seu token.
3. Na Easyhook, abra **Conectar > Telegram**.
4. Cole o token e confirme.

A Easyhook valida o bot, criptografa o token e configura o webhook
automaticamente. Você não precisa criar outro webhook no Telegram.

O Telegram não tem uma janela de serviço 24 horas em Easyhook. O bot pode
responder ou enviar mensagens em qualquer momento permitido pelo Telegram.

Enviar texto com o endpoint padrão:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/text \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "@mi_easyhook_bot",
    "to": "123456789",
    "body": "Olá da Easyhook"
  }'
```

O destinatário precisa ter iniciado uma conversa com o bot. Para enviar mídia,
use `POST /v1/messages/media` com uma URL pública em `link`.

A mídia recebida inclui inicialmente os metadados do arquivo do Telegram. O
armazenamento automático e um link de download da Easyhook serão adicionados
depois. Ao desconectar o canal, a Easyhook remove primeiro o webhook protegido
do Telegram e depois exclui o token criptografado.

## E-mail

Todos os provedores de e-mail usam o mesmo endpoint, payload, Inbox e webhooks.
Você pode trocar Gmail por Outlook ou por um servidor IMAP/SMTP sem reescrever a
integração que envia mensagens.

A janela de atendimento de 24 horas é uma política de mensageria da Meta e não
se aplica ao e-mail. Gmail, Outlook e IMAP/SMTP podem enviar mensagens a qualquer
momento, sujeitos às políticas e aos limites do provedor.

### Gmail

O Gmail aparece como um canal de E-mail dentro da Inbox compartilhada.

1. Na Easyhook, abra **Conectar > Gmail**.
2. Entre com sua conta do Google.
3. Verifique e autorize as permissões mostradas.
4. O Google retorna ao portal e a conta está disponível como remetente.

A Easyhook usa `gmail.modify` para:

- Detectar novas mensagens pelo Google Pub/Sub.
- Leia o conteúdo necessário para mostrá-lo na Inbox.
- Envie mensagens e respostas.
- Preservar assunto, HTML e a thread correta.
- Manter o estado das mensagens da conta conectada.

A informação do Gmail não é usada para publicidade.

A Easyhook aceita texto, HTML, anexos, novas mensagens, respostas na mesma
thread, encaminhamento, lido/não lido, arquivamento e exclusão.

Enviar um E-mail:

```bash
curl -X POST https://api.easyhook.dev/v1/messages/email \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "suporte@empresa.com",
    "to": "cliente@exemplo.com",
    "subject": "Seguimiento",
    "body": "Olá, estamos acompanhando sua solicitação."
  }'
```

Para responder em uma thread existente, envie `reply_to_message_id` com o
`message.id` da mensagem recebida. Easyhook resolve o tópico e os cabeçalhos
do Gmail automaticamente. Verifique todos os campos e exemplos em
[Referência completa](/api-reference#email-gmail-outlook-and-imapsmtp).

Na Inbox, o ícone do filtro aparece ao selecionar uma conta de E-mail.
O Gmail permite filtrar por categorias, não lidas, com estrela e importantes;
o Outlook, por Prioritários, Outros e não lidas; o IMAP/SMTP, por não lidas e com estrela.

Ao desconectar o Gmail em **Organização**, a Easyhook interrompe as notificações
do Gmail, revoga a autorização OAuth e exclui a credencial criptografada.

### Outlook

1. Na Easyhook, abra **Conectar > Outlook**.
2. Faça login na Microsoft e autorize o acesso solicitado.
3. A Microsoft retorna ao portal e o endereço está disponível como remetente.

A Easyhook usa o Microsoft Graph para receber e-mails, enviar mensagens e
responder na thread original. As assinaturas do Microsoft Graph são renovadas
automaticamente. Para uma resposta exata, envie `reply_to_message_id` com
`message.id` recebido por webhook ou visível na Inbox.

### IMAP/SMTP

Use esta opção para provedores diferentes do Gmail e Outlook.

1. Abra **Conectar > Outro e-mail (IMAP/SMTP)**.
2. Digite o endereço, IMAP e servidores SMTP, portas, usuário e
   A senha do aplicativo.
3. O Easyhook verifica ambas as conexões antes de salvar o canal.

A Easyhook exige TLS ou STARTTLS com certificados válidos e bloqueia servidores
locais, privados e de metadados. Muitos provedores exigem uma senha de
aplicativo; não use sua senha principal quando essa alternativa estiver disponível.

O recebimento consulta a cada minuto apenas mensagens novas após a conexão. A
Easyhook não importa automaticamente a caixa postal anterior. As respostas
preservam `Message-ID`, `In-Reply-To` e `References`.

### Vídeo para análise do Google

Grave um único fluxo contínuo:

1. Abra **Conectar > Gmail**.
2. Mostre a tela de consentimento do Google e a permissão solicitada.
3. Complete a conexão e mostre a conta dentro do Easyhook.
4. Envie um e-mail de outra conta e mostre-o para a Inbox Easyhook.
5. Responda pela Easyhook e mostre a resposta na mesma thread do Gmail.
6. Envie outro e-mail por `POST /v1/messages/email` e mostre seu recebimento.

Texto curto para justificar `gmail.modify`:

> Easyhook é uma API de mensagens multicanal e uma Inbox compartilhada.
> `gmail.modify` permite que o proprietário conecte o Gmail, receba e leia
> mensagens na Easyhook, enviar e-mails e respostas na mesma thread e manter o
> estado da mensagem. Os dados são isolados por organização e criptografados
> em trânsito e em repouso, e não são utilizados para publicidade.

## Webhooks multicanais

Em **Webhooks**, você pode assinar toda a organização ou um canal específico.
Selecione `telegram`, `gmail`, `outlook`, `imap_smtp`, `mercadolibre` ou
`tiktok` com `message.*`. O JSON mantém o mesmo contrato normalizado:

```json
{
  "id": "event-id",
  "type": "message.received",
  "channel": "gmail",
  "account": { "id": "suporte@empresa.com" },
  "contact": { "id": "cliente@exemplo.com", "name": "Ana" },
  "message": {
    "id": "gmail-message-id",
    "type": "text",
    "text": "Preciso de ajuda",
    "subject": "Solicitud",
    "thread_id": "gmail-thread-id",
    "timestamp": "2026-07-26T20:00:00.000Z"
  }
}
```

O conteúdo recebido, incluindo HTML e texto do Telegram, é uma entrada não
confiável. Higienize ou escape esse conteúdo antes de renderizá-lo em um aplicativo.
