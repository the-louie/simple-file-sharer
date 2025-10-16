# Use Node.js 20 Alpine as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application source
COPY index.js ./
COPY static ./static

# Create upload and data directories
RUN mkdir -p uploads/pending /data

# Expose application port
EXPOSE 9898

# Start application
CMD ["npm", "start"]

