#!/bin/sh
set -e

# Copy built frontend files to the volume
# This ensures we always serve the latest built version, even if the volume persists from a previous container run
mkdir -p /var/www/html/frontend
find /var/www/html/frontend -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a /usr/share/wafrn/frontend/. /var/www/html/frontend/

# replace all environment variables in the files in the frontend volume before starting caddy
perl -pi -e 's/NGSW_([_A-Z]+)/$ENV{$1}/g' /var/www/html/frontend/ngsw.json

perl -pi -e 's/\$\{\{([_A-Z]+):-(.*)\}\}/$ENV{$1}||$2/ge' /var/www/html/frontend/index.html
perl -pi -e 's/\$\{\{([_A-Z]+)\}\}/$ENV{$1}/g' /var/www/html/frontend/index.html

perl -pi -e 's/\$\{\{([_A-Z]+):-(.*)\}\}/$ENV{$1}||$2/ge' /var/www/html/frontend/manifest.webmanifest
perl -pi -e 's/\$\{\{([_A-Z]+)\}\}/$ENV{$1}/g' /var/www/html/frontend/manifest.webmanifest

for f in index.html manifest.webmanifest; do
  hash=$(sha1sum "/var/www/html/frontend/$f" | awk '{ print $1 }')
  tmp_file=$(mktemp)
  jq --arg key "/$f" --arg hash "$hash" '.hashTable[$key] = $hash' /var/www/html/frontend/ngsw.json > "$tmp_file"
  mv "$tmp_file" /var/www/html/frontend/ngsw.json
done

/overrides.sh /overrides /var/www/html/frontend/ngsw.json

exec "$@"
