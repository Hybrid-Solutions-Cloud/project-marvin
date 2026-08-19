FROM node:20-alpine

WORKDIR /app

COPY scripts ./scripts
COPY operator-ui ./operator-ui
COPY solutions ./solutions
COPY package.json ./package.json

RUN node scripts/build-marvin-portal.mjs

RUN mkdir -p /app/profiles /app/artifacts /app/.marvin

EXPOSE 3001

ENV MARVIN_UI_PUBLIC_DIR=/app/operator-ui/dist

CMD ["node", "scripts/marvin-onboard-ui.mjs"]
