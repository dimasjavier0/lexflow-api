# LexFlow API: flujo de trabajo

Este archivo se carga al empezar cada conversación. Sigue estos pasos en todo cambio de código o de documentación.

Este repositorio es uno de los dos de LexFlow: la web está en `lexflow-web`. Hasta la 0.6.0 ambos vivían en el monorepo `LexFlow-1.0`.

## Ramas: una por función

- `main` es la rama estable. No se hacen commits directos en ella: solo recibe fusiones.
- Cada función, corrección o tarea vive en su propia rama, creada desde `main`:

  | Prefijo     | Uso                                   | Ejemplo                      |
  | ----------- | ------------------------------------- | ---------------------------- |
  | `feat/`     | Funcionalidad nueva                   | `feat/pixabay-local-images`  |
  | `fix/`      | Corrección de un error                | `fix/admin-blank-screen`     |
  | `refactor/` | Cambio interno sin efecto visible     | `refactor/ui-components`     |
  | `docs/`     | Solo documentación                    | `docs/workflow`              |
  | `chore/`    | Dependencias, configuración, limpieza | `chore/upgrade-prisma`       |

- Nombres en inglés, minúsculas y con guiones. Una rama, un tema: si aparece otro trabajo, va en otra rama.
- Si un cambio necesita a la vez la API y la web, se hace una rama con el mismo nombre en cada repo, y se fusiona primero la de la API.

## Pasos de cada cambio

1. **Crear la rama** desde `main` actualizada: `git switch main && git switch -c feat/<nombre>`.
2. **Implementar** el cambio.
3. **Verificar**: `npm run check` debe pasar. Si cambia el schema de Prisma, se añade una migración en `prisma/migrations/`.
4. **Documentar** en el mismo trabajo:
   - `CHANGELOG.md`: una línea por cambio bajo `## [Unreleased]`, en `Added`, `Changed` o `Fixed`, en español y contando lo que nota quien usa la app.
   - `README.md`: si cambia una funcionalidad, un comando, una variable de entorno o la forma de arrancar el proyecto.
   - `.env.example`: si se añade una variable.
   - Documentación del sistema: **cada funcionalidad nueva** o cambio de comportamiento se explica también en `docs/` (`aws-deployment.md` para infraestructura y operación, `data-model.md` para el esquema) y en la guía técnica privada del proyecto, que vive fuera del repositorio. Con un diagrama si añade un flujo, y sin secretos ni datos de la cuenta.
5. **Commit** en la rama, con mensaje en inglés y formato Conventional Commits (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `chore: ...`). Commits pequeños y con un solo propósito.
6. **Fusionar en `main`** cuando la función está completa y verificada: `git switch main && git merge --no-ff feat/<nombre>`. La rama ya fusionada se puede borrar.
7. **Push** a `origin` solo cuando el usuario lo pida.

## Versiones y releases

- La versión vive en `package.json` (y en `package-lock.json`) y sigue SemVer: `feat` sube la versión menor, `fix` la de parche. Cada repo versiona por su cuenta.
- Al publicar una versión en `main`:
  1. En `CHANGELOG.md`, lo acumulado en `[Unreleased]` pasa a `## [X.Y.Z] - AAAA-MM-DD`, y `[Unreleased]` queda vacío encima. Al final del archivo se añade el enlace `[X.Y.Z]: https://github.com/dimasjavier0/lexflow-api/releases/tag/vX.Y.Z` y se actualiza el de `[Unreleased]` (`compare/vX.Y.Z...HEAD`).
  2. Se actualiza la versión en `package.json` y `package-lock.json` (`npm version X.Y.Z --no-git-tag-version`).
  3. Se etiqueta el commit de fusión: `git tag vX.Y.Z`.
  4. Cuando el usuario pida el push: `git push origin main --tags` y `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <notas>`, con la sección de esa versión del CHANGELOG como notas.
- Varias funciones fusionadas el mismo día pueden compartir una versión.

## Entorno local

- La API se arranca desde la raíz de este repositorio: `npm run dev` (puerto 3000). El `.env`, `uploads/` y `models/piper/` de la raíz son los suyos.
- La web está en el repositorio hermano `lexflow-web` (`npm run dev`, puerto 5173), con su propio `.env`.
- No arranques la API desde un worktree (`.claude/worktrees/...`): usaría su propia carpeta `uploads/`, vacía, y las imágenes y audios guardados responderían 404.
- Antes de usar el puerto 3000 o 5173, comprueba si ya hay un servidor escuchando y desde qué carpeta se lanzó.
- Los archivos de `uploads/` y `models/piper/` no se versionan: son datos locales que acompañan a la base de datos.
