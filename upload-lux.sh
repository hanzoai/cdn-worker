#!/bin/bash
# Bulk upload Lux CDN assets to R2
set -e
cd "$(dirname "$0")"

SRC="/Users/z/work/lux/apps/cdn/public"
PREFIX="lux"
COUNT=0
FAIL=0
TOTAL=$(find "$SRC" -type f | wc -l | tr -d ' ')

echo "Uploading $TOTAL files from $SRC to pub/$PREFIX/..."
echo "Start: $(date)"

find "$SRC" -type f | while read -r file; do
  REL="${file#$SRC/}"
  CT="application/octet-stream"
  case "${file##*.}" in
    svg) CT="image/svg+xml" ;;
    png) CT="image/png" ;;
    jpg|jpeg) CT="image/jpeg" ;;
    gif) CT="image/gif" ;;
    webp) CT="image/webp" ;;
    avif) CT="image/avif" ;;
    ico) CT="image/x-icon" ;;
    woff) CT="font/woff" ;;
    woff2) CT="font/woff2" ;;
    ttf) CT="font/ttf" ;;
    css) CT="text/css" ;;
    js) CT="application/javascript" ;;
    json) CT="application/json" ;;
    xml) CT="application/xml" ;;
    html) CT="text/html" ;;
    txt) CT="text/plain" ;;
    mp4) CT="video/mp4" ;;
    webm) CT="video/webm" ;;
    mp3) CT="audio/mpeg" ;;
    pdf) CT="application/pdf" ;;
  esac

  COUNT=$((COUNT + 1))
  if npx wrangler r2 object put "pub/$PREFIX/$REL" --file="$file" --content-type="$CT" --remote 2>/dev/null >/dev/null; then
    echo "[$COUNT/$TOTAL] $REL"
  else
    FAIL=$((FAIL + 1))
    echo "[$COUNT/$TOTAL] FAIL: $REL"
  fi
done

echo "Done! $COUNT uploaded, $FAIL failed"
echo "End: $(date)"
