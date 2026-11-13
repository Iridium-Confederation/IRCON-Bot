# Mac Docker deployment

The production bot appears in Docker Desktop under the `iridium-bot` Compose group. It uses the external Docker volume `iridium-bot-production-data` mounted at `/bot`. The active database is `/bot/app/database.sqlite` inside the container. The volume persists if the container is recreated or removed.

Production configuration is mounted read-only from `runtime/production/secrets/`. The stopped Synology container and `runtime/production/synology-cutover-backup.sqlite` retain the database as it was at cutover; neither includes subsequent Mac-side changes.

From the project root:

```sh
docker compose --env-file /dev/null -f docker/mac/compose.yaml ps
docker compose --env-file /dev/null -f docker/mac/compose.yaml logs --tail 100
docker compose --env-file /dev/null -f docker/mac/compose.yaml restart
```

The existing startup script resets the volume's checkout, pulls `master`, installs dependencies, builds, runs migrations, and starts the bot. The Discord update command restarts this process. Local uncommitted changes in the project checkout are not deployed by it.

Docker Desktop must be running and the Mac must remain awake for the bot to be available. Do not restart the old Synology bot alongside the Mac bot, or use its old database as a rollback without accounting for writes since cutover.
