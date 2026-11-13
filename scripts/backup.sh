#!/bin/sh
# نسخة احتياطية مشفّرة: قاعدة البيانات + الصور، بملف واحد.
#
#   DATABASE_URL=… UPLOAD_DIR=… BACKUP_DIR=… BACKUP_PASSPHRASE=… sh scripts/backup.sh
#   (على Docker: docker compose run --rm backup)
#
# الناتج: BACKUP_DIR/visits-YYYYMMDD-HHMMSS.tar.enc و .sha256 جنبه.
# بيضل آخر BACKUP_KEEP نسخة (افتراضي 30)، والأقدم بتنمسح.
set -eu

: "${DATABASE_URL:?DATABASE_URL لازم ينضبط}"
: "${BACKUP_DIR:?BACKUP_DIR لازم ينضبط}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE لازم ينضبط (احفظه برّا السيرفر)}"
UPLOAD_DIR="${UPLOAD_DIR:-}"
KEEP="${BACKUP_KEEP:-30}"

case "$KEEP" in '' | *[!0-9]*) echo "BACKUP_KEEP لازم يكون رقم" >&2; exit 1 ;; esac
[ "$KEEP" -ge 1 ] || { echo "BACKUP_KEEP لازم 1 أو أكتر" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
DIR=$(cd "$BACKUP_DIR" && pwd -P)
[ "$DIR" != "/" ] || { echo "BACKUP_DIR ما بيصير يكون /" >&2; exit 1; }

STAMP=$(date -u +%Y%m%d-%H%M%S)
NAME="visits-$STAMP.tar.enc"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT INT TERM

# 1) قاعدة البيانات (صيغة pg_dump المضغوطة)
pg_dump --format=custom --no-owner --no-privileges --file="$WORK/db.dump" "$DATABASE_URL"

# 2) الصور
if [ -n "$UPLOAD_DIR" ] && [ -d "$UPLOAD_DIR" ]; then
  tar -C "$UPLOAD_DIR" -cf "$WORK/uploads.tar" .
else
  tar -cf "$WORK/uploads.tar" --files-from /dev/null
fi
printf 'created=%s\n' "$STAMP" > "$WORK/manifest.txt"

# 3) ملف واحد مشفّر (AES-256 بمفتاح من كلمة السر، PBKDF2)
tar -C "$WORK" -cf - manifest.txt db.dump uploads.tar |
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$DIR/$NAME.part"
mv "$DIR/$NAME.part" "$DIR/$NAME"
(cd "$DIR" && sha256sum "$NAME" > "$NAME.sha256")
echo "تم: $DIR/$NAME ($(du -h "$DIR/$NAME" | cut -f1))"

# 4) بيضل آخر KEEP نسخة. بنمسح بس ملفات بهالاسم بالضبط، جوّا BACKUP_DIR، ومش روابط.
ls -1 "$DIR" | grep -E '^visits-[0-9]{8}-[0-9]{6}\.tar\.enc$' | sort -r | tail -n +"$((KEEP + 1))" |
  while read -r old; do
    [ -f "$DIR/$old" ] && [ ! -L "$DIR/$old" ] || continue
    rm -f -- "$DIR/$old" "$DIR/$old.sha256"
    echo "انمسحت القديمة: $old"
  done
