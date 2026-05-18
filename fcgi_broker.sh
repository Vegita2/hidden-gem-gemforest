#!/usr/bin/env bash

set -u
set -e

PORT_LOWER=43501
PORT_UPPER=43599

PORT_LOCK=/tmp/sparring.port_lock


# Parse query string arguments
declare -A ARGS
if [[ -n "$QUERY_STRING" ]]
then
    while IFS='=' read -r key value
    do
        if [[ "$key" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]
        then
            value=$(echo -e "${value//+/ /;s/%/\\x/g}")
            ARGS["$key"]="$value"
        fi
    done <<< "$(echo "$QUERY_STRING" | tr '&' '\n')"
fi


function find_port
{
    local cnt=$(( PORT_UPPER - PORT_LOWER + 1 ))
    local offset=$(( RANDOM % cnt ))
    local port=$(( PORT_LOWER + offset ))
    local tries=0

    exec 9<>"${PORT_LOCK}"
    flock -x 9
    cat /tmp/sparring/*/*/port >"${PORT_LOCK}"

    while grep -q ":${port} " "${PORT_LOCK}"
    do
        ((port++))
        ((tries++))

        if (( port > PORT_UPPER )); then
            port=$PORT_LOWER
        fi
        if (( tries > cnt )); then
            send_error "503 Service Unavailable" "Kein freier Port"
        fi
    done
    PORT=$port
    echo $PORT
}



function send_response
{
    cat >/dev/null
    echo "Status: $1"
    shift
    echo "Content-Type: text/plain"
    echo # KEEP!
    (IFS=:; echo "$*")
    exit 0
}

function send_ok
{
    send_response "200 OK" "SUCCESS" "$@"
}

# 400 Bad Request
# 404 Not Found
# 405 Method Not Allowed
function send_error
{
    local code="$1" ; shift
    send_response "$code" "ERROR" "$@"
}

if [[ $REQUEST_METHOD != "POST" ]]
then
    send_error "405 Method Not Allowed" "Nur POST erlaubt"
fi

if [[ -z $CONTENT_LENGTH || $CONTENT_LENGTH -le 0 ]]; then
    send_error "400 Bad Request" "bot.yaml fehlt!"
fi

# sparring parent dir
[[ -d /tmp/sparring ]] || mkdir /tmp/sparring


LAST=no
INIT=no

if [[ -z ${ARGS[sid]-} ]]
then
    # new session
    SES_DIR=$(mktemp -d /tmp/sparring/XXXX)
    SID=${SES_DIR#/tmp/sparring/}

    if [[ -n ${ARGS[seed]-} ]]; then
        echo "${ARGS[seed]}"
    else
        cat /tmp/sparring.seed
    fi >"${SES_DIR}/seed"

    BOT_DIR="${SES_DIR}/bot_0"
    INIT=yes
fi

# does it describe an existing session?
if [[ -n ${ARGS[sid]-} ]]
then
    SID="${ARGS[sid]}"
    SES_DIR="/tmp/sparring/${SID}"
    [[ -d ${SES_DIR} ]] || send_error "400 Bad Request" "Session-ID ungueltig"

    # TODO lock, get the next dir, evaluate last
    BOT_DIR="${SES_DIR}/bot_1"
    [[ ! -d ${BOT_DIR} ]] || send_error "400 Bad Request" "Schon gejoined?"
    LAST=yes
fi

read SEED <"${SES_DIR}/seed"


mkdir "${BOT_DIR}"
head -c "$CONTENT_LENGTH" >"${BOT_DIR}/bot.yaml"
ln -s "/opt/sparring/start.sh" "${BOT_DIR}"

find_port >"${BOT_DIR}/port"

if [[ $LAST = yes ]]
then
    echo "/opt/sparring/run.sh '${SES_DIR}'" | at now 2>/dev/null
fi

# maybe we need a different response for
#if [[ $INIT = yes ]]; then ...

send_ok $SID $PORT $SEED $INIT


#send_ok "${ARGS[sid]:-keine id angegeben}" "${ARGS[seed]:-no seed}"
