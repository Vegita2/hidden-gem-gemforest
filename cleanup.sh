#!/usr/bin/env bash

find /tmp/sparring/ -mindepth 1 -maxdepth 1 -type d -mmin +60 -exec rm -rf {} \;
