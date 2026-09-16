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
