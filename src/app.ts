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

// Keep SQLite connection warm to prevent slow first requests
setInterval(() => {
  try {
    ShipDao.sequelize.query('SELECT * FROM Ships').catch(() => {});
    ShipDao.sequelize.query('SELECT * FROM Users').catch(() => {});
  } catch (error) {
    logger.error('DB keep-alive failed:', error);
  }
}, 10000);

// Background job for ship list
refreshShipList().then(() => {});
setInterval(refreshShipList, 900_000);

discordHandlers.registerInteractionHandlers();
discordHandlers.registerRateLimit();
discordHandlers.registerOnReady();
discordHandlers.registerOnMessage();
discordHandlers.registerOnUserUpdate();
discordHandlers.login().then(() => {});
