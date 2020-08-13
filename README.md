# IRCON-Bot

## Config

Create a file in the project root called `botconfig.json`.

## Dependencies

[Python](https://www.python.org/) is needed to automatically fetch the sqlite binaries.

```
npm install
```

## Compile

```
npm run build
```

## Run

```
npm run start
```

## Install (docker)
Requires [docker](https://docs.docker.com/get-docker/) and [docker compose](https://docs.docker.com/compose/install/) 
```
cd docker && docker-compose build && docker-compose up -d
```

## Install (systemctl)

Edit ircon-bot.service and change WorkingDirectory to reflect the directory you cloned the bot

```
useradd --system --no-create-home discord
visudo
```

Add to end:

```
Cmnd_Alias DISCORD_CMNDS = /bin/systemctl start ircon-bot, /bin/systemctl stop ircon-bot, /bin/systemctl restart ircon-bot
%discord ALL=(ALL) NOPASSWD: DISCORD_CMNDS
```

type `:wq!` to exit visudo

```
./install.sh
```
