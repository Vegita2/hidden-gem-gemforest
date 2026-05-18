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

# Schleife über alle Unterordner/Sessions (falls du pro Match einen Ordner hast)
# Oder alternativ über die generierten HTML-Dateien
for match_dir in "${WEB_DIR}"/*; do
    if [ -d "${match_dir}" ]; then
        SESSION_ID=$(basename "${match_dir}")

        # Holt das Erstellungsdatum des Matches im AT-Format (z.B. 17. Mai 2026)
        MATCH_DATE=$(date -r "${match_dir}" "+%-d. %B %Y")

        # Zeile zum Index hinzufügen
        echo "            <li><a href=\"${SESSION_ID}/index.html\">Session ${SESSION_ID}</a> <span class=\"date\">${MATCH_DATE}</span></li>" >> "${INDEX_FILE}"
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



