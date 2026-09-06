FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/server ./server
COPY --from=build /app/src/admin/validate.js ./src/admin/validate.js
COPY --from=build /app/src/data/content.json ./src/data/content.json

EXPOSE 4173

CMD ["npm", "run", "start"]
