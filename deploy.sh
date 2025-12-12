#!/bin/bash
SERVER_IP="8.217.236.183"

echo "📦 Packaging project..."
# Clean previous builds to save space
rm -rf .next node_modules
# Zip the project
zip -r project.zip . -x ".git/*" ".next/*" "node_modules/*" "dist-electron/*" "deploy.sh" "server_setup.sh" "project.zip"

echo "🚀 Uploading files to $SERVER_IP..."
echo "⚠️  PLEASE NOTE: You will be asked for your server password twice."
echo "1. For uploading files"
echo "2. For executing the script"
echo "----------------------------------------------------------------"

# Upload both the zip and the setup script
scp project.zip server_setup.sh root@$SERVER_IP:/root/

echo "----------------------------------------------------------------"
echo "🔧 Executing deployment script on server..."
ssh root@$SERVER_IP "bash /root/server_setup.sh"

echo "----------------------------------------------------------------"
echo "🎉 Done! Don't forget to configure Nginx in Baota Panel if you haven't already."
