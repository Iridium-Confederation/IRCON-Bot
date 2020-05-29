#!/bin/bash
SERVICE_LOC=$(systemctl status ircon-bot | grep -Po "(?<=loaded \()[^;]+")
WORKING_DIR=$(grep -Po "(?<=WorkingDirectory=).*" $SERVICE_LOC)
cd $WORKING_DIR; git pull
npm install
npm run build
sudo systemctl restart ircon-bot