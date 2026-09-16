# LexFlow

Plataforma web para aprender vocabulario de inglés mediante imagen, audio y contexto.

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

## Funcionalidades disponibles

- Login con Google mediante Supabase Auth.
- Validación JWT en la API y sincronización de usuarios locales.
- Colecciones y palabras publicadas desde el panel admin.
- Progreso por palabra: querer aprender, no interesar y aprendida.
- Recursos manuales de imagen, audio y video mediante URL.
- Manifest y service worker básicos para instalación como PWA.

El panel admin requiere que el usuario tenga `role = 'ADMIN'` en la base PostgreSQL local.
