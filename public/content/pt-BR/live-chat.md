# Easyhook Live Chat

O Live Chat é um canal operado diretamente pela Easyhook. Você pode instalar um
widget de chat em um site ou usar a Easyhook como servidor para conversas
diretas e em grupo sem implantar um backend próprio de mensageria.

## Duas formas de usar

1. **Widget para visitantes:** crie um widget no portal, cadastre as origens
   HTTPS exatas e publique a chave `eh_chat_pk_...` no frontend.
2. **Usuários autenticados do aplicativo:** seu backend cria uma identidade
   assinada válida por cinco minutos com `POST /v1/live-chat/identity-tokens`.
   O cliente recebe uma sessão limitada à identidade e às suas conversas.

Nunca coloque uma chave de API comum da Easyhook nem credenciais do Supabase no
navegador. A chave publicável identifica um widget, mas não concede acesso à
organização.

## Recursos

O Live Chat aceita texto, imagens, vídeo, áudio, documentos, stickers,
respostas, encaminhamentos, reações, edições, marcadores de mensagem excluída,
cursores de leitura e indicadores de digitação. Também aceita conversas diretas
e em grupo. As mensagens aparecem com `channel: "live_chat"` no Inbox
multicanal e nos webhooks normalizados.

As sessões usam tokens de acesso de curta duração e refresh tokens rotativos de
uso único. O servidor valida origem, participação e ação em cada solicitação.
Turnstile, limites independentes e identidades geradas pela Easyhook protegem o
fluxo de inicialização anônimo.

## Cobrança

Mensagens e ações persistentes consomem o saldo da carteira com idempotência.
Leituras, consultas de estado e polling são grátis; portanto, reconectar ou
atualizar não duplica cobranças. Consulte os payloads e erros exatos na
[referência completa da API](/api-reference#easyhook-live-chat).

## Idioma do widget

O widget detecta automaticamente o idioma do navegador e aceita espanhol,
inglês e português do Brasil. O código gerado pelo portal usa
`data-easyhook-language="auto"`. Para fixar um idioma, altere o valor para `es`,
`en` ou `pt-BR`:

```html
<script
  src="https://www.easyhook.dev/live-chat/easyhook-chat.js"
  data-easyhook-key="eh_chat_pk_..."
  data-easyhook-sitekey="..."
  data-easyhook-language="auto"
  async
></script>
```

O idioma controla botões, avisos, rótulos de acessibilidade, datas e o desafio
de segurança. Ele não traduz o conteúdo escrito por visitantes ou agentes.
