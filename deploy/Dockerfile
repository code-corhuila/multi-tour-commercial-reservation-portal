FROM node:22-alpine AS build
WORKDIR /app
# npm ci builds from the lockfile; npm install would resolve versions at build time.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/commercial-reservation-portal/browser /usr/share/nginx/html
