# Custom Dockerfile for Supabase Edge Functions with yt-dlp
#
# Purpose: Install yt-dlp and dependencies for recipe video metadata extraction
#
# Why custom Dockerfile?
# - yt-dlp requires Python 3 and pip (not in default Deno runtime)
# - ffmpeg needed for video processing (optional, but recommended)
# - Keeps Edge Functions self-contained
#
# Build: Automatically used by Supabase when deploying functions
# Reference: https://supabase.com/docs/guides/functions/deploy
#
# Version: 2.0 (2025-10-12) - Force rebuild with latest yt-dlp

FROM denoland/deno:alpine-1.40.0

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

# Install yt-dlp via pip (always get latest version)
# - --break-system-packages: Allow pip install in system Python (Alpine-specific)
# - --no-cache-dir: Don't cache packages (reduces image size)
# - -U: Upgrade to latest version (critical for platform support)
# Build timestamp: 2025-10-12T10:35:00Z (forces cache invalidation)
RUN pip3 install --break-system-packages --no-cache-dir -U yt-dlp

# Verify installation
RUN yt-dlp --version && echo "✅ yt-dlp installed successfully"

# Set working directory (standard for Supabase Edge Functions)
WORKDIR /home/deno

# Copy function code (done automatically by Supabase CLI)
# COPY . .

# Default command (overridden by Supabase runtime)
CMD [ "deno", "run", "--allow-all", "index.ts" ]
