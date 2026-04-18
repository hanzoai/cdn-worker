#!/bin/bash
# Upload directory contents to R2 bucket with prefix
# Usage: ./upload.sh <local-dir> <r2-prefix>
# Example: ./upload.sh /path/to/public lux

set -e

LOCAL_DIR="$1"
PREFIX="$2"

if [ -z "$LOCAL_DIR" ] || [ -z "$PREFIX" ]; then
  echo "Usage: $0 <local-dir> <r2-prefix>"
  exit 1
fi

cd "$(dirname "$0")"

COUNT=0
TOTAL=$(find "$LOCAL_DIR" -type f | wc -l | tr -d ' ')
echo "Uploading $TOTAL files from $LOCAL_DIR to pub/$PREFIX/..."

find "$LOCAL_DIR" -type f | while read -r file; do
  # Get relative path from LOCAL_DIR
  REL_PATH="${file#$LOCAL_DIR/}"
  R2_KEY="$PREFIX/$REL_PATH"
  COUNT=$((COUNT + 1))

  # Determine content-type
  CT="application/octet-stream"
  case "$file" in
    *.svg) CT="image/svg+xml" ;;
    *.png) CT="image/png" ;;
    *.jpg|*.jpeg) CT="image/jpeg" ;;
    *.gif) CT="image/gif" ;;
    *.webp) CT="image/webp" ;;
    *.ico) CT="image/x-icon" ;;
    *.woff) CT="font/woff" ;;
    *.woff2) CT="font/woff2" ;;
    *.ttf) CT="font/ttf" ;;
    *.css) CT="text/css" ;;
    *.js) CT="application/javascript" ;;
    *.json) CT="application/json" ;;
    *.xml) CT="application/xml" ;;
    *.html) CT="text/html" ;;
    *.txt) CT="text/plain" ;;
    *.mp4) CT="video/mp4" ;;
    *.webm) CT="video/webm" ;;
    *.mp3) CT="audio/mpeg" ;;
    *.pdf) CT="application/pdf" ;;
    *.avif) CT="image/avif" ;;
  esac

  npx wrangler r2 object put "pub/$R2_KEY" --file="$file" --content-type="$CT" --remote 2>/dev/null && \
    echo "[$COUNT/$TOTAL] $R2_KEY" || \
    echo "[$COUNT/$TOTAL] FAILED: $R2_KEY"
done

echo "Done! Uploaded to pub/$PREFIX/"
