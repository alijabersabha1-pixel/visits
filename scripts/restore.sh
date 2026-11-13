#!/bin/sh
# استرجاع نسخة احتياطية: بيستبدل قاعدة البيانات والصور بمحتوى النسخة.
#
#   DATABASE_URL=… UPLOAD_DIR=… BACKUP_PASSPHRASE=… sh scripts/restore.sh visits-….tar.enc --yes
#   (على Docker: docker compose run --rm backup sh /scripts/restore.sh /backups/visits-….tar.enc --yes)
#
# ⚠️ بيمسح البيانات الحالية. وقّف الموقع قبل (docker compose stop app) وشغّله بعد.
set -eu

FILE="${1:-}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "الاستخدام: restore.sh <ملف النسخة> --yes" >&2; exit 1; }
[ "${2:-}" = "--yes" ] || { echo "الاسترجاع بيمسح البيانات الحالية. أعد الأمر وزيد --yes للتأكيد." >&2; exit 1; }
: "${DATABASE_URL:?DATABASE_URL لازم ينضبط}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE لازم ينضبط}"
UPLOAD_DIR="${UPLOAD_DIR:-}"

# سلامة الملف (إذا ملف البصمة موجود)
if [ -f "$FILE.sha256" ]; then
  (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256") || { echo "الملف تالف (البصمة مش مطابقة)" >&2; exit 1; }
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT INT TERM
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" | tar -C "$WORK" -xf - ||
  { echo "ما انفك التشفير: كلمة السر غلط أو الملف تالف" >&2; exit 1; }
[ -s "$WORK/db.dump" ] || { echo "النسخة ما فيها قاعدة بيانات" >&2; exit 1; }
cat "$WORK/manifest.txt"

# قاعدة البيانات: بيمسح الجداول الحالية وبيرجّعها من النسخة
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction \
  --dbname="$DATABASE_URL" "$WORK/db.dump"
echo "رجعت قاعدة البيانات"

# الصور
if [ -n "$UPLOAD_DIR" ]; then
  mkdir -p "$UPLOAD_DIR"
  tar -C "$UPLOAD_DIR" -xf "$WORK/uploads.tar"
  echo "رجعت الصور لـ $UPLOAD_DIR"
fi
echo "تم. شغّل الموقع (docker compose up -d app): بيعيد صلاحيات مستخدم الموقع لحاله."
