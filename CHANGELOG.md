# Changelog

Los cambios relevantes del proyecto se registran aquí.

## [Unreleased]

### Added

- Base del monorepo con npm workspaces.
- Aplicaciones `@lexflow/web` y `@lexflow/api`.
- Paquetes `@lexflow/shared`, `@lexflow/schemas` y `@lexflow/config`.
- Esqueleto React/Vite/Tailwind, rutas iniciales y contexto de autenticación local.
- Esqueleto Express con endpoint `GET /health`.
- Plantilla de variables de entorno y documentación inicial.
- Validación TypeScript correcta para los workspaces web y API (`npm run check`).
- Verificación local correcta: API disponible en `/health` y frontend Vite iniciado.

### Decisions

- Navegación: React Router.
- Datos en MVP: `fetch` nativo; TanStack Query queda para una segunda versión.
- Estado global: React Context.
- Formularios: React Hook Form con Zod.
- Datos: UUID, relación muchos-a-muchos entre colecciones y palabras, traducción española única e `isPublished`.

### Changed

- Se añadió el schema Prisma inicial, contratos Zod para colecciones/palabras/progreso y Docker Compose para PostgreSQL.
- Se añadió el comando `db:validate` para validar el schema Prisma.
- Prisma se actualizó al enfoque de Prisma ORM 7: ESM, `prisma.config.ts`, cliente generado localmente y adaptador PostgreSQL.
- Se corrigieron las dependencias declaradas de Prisma para que coincidan con la configuración de Prisma ORM 7.
- Schema validado correctamente con Prisma ORM 7 (`npm run db:validate --workspace=@lexflow/api`).
- La configuración Prisma carga el `.env` raíz mediante una ruta absoluta y con prioridad explícita.
- PostgreSQL local iniciado mediante Docker Compose y verificado como `healthy`.
- Prisma Client 7.10.0 generado correctamente desde el schema inicial.
- PostgreSQL local se expone por el puerto `5433` para evitar una colisión de autenticación detectada en `5432`.
- Se creó y aplicó la migración inicial de Prisma contra PostgreSQL en Docker.
- Se añadió un seed idempotente con la colección A1 `food` y tres palabras de ejemplo.
- Se completó el flujo de aprendizaje con progreso persistente por usuario y palabra.
- Se añadió panel admin para colecciones, palabras, publicación y recursos multimedia por URL.
- Se añadió una PWA básica con manifest y service worker.
- Se rediseñó el panel admin como dashboard de acciones con colecciones y palabras expandibles.
- Se añadió carga de imágenes por arrastre, persistida en disco local y registrada en PostgreSQL.
- El dashboard admin ahora usa modales para acciones y un editor de palabra reutilizable dentro de la biblioteca.
- La interfaz web se migró a utilidades Tailwind v4 con tokens de marca en `@theme` y componentes compartidos en `components/ui` (Button, Field, Modal, Switch, Badge, Alert, Toast, EmptyState).
- El panel admin se dividió en `features/admin` (hook de datos, filas de colección y palabra, modales y editor) y todas las llamadas pasan por `lib/api.ts` y `lib/admin-api.ts`.
- Las rutas `/admin` de la API se agrupan en un router con autenticación única; Pixabay y Piper viven en `services/`.
- La app pública solo muestra y cuenta palabras publicadas; el panel permite publicar cada palabra o todas las de una colección.
- El flujo de aprendizaje añade atajos de teclado, pantalla de fin de colección, reintentos y video embebido.
- El selector de imágenes separa la búsqueda en Pixabay de las URL manuales, y el editor de palabras permite borrar sonidos.

### Fixed

- Las rutas de búsqueda en Pixabay y de generación de audio no estaban registradas en la API (404).
- Recargar `/admin` redirigía a un administrador al inicio, y cada refresco de token cerraba los formularios abiertos.
- Añadir palabras a una colección sin abrir dejaba la lista incompleta; confirmar contenido faltante la dejaba vacía.
- El formulario de palabra rápida mostraba un error tras guardar correctamente.
- Un fallo al guardar el progreso sustituía la lección completa por una pantalla de error.
- Reutilizar una palabra existente en otra colección la despublicaba.
