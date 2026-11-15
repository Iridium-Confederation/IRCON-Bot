# FleetBot

FleetBot is a helpful fleet management tool for your Star Citizen Organization. Import and manage your personal fleet from the RSI website. Easily find out who owns
what ships in your org. Export your personal or org fleet and visualize it in FleetView.

Designed and developed by Iridium Confederation.

Discord: https://discord.gg/Ystmtsn

RSI: https://robertsspaceindustries.com/orgs/IRCON

Development questions: https://discord.gg/Ru8WqyG

# Development

## Config

Provide the bot token through `BOT_TOKEN` in the environment or a project-root `.env` file. A project-root `botconfig.json` is also supported. Configure the administrator allowlist in `admins.json`. Keep these files out of Git.

## Dependencies

[Node.js](https://nodejs.org/) 22.9 or later is required.

[Python](https://www.python.org/) is needed to automatically fetch the sqlite binaries.

```
npm ci
```

## Compile

```
npm run build
```

## Run

```
npm run start
```

Startup applies SQLite migrations before connecting to Discord. A new database is initialized automatically; existing tables and fleet records are preserved. Startup also sends configured administrators a notification and database backup.

## Test

```sh
npm test
```

This builds the TypeScript code and runs isolated tests with fixture databases and mocked Discord interactions. It does not start a bot or require Discord credentials.

Commands are registered by the bot during startup from `src/handlers/DiscordHandlers.ts`.

## Docker utilities

See [Docker utilities](docker/README.md) for the optional development helper image.
