#!/bin/sh
set -e

CERT_DIR=./nginx/certs
mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/self.key" ] && [ -f "$CERT_DIR/self.crt" ]; then
  echo "Self-signed cert already exists in $CERT_DIR"
  exit 0
fi

echo "Generating self-signed certificate for localhost..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/self.key" \
  -out "$CERT_DIR/self.crt" \
  -subj "/CN=localhost"

echo "Created $CERT_DIR/self.key and self.crt"
