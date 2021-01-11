#!/bin/sh 

set -e

mkdir -p /bot/app
cd /bot/app

# Clone if empty
if [ -z "$(ls -A /bot/app)" ]; then
  echo "Checking out code."
  git clone https://github.com/Iridium-Confederation/IRCON-Bot.git .
  ln -s /etc/botconfig/botconfig.json botconfig.json
  ln -s /etc/botconfig/admins.json admins.json
  echo "Successfully pulled source."
fi

git checkout master
git reset --hard
git pull
npm install 
npm run build
npm run start
