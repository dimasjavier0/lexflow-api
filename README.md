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
- Selección de nivel CEFR, lecciones que omiten las palabras ya conocidas y avance por colección.
- Publicación por palabra; los estudiantes solo ven palabras publicadas.
- Búsqueda de imágenes en Pixabay y eliminación de colecciones, palabras y recursos desde el panel.
- Dashboard admin con tarjetas de acciones, colecciones expandibles y carga de imágenes por arrastre.
- Editor reutilizable de palabras para crear y editar término, traducción, nivel, enlace de imagen y archivo arrastrado.
- Manifest y service worker básicos para instalación como PWA.

Las imágenes arrastradas se guardan localmente en `apps/api/uploads/` y su URL queda registrada en PostgreSQL. Este almacenamiento está pensado para desarrollo local; producción deberá migrarlo a Supabase Storage o a un bucket S3-compatible.

El panel admin requiere que el usuario tenga `role = 'ADMIN'` en la base PostgreSQL local.

## Seguridad de la API

- `CORS_ORIGINS` limita los orígenes web permitidos (lista separada por comas). Si está vacío se acepta cualquier origen, lo que solo es adecuado en desarrollo local.
- La API limita cada IP a 300 peticiones por minuto, y a 30 por minuto en las rutas que llaman a Pixabay o ejecutan Piper. El contador vive en memoria: con más de una instancia hará falta un almacén compartido.

## Pronunciación local

LexFlow puede generar pronunciaciones gratuitas con Piper TTS. Piper y las voces descargadas localmente quedan en el entorno Python y en `apps/api/models/piper/`. Configura en el `.env` de la raíz:

```env
PIPER_PATH="C:/Users/NAMEUSER/.pyenv/pyenv-win/versions/3.12.4/Scripts/piper.exe"
PIPER_VOICE_MODEL_US="apps/api/models/piper/en_US-amy-medium.onnx"
PIPER_VOICE_MODEL_UK="apps/api/models/piper/en_GB-alan-medium.onnx"
```

Después de guardar una palabra desde el panel admin, abre su editor, elige el acento y pulsa `Generar pronunciación`. El audio se guarda en la tabla `Audio` y queda disponible para los estudiantes.
