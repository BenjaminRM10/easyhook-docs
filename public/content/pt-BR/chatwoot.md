# Chatwoot

A integração conecta os canais da Easyhook às caixas de entrada de API do
Chatwoot. A Easyhook cuida do transporte; o Chatwoot gerencia contatos,
conversas, agentes e automações.

Os canais compatíveis são WhatsApp, Messenger, Instagram, Telegram, TikTok
Business, Gmail, Outlook, e-mail IMAP/SMTP e Mercado Livre. Cada canal
selecionado cria sua própria caixa de entrada para que identidades e conversas
não se misturem.

## Requisitos

- Uma instalação acessível do Chatwoot.
- Um token de acesso à API do Chatwoot.
- Pelo menos um número ou canal conectado ao Easyhook.

## Configurações

1. No Chatwoot, crie uma caixa de entrada do tipo **API**.
2. Na Easyhook, abra **Integrações → Chatwoot**.
3. Digite o URL do Chatwoot, ID da conta e token.
4. Selecione um ou mais canais da organização.
5. A Easyhook cria ou vincula uma caixa de entrada para cada canal e configura a entrega bidirecional.

Os nomes das caixas de entrada vêm do canal conectado. Você pode renomeá-los depois no Chatwoot.

## Comportamento

- As mensagens recebidas criam ou atualizam um contato e uma conversa.
- Mensagens enviadas do WhatsApp Business App via Coexistência aparecem como mensagens enviadas.
- As mensagens enviadas pelo Chatwoot passam pela Easyhook e usam a carteira da organização.
- Texto, imagens, vídeo, áudio, documentos e adesivos compatíveis são entregues como anexos.
- Os estados enviado, entregue e lido são sincronizados quando o Chatwoot consegue representá-los.
- Eventos `typing` se tornam indicadores de digitação quando a API do Chatwoot oferece suporte.
- As respostas mantêm o contexto nativo necessário: destinatário remoto
  para mensageria, pergunta ou pacote no Mercado Livre e mensagem ou thread no
  e-mail.
- O TikTok mantém seu identificador opaco de conversa, a janela de 48 horas e o
  limite de 10 respostas da empresa; o Chatwoot não pode iniciar uma nova conversa no TikTok.

## Importar contatos e histórico

A importação inicial descrita aqui se aplica somente aos contatos e ao histórico
do WhatsApp Coexistence que a Easyhook recebeu da Meta durante o onboarding. Os
outros canais começam com os eventos disponíveis depois da conexão.

- Mantenha as datas originais.
- Ela não envia mensagens de volta para o WhatsApp.
- Ela não deve ativar bots nem automações como se fossem mensagens novas.
- A importação é idempotente pelo identificador externo da mensagem.

A sincronização inicial depende de ter autorizado um histórico no WhatsApp Business App ao conectar o número.
