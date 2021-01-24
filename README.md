# FleetBot

FleetBot is a helpful fleet management tool for your Star Citizen Organization. Import and manage your personal fleet from the RSI website. Easily find out who owns
what ships in your org. Even get the total UEC value of your ships. Export your personal or org fleet and visualize it in FleetView.

Designed and developed by Iridium Confederation.

Discord: https://discord.gg/Ystmtsn

RSI: https://robertsspaceindustries.com/orgs/IRCON

Development questions: https://discord.gg/Ru8WqyG

# Usage (!fb help)

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
