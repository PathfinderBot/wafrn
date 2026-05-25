#!/bin/sh
set -e

FRONTEND_TARGET_PATH="${FRONTEND_TARGET_PATH:-/var/www/html/frontend}"
FRONTEND_RUNTIME_OVERRIDES_PATH="${FRONTEND_RUNTIME_OVERRIDES_PATH:-/var/www/html/frontend-overrides}"

apply_env_placeholders() {
  file="$1"

  if [ -f "$file" ]; then
    perl -pi -e 's/\$\{\{([_A-Z]+):-(.*)\}\}/$ENV{$1}||$2/ge' "$file"
    perl -pi -e 's/\$\{\{([_A-Z]+)\}\}/$ENV{$1}/g' "$file"
  fi
}

refresh_ngsw_hashes() {
  overrides_path="${FRONTEND_RUNTIME_OVERRIDES_PATH%/}"

  if [ ! -f "$FRONTEND_TARGET_PATH/ngsw.json" ] || [ ! -d "$overrides_path" ]; then
    return
  fi

  find "$overrides_path" -type f | while IFS= read -r override_file; do
    relative_path="/${override_file#"$overrides_path"/}"
    update_ngsw_hash "$relative_path"
  done
}

update_ngsw_hash() {
  relative_path="$1"
  target_file="$FRONTEND_TARGET_PATH$relative_path"

  if [ -f "$FRONTEND_TARGET_PATH/ngsw.json" ] && [ -f "$target_file" ]; then
    file_hash="$(sha1sum "$target_file" | awk '{ print $1 }')"
    MATCH_PATH="$relative_path" FILE_HASH="$file_hash" perl -0pi -e '
      BEGIN {
        $path = quotemeta($ENV{"MATCH_PATH"});
        $hash = $ENV{"FILE_HASH"};
      }
      s/("$path"\s*:\s*")[0-9a-f]+(")/$1$hash$2/g;
    ' "$FRONTEND_TARGET_PATH/ngsw.json"
  fi
}

perl -pi -e 's/NGSW_([_A-Z]+)/$ENV{$1}/g' /app/frontend/ngsw.json

mkdir -p "$FRONTEND_TARGET_PATH"
find "$FRONTEND_TARGET_PATH" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

cp -a /app/frontend/. "$FRONTEND_TARGET_PATH/"

if [ -d "$FRONTEND_RUNTIME_OVERRIDES_PATH" ]; then
  cp -a "$FRONTEND_RUNTIME_OVERRIDES_PATH"/. "$FRONTEND_TARGET_PATH/"
fi

apply_env_placeholders "$FRONTEND_TARGET_PATH/index.html"
apply_env_placeholders "$FRONTEND_TARGET_PATH/manifest.webmanifest"
update_ngsw_hash "/index.html"
update_ngsw_hash "/manifest.webmanifest"
refresh_ngsw_hashes

exec "$@"
