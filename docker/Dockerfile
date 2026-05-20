FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        fcgiwrap \
        spawn-fcgi \
        at \
        ruby \
        ruby-dev \
        bundler \
        build-essential \
        socat \
        curl \
        jq \
        pv \
        bash \
        git \
        ca-certificates \
        locales \
        iproute2 \
        procps \
        nodejs \
        npm \
    && rm -rf /var/lib/apt/lists/*

# de_AT.UTF-8 locale (used by genreport.sh / genindex.sh)
RUN sed -i 's/^# *\(de_AT.UTF-8 UTF-8\)/\1/' /etc/locale.gen && \
    locale-gen de_AT.UTF-8 && \
    update-locale

# markdown-it CLI for index.html generation
RUN npm install -g markdown-it markdown-it-cli 2>/dev/null || \
    npm install -g markdown-it-cli || true

# Hidden-gems runner
RUN git clone --depth=1 https://github.com/specht/hidden-gems.git /opt/hidden-gems && \
    cd /opt/hidden-gems && \
    if [ -f Gemfile ]; then bundle install || true; fi

# Allow www-data to use `at`
RUN if [ -f /etc/at.deny ]; then sed -i '/^www-data$/d' /etc/at.deny; fi && \
    touch /etc/at.allow && \
    echo www-data > /etc/at.allow && \
    echo root >> /etc/at.allow && \
    chown root:daemon /etc/at.allow && \
    chmod 640 /etc/at.allow

# Working dirs
RUN mkdir -p /tmp/sparring /var/www/sparring /run/sparring && \
    chown -R www-data:www-data /tmp/sparring /var/www/sparring /run/sparring

# nginx site
COPY nginx.conf /etc/nginx/sites-available/sparring
RUN rm -f /etc/nginx/sites-enabled/default && \
    ln -sf /etc/nginx/sites-available/sparring /etc/nginx/sites-enabled/sparring

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 43500 43501-43599

ENTRYPOINT ["/entrypoint.sh"]
