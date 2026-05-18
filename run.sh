#!/usr/bin/env bash

set -e
set -u

#set -x

SES_DIR=$1

RUNNER=/opt/hidden-gems/runner.rb

exec 2> ${SES_DIR}/stderr
exec 1>&2

read SEED <"${SES_DIR}/seed"

echo "Running simulation ..."
# start runner
timeout 15m ruby "${RUNNER}" --seed=${SEED} \
    --timeout-scale=0 --max-tps=0 --verbose=0 \
    --no-enable-debug --no-bot-chatter \
    --ansi-log-path="${SES_DIR}/recording.json.gz" \
    ${SES_DIR}/bot_*

# TODO check for timoeout [[ $? -eq 124 ]]

echo "Move to web directory"
/opt/sparring/copy.sh "${SES_DIR}"

rm -fr "${SES_DIR}"
