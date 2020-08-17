import { ShipDao } from "./models/Ships";
import { refreshShipList } from "./utils";
import * as discordHandlers from "./handlers/DiscordHandlers";
import { configure, getLogger } from "log4js";

require("fs");

// logging
configure({
  appenders: {
    commands: { type: "file", filename: "logs/commands.log" },
    default: { type: "file", filename: "logs/application.log" },
  },
  categories: {
    default: { appenders: ["default"], level: "info" },
    commands: { appenders: ["commands"], level: "info" },
  },
});
export const logger = getLogger();
export const commandsLogger = getLogger("commands");
logger.info("Starting Iridium FleetBot...");

// Initialize DB
ShipDao.initialize();

// Background job for ship list
refreshShipList().then(() => {});
setInterval(refreshShipList, 900_000);

discordHandlers.login();
discordHandlers.registerOnReady();
discordHandlers.registerOnMessage();
discordHandlers.registerOnUserUpdate();
