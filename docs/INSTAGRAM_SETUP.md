# Instagram Integration Setup Guide

## Requisitos Previos
- Cuenta de Instagram Business o Creator
- Cuenta de Facebook vinculada
- Acceso a Meta for Developers

## Paso 1: Crear Meta App

1. Ve a https://developers.facebook.com/apps/
2. Click "Create App"
3. Selecciona "Business" como tipo de app
4. Ingresa nombre: "Kora Instagram Integration" (o tu preferencia)
5. Selecciona tu Business Account

## Paso 2: Agregar Instagram Product

1. En el Dashboard de la app, click "Add Product"
2. Busca "Instagram" y click "Set Up"
3. Selecciona "Instagram API with Instagram Login"

## Paso 3: Configurar OAuth

1. En Instagram > Basic Display > Instagram App ID, copia el **App ID**
2. En Settings > Basic, copia el **App Secret**
3. En Instagram > Basic Display > Valid OAuth Redirect URIs, agrega:
   - Para desarrollo: `https://financials-dashboard.preview.emergentagent.com/api/instagram/oauth/callback`
   - Para producción: `https://ourkora.com/api/instagram/oauth/callback`

## Paso 4: Permisos (Scopes)

En Instagram > Permissions, asegúrate de tener:
- `instagram_business_basic` - Acceso básico al perfil
- `instagram_business_manage_messages` - Gestión de mensajes (opcional)

## Paso 5: Configurar Variables de Entorno

En el archivo `/app/backend/.env`, agrega:
```
INSTAGRAM_APP_ID=tu_app_id_aqui
INSTAGRAM_APP_SECRET=tu_app_secret_aqui
```

## Paso 6: App Review (para Producción)

Para usar en producción, necesitas:
1. Ir a App Review > Permissions and Features
2. Solicitar los permisos necesarios
3. Proporcionar documentación y casos de uso
4. Esperar aprobación de Meta (puede tomar días/semanas)

## Notas Multi-Tenant

- Kora tiene UNA sola app de Meta
- Cada tenant (cliente) puede conectar SU propia cuenta de Instagram
- Los tokens se almacenan de forma segura por tenant
- Los tokens se refrescan automáticamente antes de expirar (60 días)

## Flujo de Usuario

1. Tenant admin hace click en "Conectar Instagram" en Settings
2. Redirige a Instagram para autorizar
3. Usuario autoriza acceso a su cuenta Business/Creator
4. Regresa a Kora con la cuenta conectada
5. Puede ver sus posts publicados en el Feed

## Troubleshooting

### Error: "Instagram not configured"
- Verifica que INSTAGRAM_APP_ID y INSTAGRAM_APP_SECRET estén en .env
- Reinicia el backend: `sudo supervisorctl restart backend`

### Error: "Invalid redirect URI"
- Asegúrate de que la URL en Meta App Dashboard coincida EXACTAMENTE con la URL de callback
- Incluye o excluye el trailing slash según lo que esté configurado

### Error: "Unauthorized"
- El usuario debe tener cuenta Instagram Business o Creator
- La cuenta debe estar vinculada a una página de Facebook

## Soporte
Para problemas con la integración, contacta a soporte de Kora.
