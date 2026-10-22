#!/usr/bin/env bash
# One-off copy of LexFlow's educational content from the local PostgreSQL (docker container
# lexflow-postgres) to the production database, with the local file URLs rewritten to the
# public CloudFront domain. Accounts, progress, points and friendships are NOT copied.
# See docs/aws-deployment.md, step 6.
#
# Usage, from the repository root:
#   TARGET_DATABASE_URL='<session pooler URL, port 5432>' PUBLIC_URL='https://<domain>' infra/scripts/migrate-content.sh
#
# The target must already have the schema (npx prisma migrate deploy) and no content rows.
set -euo pipefail

: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL (Supabase session pooler, port 5432)}"
: "${PUBLIC_URL:?Set PUBLIC_URL (https://<cloudfront domain>)}"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-lexflow-postgres}"
LOCAL_UPLOADS="http://localhost:3000/uploads/"
PUBLIC_UPLOADS="${PUBLIC_URL%/}/uploads/"

CONTENT_TABLES=(Collection Word CollectionWord Image Audio Video ExampleSentence WordRelationship)
table_args=()
for table in "${CONTENT_TABLES[@]}"; do table_args+=(--table "public.\"$table\""); done

dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT

echo "Exporting ${#CONTENT_TABLES[@]} content tables from $LOCAL_CONTAINER..."
docker exec "$LOCAL_CONTAINER" pg_dump -U lexflow -d lexflow --data-only --no-owner --no-privileges "${table_args[@]}" > "$dump"

# psql runs in a throwaway container, so nothing needs installing; the URL travels as an
# environment variables, never on the command line or in a file. Node (the API's own URL
# parser) splits the URL into libpq's PG* variables: libpq reads some password characters in
# a URL differently, and rejects the Node-only uselibpqcompat parameter.
eval "$(node -e '
  const u = new URL(process.env.TARGET_DATABASE_URL);
  const q = (s) => "\x27" + s.replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
  const vars = { PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || "postgres", PGSSLMODE: u.searchParams.get("sslmode") || "require" };
  for (const [k, v] of Object.entries(vars)) console.log("export " + k + "=" + q(v));
')"
psql_target() {
  docker run --rm -i -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE \
    public.ecr.aws/docker/library/postgres:17-alpine psql -v ON_ERROR_STOP=1 -q "$@"
}

echo "Importing into the target database (one transaction)..."
{
  echo "BEGIN;"
  cat "$dump"
  cat <<SQL
UPDATE public."Image" SET url = replace(url, '$LOCAL_UPLOADS', '$PUBLIC_UPLOADS') WHERE url LIKE '$LOCAL_UPLOADS%';
UPDATE public."Audio" SET url = replace(url, '$LOCAL_UPLOADS', '$PUBLIC_UPLOADS') WHERE url LIKE '$LOCAL_UPLOADS%';
UPDATE public."Collection" SET "imageUrl" = replace("imageUrl", '$LOCAL_UPLOADS', '$PUBLIC_UPLOADS') WHERE "imageUrl" LIKE '$LOCAL_UPLOADS%';
COMMIT;
SQL
} | psql_target > /dev/null

echo "Rows now in the target:"
psql_target -At -c "select 'collections', count(*) from \"Collection\" union all select 'words', count(*) from \"Word\" union all select 'images', count(*) from \"Image\" union all select 'audios', count(*) from \"Audio\" union all select 'users', count(*) from \"User\" union all select 'urls still local', (select count(*) from \"Image\" where url like 'http://localhost%') + (select count(*) from \"Audio\" where url like 'http://localhost%')"
