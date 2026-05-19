#!/usr/bin/env bash

set -u
set -e

shopt -s nullglob

TMP_DIR=${1?missing argument (tmpdir)}
SID="$(basename "${TMP_DIR}")"

WEB_DIR="/var/www/sparring/${SID}"

mkdir -p "${WEB_DIR}"

# seed
jq -r '.[0].seed' \
    "${TMP_DIR}/profile.json" >"${WEB_DIR}/seed"

# bots
jq -r '.[0,1]|"\(.emoji) \(.name)"' \
    "${TMP_DIR}/profile.json" >"${WEB_DIR}/bots"

# score
jq -r '[.[0,1].total_score] | join(" : ")' \
    "${TMP_DIR}/profile.json" >"${WEB_DIR}/score"

# recordings
for gzfile in "${TMP_DIR}"/recording-*.json.gz
do
    mv "$gzfile" "${WEB_DIR}/"
done

### implicit data below

# date
#LC_TIME="de_AT.UTF-8" date >"${WEB_DIR}/date"
#date '+%d.%m.%Y %H:%M' >"${WEB_DIR}/date"

# session-id
#echo "${SID}" >"${WEB_DIR}/sid"

/opt/sparring/genreport.sh "${WEB_DIR}"
/opt/sparring/genindex.sh

