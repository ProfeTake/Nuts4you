# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
# VITE_API_URL debe estar disponible en build: Vite la hornea en el bundle.
# Railway pasa las variables del servicio como --build-arg automáticamente.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY .npmrc package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Serve with a lightweight static server
FROM node:22-alpine
RUN npm install -g serve@14
WORKDIR /app
COPY --from=builder /app/dist ./dist
# Railway inyecta la variable PORT en runtime; serve la usa, con 3000 de respaldo.
# Forma shell para que ${PORT} se expanda dentro del contenedor al arrancar.
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
