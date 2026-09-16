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
