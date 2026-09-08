#!/bin/bash
cd "$(dirname "$0")"
PORT=4310
echo "Starting FlexiblePDF-Editor..."
(sleep 1 && open "http://localhost:$PORT") &
node server.js
