#!/bin/bash
# Use this to list all users to get the DID if you want to delete someone
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
source "${SCRIPT_DIR}/../../.env"
echo Listing accounts

DIDS=""
CURSOR=""

while true; do
  URL="https://${PDS_DOMAIN_NAME}/xrpc/com.atproto.sync.listRepos?limit=1000"
  if [[ -n "${CURSOR}" ]]; then
    URL="${URL}&cursor=${CURSOR}"
  fi

  RESPONSE="$(curl \
    --fail \
    --silent \
    --show-error \
    --user "admin:${PDS_ADMIN_PASSWORD}" \
    --header "Content-Type: application/json" \
    "${URL}")"

  PAGE_DIDS="$(echo "${RESPONSE}" | jq --raw-output '.repos[].did')"
  if [[ -n "${PAGE_DIDS}" ]]; then
    DIDS="${DIDS}${PAGE_DIDS}
"
  fi

  CURSOR="$(echo "${RESPONSE}" | jq --raw-output '.cursor // empty')"

  if [[ -z "${CURSOR}" ]]; then
    break
  fi
done

OUTPUT='[{"handle":"Handle","email":"Email","did":"DID"}'
for did in ${DIDS}; do
  ITEM="$(curl \
    --fail \
    --silent \
    --show-error \
    --user "admin:${PDS_ADMIN_PASSWORD}" \
    --header "Content-Type: application/json" \
    "https://${PDS_DOMAIN_NAME}/xrpc/com.atproto.admin.getAccountInfo?did=${did}"
  )"
  OUTPUT="${OUTPUT},${ITEM}"
done
OUTPUT="${OUTPUT}]"
echo "${OUTPUT}" | jq --raw-output '.[] | [.handle, .email, .did] | @tsv' | column --table