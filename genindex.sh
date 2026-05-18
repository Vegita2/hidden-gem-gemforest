#!/usr/bin/env bash

set -u
set -e

shopt -s nullglob

WEB_DIR="/var/www/sparring"
INDEX_FILE="${WEB_DIR}/index.html"

# Erzwinge die österreichische Locale für das Datumsformat in der Liste
export LC_TIME="de_AT.UTF-8"

# Start der minimalen Index-Seite
cat <<EOF > "${INDEX_FILE}"
<!DOCTYPE html>
<html lang="de-AT">
<head>
    <meta charset="UTF-8">
    <title>Übersicht aller Sparring-Matches</title>
    <style>
        body { font-family: sans-serif; background-color: #121212; color: #fff; padding: 30px; }
        .container { max-width: 800px; margin: 0 auto; background-color: #1e1e1e; padding: 20px; border-radius: 6px; border: 1px solid #333; }
        h1 { color: #00ffcc; font-size: 22px; }
        ul { list-style: none; padding: 0; }
        li { padding: 10px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; }
        a { color: #00ffcc; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .date { color: #888; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Verfügbare Match-Aufzeichnungen</h1>
        <ul>
EOF

mapfile -t MATCH_DIRS < <(ls -dt "${WEB_DIR}"/*/)

# Schleife über alle Unterordner/Sessions (falls du pro Match einen Ordner hast)
# Oder alternativ über die generierten HTML-Dateien
for match_dir in "${MATCH_DIRS[@]}"
do
    if [[ -d "${match_dir}" ]]; then
        SID=$(basename "${match_dir}")
        MATCH_DATE=$(date -r "${match_dir}")
        read SEED <"${match_dir}/seed"
        mapfile -t BOT <"${match_dir}/bots"

        # Zeile zum Index hinzufügen
        echo "            <li><a href=\"${SID}/\">${SID}</a><span>${BOT[0]} vs. ${BOT[1]}</span><span>${SEED}</span><span class=\"date\">${MATCH_DATE}</span></li>" >> "${INDEX_FILE}"
    fi
done

# HTML-Ende schreiben
cat <<EOF >> "${INDEX_FILE}"
        </ul>
    </div>
</body>
</html>
EOF

echo "Index erfolgreich in de-AT generiert!"



