#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="$DIR/codebase.md"
rm -f "$OUTPUT"
echo "# setu-map Codebase" > "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Generated on $(date)" >> "$OUTPUT"
echo "" >> "$OUTPUT"

find "$DIR" \
  -path "$PWD/.git" -prune -o \
  -path "$PWD/node_modules" -prune -o \
  -path "$PWD/.vercel" -prune -o \
  -path "$PWD/generate-codebase-md.sh" -prune -o \
  -path "$PWD/codebase.md" -prune -o \
  -type f -print | sort | while IFS= read -r file; do
  relpath="${file#$DIR/}"
  echo "---" >> "$OUTPUT"
  echo "**$relpath**" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  echo '```' >> "$OUTPUT"
  cat "$file" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  echo '```' >> "$OUTPUT"
  echo "" >> "$OUTPUT"
done

echo "Done. Wrote codebase.md"
