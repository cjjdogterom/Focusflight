#!/usr/bin/env bash
# Start the FocusFlight dev server.
# Node is installed locally at ~/.local/node (not on the global PATH), so we
# prepend it here. Then run Vite.
set -e
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")"
exec node node_modules/vite/bin/vite.js --host --port 5173 "$@"
