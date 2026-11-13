#!/bin/sh
# أول تشغيل لقاعدة البيانات بس: مستخدم الموقع (مش مالك الجداول).
# الصلاحيات نفسها بيعطيها scripts/migrate.mjs مع كل تشغيل للموقع.
set -eu
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD لازم ينضبط}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v pw="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE visits_app LOGIN PASSWORD :'pw';
GRANT CONNECT ON DATABASE visits TO visits_app;
SQL
