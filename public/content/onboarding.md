# Conectar WhatsApp

Easyhook usa el registro insertado oficial de Meta. Elige el modo según lo que debe ocurrir con el número después de conectarlo.

## WhatsApp Coexistence

Usa Coexistence cuando el negocio necesita conservar el número en WhatsApp Business App.

- El número debe usar WhatsApp Business, no WhatsApp personal.
- Meta determina si el número es elegible.
- Debes abrir WhatsApp Business al menos una vez cada 14 días.
- Durante el registro se escanea un código QR.
- Puedes autorizar la sincronización inicial de contactos e historial.

La disponibilidad de historial y media depende de lo que Meta entregue durante el onboarding. Los eventos de importación son históricos y no deben activar respuestas automáticas.

## WhatsApp Cloud API

Usa Cloud API cuando el número funcionará exclusivamente mediante la plataforma oficial:

- Puedes solicitar un número nuevo proporcionado por Meta.
- Puedes migrar un número existente.
- Un número existente migrado deja de funcionar en WhatsApp y WhatsApp Business App.

## Onboarding alojado para tus clientes

Una API key puede crear una sesión alojada en `easyhook.dev`. El número completado se registra automáticamente en la organización dueña de esa key.

```bash
curl -X POST https://api.easyhook.dev/v1/onboarding/sessions \
  -H "Authorization: Bearer $EASYHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "signup_mode": "coexistence",
    "customer_name": "Cliente",
    "language": "es",
    "return_url": "https://app.example.com/channels"
  }'
```

Suscríbete a `onboarding.*` para recibir el resultado sin consultar repetidamente la sesión.
