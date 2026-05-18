#!/usr/bin/env bash

set -u
set -e

shopt -s nullglob

TMP_DIR=${1?missing argument (tmpdir)}
SID="$(basename "${TMP_DIR}")"

WEB_DIR="/var/www/sparring/${SID}"

mkdir -p "${WEB_DIR}"

# recordings
for gzfile in "${TMP_DIR}"/*.json.gz
do
    mv "$gzfile" "${WEB_DIR}/"
done

# seed
cp "${TMP_DIR}/seed" "${WEB_DIR}/"

# bots
while read _ name
do
    read _ emoji
    echo $name $emoji
done < <(cat "${TMP_DIR}"/bot_*/bot.yaml) >"${WEB_DIR}/bots"


### implicit data below

# date
# LC_TIME="de_AT.UTF-8" date -d "$(stat -c%w .)"
#LC_TIME="de_AT.UTF-8" date >"${WEB_DIR}/date"
#date '+%d.%m.%Y %H:%M' >"${WEB_DIR}/date"

# session-id
#echo "${SID}" >"${WEB_DIR}/sid"

/opt/sparring/genreport.sh "${WEB_DIR}"

