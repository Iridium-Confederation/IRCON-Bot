FROM node:22.23.4-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /seed
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY docker/fleetbot-ircon/start.sh /start.sh
RUN chmod +x /start.sh
WORKDIR /bot
CMD ["/start.sh"]
