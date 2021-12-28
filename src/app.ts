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

// Background job for ship list
refreshShipList().then(() => {});
setInterval(refreshShipList, 900_000);

discordHandlers.registerInteractionHandlers();
discordHandlers.registerOnGuildMemberAdd();
discordHandlers.registerRateLimit();
discordHandlers.registerOnReady();
discordHandlers.registerOnMessage();
discordHandlers.registerOnUserUpdate();
discordHandlers.login();
