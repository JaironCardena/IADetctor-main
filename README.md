# AcademiX AI

Plataforma web para la deteccion de contenido generado por inteligencia artificial y plagio academico en documentos. Incluye un modulo de humanizacion de texto que reescribe contenido para evadir detectores de IA, utilizando un modelo de lenguaje local (Ollama).

El sistema esta disenado para instituciones educativas y profesionales que necesitan verificar la autenticidad de textos academicos.

---

## Tabla de contenidos

- [Arquitectura general](#arquitectura-general)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Requisitos previos](#requisitos-previos)
- [Instalacion](#instalacion)
- [Configuracion del entorno](#configuracion-del-entorno)
- [Ejecucion](#ejecucion)
- [Endpoints de la API](#endpoints-de-la-api)
- [Stack tecnologico](#stack-tecnologico)

---

## Arquitectura general

El proyecto es un monorepo fullstack compuesto por tres capas:

- **Client** — Aplicacion de interfaz de usuario construida con React y TypeScript. Se encarga de la subida de documentos, la visualizacion de resultados y el panel de administracion.
- **Server** — API REST construida con Express y Socket.IO. Gestiona la autenticacion, el procesamiento de tickets, las notificaciones por correo electronico y Telegram, y la humanizacion de texto mediante Ollama.
- **Shared** — Tipos TypeScript compartidos entre el cliente y el servidor para garantizar consistencia en las interfaces.

El flujo principal es:

1. El usuario sube un documento desde la interfaz web.
2. Se genera un ticket y se notifica a los administradores via Telegram y Socket.IO.
3. Un administrador confirma la recepcion, procesa el documento y sube los reportes de plagio e IA.
4. El usuario recibe una notificacion por correo y puede descargar los resultados.

---

## Estructura de carpetas

```
IADetctor-main/
|
|-- client/                            Codigo fuente del frontend
|   |-- App.tsx                        Componente raiz de la aplicacion
|   |-- main.tsx                       Punto de entrada de React
|   |-- index.css                      Estilos globales (Tailwind + custom)
|   |
|   |-- components/
|   |   |-- layout/
|   |       |-- Header.tsx             Barra de navegacion principal
|   |       |-- Footer.tsx             Pie de pagina
|   |       |-- index.ts              Barrel export
|   |
|   |-- features/                      Modulos organizados por dominio
|   |   |-- auth/
|   |   |   |-- AuthContext.tsx        Proveedor de autenticacion (JWT)
|   |   |   |-- LoginPage.tsx          Pagina de inicio de sesion
|   |   |   |-- RegisterPage.tsx       Registro con verificacion por correo
|   |   |
|   |   |-- detector/
|   |   |   |-- DetectorLayout.tsx     Vista principal del detector
|   |   |   |-- DropzoneView.tsx       Zona de arrastrar y soltar archivos
|   |   |   |-- ProcessingView.tsx     Vista de procesamiento
|   |   |   |-- ResultsView.tsx        Descarga de reportes
|   |   |   |-- TicketProgressRow.tsx  Fila de progreso por ticket
|   |   |
|   |   |-- humanizer/
|   |   |   |-- HumanizerLayout.tsx    Interfaz del humanizador (beta)
|   |   |
|   |   |-- admin/
|   |       |-- AdminDashboard.tsx     Panel de administracion de tickets
|   |
|   |-- hooks/
|   |   |-- useSocket.ts              Hook para conexion Socket.IO
|   |
|   |-- services/                      Capa de comunicacion con la API
|   |-- utils/
|       |-- formatters.ts             Funciones de formato (fecha, tamano, etc.)
|
|-- server/                            Codigo fuente del backend
|   |-- index.ts                       Punto de entrada del servidor
|   |-- app.ts                         Configuracion de Express y middlewares
|   |
|   |-- config/
|   |   |-- env.ts                     Variables de entorno centralizadas
|   |
|   |-- middleware/
|   |   |-- auth.middleware.ts         Autenticacion JWT y control de roles
|   |   |-- upload.middleware.ts       Configuracion de multer (subida de archivos)
|   |
|   |-- routes/
|   |   |-- auth.routes.ts            Registro, login, verificacion de cuenta
|   |   |-- ticket.routes.ts          CRUD de tickets y subida de resultados
|   |   |-- download.routes.ts        Descarga de archivos originales y reportes
|   |   |-- humanize.routes.ts        Humanizacion de texto y archivos via Ollama
|   |   |-- index.ts                  Router central que agrupa todas las rutas
|   |
|   |-- services/
|   |   |-- database.ts               Capa de acceso a datos (Supabase)
|   |   |-- email.ts                  Envio de correos con Resend
|   |   |-- telegram.ts              Bot de Telegram (notificaciones y escalacion)
|   |   |-- ollama.ts                 Cliente para la API de Ollama (LLM local)
|   |   |-- fileParser.ts            Extraccion de texto desde archivos (txt, md, docx)
|   |
|   |-- utils/
|       |-- prompts.ts                Sistema de prompts para reescritura anti-deteccion
|       |-- textMetrics.ts            Analisis de texto (conteo, diversidad lexica)
|
|-- shared/                            Tipos compartidos entre cliente y servidor
|   |-- types/
|       |-- user.ts                   Interfaces de usuario
|       |-- ticket.ts                 Interfaces de ticket
|       |-- humanizer.ts             Tipos del humanizador (tono, intensidad, resultado)
|       |-- index.ts                  Barrel export
|
|-- .env                               Variables de entorno (no versionado)
|-- .env.example                       Plantilla de variables de entorno
|-- index.html                         HTML raiz para Vite
|-- package.json                       Dependencias y scripts
|-- tsconfig.json                      Configuracion de TypeScript
|-- vite.config.ts                     Configuracion de Vite (aliases, proxy)
```

### Criterios de organizacion

- **Separacion por responsabilidad**: el codigo del cliente, el servidor y los tipos compartidos estan completamente aislados entre si. No hay dependencias cruzadas fuera de `shared/`.
- **Agrupacion por dominio (features)**: cada modulo funcional del frontend (auth, detector, humanizer, admin) esta contenido en su propia carpeta con todos sus componentes.
- **Modularidad del backend**: el archivo `server.ts` original (220+ lineas) fue dividido en rutas, middlewares, servicios y utilidades independientes. Cada archivo tiene una unica responsabilidad.
- **Barrel exports**: cada carpeta expone un `index.ts` para simplificar las importaciones. Esto evita rutas profundas y fragiles en los imports.
- **Path aliases**: TypeScript y Vite estan configurados con `@client/`, `@server/` y `@shared/` para imports limpios.

---

## Requisitos previos

- [Node.js](https://nodejs.org/) v18 o superior
- [npm](https://www.npmjs.com/) v9 o superior
- Una cuenta de [Supabase](https://supabase.com/) con las tablas `users` y `tickets` creadas
- [Ollama](https://ollama.ai/) instalado localmente (solo si se va a usar el modulo de humanizacion)

### Tablas de Supabase

La base de datos requiere dos tablas:

**users**

| Columna               | Tipo      | Notas                |
|------------------------|-----------|----------------------|
| id                     | text (PK) | UUID generado por la app |
| name                   | text      |                      |
| email                  | text      | Unico                |
| passwordHash           | text      |                      |
| role                   | text      | 'user' o 'admin'     |
| telegramChatId         | text      | Nullable             |
| isVerified             | boolean   |                      |
| verificationCode       | text      | Nullable             |
| verificationExpiresAt  | text      | Nullable             |
| createdAt              | text      | ISO 8601              |

**tickets**

| Columna            | Tipo      | Notas                     |
|---------------------|-----------|---------------------------|
| id                  | text (PK) | Formato TK-XXXXXXXX       |
| userId              | text      | FK a users.id             |
| userName            | text      |                           |
| fileName            | text      |                           |
| fileSize            | int8      |                           |
| filePath            | text      |                           |
| status              | text      | pending, processing, completed |
| assignedTo          | text      | Nullable                  |
| assignedAdminId     | text      | Nullable                  |
| plagiarismPdfPath   | text      | Nullable                  |
| aiPdfPath           | text      | Nullable                  |
| createdAt           | text      | ISO 8601                  |
| completedAt         | text      | Nullable                  |

---

## Instalacion

```bash
git clone https://github.com/tu-usuario/IADetctor-main.git
cd IADetctor-main
npm install
```

Si se va a usar el humanizador, tambien se debe descargar el modelo de Ollama:

```bash
ollama pull llama3.1:8b
```

---

## Configuracion del entorno

Crear un archivo `.env` en la raiz del proyecto con las siguientes variables:

```env
# Servidor
JWT_SECRET="clave_secreta_jwt"
SERVER_PORT=3001

# Supabase
SUPABASE_URL="https://tu-proyecto.supabase.co"
SUPABASE_KEY="tu_supabase_anon_key"

# Telegram Bot
TELEGRAM_BOT_TOKEN="token_de_tu_bot"
ESCALATION_TIMEOUT_MINUTES=5

# Cuentas de administrador
# Formato: email:password:nombre:telegramChatId (separadas por coma)
ADMIN_ACCOUNTS="admin@ejemplo.com:password123:Admin Principal:123456789"

# Email (Resend)
RESEND_API_KEY="re_xxxxxxxxxxxx"
RESEND_FROM_EMAIL="notificaciones@tudominio.com"

# Ollama (Humanizador)
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_TIMEOUT_MS=120000
MAX_INPUT_CHARS=30000
```

### Notas sobre las variables

- `ADMIN_ACCOUNTS` permite registrar multiples administradores. El sistema los crea automaticamente al iniciar si no existen en la base de datos.
- `TELEGRAM_BOT_TOKEN` se obtiene mediante [@BotFather](https://t.me/BotFather) en Telegram. El bot notifica sobre nuevos tickets y permite confirmar la recepcion.
- `OLLAMA_MODEL` puede cambiarse por cualquier modelo compatible con Ollama (mistral, llama3, etc.). El modelo debe estar descargado localmente.

---

## Ejecucion

Un solo comando inicia todo el proyecto (servidor + cliente):

```bash
npm run dev
```

Esto levanta de forma simultanea:
- El servidor Express en `http://localhost:3001` (API REST, Socket.IO, Telegram bot)
- El cliente Vite en `http://localhost:3000` (interfaz web con proxy automatico hacia la API)

No se requiere abrir dos terminales ni ejecutar comandos por separado.

### Otros comandos disponibles

| Comando            | Descripcion                                      |
|---------------------|--------------------------------------------------|
| `npm run dev`       | Inicia cliente + servidor en modo desarrollo     |
| `npm start`         | Inicia solo el servidor (produccion)             |
| `npm run build`     | Genera el bundle optimizado en `dist/`           |
| `npm run lint`      | Verificacion de tipos con TypeScript             |

### Configuracion de Ollama (humanizador)

Ollama debe estar corriendo en la maquina donde se ejecuta el modelo. Por defecto, el proyecto apunta a la IP local de esta maquina:

```env
OLLAMA_BASE_URL=http://192.168.1.20:11434
```

Cuando se despliegue en un servidor en la nube, solo hay que cambiar esa linea en `.env` por la IP del servidor donde corre Ollama:

```env
OLLAMA_BASE_URL=http://IP_DEL_SERVIDOR:11434
```

Ollama debe estar configurado para aceptar conexiones externas. Para eso, al iniciar Ollama en el servidor se debe establecer la variable:

```bash
OLLAMA_HOST=0.0.0.0 ollama serve
```

---

## Endpoints de la API

### Autenticacion

| Metodo | Ruta                  | Descripcion                          |
|--------|-----------------------|--------------------------------------|
| POST   | /api/auth/register    | Registro de usuario                  |
| POST   | /api/auth/login       | Inicio de sesion                     |
| POST   | /api/auth/verify      | Verificacion de cuenta (codigo)      |
| POST   | /api/auth/resend-code | Reenvio de codigo de verificacion    |
| GET    | /api/auth/me          | Obtener usuario autenticado          |

### Tickets

| Metodo | Ruta                          | Descripcion                          |
|--------|-------------------------------|--------------------------------------|
| POST   | /api/upload                   | Subir documento (crea ticket)        |
| GET    | /api/tickets                  | Listar tickets del usuario/admin     |
| GET    | /api/tickets/:id              | Detalle de un ticket                 |
| POST   | /api/tickets/:id/results      | Subir reportes PDF (admin)           |
| POST   | /api/tickets/:id/notify-delay | Notificacion de demora               |

### Descargas

| Metodo | Ruta                              | Descripcion                      |
|--------|-----------------------------------|----------------------------------|
| GET    | /api/download/:ticketId/original  | Descargar archivo original       |
| GET    | /api/download/:ticketId/plagiarism| Descargar reporte de plagio      |
| GET    | /api/download/:ticketId/ai        | Descargar reporte de IA          |

### Humanizador

| Metodo | Ruta                 | Descripcion                              |
|--------|----------------------|------------------------------------------|
| POST   | /api/humanize        | Humanizar texto plano                    |
| POST   | /api/humanize-file   | Humanizar archivo (txt, md, docx)        |
| GET    | /api/models          | Listar modelos de Ollama disponibles     |

### Otros

| Metodo | Ruta     | Descripcion       |
|--------|----------|--------------------|
| GET    | /health  | Health check       |

---

## Stack tecnologico

| Capa       | Tecnologia                                      |
|------------|--------------------------------------------------|
| Frontend   | React 19, TypeScript, Tailwind CSS 4, Vite 6     |
| Backend    | Node.js, Express 4, Socket.IO 4, TypeScript      |
| Base de datos | Supabase (PostgreSQL)                         |
| Autenticacion | JWT (jsonwebtoken), bcryptjs                  |
| Email      | Resend                                           |
| Notificaciones | Telegram Bot API (node-telegram-bot-api)     |
| Humanizador | Ollama (LLM local), mammoth, formidable, zod   |
| Validacion  | Zod                                             |
| Build      | Vite, tsx, concurrently                          |
