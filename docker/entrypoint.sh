#!/usr/bin/env bash
set -e

# Runtime dirs (recreate ownership in case of fresh volumes)
mkdir -p /tmp/sparring /var/www/sparring
chown -R www-data:www-data /tmp/sparring /var/www/sparring

# Default seed if cron-supplied one isn't present
if [[ ! -s /tmp/sparring.seed ]]; then
    date +%s > /tmp/sparring.seed
fi

# Rebuild the landing page (index.html) from the mounted repo
if [[ -f /opt/sparring/README.md && -f /opt/sparring/index.tmpl ]]; then
    HTM=$(mktemp)
    if command -v markdown-it >/dev/null 2>&1; then
        markdown-it /opt/sparring/README.md > "$HTM" 2>/dev/null || cp /opt/sparring/README.md "$HTM"
    else
        cp /opt/sparring/README.md "$HTM"
    fi
    sed -e "/__CONTENT__/{r $HTM" -e 'd;}' /opt/sparring/index.tmpl > /var/www/sparring/index.html
    rm -f "$HTM"
fi

# Static assets (JS libs, CSS, images) shipped with the repo
if [[ -d /opt/sparring/static ]]; then
    mkdir -p /var/www/sparring/static
    cp -r /opt/sparring/static/. /var/www/sparring/static/
fi

# Re-render the (possibly empty) match index
[[ -x /opt/sparring/genindex.sh ]] && /opt/sparring/genindex.sh || true

# Files created above were created by root; atd jobs run as www-data and must
# be able to overwrite them.
chown -R www-data:www-data /var/www/sparring

# atd
atd

# fcgiwrap
rm -f /run/fcgiwrap.sock
spawn-fcgi -s /run/fcgiwrap.sock -u www-data -g www-data -- /usr/sbin/fcgiwrap
chmod 660 /run/fcgiwrap.sock

# Helpful banner
cat <<EOF
==============================================================
gemforest local dev server
  Broker:   http://localhost:43500/join
  Site:     http://localhost/
  Matches:  http://localhost/matches/

To run a client against this server:
  REMOTE_HOST=localhost BOT_DIR=/path/to/bot ./client.sh
==============================================================
EOF

exec nginx -g 'daemon off;'
