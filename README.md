# 🌲 Glitzersteine Waldgeplänkel 💎

Willkommen im Glitzersteine-Wald, einem Live-Sparring Service!

## Quickstart


```bash
# benoetigte Pakete
sudo apt install curl socat pv

# Sparring Client Skript herunterladen
curl -O http://gemforest.servegame.com/client.sh

# ausfuehrbar machen
chmod a+x client.sh

# Pfad zu eigenem Bot setzen
export BOT_DIR=/pfad/zu/deinem/bot
```

Wenn du nun jemanden herausfordern möchtest, führe das Skript aus:
```bash
./client.sh
```

In der Ausgabe findest du eine 4-stellige **Sparring-ID**.
Diese teilst du dem/der Herausgeforderten mit, welche dann das Skript
mit der Sparring-ID als Argument ausführt:
```bash
./client.sh SID
```

Dadurch startet die Sparring-Simulation!

Anschließend wird ein Report generiert und ihr könnt euch die Aufzeichnung
ansehen.

Viel Spaß! 🦉

---

* [Sparring Client](client.sh)
* [Liste der letzten Matches](matches/)

