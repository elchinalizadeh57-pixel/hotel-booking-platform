FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/hotel.db
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "--no-warnings", "server/index.js"]
