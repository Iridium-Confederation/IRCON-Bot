#!/bin/sh 

set -e
git reset --hard
git pull
npm install 
npm run build
npm run start
