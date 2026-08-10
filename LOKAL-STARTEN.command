#!/bin/zsh
cd "${0:A:h}"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js und npm wurden nicht gefunden. Bitte zuerst Node.js installieren."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

open "http://localhost:4173"
npm run dev
