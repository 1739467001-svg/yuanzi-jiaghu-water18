#!/bin/zsh
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  export PATH="/Users/mac/.deskclaw/node/bin:$PATH"
fi
if [ ! -d node_modules ]; then
  npm ci || exit 1
fi
open 'http://127.0.0.1:5173'
npm run dev
