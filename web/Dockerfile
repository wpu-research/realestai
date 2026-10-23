FROM node:20-slim AS derle
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=derle /app/node_modules ./node_modules
COPY --from=derle /app/dist ./dist
COPY package.json ./
COPY public ./public
COPY db ./db
COPY data ./data
# Railway volume /data'ya bağlanır; ilan fotoğrafları ve sözleşmeler orada kalıcıdır.
ENV UPLOAD_DIZIN=/data/uploads
EXPOSE 3000
CMD ["node", "dist/server.js"]
