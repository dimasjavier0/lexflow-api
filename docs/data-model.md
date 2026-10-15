# Modelo de datos inicial

## Relaciones

```text
User 1 ── N UserWordProgress N ── 1 Word
User 1 ── N UserDailyPoints         (un registro por día UTC con puntos)
Collection N ── N Word             (mediante CollectionWord)
Word 1 ── N Image | Audio | Video | ExampleSentence
Word N ── N Word                   (mediante WordRelationship, dirigida y con tipo)
```

## Decisiones

- Todos los identificadores son UUID; los de usuarios provienen de Supabase Auth.
- Una palabra puede aparecer en varias colecciones sin duplicarse.
- Cada palabra tiene una traducción en español para el MVP.
- Colecciones y palabras usan `isPublished`; no se implementa soft delete.
- Los recursos externos conservan URL, origen, proveedor, licencia, atribución, metadatos y orden cuando aplica.
- `Word` guarda categoría gramatical (`partOfSpeech`) y frecuencia (`frequencyRank`) opcionales. La categoría es un enum y no una tabla catálogo: los valores son fijos y no necesitan administración.
- Las oraciones de ejemplo pertenecen a una sola palabra (1:N). El borrador de diseño las modelaba como N:M con posición por palabra; se simplificó porque hoy cada oración se escribe para ilustrar una palabra concreta.
- `WordRelationship` es única por `(sourceWordId, targetWordId, type)`.
- `UserWordProgress` incluye el estado SM-2 (`stage`, `repetitions`, `intervalDays`, `easeFactor`, `lastReviewedAt`, `nextReviewAt`). `nextReviewAt = null` significa «pendiente desde ya».
- `User` incluye perfil (`name`, `avatarUrl`) y gamificación (`pointsTotal`, `streakCurrent`, `streakBest`, `lastActivityOn`). El nivel no se almacena: se deriva de los puntos.
- `User.country` guarda el país elegido por el estudiante (ISO 3166-1 alfa-2) y filtra el ranking por país.
- `UserDailyPoints` suma los puntos de cada usuario por día (UTC), con clave `(userId, day)`. Los rankings diario, semanal y mensual suman sus filas desde el inicio del periodo; `pointsTotal` sigue siendo el total histórico. Los puntos ganados antes de existir la tabla no cuentan en ningún periodo.
- Prisma ORM 7 se usa con el adaptador `@prisma/adapter-pg` y el driver `pg` para PostgreSQL.
