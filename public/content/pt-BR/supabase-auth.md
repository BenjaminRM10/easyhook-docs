# Supabase Auth com Easyhook

Conecte um projeto Supabase para entregar códigos de acesso e MFA por SMS,
WhatsApp ou WhatsApp com backup de SMS. A configuração é feita em **Portal →
Integrações → Supabase Auth**; seu aplicativo continua usando o SDK normal do Supabase.

## Por que Easyhook não aparece como um fornecedor

A Easyhook não aparece na lista de provedores nativos de telefonia do Supabase.
Essa lista contém adaptadores incluídos diretamente pelo Supabase. A Easyhook
usa o **Send SMS Hook** do Supabase, que permite provedores regionais, WhatsApp
e estratégias de fallback.

Não selecione outro provedor como substituto nem coloque uma chave de API da
Easyhook no Supabase ou no frontend. Ao conectar o projeto pela Easyhook, o
portal usa OAuth do Supabase para habilitar o Phone Auth, criar um segredo de
assinatura exclusivo e instalar o hook correspondente ao projeto.

## Conectar um projeto

1. Na Easyhook, abra **Integrações → Supabase Auth** e conecte sua conta do Supabase.
2. Selecione o modo de projeto e entrega.
3. Escolha o número de SMS ou o número e template do WhatsApp apropriados, junto com o idioma (`es`, `en` ou `pt-BR`).
4. Confirme a conexão. Se já existir um Send SMS Hook, a Easyhook mostrará que
   ele será substituído e preservará sua configuração para restaurá-la ao desconectar.
5. Pressione **Verificar**. A Easyhook confirma que o Phone Auth e o hook exato
   desta integração continuam ativos.

Você também pode ver o hook instalado em **Supabase → Autenticação → Hooks**.
Você não precisa configurar um provedor de SMS nativo.

## Modos de entrega

- **SMS:** usa um número ativo da Easyhook com SMS de saída.
- **WhatsApp:** usa um template `AUTHENTICATION` aprovado para um número conectado do WhatsApp.
- **WhatsApp com fallback por SMS:** tenta primeiro o WhatsApp e envia SMS
  somente se essa entrega falhar; não envia dois códigos de propósito.

A seleção é definida por projeto. O Send SMS Hook do Supabase não inclui o
canal solicitado pelo frontend; portanto, `options.channel` não pode alternar
entre SMS e WhatsApp em cada solicitação quando esse hook é usado.

## Requisitos do WhatsApp

A Easyhook mostra essa opção quando encontra pelo menos um template
`AUTHENTICATION` aprovado e sincronizado na organização. A Meta pode exigir que
a empresa seja verificada antes de permitir essa categoria; a aprovação do
template é o sinal que a Easyhook consegue verificar.

Se ainda não aparecer:

1. Conecte o número WhatsApp ao Easyhook.
2. Crie o modelo de autenticação a partir de **Modelos**.
3. Espere pela aprovação da Meta e sincronize os modelos.
4. Volte para a integração do Supabase.

## Código do aplicativo

Solicite o código ao Supabase. Se o CAPTCHA estiver ativo no projeto, envie
também o token gerado pelo frontend:

```ts
const { error } = await supabase.auth.signInWithOtp({
  phone: "+15550100003",
  options: {
    captchaToken,
    shouldCreateUser: false
  }
})
```

Use sempre E.164 (`+` seguido do código do país e do número) e preserve
exatamente o mesmo valor na verificação. Remova `shouldCreateUser: false`
somente se quiser que um telefone desconhecido crie uma nova conta.

Verifique o código com o Supabase:

```ts
const { data, error } = await supabase.auth.verifyOtp({
  phone: "+15550100003",
  token: code,
  type: "sms"
})
```

O Supabase usa `sms` como tipo de verificação para qualquer OTP por telefone.
Esse valor não muda mesmo quando o código chega pelo WhatsApp. O mesmo modo de
entrega se aplica aos desafios de MFA por telefone.

Uma solicitação de OTP bem-sucedida confirma que o Supabase aceitou a entrega
pelo hook. A autenticação só termina quando `verifyOtp` retorna uma sessão.

## Teste pelo terminal

Use a URL e a chave publicável do projeto. Nunca use `service_role` nem uma
chave secreta em um teste do cliente:

```bash
IFS= read -rp "Supabase URL: " SB_URL
IFS= read -rsp "Supabase publishable key: " SB_KEY; printf '\n'
IFS= read -rp "Telefone E.164 (+52...): " PHONE

curl -sS -X POST "${SB_URL%/}/auth/v1/otp" \
  -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc --arg phone "$PHONE" '{phone:$phone}')" \
  -w '\nHTTP %{http_code}\n'
```

Escreva apenas o código mais recente e verifique com o mesmo telefone.
A saída é reduzida para não imprimir os tokens de sessão:

```bash
IFS= read -rp "Código mais recente: " OTP

VERIFY_RESPONSE=$(curl -sS -X POST "${SB_URL%/}/auth/v1/verify" \
  -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc --arg phone "$PHONE" --arg token "$OTP" \
    '{type:"sms",phone:$phone,token:$token}')")

printf '%s' "$VERIFY_RESPONSE" | jq '{
  authenticated: (.access_token != null),
  user_id: .user.id,
  phone: .user.phone,
  error_code,
  msg
}'

unset SB_URL SB_KEY PHONE OTP VERIFY_RESPONSE
```

O Supabase pode usar por padrão apenas 60 segundos de validade para o OTP; o
aplicativo deve exibir imediatamente o campo do código. Em um teste manual
controlado, você pode ampliar temporariamente a validade, por exemplo para 300
segundos, nas configurações de telefone do projeto.

## Solução de problemas

| Erro | O que significa? |
| --- | --- |
| `captcha_failed` | O Supabase interrompeu a solicitação antes de chamar a Easyhook. Gere um `captchaToken` novo; desative o CAPTCHA somente em um teste controlado. |
| `phone_provider_disabled` | O Phone Auth ou o hook está inativo. Use **Verificar** na Easyhook; não escolha outro provedor nativo. |
| `unexpected_failure` / `Invalid payload sent to hook` | O Supabase chamou o hook, mas ele retornou um erro. Anote o `error_id` e revise os registros de integração e entrega. |
| `otp_expired` | O código pode ter sido entregue corretamente, mas já expirou, foi substituído ou verificado com outro telefone. Ele solicita um novo e usa apenas o mais recente. |
| HTTP `429` | Você alcançou o intervalo de reenvio ou um limite de Supabase. Espere antes de solicitar outro código. |

Não solicite códigos repetidamente para diagnosticar: cada solicitação aceita
pode gerar entrega e cobrança. A aceitação do envio e a validação correta do
código são etapas diferentes.

## Privacidade e encargos

- O OTP não aparece na Inbox, webhooks do cliente ou registros de integração.
- Cada solicitação aceita cobra uma operação de API da Easyhook.
- Se o SMS for usado, o SMS também é cobrado à taxa atual.
- Se o WhatsApp funcionar, o Easyhook não cobra um SMS.
- No modo de fallback, o SMS é cobrado apenas quando o fallback é tentado.
- Os encargos do modelo de autenticação do WhatsApp são aplicados à conta
  do WhatsApp conectado de acordo com as taxas atuais do Meta.

A Easyhook confirma que o número, a conexão do WhatsApp e o template pertencem
à mesma organização. Ela nunca usa recursos de outra organização como fallback.
