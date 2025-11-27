# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files to install serve
COPY package*.json ./

# Install only serve (production dependency)
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Expose port (Cloud Run will set PORT env var)
EXPOSE 8080

# Start server on the port provided by Cloud Run, binding to 0.0.0.0
CMD ["sh", "-c", "npx serve -s dist -l 0.0.0.0:${PORT:-8080}"]

