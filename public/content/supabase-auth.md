# Supabase Auth con Easyhook

Conecta un proyecto de Supabase para entregar códigos de acceso y MFA por SMS,
WhatsApp o WhatsApp con respaldo SMS. La configuración se hace en **Portal →
Integraciones → Supabase Auth**; tu aplicación sigue usando el SDK normal de
Supabase.

## Por qué Easyhook no aparece como proveedor

Easyhook no aparece en la lista de proveedores telefónicos nativos de Supabase.
Esa lista contiene adaptadores incluidos directamente por Supabase. Easyhook se
conecta mediante el **Send SMS Hook HTTPS oficial de Supabase**, que permite
usar proveedores regionales, WhatsApp y estrategias de respaldo.

No selecciones otro proveedor como sustituto y no pongas una API key de
Easyhook en Supabase ni en tu frontend. Al conectar el proyecto desde Easyhook,
el portal usa OAuth de Supabase para habilitar Phone Auth, crear un secreto de
firma único e instalar el hook correspondiente a ese proyecto.

## Conectar un proyecto

1. En Easyhook, abre **Integraciones → Supabase Auth** y conecta tu cuenta de
   Supabase.
2. Selecciona el proyecto y el modo de entrega.
3. Elige el número SMS o el número y template de WhatsApp que corresponda, junto con el idioma (`es`, `en` o `pt-BR`).
4. Confirma la conexión. Si ya existía un Send SMS Hook, Easyhook te mostrará
   que será reemplazado y conservará su configuración para restaurarla al
   desconectar.
5. Presiona **Verificar**. Easyhook comprobará que Phone Auth y el hook exacto
   de esa integración continúan activos.

También puedes ver el hook instalado en **Supabase → Authentication → Hooks**.
No necesitas configurar adicionalmente un proveedor SMS nativo.

## Modos de entrega

- **SMS:** usa un número Easyhook activo con SMS saliente.
- **WhatsApp:** usa un template `AUTHENTICATION` aprobado en un número de
  WhatsApp conectado.
- **WhatsApp con respaldo SMS:** intenta WhatsApp primero y envía SMS solamente
  si esa solicitud falla. No envía dos códigos deliberadamente.

La selección se configura por proyecto. El Send SMS Hook de Supabase no incluye
el canal solicitado por el frontend, por lo que `options.channel` no puede
cambiar entre SMS y WhatsApp en cada solicitud cuando se usa este hook.

## Requisitos de WhatsApp

Easyhook muestra esta opción cuando encuentra al menos un template
`AUTHENTICATION` aprobado y sincronizado en la organización. Meta puede exigir
que la empresa esté verificada antes de permitir crear este tipo de template;
la aprobación del template es la señal que Easyhook puede comprobar.

Si todavía no aparece:

1. Conecta el número de WhatsApp en Easyhook.
2. Crea el template de autenticación desde **Plantillas**.
3. Espera la aprobación de Meta y sincroniza las plantillas.
4. Regresa a la integración de Supabase.

## Código de la aplicación

Solicita el código desde Supabase. Si activaste CAPTCHA en el proyecto, entrega
también el token generado por tu frontend:

```ts
const { error } = await supabase.auth.signInWithOtp({
  phone: "+15550100003",
  options: {
    captchaToken,
    shouldCreateUser: false
  }
})
```

Usa siempre E.164 (`+` seguido del código de país y número) y conserva
exactamente el mismo valor al verificar. Omite `shouldCreateUser: false` sólo
si quieres que un teléfono desconocido cree una cuenta nueva.

Verifica el código con Supabase:

```ts
const { data, error } = await supabase.auth.verifyOtp({
  phone: "+15550100003",
  token: code,
  type: "sms"
})
```

Supabase llama `sms` al tipo de verificación de cualquier OTP telefónico. Ese
valor no cambia aunque el código haya llegado por WhatsApp. El mismo modo de
entrega se aplica a los desafíos MFA por teléfono.

Un resultado correcto al solicitar el OTP confirma que Supabase aceptó la
entrega mediante el hook. La autenticación termina únicamente cuando
`verifyOtp` devuelve una sesión.

## Probar desde terminal

Usa la URL y la llave publicable del proyecto. Nunca uses `service_role` ni una
llave secreta en una prueba de cliente:

```bash
IFS= read -rp "Supabase URL: " SB_URL
IFS= read -rsp "Supabase publishable key: " SB_KEY; printf '\n'
IFS= read -rp "Teléfono E.164 (+52...): " PHONE

curl -sS -X POST "${SB_URL%/}/auth/v1/otp" \
  -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc --arg phone "$PHONE" '{phone:$phone}')" \
  -w '\nHTTP %{http_code}\n'
```

Escribe únicamente el código más reciente y verifica con el mismo teléfono.
La salida se reduce para no imprimir los tokens de sesión:

```bash
IFS= read -rp "Código más reciente: " OTP

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

Supabase puede usar por defecto una vigencia de sólo 60 segundos para OTP
telefónicos. La aplicación debe mostrar inmediatamente la captura del código.
Para una prueba manual controlada puedes ampliar temporalmente la vigencia, por
ejemplo a 300 segundos, desde la configuración telefónica del proyecto.

## Solución de problemas

| Error | Qué significa |
| --- | --- |
| `captcha_failed` | Supabase detuvo la solicitud antes de llamar a Easyhook. Envía un `captchaToken` nuevo; desactiva CAPTCHA sólo durante una prueba controlada. |
| `phone_provider_disabled` | Phone Auth o el hook no está activo. Usa **Verificar** en Easyhook; no elijas un proveedor nativo distinto. |
| `unexpected_failure` / `Invalid payload sent to hook` | Supabase llamó al hook, pero éste devolvió un error. Conserva el `error_id` y revisa la integración y los registros de entrega. |
| `otp_expired` | El código puede haberse entregado correctamente, pero ya venció, fue reemplazado o se verificó con otro teléfono. Solicita uno nuevo y usa sólo el más reciente. |
| HTTP `429` | Alcanzaste el intervalo de reenvío o un límite de Supabase. Espera antes de solicitar otro código. |

No solicites códigos repetidamente para diagnosticar: cada solicitud aceptada
puede generar entrega y cobro. Que el envío sea aceptado y que Supabase valide
el código son dos etapas distintas.

## Privacidad y cobros

- El OTP no aparece en Inbox, webhooks del cliente ni registros de integración.
- Cada solicitud aceptada cobra una llamada API de Easyhook.
- Si se usa SMS, se cobra también el SMS según la tarifa vigente.
- Si WhatsApp funciona, Easyhook no cobra un SMS.
- En modo de respaldo, el SMS se cobra sólo cuando se intenta el respaldo.
- Los cargos de templates de autenticación de WhatsApp se aplican en la cuenta
  de WhatsApp conectada según las tarifas vigentes de Meta.

Easyhook valida que el número, conexión de WhatsApp y template pertenezcan a la
misma organización. Nunca usa recursos de otra organización como respaldo.
