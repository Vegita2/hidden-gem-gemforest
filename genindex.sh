#!/usr/bin/env bash

set -u
set -e

shopt -s nullglob

WEB_DIR="/var/www/sparring"
INDEX_FILE="${WEB_DIR}/index.html"

# Erzwinge die österreichische Locale für das Datumsformat in der Liste
export LC_TIME="de_AT.UTF-8"

# Start der wald-thematisierten Index-Seite
cat <<EOF > "${INDEX_FILE}"
<!DOCTYPE html>
<html lang="de-AT">
<head>
    <meta charset="UTF-8">
    <title>Übersicht aller Sparring-Matches</title>
    <style>
        /* --- WALD-THEME FARBPALETTE --- */
        :root {
            --bg-color: #141f19;       /* Tiefes Tannengrün */
            --container-bg: #1b2a22;   /* Dunkles Moosgrün */
            --text-color: #e2ece9;     /* Sanftes Graugrün */
            --accent-green: #4ade80;   /* Frisches Maigrün */
            --accent-earth: #b45309;   /* Warmes Erd-Braun */
            --border-color: #2d4337;   /* Ast-Grau */
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            padding: 30px;
            margin: 0;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background-color: var(--container-bg);
            padding: 30px 40px;
            border-radius: 12px;
            border: 1px solid var(--border-color);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }

        h1 {
            color: #ffffff;
            font-size: 24px;
            margin-top: 0;
            border-bottom: 2px solid var(--accent-earth);
            padding-bottom: 8px;
            margin-bottom: 20px;
        }

        ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        li {
            padding: 12px 8px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 15px;
        }

        li:hover {
            background-color: rgba(255, 255, 255, 0.02);
        }

        /* --- ELEMENTE IN DER LISTE --- */
        .sid a {
            color: var(--accent-green);
            text-decoration: none;
            font-weight: bold;
            border-bottom: 1px dashed var(--accent-green);
        }

        .sid a:hover {
            color: #ffffff;
            border-bottom-style: solid;
        }

        .bots {
            flex-grow: 1;
            font-weight: 500;
        }

        .seed {
            font-family: Consolas, Monaco, monospace;
            background-color: rgba(0, 0, 0, 0.2);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 14px;
        }

        .date {
            color: rgba(226, 236, 233, 0.5);
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Verfügbare Match-Aufzeichnungen</h1>
        <ul>
EOF

# Verzeichnisse nach Zeit sortiert (Neu -> Alt) einlesen
mapfile -t MATCH_DIRS < <(ls -dt "${WEB_DIR}"/*/)

# Schleife über alle Unterordner/Sessions
for match_dir in "${MATCH_DIRS[@]}"
do
    if [[ -d "${match_dir}" ]]; then
        SID=$(basename "${match_dir}")
        MATCH_DATE=$(date -r "${match_dir}")

        # Daten sicher auslesen
        read -r SEED < "${match_dir}/seed"
        mapfile -t BOT < "${match_dir}/bots"

        # Zeile formatiert zum Index hinzufügen
        cat <<ROW >> "${INDEX_FILE}"
            <li>
                <span class="sid"><a href="${SID}/">${SID}</a></span>
                <span class="bots">${BOT[0]} vs. ${BOT[1]}</span>
                <span class="seed">${SEED}</span>
                <span class="date">${MATCH_DATE}</span>
            </li>
ROW
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

