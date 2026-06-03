# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY .npmrc package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Serve with a lightweight static server
FROM node:22-alpine
RUN npm install -g serve@14
WORKDIR /app
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
