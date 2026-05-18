#!/usr/bin/env bash

set -u
set -e

: ${BOT_DIR=../../pathowlogica}
: ${BOT_ARGS=}

REMOTE_HOST=gemforest.servegame.com


IFS=":" ; read STATUS REST <<<$(curl -s --fail-with-body -X POST \
     --data-binary @${BOT_DIR}/bot.yaml \
     "http://${REMOTE_HOST}:43500/join?sid=${1-}&seed=${2-}")


if [[ $STATUS != "SUCCESS"  ]]
then
    echo -e "Fehler!\n${REST}"
    exit 1
fi

read SID PORT SEED INIT <<<"$REST"

if [[ $INIT = yes ]]
then
    echo "Session erzeugt!
Session-ID: $SID
Der andere Client muss innerhalb von 4 Minuten die Session joinen!
Gespielt wird Seed: $SEED"
else
    echo "Session $SID gejoined!
Gespielt wird Seed: $SEED"
fi


cd "${BOT_DIR}"

socat \
     SYSTEM:"./start.sh ${BOT_ARGS} 2>stderr.log | sed -u 's/[[:space:]].*//' | pv -l -N Ticks:" \
     TCP:${REMOTE_HOST}:${PORT},retry=240,interval=5


echo "Falls alles gut ging:
Report:
https://${REMOTE_HOST}/matches/${SID}/

Aufzeichnung:
http://${REMOTE_HOST}/matches/${SID}/recording-${SEED}.json.gz
"
