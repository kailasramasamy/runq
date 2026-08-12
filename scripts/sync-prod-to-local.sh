#!/usr/bin/env bash
#
# Replace the local dev database with a snapshot of production.
#
#   ./scripts/sync-prod-to-local.sh
#
# Both connection strings come from .env, which is gitignored:
#
#   PROD_DATABASE_URL=postgresql://...   the Railway Postgres URL
#   DATABASE_URL=postgresql://...        the local target
#
# The prod URL is deliberately NOT written into this file — scripts/ is
# tracked, so a credential here would be published on the next push and
# could only be undone by rotating it. Environment variables override .env
# for a one-off run against a different database.
#
# Flags:
#   --yes         skip the confirmation prompt
#   --keep-dumps  leave the dump files behind (they hold real customer data)
#
# The local database is backed up before anything is dropped; the restore
# command is printed at the end.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_DIR="$ROOT/tmp/db-sync"
STAMP="$(date +%Y%m%d-%H%M%S)"
ASSUME_YES=0
KEEP_DUMPS=0

for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --keep-dumps) KEEP_DUMPS=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "error: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

# --- resolve connection strings -------------------------------------------

# Read one key out of .env without sourcing the file — it holds API keys and
# secrets that have no business in this script's environment.
env_value() {
  [[ -f "$ROOT/.env" ]] || return 1
  local v
  v="$(grep -E "^$1=" "$ROOT/.env" | head -1 | cut -d= -f2-)"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  [[ -n "$v" ]] && echo "$v"
}

PROD_URL="${PROD_DATABASE_URL:-$(env_value PROD_DATABASE_URL || true)}"
[[ -n "$PROD_URL" ]] || die "no PROD_DATABASE_URL in the environment or $ROOT/.env.
Add this line to .env (it is gitignored), from Railway → Postgres → Connect:
  PROD_DATABASE_URL=postgresql://postgres:PASSWORD@HOST:PORT/railway"

LOCAL_URL="${LOCAL_DATABASE_URL:-$(env_value DATABASE_URL || true)}"
[[ -n "$LOCAL_URL" ]] || die "no DATABASE_URL in the environment or $ROOT/.env"

# The one mistake this script must never make is pointing the destructive
# half at a remote host. Anything but a loopback target is refused outright.
LOCAL_HOST="$(sed -E 's#^[^:]+://[^@]*@?([^:/?]+).*#\1#' <<<"$LOCAL_URL")"
case "$LOCAL_HOST" in
  localhost|127.0.0.1|::1|host.docker.internal) ;;
  *) die "refusing to overwrite a non-local host: '$LOCAL_HOST'" ;;
esac

# --- pick client binaries new enough for the server ------------------------

# pg_dump refuses to dump from a server newer than itself, and Homebrew's
# default `postgresql` keg is often several majors behind the Railway server.
find_pg_bin() {
  local need="$1" c major
  for c in "${PGBIN:-}" "" /usr/local/opt/postgresql@*/bin /opt/homebrew/opt/postgresql@*/bin; do
    local dump="${c:+$c/}pg_dump"
    command -v "$dump" >/dev/null 2>&1 || continue
    major="$("$dump" --version | grep -oE '[0-9]+' | head -1)"
    if (( major >= need )); then echo "${c:-$(dirname "$(command -v pg_dump)")}"; return 0; fi
  done
  return 1
}

command -v psql >/dev/null || die "psql not found on PATH"
PROD_MAJOR="$(psql "$PROD_URL" -tAc 'show server_version' | grep -oE '^[0-9]+')" \
  || die "cannot reach the production database"
PG_BIN="$(find_pg_bin "$PROD_MAJOR")" \
  || die "no pg_dump >= $PROD_MAJOR found. Try: brew install postgresql@$PROD_MAJOR"
export PATH="$PG_BIN:$PATH"

# --- confirm ---------------------------------------------------------------

PROD_SIZE="$(psql "$PROD_URL" -tAc 'select pg_size_pretty(pg_database_size(current_database()))')"
LOCAL_DB="$(sed -E 's#.*/([^/?]+).*#\1#' <<<"$LOCAL_URL")"

echo "  source : production, $PROD_SIZE, PostgreSQL $PROD_MAJOR"
echo "  target : $LOCAL_DB on $LOCAL_HOST  (will be DROPPED and replaced)"
echo "  client : $PG_BIN"

if (( ASSUME_YES == 0 )); then
  read -r -p "Replace the local database? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "aborted."; exit 1; }
fi

mkdir -p "$DUMP_DIR"
PROD_DUMP="$DUMP_DIR/prod-$STAMP.dump"
LOCAL_DUMP="$DUMP_DIR/local-backup-$STAMP.dump"

# --- dump both ends --------------------------------------------------------

step "Backing up the local database"
pg_dump "$LOCAL_URL" -Fc --no-owner --no-acl -f "$LOCAL_DUMP"
echo "    $LOCAL_DUMP ($(du -h "$LOCAL_DUMP" | cut -f1))"

step "Dumping production"
pg_dump "$PROD_URL" -Fc --no-owner --no-acl -f "$PROD_DUMP"
echo "    $PROD_DUMP ($(du -h "$PROD_DUMP" | cut -f1))"

# --- replace ---------------------------------------------------------------

# Both schemas go, not just public: drizzle holds the migration ledger, and
# leaving the local copy in place makes the restore collide with it. Only
# public is recreated — the dump carries its own CREATE SCHEMA drizzle, so
# making that one here would collide in turn.
step "Replacing local schemas"
psql "$LOCAL_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
SET client_min_messages = warning;
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
CREATE SCHEMA public;
SQL

step "Restoring production into $LOCAL_DB"
pg_restore -d "$LOCAL_URL" --no-owner --no-acl -j 4 "$PROD_DUMP" 2>"$DUMP_DIR/restore-$STAMP.log" || true
ERRORS="$(grep -c '^pg_restore: error' "$DUMP_DIR/restore-$STAMP.log" || true)"
if (( ERRORS > 0 )); then
  echo "    $ERRORS restore error(s) — see $DUMP_DIR/restore-$STAMP.log"
  grep '^pg_restore: error' "$DUMP_DIR/restore-$STAMP.log" | head -5
else
  echo "    no errors"
fi

# --- verify ----------------------------------------------------------------

# Exact counts, not pg_stat_user_tables — its estimates are stale on the
# source and freshly analyzed on the target, which invents differences.
step "Verifying"
COUNT_SQL="select c.relname||'='||(xpath('/row/c/text()',
    query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by c.relname"

psql "$PROD_URL" -tAc "$COUNT_SQL" | tr -d ' ' > "$DUMP_DIR/counts-prod.txt"
psql "$LOCAL_URL" -tAc "$COUNT_SQL" | tr -d ' ' > "$DUMP_DIR/counts-local.txt"

TABLES="$(wc -l < "$DUMP_DIR/counts-local.txt" | tr -d ' ')"
if diff -q "$DUMP_DIR/counts-prod.txt" "$DUMP_DIR/counts-local.txt" >/dev/null; then
  echo "    $TABLES tables, every row count identical"
else
  DRIFT="$(diff "$DUMP_DIR/counts-prod.txt" "$DUMP_DIR/counts-local.txt" | grep -c '^<' || true)"
  echo "    $TABLES tables, $DRIFT with different counts (prod → local):"
  diff "$DUMP_DIR/counts-prod.txt" "$DUMP_DIR/counts-local.txt" \
    | grep -E '^[<>]' | sed 's/^/      /' | head -20
  echo "    Rows written to prod while the dump ran show up here; that is normal."
fi

# --- clean up --------------------------------------------------------------

echo
echo "Restore the previous local database with:"
echo "  pg_restore -d '$LOCAL_URL' --clean --no-owner --no-acl '$LOCAL_DUMP'"

if (( KEEP_DUMPS == 0 )); then
  # These carry live customer data — GST filings, farmer PII. The local
  # backup stays until the next run so the line above keeps working.
  rm -f "$PROD_DUMP" "$DUMP_DIR/counts-prod.txt" "$DUMP_DIR/counts-local.txt"
  echo "Removed the production dump. Pass --keep-dumps to retain it."
fi
echo
echo "Done."
