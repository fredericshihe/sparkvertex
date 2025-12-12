#!/bin/bash
set -e

# 1. Install utilities
echo "Installing utilities..."
if ! command -v unzip &> /dev/null; then
    yum install -y unzip
fi

# 2. Prepare directory
echo "Preparing directory..."
mkdir -p /www/wwwroot/spark-vertex

# 3. Unzip
echo "Unzipping project..."
unzip -o /root/project.zip -d /www/wwwroot/spark-vertex

# 4. Go to directory
cd /www/wwwroot/spark-vertex

# 5. Install dependencies
echo "Installing dependencies..."
npm config set registry https://registry.npmmirror.com
npm install

# 6. Build
echo "Building project (this may take a while)..."
# Ensure swap is used if available (handled by user previously, hopefully)
npm run build

# 7. Start with PM2
echo "Starting application..."
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found, installing globally..."
    npm install -g pm2
fi

# Delete existing process if it exists to restart clean
pm2 delete spark-vertex || true
pm2 start npm --name "spark-vertex" -- start

# Save PM2 list
pm2 save
# Startup script (might need user interaction on some systems, but usually fine on CentOS/Alibaba)
# pm2 startup # Skipping to avoid potential interactive prompt issues

echo "✅ Deployment Success! Your app is running on port 3000."
