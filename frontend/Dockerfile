FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
ENV VITE_API_URL=/api
RUN npm run build

FROM nginx:alpine

# 자체 서명 인증서 생성
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/certs && \
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout /etc/nginx/certs/key.pem \
      -out /etc/nginx/certs/cert.pem \
      -days 365 \
      -subj "/CN=smartfarm" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:175.206.245.234" && \
    apk del openssl

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
