# Changelog

Los cambios relevantes del proyecto se registran aquí, por versión y con su fecha (AAAA-MM-DD).
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones, [SemVer](https://semver.org/lang/es/).
Cómo y cuándo se actualiza este archivo está en [CLAUDE.md](CLAUDE.md).

## [Unreleased]

### Added

- Logo nuevo: una gota coral con la L dentro. Aparece junto al nombre en la cabecera y en el inicio de sesión, en la pestaña del navegador y como icono al instalar la app.
- Barra de progreso en las operaciones del panel admin que recorren varias palabras o imágenes: la lista rápida, «Completar imágenes y sonido» (al buscar y al guardar), «Reparar imágenes» (general y sobre la selección) y «Reemplazar» o «Buscar imágenes» sobre la selección. Muestra cuántas van, la última palabra procesada y el recuento hasta el momento: con imágenes, sin imágenes, sin pronunciación, reparadas o no recuperadas.
- El aviso final de la lista rápida indica también cuántas palabras quedaron sin imágenes.
- Los endpoints de esas operaciones envían el avance línea a línea (NDJSON) cuando la petición lleva `Accept: application/x-ndjson`; sin esa cabecera responden como antes.

- La lista rápida acepta el nivel de cada palabra como tercer campo: `cat, gato, A1`. Es opcional; sin él la palabra se crea en A1. Un nivel que no sea A1, A2, B1, B2, C1 o C2 marca la línea como inválida, y las palabras que ya existen conservan el suyo.
- Botón «Eliminar» en cada colección del panel admin. No borra al pulsarlo: abre un diálogo que nombra la colección, indica cuántas palabras se van con ella y pide confirmar con «Sí, eliminar colección».

### Changed

- El icono de la app se entrega también en PNG (192 y 512 px), para que aparezca al instalarla o añadirla a la pantalla de inicio en móviles que no admiten iconos SVG, incluido iPhone.
- El nombre junto al logo pasa a ser «LexFlow English», con una letra redondeada propia que se sirve desde la app, sin depender de servicios externos.
- Las pantallas e indicadores de carga muestran la L dentro de un anillo que se dibuja desde vacío hasta completarse, en lugar del círculo giratorio.
- Con palabras seleccionadas que no tienen imágenes, el botón pasa a llamarse «Buscar imágenes», actúa sin pedir confirmación y avisa con «Imágenes añadidas a N palabras».
- Mientras se aplica una acción a las palabras seleccionadas, sus casillas quedan bloqueadas.
- En el panel admin, al elegir un filtro de palabras («Sin significado», «Sin imágenes» o «Sin sonido») se despliegan solas las colecciones que tienen palabras que coinciden y se pliegan las demás, sin tener que abrir cada colección para ver el resultado.

### Fixed

- En el inicio de sesión y en las pantallas de carga, el botón de tema aparecía desplazado hacia el centro de la pantalla. Vuelve a estar en la esquina superior derecha.
- La barra de selección ofrecía acciones que no aplicaban a las palabras elegidas, sobre todo al combinarla con un filtro: con «Sin imágenes» se podía «Reparar» o «Eliminar imágenes» y la respuesta era «Las palabras seleccionadas no tienen imágenes caducadas» o «0 imágenes eliminadas». Ahora solo aparecen las acciones que tienen efecto: «Publicar» si hay borradores, «Pasar a borrador» si hay publicadas, «Reparar imágenes» si alguna imagen está caducada y «Eliminar imágenes» si hay imágenes.
- «Seleccionar todas» con un filtro activo descartaba la selección de las palabras ocultas por el filtro; ahora solo marca o desmarca las que se ven.

## [0.6.0] - 2026-10-11

### Added

- Las imágenes de Pixabay se descargan a `apps/api/uploads` al guardarlas (palabra nueva o editada, lista rápida, «Completar imágenes y sonido» y portadas de colección).
- Botón «Reparar imágenes» en el panel admin (`POST /admin/images/repair`): vuelve a pedir cada imagen caducada por su id de Pixabay y la guarda en el servidor, hasta 80 por pulsación. Las portadas de colección caducadas no conservan id, así que se sustituyen por el primer resultado para el nombre de la colección.
- Las palabras de una colección se pueden seleccionar, una a una o todas, para publicarlas, pasarlas a borrador, reparar, reemplazar o eliminar sus imágenes, o quitarlas de la colección (`POST /admin/collections/:collectionId/words/actions`, hasta 200 palabras por acción).
- Buscador de videos por fuente en el editor de palabras: YouGlish, Pixabay, Pexels, Dailymotion, Wikimedia y YouTube (`GET /admin/videos/search`).
- Búsqueda de grabaciones humanas de la pronunciación, con acento preferido, para escucharlas antes de asociarlas (`GET /admin/audio/recorded`).
- El repaso gradúa la ayuda en cuatro niveles, desde media palabra ya escrita hasta escribirla de memoria.
- «Mi progreso» muestra las palabras por nivel de repaso y los repasos previstos para los próximos siete días.
- `CLAUDE.md` con el flujo de trabajo del repositorio: una rama por función, changelog por versiones y fusión en `main`.

### Changed

- Al eliminar una imagen se borra también su archivo en `uploads` si nada más lo usa.
- El changelog se reorganizó por versiones con fecha.

### Fixed

- Las imágenes de Pixabay dejaban de verse al día siguiente y mostraban «This URL is invalid or has expired»: se guardaba el enlace temporal `pixabay.com/get/...`, que Pixabay solo mantiene 24 horas.
- En móvil, la fila de una palabra con varias insignias ocultaba el término.
- Se restauraron archivos que el editor había sobrescrito con versiones antiguas.

## [0.5.0] - 2026-10-09

### Added

- Vista previa del contenido que falta en una colección (imágenes y pronunciación), que solo se guarda al confirmarla.
- Publicación por palabra y de todas las palabras de una colección; la app pública solo muestra y cuenta las publicadas.
- Selección de nivel CEFR en inicio y lecciones (`?level=`), recordada entre visitas.
- Las lecciones empiezan solo con las palabras pendientes y las tarjetas de inicio muestran el avance del estudiante.
- El panel permite eliminar colecciones, quitar palabras de una colección (también desde su fila) y asociar audio por URL.
- La API restringe CORS mediante `CORS_ORIGINS` y limita las peticiones por IP.
- Las palabras admiten categoría gramatical, frecuencia de uso, oraciones de ejemplo y relaciones (sinónimos, antónimos, derivadas…).
- Repaso espaciado SM-2 para las palabras marcadas «Quiero aprender», con una pantalla de repaso imagen → audio → escribir la palabra.
- Perfil del estudiante con nombre y avatar, puntos, nivel y racha diaria, y página «Mi progreso».
- Búsqueda de palabras con autocompletado desde el inicio.
- Selector de tema con tonos de color y modo oscuro, y diseño más ancho en escritorio.
- La lección muestra todas las imágenes de la palabra en una cuadrícula y reproduce su audio automáticamente.
- Importación de varias listas de palabras en Markdown a la vez, con detección de duplicados.

### Changed

- La interfaz web se migró a utilidades Tailwind v4 con tokens de marca en `@theme` y componentes compartidos en `components/ui` (Button, Field, Modal, Switch, Badge, Alert, Toast, EmptyState).
- El panel admin se dividió en `features/admin` (hook de datos, filas de colección y palabra, modales y editor) y todas las llamadas pasan por `lib/api.ts` y `lib/admin-api.ts`.
- Las rutas `/admin` de la API se agrupan en un router con autenticación única; Pixabay y Piper viven en `services/`.
- El flujo de aprendizaje añade atajos de teclado, pantalla de fin de colección, reintentos y video embebido.
- El selector de imágenes separa la búsqueda en Pixabay de las URL manuales, y el editor de palabras permite borrar sonidos.
- Crear y editar una colección comparten el mismo formulario.

### Fixed

- Las rutas de búsqueda en Pixabay y de generación de audio no estaban registradas en la API (404).
- Recargar `/admin` redirigía a un administrador al inicio, y cada refresco de token cerraba los formularios abiertos.
- Añadir palabras a una colección sin abrir dejaba la lista incompleta; confirmar contenido faltante la dejaba vacía.
- El formulario de palabra rápida mostraba un error tras guardar correctamente.
- Un fallo al guardar el progreso sustituía la lección completa por una pantalla de error.
- Reutilizar una palabra existente en otra colección la despublicaba.
- El enriquecimiento automático pedía a Pixabay un tamaño de página que la API rechaza.

## [0.4.0] - 2026-10-06

### Added

- Búsqueda de imágenes en Pixabay desde el panel admin (`PIXABAY_API_KEY`).
- Pronunciación generada en local con Piper TTS, con acento de EE. UU. o del Reino Unido.

## [0.3.0] - 2026-10-02

### Added

- Lista rápida para añadir varias palabras de una vez.
- Formulario para añadir una palabra dentro de cada colección.
- Imagen de portada y publicación de colecciones desde el panel.
- Miniaturas de las imágenes y los videos asociados a cada palabra.

## [0.2.0] - 2026-09-19

### Added

- Carga de imágenes por arrastre, persistida en disco local y registrada en PostgreSQL.
- Varias imágenes, audios y videos por palabra.

### Changed

- Se rediseñó el panel admin como dashboard de acciones con colecciones y palabras expandibles.
- El dashboard admin usa modales para las acciones y un editor de palabra reutilizable dentro de la biblioteca.

## [0.1.0] - 2026-09-16

### Added

- Base del monorepo con npm workspaces: aplicaciones `@lexflow/web` y `@lexflow/api`, y paquetes `@lexflow/shared`, `@lexflow/schemas` y `@lexflow/config`.
- Esqueleto React/Vite/Tailwind, rutas iniciales y contexto de autenticación.
- Esqueleto Express con endpoint `GET /health`.
- Plantilla de variables de entorno y documentación inicial.
- Schema Prisma inicial, contratos Zod para colecciones, palabras y progreso, y Docker Compose para PostgreSQL (puerto `5433`).
- Migración inicial y seed idempotente con la colección A1 `food` y tres palabras de ejemplo.
- Login con Google mediante Supabase Auth, validación del JWT en la API y sincronización del usuario local.
- Flujo de aprendizaje por colección con progreso persistente por usuario y palabra.
- Panel admin para colecciones, palabras, publicación y recursos multimedia por URL.
- PWA básica con manifest y service worker.

### Decisions

- Navegación: React Router.
- Datos en MVP: `fetch` nativo; TanStack Query queda para una segunda versión.
- Estado global: React Context.
- Formularios: React Hook Form con Zod.
- Datos: UUID, relación muchos-a-muchos entre colecciones y palabras, traducción española única e `isPublished`.
- Prisma ORM 7: ESM, `prisma.config.ts`, cliente generado localmente y adaptador PostgreSQL; el `.env` de la raíz se carga con ruta absoluta.
