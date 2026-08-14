#!/bin/bash
echo "=== package.json ==="
cat package.json
echo ""
echo "=== server.ts (if exists) ==="
[ -f server.ts ] && cat server.ts || echo "(not found)"
echo ""
echo "=== api/rates.ts ==="
cat api/rates.ts
echo ""
echo "=== index.html ==="
cat index.html
echo ""
echo "=== src/main.tsx ==="
cat src/main.tsx
echo ""
echo "=== src/App.tsx ==="
cat src/App.tsx
echo ""
echo "=== src/index.css ==="
cat src/index.css
