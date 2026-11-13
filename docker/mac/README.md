# Mac Docker deployment

The production bot appears in Docker Desktop under the `iridium-bot` Compose group. It uses the external Docker volume `iridium-bot-production-data` mounted at `/bot`. The active database is `/bot/app/database.sqlite` inside the container. The volume persists if the container is recreated or removed.

Production configuration is mounted read-only from `runtime/production/secrets/`. The stopped Synology container and `runtime/production/synology-cutover-backup.sqlite` retain the database as it was at cutover; neither includes subsequent Mac-side changes.

From the project root:

```sh
docker compose --env-file /dev/null -f docker/mac/compose.yaml ps
docker compose --env-file /dev/null -f docker/mac/compose.yaml logs --tail 100
docker compose --env-file /dev/null -f docker/mac/compose.yaml restart
```

The startup script sets the volume checkout's `origin` to the `BOT_REPOSITORY` configured in Compose (`https://github.com/triesmon/IRCON-Bot.git`), resets the checkout, pulls `master`, installs dependencies, builds, runs migrations, and starts the bot. The Discord update command restarts this process. Local uncommitted changes in the project checkout are not deployed by it.

After changing the startup script, rebuild and recreate the service:

```sh
docker compose --env-file /dev/null -f docker/mac/compose.yaml build
docker compose --env-file /dev/null -f docker/mac/compose.yaml up -d --no-build
```

If only `BOT_REPOSITORY` changes in Compose, run just the `up -d --no-build` command to recreate the container with the new URL. Ordinary code updates need only a restart.

Docker Desktop must be running and the Mac must remain awake for the bot to be available. Do not restart the old Synology bot alongside the Mac bot, or use its old database as a rollback without accounting for writes since cutover.
