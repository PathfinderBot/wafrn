#!/bin/sh
set -e

perl -pi -e 's/NGSW_([_A-Z]+)/$ENV{$1}/g' /app/frontend/ngsw.json

perl -pi -e 's/\$\{\{([_A-Z]+):-(.*)\}\}/$ENV{$1}||$2/ge' /etc/caddy/Caddyfile
perl -pi -e 's/\$\{\{([_A-Z]+)\}\}/$ENV{$1}/g' /etc/caddy/Caddyfile

perl -pi -e 's/\$\{\{([_A-Z]+):-(.*)\}\}/$ENV{$1}||$2/ge' /app/frontend/index.html
perl -pi -e 's/\$\{\{([_A-Z]+)\}\}/$ENV{$1}/g' /app/frontend/index.html

rm -rf /var/www/html/frontend/*
rm -rf /var/www/html/frontend/.* 2>/dev/null || true

cp -a /app/frontend /var/www/html/

exec "$@"
