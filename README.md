# FleetBot

FleetBot is a helpful fleet management tool for your Star Citizen Organization. Import and manage your personal fleet from the RSI website. Easily find out who owns
what ships in your org. Even get the total UEC value of your ships. Export your personal or org fleet and visualize it in FleetView.

Designed and developed by Iridium Confederation.

Discord: https://discord.gg/Ystmtsn

RSI: https://robertsspaceindustries.com/orgs/IRCON

Development questions: https://discord.gg/Ru8WqyG

# Usage (!fb help)

Looking for the exact name of your ship? See: https://fleetyards.net/ships/

!fb add \<ship\>
     
     Add a ship to your fleet.
     
!fb remove {ship|-all}

     Remove ships from your fleet.
     
!fb search \<ship\>
     
     List all owners of a certain ship.
     
!fb inventory [username]

     List all ships a certain user owns. Leave blank for your own
    
!fb fleetview {user|-org}

     Generate a fleetview.json file for the org or a user.
     
!fb import

     Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.
     
!fb stats [ship] 

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
