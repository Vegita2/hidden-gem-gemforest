#!/bin/bash

curl -s https://hiddengems.gymnasiumsteglitz.de/scrims |\
    grep -A1 '<h3>Seed</h3>' |\
    sed -n 's/.*<span[^>]*>\([^<]*\)<\/span>.*/\1/p'

