set -e

OVERRIDES_FOLDER="${1:-./overrides}"
HASH_TABLE_FILE="${2:-./ngsw.json}"

if [ ! -f $HASH_TABLE_FILE ]; then
  echo "$HASH_TABLE_FILE file not found. aborting process"
  exit 0
fi

if [ ! -d $OVERRIDES_FOLDER ]; then
  echo "$OVERRIDES_FOLDER directory not found. aborting process"
  exit 0
fi

# tmp file to do rewrites to
tmp_file=$(mktemp)
cp "$HASH_TABLE_FILE" "$tmp_file"

updated=0
missing=0

find "$OVERRIDES_FOLDER" -type f | while IFS= read -r file; do
  hash=$(sha1sum "$file" | awk '{ print $1 }')
  relative_file="${file#$OVERRIDES_FOLDER}"
  echo "found file: $relative_file with hash $hash"
  if jq -e --arg key "$relative_file" '.hashTable | has($key)' "$tmp_file" >/dev/null; then
    jq --arg key "$relative_file" --arg hash "$hash" '.hashTable[$key] = $hash' "$tmp_file" > "${tmp_file}.new"
    mv "${tmp_file}.new" "$tmp_file"
    echo "Updated: $relative_file -> $hash"
    updated=$((updated + 1))
  else
    echo "Warning: $relative_file not found in hashTable, skipping"
    missing=$((missing + 1))
  fi
done

mv "$tmp_file" "$HASH_TABLE_FILE"
rm -f "$tmp_file"
rm -f "${tmp_file}.new"

# directory to copy overriden files to
copy_target=$(dirname "$HASH_TABLE_FILE")

# once hashes have been replaced, copy the overrides to the original folder
cp -af "$OVERRIDES_FOLDER"/* "$copy_target"

echo "Done! updated $HASH_TABLE_FILE with the new hashes"
