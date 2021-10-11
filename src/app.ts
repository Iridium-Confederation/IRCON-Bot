import { ShipDao } from "./models/Ships";
import { refreshShipList } from "./utils";
import * as discordHandlers from "./handlers/DiscordHandlers";
import { initializeLogging, logger } from "./logging/logging";
import { registerInteractionHandlers } from "./handlers/DiscordHandlers";

require("fs");

// Initialize logging
initializeLogging();
logger.info("Starting Iridium FleetBot...");

// Initialize DB
ShipDao.initialize();

// Background job for ship list
refreshShipList().then(() => {});
setInterval(refreshShipList, 900_000);

discordHandlers.login();
discordHandlers.registerInteractionHandlers();
discordHandlers.registerOnGuildMemberAdd();
discordHandlers.registerOnReady();
discordHandlers.registerOnMessage();
discordHandlers.registerOnUserUpdate();
