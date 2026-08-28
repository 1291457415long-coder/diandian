#!/bin/bash
set -e
SRC=../diandian-app
DST=app/src/main/assets/www
mkdir -p "$DST"
cp "$SRC"/index.html "$SRC"/manifest.webmanifest "$SRC"/sw.js "$DST"/
cp -r "$SRC"/css "$SRC"/js "$SRC"/icons "$DST"/
echo "Synced $SRC -> $DST"
