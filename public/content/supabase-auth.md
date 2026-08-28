# Supabase Auth con Easyhook

Conecta un proyecto de Supabase para entregar códigos de acceso y MFA por SMS,
WhatsApp o WhatsApp con respaldo SMS. La configuración se hace en **Portal →
Integraciones → Supabase Auth**; tu aplicación sigue usando el SDK normal de
Supabase.

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
  phone: "+525566006997",
  options: { captchaToken }
})
```

Verifica el código con Supabase:

```ts
const { data, error } = await supabase.auth.verifyOtp({
  phone: "+525566006997",
  token: code,
  type: "sms"
})
```

Supabase llama `sms` al tipo de verificación de cualquier OTP telefónico. Ese
valor no cambia aunque el código haya llegado por WhatsApp. El mismo modo de
entrega se aplica a los desafíos MFA por teléfono.

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
