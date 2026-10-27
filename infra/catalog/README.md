# Catálogo de vocabulario

`words.tsv` es el vocabulario que LexFlow carga en producción: 8.624 palabras de A1 a C2, cada una con su traducción al español, su nivel CEFR, su categoría gramatical, su tema (la colección en la que va) y si es «visual» (si tiene sentido buscarle una foto).

| Columna | Contenido |
| ------- | --------- |
| `term` | La palabra o expresión en inglés (única) |
| `translation_es` | Traducción breve; varios sentidos separados por `;` |
| `level` | A1, A2, B1, B2, C1 o C2 |
| `part_of_speech` | Categoría gramatical (vacía si la fuente no la da) |
| `topic` | Clave del tema; `topics.json` la traduce al nombre de la colección |
| `visual` | `1` si lleva imagen propia; `0` si usa la portada de su colección |

Se carga con los scripts de `infra/scripts/` (ver [docs/aws-deployment.md](../../docs/aws-deployment.md#catálogo-de-vocabulario)).

## Fuentes y licencia

Las palabras y sus niveles vienen de:

- **The CEFR-J Wordlist Version 1.5.** Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from http://www.cefr-j.org/download.html. Uso libre, también comercial, citando la fuente.
- **Octanove Vocabulary Profile C1/C2 (ver 1.0)**, Octanove Labs, bajo [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Ambas se obtuvieron de [openlanguageprofiles/olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj). Una palabra que aparece con varias categorías se guarda una sola vez, en su nivel más bajo. Se omitieron las formas flexionadas que ya están como lema (*am, is, was…*) y algunos términos ofensivos o inapropiados para una app desde 13 años.

Las traducciones, los temas y la marca «visual» son de LexFlow. Este archivo, como obra derivada del perfil de Octanove, se distribuye también bajo **CC BY-SA 4.0**.
