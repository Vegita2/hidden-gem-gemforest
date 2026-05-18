#!/usr/bin/env bash
read PORT <port
exec 2>stderr
exec socat - TCP-LISTEN:${PORT},reuseaddr
