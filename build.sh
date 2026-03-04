#!/bin/bash
set -e

# Parse flags
BUMP=false
for arg in "$@"; do
    if [ "$arg" = "--bump" ]; then
        BUMP=true
    fi
done

# Bump patch version in manifest.json if requested.
# Carries over to minor/major when a component exceeds 99.
if [ "$BUMP" = true ]; then
    node -e "
        const fs = require('fs');
        const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
        const parts = manifest.version.split('.').map(Number);
        const MAX = 99;
        for (let i = parts.length - 1; i >= 0; i--) {
            parts[i]++;
            if (parts[i] <= MAX || i === 0) break;
            parts[i] = 0;
        }
        manifest.version = parts.join('.');
        fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');
        process.stderr.write('Version bumped to ' + manifest.version + '\n');
    "
fi

VERSION=$(node -e "console.log(require('./manifest.json').version)")
OUTPUT="../pega-extension-${VERSION}.zip"

echo "Building pega-extension v${VERSION}..."

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