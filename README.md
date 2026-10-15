# LexFlow

Plataforma web para aprender vocabulario de inglés mediante imagen, audio y contexto.

Versión actual: **0.6.0**. El historial por versiones está en [CHANGELOG.md](CHANGELOG.md) y el flujo de trabajo del repositorio (ramas, commits y versiones), en [CLAUDE.md](CLAUDE.md).

## Monorepo

```text
apps/
  api/       API REST (Express + TypeScript)
  web/       Cliente web (React + Vite + Tailwind)
packages/
  config/    Configuración compartida
  schemas/   Esquemas Zod compartidos
  shared/    Tipos, enums y contratos compartidos
docker/      Entorno local de infraestructura
```

## Requisitos actuales

- Node.js 22 o superior
- npm 11 o superior

PostgreSQL local se ejecuta con Docker y se expone en el puerto `5433` para evitar conflictos con otros servicios de Windows.

## Base de datos local

Desde la raíz del proyecto:

```bash
docker compose -f docker/docker-compose.yml up -d
npm run db:migrate --workspace=@lexflow/api -- --name initial_schema
npm run db:seed --workspace=@lexflow/api
```

La migración inicial queda versionada en `apps/api/prisma/migrations/`. El seed crea una colección A1 de alimentos y es idempotente.

## Desarrollo

En terminales separadas:

```bash
npm run dev:api
npm run dev:web
```

URLs locales:

- Web: `http://localhost:5173`
- API: `http://localhost:3000/health`
- Prisma Studio: `npm run db:studio --workspace=@lexflow/api`

Arranca siempre los servidores desde la raíz del repositorio. La API sirve los archivos de `apps/api/uploads/` de la carpeta desde la que se lanza: iniciada desde otra copia del proyecto (por ejemplo, un worktree de git), las imágenes y los audios guardados responden 404.

Antes de dar un cambio por terminado:

```bash
npm run check
```

## Funcionalidades disponibles

- Login con Google mediante Supabase Auth.
- Validación JWT en la API y sincronización de usuarios locales.
- Colecciones y palabras publicadas desde el panel admin.
- Progreso por palabra: querer aprender, no interesar y aprendida.
- Recursos manuales de imagen, audio y video mediante URL.
- Selección de nivel CEFR, lecciones que omiten las palabras ya conocidas y avance por colección.
- Publicación por palabra; los estudiantes solo ven palabras publicadas.
- Búsqueda de imágenes en Pixabay y eliminación de colecciones, palabras y recursos desde el panel. Cada colección tiene un botón «Eliminar» que pide confirmación antes de borrarla; sus palabras se conservan si también están en otra colección.
- Las imágenes de Pixabay se guardan en el servidor, y el panel puede reparar las que quedaron con un enlace caducado.
- Selección de varias palabras de una colección para publicarlas, pasarlas a borrador, reparar, reemplazar o eliminar sus imágenes, o quitarlas de la colección.
- Lista rápida de palabras e importación de varias listas en Markdown, con detección de duplicados. Cada línea es `palabra en inglés, traducción, nivel` (`cat, gato, A1`); el nivel es opcional (A1 si falta), solo se aplica a las palabras nuevas y uno que no sea A1–C2 marca la línea como inválida.
- Vista previa de las imágenes y la pronunciación que faltan en una colección, que se guardan al confirmar.
- Buscador de videos (YouGlish, Pixabay, Pexels, Dailymotion, Wikimedia y YouTube) y de grabaciones de la pronunciación.
- Selector de tema con tonos de color y modo oscuro.
- Categoría gramatical, frecuencia, oraciones de ejemplo y palabras relacionadas por palabra.
- Repaso espaciado (SM-2) en `/review`: imagen, audio y escribir la palabra.
- Perfil con puntos, nivel y racha en `/profile`, y búsqueda de palabras con autocompletado.
- Dashboard admin con tarjetas de acciones, colecciones expandibles y carga de imágenes por arrastre.
- Editor reutilizable de palabras para crear y editar término, traducción, nivel, enlace de imagen y archivo arrastrado.
- Manifest y service worker básicos para instalación como PWA.

Las imágenes arrastradas, las descargadas de Pixabay y los audios generados se guardan localmente en `apps/api/uploads/` y su URL queda registrada en PostgreSQL. La carpeta no se versiona. Este almacenamiento está pensado para desarrollo local; producción deberá migrarlo a Supabase Storage o a un bucket S3-compatible.

El panel admin requiere que el usuario tenga `role = 'ADMIN'` en la base PostgreSQL local.

## Imágenes de Pixabay

Pixabay entrega cada imagen con un enlace temporal (`https://pixabay.com/get/...`) que deja de funcionar a las 24 horas y no permite enlazarlas de forma permanente. Por eso la API descarga la imagen a `apps/api/uploads/` en el momento de guardarla y registra esa URL local. Requiere `PIXABAY_API_KEY` en el `.env` de la raíz.

- **Reparar imágenes** (cabecera de «Colecciones» en el panel admin): busca las imágenes que aún apuntan a un enlace temporal, las vuelve a pedir a Pixabay por su id y las guarda en el servidor. Procesa hasta 80 por pulsación, por el límite de 100 peticiones por minuto de Pixabay, y avisa si quedan pendientes.
- Las portadas de colección no conservan el id de Pixabay: una portada caducada se sustituye por el primer resultado para el nombre de la colección.
- Si Pixabay ya no tiene una imagen, la reparación la cuenta como no recuperada; usa «Reemplazar imágenes» sobre esas palabras.

## Acciones sobre varias palabras

Al abrir una colección en el panel admin, cada palabra tiene una casilla y la barra superior permite seleccionarlas todas. Las acciones se aplican solo a las palabras visibles con el filtro activo, hasta 200 a la vez. Las palabras que el filtro oculta conservan su casilla para cuando vuelvan a listarse. La barra solo muestra las acciones que tienen efecto sobre la selección:

| Acción                 | Aparece cuando                  | Efecto                                                                         |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| Publicar               | Hay algún borrador.             | Las hace visibles para los estudiantes.                                        |
| Pasar a borrador       | Hay alguna publicada.           | Las oculta a los estudiantes.                                                  |
| Reparar imágenes       | Alguna imagen está caducada.    | Descarga al servidor sus imágenes de Pixabay con enlace caducado.              |
| Reemplazar imágenes    | Alguna palabra tiene imágenes.  | Sustituye sus imágenes por una búsqueda nueva en Pixabay. Pide confirmación.   |
| Buscar imágenes        | Ninguna palabra tiene imágenes. | Les añade imágenes con una búsqueda en Pixabay.                                |
| Eliminar imágenes      | Alguna palabra tiene imágenes.  | Borra todas sus imágenes y los archivos guardados. Pide confirmación.          |
| Quitar de la colección | Siempre.                        | Las saca de la colección; se borran si no están en ninguna otra. Pide confirmación. |

## Progreso de las operaciones largas

Las operaciones del panel admin que recorren varias palabras o imágenes muestran una barra de progreso con el recuento hasta el momento (por ejemplo, cuántas palabras ya tienen imágenes y cuántas se quedaron sin ellas):

- Lista rápida, lista por lista.
- «Completar imágenes y sonido», al buscar las propuestas y al guardarlas.
- «Reparar imágenes», tanto el botón general como el de las palabras seleccionadas.
- «Reemplazar imágenes» y «Buscar imágenes» sobre las palabras seleccionadas.

Publicar, pasar a borrador, eliminar imágenes y quitar palabras son una sola consulta y no muestran barra.

En la API, esos endpoints aceptan `Accept: application/x-ndjson`. Con esa cabecera responden con una línea JSON por paso (`{"type":"progress","done":3,"total":18,"item":"cat","counts":{...}}`) y una última con el cuerpo habitual (`{"type":"result","body":{...}}`); si la operación falla a mitad, la última línea es `{"type":"error"}`. Sin la cabecera devuelven el JSON de siempre. El código común está en `apps/api/src/lib/progress-stream.ts` y, en la web, en `apiRequest` (`onProgress`) y el componente `ProgressBar`.

## Repaso espaciado y gamificación

- Una palabra entra en el repaso cuando el estudiante la marca como «Quiero aprender». Cada repaso aplica SM-2 (`apps/api/src/services/srs.ts`): un acierto alarga el intervalo (1, 6 y después `intervalo × facilidad` días) y un fallo la devuelve al día siguiente.
- Cuatro aciertos seguidos convierten la palabra en dominada; un fallo posterior la devuelve a «aprendiendo».
- Puntos (`apps/api/src/services/gamification.ts`): 10 por acierto, 5 por acierto con pista y 25 extra al dominar una palabra. El nivel `n` empieza en `(n − 1)² × 100` puntos.
- La racha cuenta días consecutivos (en UTC) con al menos un repaso y se pierde al saltarse un día.

## Seguridad de la API

- `CORS_ORIGINS` limita los orígenes web permitidos (lista separada por comas). Si está vacío se acepta cualquier origen, lo que solo es adecuado en desarrollo local.
- La API limita cada IP a 300 peticiones por minuto, y a 30 por minuto en las rutas que llaman a Pixabay o ejecutan Piper (búsqueda, reparación y acciones sobre varias palabras incluidas). El contador vive en memoria: con más de una instancia hará falta un almacén compartido.

## Pronunciación local

LexFlow puede generar pronunciaciones gratuitas con Piper TTS. Piper y las voces descargadas localmente quedan en el entorno Python y en `apps/api/models/piper/`. Configura en el `.env` de la raíz:

```env
PIPER_PATH="C:/Users/NAMEUSER/.pyenv/pyenv-win/versions/3.12.4/Scripts/piper.exe"
PIPER_VOICE_MODEL_US="apps/api/models/piper/en_US-amy-medium.onnx"
PIPER_VOICE_MODEL_UK="apps/api/models/piper/en_GB-alan-medium.onnx"
```

Después de guardar una palabra desde el panel admin, abre su editor, elige el acento y pulsa `Generar pronunciación`. El audio se guarda en la tabla `Audio` y queda disponible para los estudiantes.
