#!/usr/bin/env bash
# Type-check and build FocusFlight for production (output in dist/).
set -e
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")"
npm run build
