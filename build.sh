#!/bin/bash
set -e

# Read version from manifest.json
VERSION=$(node -e "console.log(require('./manifest.json').version)")
OUTPUT="../pega-extension-${VERSION}.zip"

echo "Building pega-extension v${VERSION}..."

# Remove previous build if exists
rm -f "$OUTPUT"

zip -r "$OUTPUT" \
    manifest.json \
    popup.html \
    popup.js \
    popup.css \
    build/ \
    assets/ \
    --exclude '*/backup/*' \
    --exclude '*DS_Store'

echo ""
echo "Done: $OUTPUT"
echo "Size: $(du -sh "$OUTPUT" | cut -f1)"