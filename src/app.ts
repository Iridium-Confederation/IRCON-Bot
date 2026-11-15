import { ShipDao } from "./models/Ships";
import { refreshShipList } from "./utils";
import * as discordHandlers from "./handlers/DiscordHandlers";
import { initializeLogging, logger } from "./logging/logging";

require("fs");

// Initialize logging
initializeLogging();
logger.info("Starting Iridium FleetBot...");

// Initialize DB
ShipDao.initialize();

async function startBot() {
  // Do not connect to Discord until there is a valid initial catalog.
  await refreshShipList();

  discordHandlers.registerInteractionHandlers();
  discordHandlers.registerRateLimit();
  discordHandlers.registerOnReady();
  discordHandlers.registerOnMessage();
  discordHandlers.registerOnUserUpdate();
  await discordHandlers.login();

  // Keep SQLite connection warm to prevent slow first requests
  setInterval(() => {
    try {
      ShipDao.sequelize.query('SELECT * FROM Ships').catch(() => {});
      ShipDao.sequelize.query('SELECT * FROM Users').catch(() => {});
    } catch (error) {
      logger.error('DB keep-alive failed:', error);
    }
  }, 10000);

  // Background failures retain the healthy catalog and are always consumed.
  setInterval(() => {
    refreshShipList().catch((error) => logger.error("Catalog refresh failed:", error));
  }, 900_000);
}

startBot().catch(async (error) => {
  logger.error("Bot startup failed:", error);
  await ShipDao.sequelize.close().catch((closeError) => logger.error("Database close failed:", closeError));
  process.exitCode = 1;
});
