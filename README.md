# LexFlow API

API REST de LexFlow, la plataforma para aprender vocabulario de inglés mediante imagen, audio y contexto. Express 5, TypeScript, Prisma 7 y PostgreSQL, con autenticación de Supabase.

La web que la consume está en [lexflow-web](https://github.com/dimasjavier0/lexflow-web). Hasta la versión 0.6.0, ambas vivían en el monorepo [LexFlow-1.0](https://github.com/dimasjavier0/LexFlow-1.0).

Versión actual: **1.0.0**. El historial por versiones está en [CHANGELOG.md](CHANGELOG.md) y en las [releases](https://github.com/dimasjavier0/lexflow-api/releases), y el flujo de trabajo del repositorio (ramas, commits y versiones), en [CLAUDE.md](CLAUDE.md).

## Estructura

```text
src/
  server.ts       Arranque: rutas y middlewares
  routes/         Router de /admin
  controllers/    Una función por endpoint, validación con Zod
  services/       SM-2, gamificación, Pixabay, Piper, Facebook, fuentes de video
  middlewares/    Autenticación, admin, límite de peticiones, subidas, errores
  lib/            Utilidades (progreso NDJSON, caché, texto, errores de Prisma)
  db/prisma.ts    Cliente de Prisma
prisma/           Schema, migraciones y seed
docker/           PostgreSQL local
docs/             Modelo de datos
uploads/          Imágenes y audios guardados (local, no versionado)
models/piper/     Voces de Piper (local, no versionado)
```

## Requisitos

- Node.js 22 o superior
- npm 11 o superior
- Docker, para PostgreSQL local. Se expone en el puerto `5433` para evitar conflictos con otros servicios de Windows.

## Puesta en marcha

Desde la raíz del repositorio:

```bash
npm install
cp .env.example .env              # y rellena las claves
docker compose -f docker/docker-compose.yml up -d
npm run db:migrate                # aplica las migraciones y genera el cliente de Prisma
npm run db:seed                   # colección A1 de alimentos; idempotente
npm run dev
```

- API: `http://localhost:3000/health`
- Prisma Studio: `npm run db:studio`

Arranca la API siempre desde la raíz de este repositorio: el `.env`, `uploads/` y `models/piper/` se buscan ahí. Iniciada desde otra copia (por ejemplo, un worktree de git), las imágenes y los audios guardados responden 404.

Antes de dar un cambio por terminado:

```bash
npm run check
```

### Scripts

| Script               | Qué hace                                             |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | API con recarga automática (`tsx watch`)             |
| `npm run build`      | Compila a `dist/`                                    |
| `npm start`          | Arranca la versión compilada                         |
| `npm run check`      | Comprueba los tipos                                  |
| `npm run db:migrate` | `prisma migrate dev`                                 |
| `npm run db:generate`| Genera el cliente de Prisma en `src/generated/prisma`|
| `npm run db:seed`    | Datos de ejemplo                                     |
| `npm run db:studio`  | Prisma Studio                                        |

## Variables de entorno

Todas en el `.env` de la raíz; la plantilla es [.env.example](.env.example).

| Variable                                       | Uso                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                 | Conexión a PostgreSQL.                                                                |
| `SUPABASE_URL`, `SUPABASE_JWT_SECRET`          | Validación del JWT de Supabase (JWKS con `SUPABASE_URL`; HS256 con el secreto si está vacía). |
| `SUPABASE_SERVICE_ROLE_KEY`                    | Secreta: borra la cuenta de Supabase en `DELETE /me`. Sin ella, borrar la cuenta responde 503. |
| `API_PORT`                                     | Puerto de la API (3000 por defecto).                                                  |
| `CORS_ORIGINS`                                 | Orígenes web permitidos, separados por comas. Vacío = cualquiera (solo en local).     |
| `PIXABAY_API_KEY`                              | Búsqueda y descarga de imágenes.                                                      |
| `FACEBOOK_APP_SECRET`                          | Lectura de la lista de amigos de Facebook.                                            |
| `PEXELS_API_KEY`, `YOUTUBE_API_KEY`            | Opcionales: fuentes extra del buscador de videos.                                     |
| `WIKIMEDIA_USER_AGENT`                         | Opcional: identifica la app ante Wikimedia.                                           |
| `PIPER_PATH`, `PIPER_VOICE_MODEL_US`, `PIPER_VOICE_MODEL_UK` | Pronunciación con Piper. Las rutas relativas parten de la raíz del repo. |

## Funcionalidades

- Validación del JWT de Supabase y sincronización de usuarios locales (Google y Facebook).
- Colecciones y palabras publicadas, búsqueda con autocompletado y filtro por nivel CEFR. Los estudiantes solo ven palabras publicadas.
- Progreso por palabra: querer aprender, no interesar y aprendida.
- Borrado de la propia cuenta. Ver [Borrar la cuenta](#borrar-la-cuenta).
- Repaso espaciado (SM-2), puntos, nivel y racha.
- Clasificación diaria, semanal y mensual, con filtro por país. Ver [Clasificación](#clasificación).
- Amigos de Facebook con las palabras aprendidas de cada uno. Ver [Facebook y amigos](#facebook-y-amigos).
- Panel admin (`/admin`, requiere `role = 'ADMIN'` en la tabla `User`):
  - Colecciones y palabras con imágenes, audios, videos, categoría gramatical, frecuencia, oraciones de ejemplo y palabras relacionadas.
  - Subida de imágenes, búsqueda en Pixabay y reparación de enlaces caducados.
  - Lista rápida e importación de varias listas, con vista previa antes de guardar.
  - Vista previa y guardado de las imágenes y la pronunciación que faltan en una colección.
  - Acciones sobre varias palabras a la vez.
  - Buscador de videos (YouGlish, Pixabay, Pexels, Dailymotion, Wikimedia y YouTube) y de grabaciones de la pronunciación.
  - Pronunciación generada con Piper TTS.

Las imágenes subidas, las descargadas de Pixabay y los audios generados se guardan en `uploads/` y la API los sirve en `/uploads/...`; su URL queda registrada en PostgreSQL. La carpeta no se versiona. Este almacenamiento está pensado para desarrollo local; en producción deberá pasar a un bucket S3 o compatible.

## Imágenes de Pixabay

Pixabay entrega cada imagen con un enlace temporal (`https://pixabay.com/get/...`) que deja de funcionar a las 24 horas y no permite enlazarlas de forma permanente. Por eso la API descarga la imagen a `uploads/` en el momento de guardarla y registra esa URL local. Requiere `PIXABAY_API_KEY`.

- **Reparar imágenes** (`POST /admin/images/repair`): busca las imágenes que aún apuntan a un enlace temporal, las vuelve a pedir a Pixabay por su id y las guarda en el servidor. Procesa hasta 80 por llamada, por el límite de 100 peticiones por minuto de Pixabay, e indica si quedan pendientes.
- Las portadas de colección no conservan el id de Pixabay: una portada caducada se sustituye por el primer resultado para el nombre de la colección.
- Si Pixabay ya no tiene una imagen, la reparación la cuenta como no recuperada; hay que reemplazar las imágenes de esas palabras.

## Acciones sobre varias palabras

`POST /admin/collections/:collectionId/words/actions` aplica una acción a hasta 200 palabras de una colección:

| Acción                 | Efecto                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| Publicar               | Las hace visibles para los estudiantes.                             |
| Pasar a borrador       | Las oculta a los estudiantes.                                       |
| Reparar imágenes       | Descarga al servidor sus imágenes de Pixabay con enlace caducado.   |
| Reemplazar imágenes    | Sustituye sus imágenes por una búsqueda nueva en Pixabay.           |
| Buscar imágenes        | Añade imágenes de Pixabay a las palabras que no tienen.             |
| Eliminar imágenes      | Borra todas sus imágenes y los archivos guardados.                  |
| Quitar de la colección | Las saca de la colección; se borran si no están en ninguna otra.    |

## Progreso de las operaciones largas

Los endpoints que recorren varias palabras o imágenes (lista rápida al previsualizar y al guardar, «Completar imágenes y sonido», reparación de imágenes y las acciones de reparar, reemplazar o buscar imágenes) aceptan `Accept: application/x-ndjson`. Con esa cabecera responden con una línea JSON por paso (`{"type":"progress","done":3,"total":18,"item":"cat","counts":{...}}`) y una última con el cuerpo habitual (`{"type":"result","body":{...}}`); si la operación falla a mitad, la última línea es `{"type":"error"}`. Sin la cabecera devuelven el JSON de siempre. El código común está en `src/lib/progress-stream.ts`.

## Repaso espaciado y gamificación

- Una palabra entra en el repaso cuando el estudiante la marca como «Quiero aprender». Cada repaso aplica SM-2 (`src/services/srs.ts`): un acierto alarga el intervalo (1, 6 y después `intervalo × facilidad` días) y un fallo la devuelve al día siguiente.
- Cuatro aciertos seguidos convierten la palabra en dominada; un fallo posterior la devuelve a «aprendiendo».
- Si la respuesta es incorrecta, el estudiante puede reintentar una vez antes de ver la solución; el primer fallo no se registra.
- Puntos (`src/services/gamification.ts`): 2 por acierto y 1 por acierto con pista o al segundo intento; dominar una palabra no da puntos extra. El nivel `n` empieza en `(n − 1)² × 20` puntos.
- La racha cuenta días consecutivos (en UTC) con al menos un repaso y se pierde al saltarse un día.

## Clasificación

`GET /leaderboard?period=day|week|month&country=CO` (con sesión) ordena a los estudiantes por los puntos ganados en el periodo actual: hoy, esta semana desde el lunes o este mes, en días UTC. Sin `period` usa la semana; sin `country`, todos los países.

- Los puntos de cada repaso se suman a un total por día (`UserDailyPoints`, `src/services/leaderboard.ts`), y cada periodo suma sus días. Los puntos ganados antes de existir esa tabla no cuentan en ningún periodo; `pointsTotal` sigue siendo el total histórico.
- Responde `{ period, country, endsAt, countries, rows, viewer }`: los 50 primeros (los empates comparten puesto), la fila de quien consulta esté donde esté (`null` si no ganó puntos en el periodo), el momento en que el periodo se reinicia y los países que tiene algún estudiante, para el filtro. Quien no ganó puntos en el periodo no aparece.
- De los demás estudiantes solo se ve el nombre y la inicial del apellido, sin foto; quien consulta ve su fila completa.
- Cada estudiante elige su país con `PATCH /me` (`country`, código ISO 3166-1 de dos letras, o `null`).

## Facebook y amigos

El inicio de sesión con Facebook lo resuelve Supabase Auth en la web. La API guarda las amistades y calcula cuántas palabras ha aprendido cada amigo: las marcadas como aprendidas más las dominadas en el repaso.

### Configuración

1. En [developers.facebook.com](https://developers.facebook.com), crea una app con el caso de uso de inicio de sesión con Facebook y añade los permisos `public_profile`, `email` y `user_friends`.
2. En los ajustes de Facebook Login, añade `https://<project-ref>.supabase.co/auth/v1/callback` a «Valid OAuth Redirect URIs».
3. En Supabase, **Authentication → Providers → Facebook**: actívalo y pega el App ID y el App Secret (Facebook: **Settings → Basic**).
4. En Supabase, activa **Allow manual linking** (ajustes de inicio de sesión de Authentication). Sin esto, «Conectar con Facebook» falla para quien entró con Google.
5. En Supabase, **Authentication → URL Configuration**, añade la URL de la web (`http://localhost:5173/**` en local) a las Redirect URLs.
6. En el `.env`, `FACEBOOK_APP_SECRET` con el mismo App Secret. Sin él, `POST /me/facebook` responde 503 y la web avisa de que Facebook no está configurado.

Mientras Meta no apruebe `user_friends` en App Review, solo pueden conceder ese permiso las personas con un rol en la app (administradores, desarrolladores y testers). Para publicar la app, Facebook pide además una política de privacidad y una forma de solicitar el borrado de datos: en **App settings → Basic**, usa `https://<dominio-de-la-web>/privacy` como «Privacy Policy URL» y `https://<dominio-de-la-web>/delete-account` como «Data Deletion Instructions URL». Las dos páginas son públicas en la web.

### Cómo funciona

- Facebook solo devuelve a los amigos que también entraron en LexFlow con Facebook y concedieron `user_friends`. Los demás no aparecen, y tampoco sus datos.
- Supabase entrega el token de Facebook (`session.provider_token`) solo en la sesión que vuelve de Facebook. La web lo envía una vez a `POST /me/facebook`, y la API lee `/me`, `/me/permissions` y `/me/friends` de la Graph API v26.0, con `appsecret_proof` para rechazar tokens emitidos a otra app. El token no se guarda.
- La lista se actualiza cada vez que el usuario o alguno de sus amigos entra con Facebook: la lista nueva reemplaza todas las amistades de esa persona, así que dejar de ser amigos en Facebook se refleja en el siguiente inicio de sesión de cualquiera de los dos.
- `GET /me/friends` responde `{ facebook: { connected, friendsGranted }, me, friends }`, donde cada persona es `{ id, name, avatarUrl, knownWords }`. Nunca incluye el correo de los amigos.

## Borrar la cuenta

`DELETE /me` borra la cuenta de quien hace la petición y responde 204. Lo exigen Google Play y Facebook, y la web lo ofrece en «Mi progreso».

1. Borra el usuario de Supabase Auth con la API de administración (`SUPABASE_SERVICE_ROLE_KEY`), junto con sus identidades de Google y Facebook. Si Supabase falla, no se borra nada y responde 502; si el usuario ya no existe en Supabase, sigue adelante.
2. Borra el usuario local; la base borra en cascada su progreso, sus puntos diarios y sus amistades en las dos direcciones.

Sin `SUPABASE_SERVICE_ROLE_KEY` responde 503. Está limitada a 5 peticiones por minuto. Las imágenes y audios de `uploads/` no se tocan: pertenecen a las palabras, no a los estudiantes.

## Seguridad

- `CORS_ORIGINS` limita los orígenes web permitidos (lista separada por comas). Si está vacío se acepta cualquier origen, lo que solo es adecuado en desarrollo local.
- La API limita cada IP a 300 peticiones por minuto, a 30 por minuto en las rutas que llaman a Pixabay o ejecutan Piper (búsqueda, reparación y acciones sobre varias palabras incluidas), a 10 por minuto en `POST /me/facebook`, que lee la lista de amigos de Facebook, y a 5 por minuto en `DELETE /me`. El contador vive en memoria: con más de una instancia hará falta un almacén compartido.

## Pronunciación local

LexFlow puede generar pronunciaciones gratuitas con Piper TTS. Piper se instala en un entorno Python y las voces se descargan a `models/piper/`. Configura en el `.env`:

```env
PIPER_PATH="C:/ruta/a/piper.exe"
PIPER_VOICE_MODEL_US="models/piper/en_US-amy-medium.onnx"
PIPER_VOICE_MODEL_UK="models/piper/en_GB-alan-medium.onnx"
```

Desde el panel admin de la web, en el editor de una palabra guardada, se elige el acento y se pulsa «Generar pronunciación». El audio se guarda en `uploads/`, se registra en la tabla `Audio` y queda disponible para los estudiantes.
