# Dockerfile for yt-dlp microservice on Google Cloud Run
#
# This image:
# - Installs yt-dlp and dependencies (Python, ffmpeg)
# - Runs a Node.js Express server that wraps yt-dlp
# - Optimized for Cloud Run (fast cold starts, small image size)

FROM node:18-alpine

# Install system dependencies
# - python3: Required by yt-dlp
# - py3-pip: Package manager for Python
# - ffmpeg: Video/audio processing (used by yt-dlp for certain formats)
# - ca-certificates: SSL/TLS support for HTTPS downloads
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    ca-certificates

# Install yt-dlp (always get latest version)
RUN pip3 install --break-system-packages --no-cache-dir -U yt-dlp

# Verify yt-dlp installation
RUN yt-dlp --version && echo "✅ yt-dlp installed successfully"

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY index.js ./

# Cloud Run sets PORT environment variable
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check (optional, Cloud Run has built-in health checks)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the service
CMD ["node", "index.js"]
