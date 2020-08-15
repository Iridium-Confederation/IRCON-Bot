import { ShipDao } from "./models/Ships";
import { refreshShipList } from "./utils";
import { DiscordHandlers } from "./handlers/DiscordHandlers";
require("fs");

// Initialize DB
ShipDao.initialize();

// Background job for ship list
(async () => {
  await refreshShipList();
})();
setInterval(refreshShipList, 900_000);

const discordHandlers = new DiscordHandlers();
discordHandlers.login();
discordHandlers.registerOnReady();
discordHandlers.registerOnGuildMemberAdd();
discordHandlers.registerOnMessage();
discordHandlers.registerOnUserUpdate();
