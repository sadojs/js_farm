FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine

RUN apk add --no-cache postgresql-client

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY database/migrate.sql ./database/migrate.sql
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000

CMD ["./entrypoint.sh"]
