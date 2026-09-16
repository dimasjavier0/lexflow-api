# Modelo de datos inicial

## Relaciones

```text
User 1 ── N UserWordProgress N ── 1 Word
Collection N ── N Word             (mediante CollectionWord)
Word 1 ── N Image | Audio | Video
```

## Decisiones

- Todos los identificadores son UUID; los de usuarios provienen de Supabase Auth.
- Una palabra puede aparecer en varias colecciones sin duplicarse.
- Cada palabra tiene una traducción en español para el MVP.
- Colecciones y palabras usan `isPublished`; no se implementa soft delete.
- Los recursos externos conservan URL, origen, proveedor, licencia, atribución, metadatos y orden cuando aplica.
- Prisma ORM 7 se usa con el adaptador `@prisma/adapter-pg` y el driver `pg` para PostgreSQL.
