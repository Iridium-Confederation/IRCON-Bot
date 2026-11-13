#!/bin/sh 

set -e

BOT_REPOSITORY=${BOT_REPOSITORY:-https://github.com/Iridium-Confederation/IRCON-Bot.git}

mkdir -p /bot/app
cd /bot/app

# Clone if empty
if [ -z "$(ls -A /bot/app)" ]; then
  echo "Checking out code."
  git clone "$BOT_REPOSITORY" .
  ln -s /etc/botconfig/botconfig.json botconfig.json
  ln -s /etc/botconfig/admins.json admins.json
  echo "Successfully pulled source."
fi

git remote set-url origin "$BOT_REPOSITORY"
git reset --hard
git checkout master
git pull
npm install 
npm run build
npm run start
