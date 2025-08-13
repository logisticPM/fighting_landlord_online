FROM node:20-alpine
WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev=false

# Copy source and build
COPY . .
RUN npm run build

# Fly.io will route external traffic to this port; Express/Socket.IO reads PORT
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]


