# LexFlow: flujo de trabajo

Este archivo se carga al empezar cada conversación. Sigue estos pasos en todo cambio de código o de documentación.

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

## Pasos de cada cambio

1. **Crear la rama** desde `main` actualizada: `git switch main && git switch -c feat/<nombre>`.
2. **Implementar** el cambio.
3. **Verificar**: `npm run check` debe pasar. Los cambios de interfaz se prueban en el navegador, también a ancho de móvil (390 px).
4. **Documentar** en el mismo trabajo:
   - `CHANGELOG.md`: una línea por cambio bajo `## [Unreleased]`, en `Added`, `Changed` o `Fixed`, en español y contando lo que nota quien usa la app.
   - `README.md`: si cambia una funcionalidad, un comando, una variable de entorno o la forma de arrancar el proyecto.
   - `.env.example`: si se añade una variable.
5. **Commit** en la rama, con mensaje en inglés y formato Conventional Commits (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `chore: ...`). Commits pequeños y con un solo propósito.
6. **Fusionar en `main`** cuando la función está completa y verificada: `git switch main && git merge --no-ff feat/<nombre>`. La rama ya fusionada se puede borrar.
7. **Push** a `origin` solo cuando el usuario lo pida.

## Versiones

- La versión vive en `package.json` de la raíz (y en `package-lock.json`) y sigue SemVer: `feat` sube la versión menor, `fix` la de parche.
- Al publicar una versión en `main`:
  1. En `CHANGELOG.md`, lo acumulado en `[Unreleased]` pasa a `## [X.Y.Z] - AAAA-MM-DD`, y `[Unreleased]` queda vacío encima.
  2. Se actualiza la versión en `package.json` y `package-lock.json`.
  3. Se etiqueta el commit de fusión: `git tag vX.Y.Z`.
- Varias funciones fusionadas el mismo día pueden compartir una versión.

## Entorno local

- Los servidores se arrancan desde la raíz del repositorio: `npm run dev:api` (puerto 3000) y `npm run dev:web` (puerto 5173). El `.env` de la raíz alimenta a ambos.
- No arranques la API desde un worktree (`.claude/worktrees/...`): usaría su propia carpeta `apps/api/uploads`, vacía, y las imágenes y audios guardados responderían 404.
- Antes de usar el puerto 3000 o 5173, comprueba si ya hay un servidor escuchando y desde qué carpeta se lanzó.
- Los archivos de `apps/api/uploads/` no se versionan: son datos locales que acompañan a la base de datos.
