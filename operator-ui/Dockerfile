FROM node:20-alpine

WORKDIR /app

COPY scripts ./scripts
COPY operator-ui ./operator-ui
COPY solutions ./solutions
COPY package.json ./package.json

RUN mkdir -p /app/profiles /app/artifacts /app/.marvin

EXPOSE 3001

CMD ["node", "scripts/marvin-onboard-ui.mjs"]
