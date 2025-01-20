# Use official Node.js 20 Alpine image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install npm dependencies
RUN npm install

# Copy source files
COPY . .

# Build the project
RUN npm run build

# Expose port (if needed)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
