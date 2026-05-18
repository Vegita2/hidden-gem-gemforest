#!/usr/bin/env bash

set -u
set -e

shopt -s nullglob
shopt -s extglob

WEB_DIR=${1?missing webdir}
TEMPLATE="/opt/sparring/template.html"

SID="$(basename "${WEB_DIR}")"

DATE="$(LC_TIME="de_AT.UTF-8" date -d "$(stat -c%w "${WEB_DIR}")")"

read SEED <"${WEB_DIR}/seed"

mapfile -t  BOT <"${WEB_DIR}/bots"

RECORDING=("${WEB_DIR}"/!(*-poster).json.gz)


echo "Generate HTML site ..."
sed -e "s/__SID__/${SID}/g" \
    -e "s/__DATE__/${DATE}/g" \
    -e "s/__SEED__/${SEED}/g" \
    -e "s/__BOT_0__/${BOT[0]}/g" \
    -e "s/__BOT_1__/${BOT[1]}/g" \
    -e "s/__RECORDING__/$(basename ${RECORDING[0]})/g" \
    "${TEMPLATE}" > "${WEB_DIR}/index.html"


