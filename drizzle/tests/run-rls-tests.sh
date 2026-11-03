#!/usr/bin/env bash
# Runs every migration on a throwaway local Postgres database, loads the demo
# seed, then checks the access rules for each role (drizzle/tests/rls.test.sql).
#
# Needs a local Postgres you can connect to as a superuser, e.g.
#   PGHOST=localhost PGUSER=postgres ./drizzle/tests/run-rls-tests.sh
# The database named by $TEST_DB (default acta_rls_test) is dropped and recreated.
set -euo pipefail

cd "$(dirname "$0")/.."
DB="${TEST_DB:-acta_rls_test}"

psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
{
  cat tests/supabase-stubs.sql
  for f in migrations/0*.sql; do cat "$f"; echo; done
  cat seed/demo.sql
} | psql -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null

psql -q -d "$DB" -f tests/rls.test.sql
