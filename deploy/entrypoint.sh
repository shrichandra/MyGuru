#!/bin/sh
set -e
# With LITESTREAM_BUCKET set: restore the latest copy from Cloud Storage, then run the
# app under Litestream so every write is streamed back to the bucket within a second.
# Without it (local Docker runs), just start the app.
if [ -n "$LITESTREAM_BUCKET" ]; then
  litestream restore -if-db-not-exists -if-replica-exists -config /etc/litestream.yml "$DATABASE_PATH"
  exec litestream replicate -config /etc/litestream.yml -exec "node server.js"
fi
exec node server.js
