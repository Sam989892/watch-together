# Sync server — the only piece that gets hosted. Tiny: Node + ws, no build step.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY index.js ./
# Hosts inject PORT; the server reads it and serves HTTP health + WS on it.
EXPOSE 8787
CMD ["npm", "start"]
