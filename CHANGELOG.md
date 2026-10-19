# Changelog

Los cambios relevantes de la API de LexFlow se registran aquí, por versión y con su fecha (AAAA-MM-DD).
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones, [SemVer](https://semver.org/lang/es/).
Cada versión tiene su etiqueta `vX.Y.Z` y su [release en GitHub](https://github.com/dimasjavier0/lexflow-api/releases) con estas mismas notas.
Cómo y cuándo se actualiza este archivo está en [CLAUDE.md](CLAUDE.md).

Hasta la 0.6.0, la API y la web vivían juntas en el monorepo [LexFlow-1.0](https://github.com/dimasjavier0/LexFlow-1.0). Las versiones anteriores a la 1.0.0 conservan solo las entradas que afectan a la API. La web está en [lexflow-web](https://github.com/dimasjavier0/lexflow-web).

## [Unreleased]

## [1.0.0] - 2026-10-19

Primera versión como repositorio propio, lista para desplegarse por separado de la web. Incluye todo lo publicado hasta la 0.6.0: colecciones y palabras con imágenes, audio y video; progreso por palabra; repaso espaciado SM-2 con puntos, niveles y racha; panel admin con Pixabay, Piper y buscadores de videos y grabaciones; y autenticación con Supabase.

### Added

- Clasificación de estudiantes (`GET /leaderboard`) por los puntos ganados hoy, esta semana (desde el lunes) o este mes, en días UTC, con filtro opcional por país (`?period=day|week|month&country=CO`). Devuelve los 50 primeros más la fila de quien consulta, esté donde esté, si ganó puntos en el periodo; de los demás solo se ve el nombre y la inicial del apellido. Los puntos de cada repaso se suman también a un total por día, y solo cuentan los ganados desde esta versión.
- El perfil admite el país del estudiante (`PATCH /me` con `country`, código ISO de dos letras), que lo sitúa en la clasificación de su país.
- Amigos de Facebook: `POST /me/facebook` recibe el token de Facebook del inicio de sesión, lee la lista de amigos con la Graph API (firmada con `FACEBOOK_APP_SECRET`) y guarda las amistades; `GET /me/friends` las devuelve con las palabras aprendidas de cada amigo. El token no se guarda y la respuesta nunca incluye el correo de los amigos.
- Avance de las operaciones largas línea a línea (NDJSON) cuando la petición lleva `Accept: application/x-ndjson`: lista rápida, «Completar imágenes y sonido», «Reparar imágenes» y acciones sobre varias palabras. Cada línea dice cuántas van, la última palabra procesada y el recuento hasta el momento (con imágenes, sin imágenes, sin pronunciación, reparadas o no recuperadas). Sin esa cabecera responden como antes.
- Cada palabra de la lista rápida puede llevar su nivel CEFR (A1–C2). Sin él se crea en A1, y las palabras que ya existen conservan el suyo.
- Acertar una palabra del repaso al segundo intento da 1 punto.

### Changed

- La lista rápida se previsualiza antes de guardarse (`POST /admin/collections/:collectionId/words/bulk/preview`): devuelve cada palabra como nueva, ya existente o ya incluida, con las imágenes propuestas por Pixabay. Al guardar se usan las imágenes elegidas.
- Nueva puntuación del repaso: 2 puntos por palabra acertada (antes 10) y 1 con pista (antes 5). Dominar una palabra ya no da puntos extra (antes 25). Los niveles se ajustan a la nueva escala: el nivel 2 llega a los 20 puntos, el 3 a los 80, el 4 a los 180. Los puntos ya ganados se conservan.
- La API es un repositorio propio: se arranca con `npm run dev` desde su raíz, que guarda el `.env`, `uploads/` y `models/piper/`. Las rutas relativas de `PIPER_VOICE_MODEL_US` y `PIPER_VOICE_MODEL_UK` parten de esa raíz (`models/piper/...`).

## [0.6.0] - 2026-10-11

### Added

- Las imágenes de Pixabay se descargan a `apps/api/uploads` al guardarlas (palabra nueva o editada, lista rápida, «Completar imágenes y sonido» y portadas de colección).
- Botón «Reparar imágenes» en el panel admin (`POST /admin/images/repair`): vuelve a pedir cada imagen caducada por su id de Pixabay y la guarda en el servidor, hasta 80 por pulsación. Las portadas de colección caducadas no conservan id, así que se sustituyen por el primer resultado para el nombre de la colección.
- Las palabras de una colección se pueden seleccionar, una a una o todas, para publicarlas, pasarlas a borrador, reparar, reemplazar o eliminar sus imágenes, o quitarlas de la colección (`POST /admin/collections/:collectionId/words/actions`, hasta 200 palabras por acción).
- Buscador de videos por fuente en el editor de palabras: YouGlish, Pixabay, Pexels, Dailymotion, Wikimedia y YouTube (`GET /admin/videos/search`).
- Búsqueda de grabaciones humanas de la pronunciación, con acento preferido, para escucharlas antes de asociarlas (`GET /admin/audio/recorded`).
- «Mi progreso» muestra las palabras por nivel de repaso y los repasos previstos para los próximos siete días.
- `CLAUDE.md` con el flujo de trabajo del repositorio: una rama por función, changelog por versiones y fusión en `main`.

### Changed

- Al eliminar una imagen se borra también su archivo en `uploads` si nada más lo usa.
- El changelog se reorganizó por versiones con fecha.

### Fixed

- Las imágenes de Pixabay dejaban de verse al día siguiente y mostraban «This URL is invalid or has expired»: se guardaba el enlace temporal `pixabay.com/get/...`, que Pixabay solo mantiene 24 horas.
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
- Importación de varias listas de palabras en Markdown a la vez, con detección de duplicados.

### Changed

- Las rutas `/admin` de la API se agrupan en un router con autenticación única; Pixabay y Piper viven en `services/`.

### Fixed

- Las rutas de búsqueda en Pixabay y de generación de audio no estaban registradas en la API (404).
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

## [0.2.0] - 2026-09-19

### Added

- Carga de imágenes por arrastre, persistida en disco local y registrada en PostgreSQL.
- Varias imágenes, audios y videos por palabra.

## [0.1.0] - 2026-09-16

### Added

- Base del monorepo con npm workspaces: aplicaciones `@lexflow/web` y `@lexflow/api`, y paquetes `@lexflow/shared`, `@lexflow/schemas` y `@lexflow/config`.
- Esqueleto Express con endpoint `GET /health`.
- Plantilla de variables de entorno y documentación inicial.
- Schema Prisma inicial, contratos Zod para colecciones, palabras y progreso, y Docker Compose para PostgreSQL (puerto `5433`).
- Migración inicial y seed idempotente con la colección A1 `food` y tres palabras de ejemplo.
- Login con Google mediante Supabase Auth, validación del JWT en la API y sincronización del usuario local.
- Flujo de aprendizaje por colección con progreso persistente por usuario y palabra.
- Panel admin para colecciones, palabras, publicación y recursos multimedia por URL.

### Decisions

- Datos: UUID, relación muchos-a-muchos entre colecciones y palabras, traducción española única e `isPublished`.
- Prisma ORM 7: ESM, `prisma.config.ts`, cliente generado localmente y adaptador PostgreSQL; el `.env` de la raíz se carga con ruta absoluta.

[Unreleased]: https://github.com/dimasjavier0/lexflow-api/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/dimasjavier0/lexflow-api/releases/tag/v1.0.0
[0.6.0]: https://github.com/dimasjavier0/lexflow-api/releases/tag/v0.6.0
