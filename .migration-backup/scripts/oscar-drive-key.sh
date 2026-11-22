#!/usr/bin/env bash
# Oscar Drive upload key (one time). Run in the Replit Shell of project "sf":
#   bash scripts/oscar-drive-key.sh
# Makes ./oscar-drive-key/ (git-ignored by its own .gitignore) with:
#   KEYSTORE_B64.txt  PASSWORD.txt  SHA1.txt
# Refuses to make a second key: a new key means installed apps can no longer update.
# ASCII only on purpose — Arabic inside a pasted shell command broke the Replit Shell (2026-11-05).
set -euo pipefail
DIR=oscar-drive-key
if [ -e "$DIR/upload.p12" ]; then
  echo "STOP: a key already exists in $DIR - not making another one."
  exit 1
fi
mkdir -p "$DIR"
cd "$DIR"
echo '*' > .gitignore
PW=$(openssl rand -hex 24)
openssl req -x509 -newkey rsa:4096 -sha256 -days 10000 -nodes -keyout k.pem -out c.pem \
  -subj "/CN=OscarDevs/O=OscarDevs/C=EG" 2>/dev/null
openssl pkcs12 -export -inkey k.pem -in c.pem -name oscardrive -out upload.p12 -passout "pass:$PW"
base64 -w0 upload.p12 > KEYSTORE_B64.txt
printf %s "$PW" > PASSWORD.txt
openssl x509 -in c.pem -noout -fingerprint -sha1 | sed 's/.*=//' > SHA1.txt
rm -f k.pem
echo "DONE: files are in the oscar-drive-key folder"
