#!/bin/sh
set -e

# replace all environment variables in the files in the frontend volume before starting caddy
perl -pi -e 's/NGSW_([_A-Z]+)/$ENV{$1}/g' /var/www/html/frontend/ngsw.json

perl -pi -e 's/\$\{\{([_A-Z]+):-(.*)\}\}/$ENV{$1}||$2/ge' /var/www/html/frontend/index.html
perl -pi -e 's/\$\{\{([_A-Z]+)\}\}/$ENV{$1}/g' /var/www/html/frontend/index.html

perl -pi -e 's/\$\{\{([_A-Z]+):-(.*)\}\}/$ENV{$1}||$2/ge' /var/www/html/frontend/manifest.webmanifest
perl -pi -e 's/\$\{\{([_A-Z]+)\}\}/$ENV{$1}/g' /var/www/html/frontend/manifest.webmanifest

# TEMPORARY OFF
#cp -r /var/www/html/frontend/ /var/www/html/frontend_output
#if [ -d /overrides ] && [ "$(find /overrides -mindepth 1 -maxdepth 1 | head -n 1)" ]; then
#  /overrides.sh /overrides /var/www/html/frontend/ngsw.json
#else
#  echo "WARNING: OVERRIDES FOLDER MISSING"
#fi

exec "$@"
