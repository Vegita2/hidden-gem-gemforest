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
            max-width: 1100px;
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

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            text-align: left;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border-color);
            width: 1%;
            white-space: nowrap;
        }

        th.spacer, td.spacer {
            width: auto;
        }

        th {
            color: rgba(226, 236, 233, 0.7);
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid var(--accent-earth);
        }

        tbody tr:hover {
            background-color: rgba(255, 255, 255, 0.02);
        }

        .id a {
            color: var(--accent-green);
            text-decoration: none;
            font-weight: bold;
            border-bottom: 1px dashed var(--accent-green);
        }

        .id a:hover {
            color: #ffffff;
            border-bottom-style: solid;
        }

        .score {
            font-family: Consolas, Monaco, monospace;
            text-align: right;
        }

        .score-left {
            font-family: Consolas, Monaco, monospace;
            text-align: left;
        }

        .winner {
            color: #ffffff;
            font-weight: bold;
        }

        .loser {
            color: rgba(226, 236, 233, 0.7);
        }

        .score-sep {
            font-family: Consolas, Monaco, monospace;
            text-align: center;
            padding-left: 4px;
            padding-right: 4px;
            color: rgba(226, 236, 233, 0.5);
        }

        .seed {
            font-family: Consolas, Monaco, monospace;
            background-color: rgba(0, 0, 0, 0.2);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 13px;
        }

        .date {
            color: rgba(226, 236, 233, 0.5);
            font-size: 14px;
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Verfügbare Match-Aufzeichnungen</h1>
        <table>
            <tbody>
EOF

# Verzeichnisse nach Zeit sortiert (Neu -> Alt) einlesen
mapfile -t MATCH_DIRS < <(ls -dt "${WEB_DIR}"/*/)

# Schleife über alle Unterordner/Sessions
for match_dir in "${MATCH_DIRS[@]}"
do
    if [[ -d "${match_dir}" ]]; then
        SID=$(basename "${match_dir}")

        # Skip non-match directories (e.g. /static for shared assets)
        [[ "${SID}" == "static" ]] && continue

        MATCH_DATE=$(date -r "${match_dir}")

        # Daten sicher auslesen
        SEED=""
        [[ -f "${match_dir}/seed" ]] && read -r SEED < "${match_dir}/seed"

        BOT=("" "")
        [[ -f "${match_dir}/bots" ]] && mapfile -t BOT < "${match_dir}/bots"

        SCORE_LINE=""
        [[ -f "${match_dir}/score" ]] && read -r SCORE_LINE < "${match_dir}/score"
        # Erwartetes Format: "scoreA : scoreB"
        SCORE_A=""
        SCORE_B=""
        if [[ -n "${SCORE_LINE}" ]]; then
            SCORE_A="${SCORE_LINE%% : *}"
            SCORE_B="${SCORE_LINE##* : }"
        fi

        # Sieger ermitteln (nur wenn beide Werte numerisch sind)
        CLASS_A=""
        CLASS_B=""
        if [[ "${SCORE_A}" =~ ^-?[0-9]+$ && "${SCORE_B}" =~ ^-?[0-9]+$ ]]; then
            if (( SCORE_A > SCORE_B )); then
                CLASS_A=" winner"
                CLASS_B=" loser"
            elif (( SCORE_B > SCORE_A )); then
                CLASS_A=" loser"
                CLASS_B=" winner"
            fi
        fi

        # Zeile formatiert zum Index hinzufügen
        cat <<ROW >> "${INDEX_FILE}"
                <tr>
                    <td class="id"><a href="${SID}/">${SID}</a></td>
                    <td class="bot1${CLASS_A}">${BOT[0]:-}</td>
                    <td class="score${CLASS_A}">${SCORE_A}</td>
                    <td class="score-sep">:</td>
                    <td class="score-left${CLASS_B}">${SCORE_B}</td>
                    <td class="bot2${CLASS_B}">${BOT[1]:-}</td>
                    <td class="spacer"></td>
                    <td><span class="seed">${SEED}</span></td>
                    <td class="date">${MATCH_DATE}</td>
                </tr>
ROW
    fi
done

# HTML-Ende schreiben
cat <<EOF >> "${INDEX_FILE}"
            </tbody>
        </table>
    </div>
</body>
</html>
EOF

echo "Index erfolgreich in de-AT generiert!"
