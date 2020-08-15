# FleetBot

FleetBot is a helpful fleet management tool for your Star Citizen Org. Import and manage your personal fleet from the RSI website. Easily find out who owns
what ships in your org. Even get the total UEC value of your ships. 

## Usage (!help)

Looking for the exact name of your ship? See: https://fleetyards.net/ships/

!add <ship>
     
     Add a ship to your fleet.
     
!remove {ship|-all}

     Remove ships from your fleet.
     
!search <ship>
     
     List all owners of a certain ship.
     
!inventory [username]

     List all ships a certain user owns. Leave blank for your own
    
!fleetview {user|-org}

     Generate a fleetview.json file for the org or a user.
     
!import

     Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.
     
!stats [ship] 

     Display org fleet statistics or show detailed info about a single ship.
     
  
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
