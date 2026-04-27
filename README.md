# AcademiX AI

Plataforma web para revisar documentos academicos con flujo de detector de IA/plagio, gestion de pagos manuales, panel administrativo, notificaciones por WhatsApp y modulo de humanizacion con Ollama.

## Arquitectura

- **Frontend:** React, TypeScript, Vite y Tailwind CSS.
- **Backend:** Express, Socket.IO y TypeScript.
- **Base de datos:** MongoDB Atlas con Mongoose.
- **Archivos:** MongoDB GridFS para originales, reportes y comprobantes.
- **Notificaciones:** Resend para correo y bot de WhatsApp con Baileys.
- **Humanizador:** Ollama local o remoto.

## Estructura

```text
client/
  App.tsx
  main.tsx
  index.css
  components/layout/
  features/
    auth/
    detector/
    humanizer/
    subscription/
    admin/

server/
  index.ts
  app.ts
  config/env.ts
  middleware/
  models/
  routes/
  services/
  utils/

shared/
  constants/
  types/
```

## Requisitos

- Node.js 18 o superior.
- npm 9 o superior.
- MongoDB Atlas con una base de datos disponible.
- Cuenta de Resend si se enviaran correos reales.
- Bot de WhatsApp si se usaran notificaciones/admin por WhatsApp.
- Ollama si se usara el humanizador.

## Configuracion

Crea un archivo `.env` en la raiz. Puedes partir de `.env.example`.

```env
JWT_SECRET="academix_secret_key_2026"
MONGODB_URI="mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/academix-ai?retryWrites=true&w=majority"
SERVER_PORT=3001

ADMIN_EMAIL="admin@academix.com"
ADMIN_PASSWORD="admin123"
ADMIN_ACCOUNTS="admin@academix.com:admin123:Admin Principal"

ESCALATION_TIMEOUT_MINUTES=5

WHATSAPP_ENABLED=true
WHATSAPP_BOT_NUMBER="+5930998949312"
WHATSAPP_ADMIN_NUMBERS="+593999999999"
WHATSAPP_SESSION_DIR=".baileys_auth"

RESEND_API_KEY="re_xxxxxxxxxxxx"
RESEND_FROM_EMAIL="AcademiX AI <notificaciones@tudominio.com>"

OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="llama3.1:8b"
OLLAMA_TIMEOUT_MS=300000
MAX_INPUT_CHARS=100000

PLAN_BASIC_PRICE="5.00"
PLAN_PRO_PRICE="10.00"
PLAN_PRO_PLUS_PRICE="15.00"
SUBSCRIPTION_DAYS=30
BANK_ACCOUNTS="[]"
```

`MONGODB_URI` es obligatorio. Si no existe, el servidor no arranca.
`BANK_ACCOUNTS` es opcional y solo sirve como semilla inicial cuando `systemsettings` no existe; despues las cuentas se editan desde el panel admin y quedan guardadas en MongoDB.

## Datos Y Configuracion Persistente

MongoDB Atlas guarda:

- `users`: usuarios y administradores.
- `tickets`: documentos enviados y estado de reportes.
- `payments`: comprobantes y revisiones de pago.
- `subscriptions`: plan activo y periodo de cupo.
- `systemsettings`: precios, limites y cuentas bancarias configurables por admin.

`systemsettings` se crea automaticamente con valores por defecto si la base esta vacia. Desde el panel admin se pueden editar precios, limites del detector, limites preparados del humanizador y cuentas bancarias de Ecuador; esos cambios persisten tras reiniciar el servidor.

Los archivos nuevos se guardan en GridFS usando los buckets:

- `originals`
- `results`
- `vouchers`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
npm start
```

`npm run dev` inicia backend y frontend. El backend usa `SERVER_PORT` y Vite corre en `http://localhost:3000`.

## Endpoints Principales

### Autenticacion

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| POST | `/api/auth/register` | Registro de usuario |
| POST | `/api/auth/login` | Inicio de sesion |
| POST | `/api/auth/verify` | Verificacion por codigo |
| POST | `/api/auth/resend-code` | Reenvio de codigo |
| GET | `/api/auth/me` | Usuario autenticado |

### Detector

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| POST | `/api/upload` | Subir documento y crear ticket |
| GET | `/api/tickets` | Listar tickets |
| GET | `/api/tickets/:id` | Detalle de ticket |
| POST | `/api/tickets/:id/results` | Subir reportes como admin |
| POST | `/api/tickets/:id/notify-delay` | Notificar demora |

### Suscripciones Y Pagos

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/subscription/status` | Plan, dias y cupo restante |
| GET | `/api/subscription/bank-accounts` | Cuentas bancarias, precios y limites |
| POST | `/api/subscription/pay` | Subir comprobante |
| GET | `/api/subscription/payments` | Historial de pagos |

### Admin

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/admin/payments` | Pagos pendientes o todos |
| GET | `/api/admin/payments/:id/voucher` | Ver comprobante |
| POST | `/api/admin/payments/:id/approve` | Aprobar pago |
| POST | `/api/admin/payments/:id/reject` | Rechazar pago |
| GET | `/api/admin/subscription-settings` | Leer precios, limites y cuentas bancarias |
| PUT | `/api/admin/subscription-settings` | Guardar precios, limites y cuentas bancarias |

### Descargas Y Humanizador

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/download/:ticketId/original` | Descargar original |
| GET | `/api/download/:ticketId/plagiarism` | Descargar reporte de plagio |
| GET | `/api/download/:ticketId/ai` | Descargar reporte de IA |
| POST | `/api/humanize` | Humanizar texto |
| POST | `/api/humanize-file` | Humanizar archivo |
| GET | `/api/models` | Modelos de Ollama disponibles |

## Distribucion

1. Configura `MONGODB_URI` y secretos reales en `.env`.
2. Ejecuta `npm install`.
3. Ejecuta `npm run build`.
4. Inicia con `npm start`.
5. Verifica `/health`.
6. Entra con el admin seed y ajusta precios/limites.

La base nueva empieza limpia salvo el admin seed y la configuracion default de planes.
