import { ShipDao } from "./models/Ships";
import { refreshShipList } from "./utils";
import { DiscordHandlers } from "./handlers/DiscordHandlers";
require("fs");

// Initialize DB
ShipDao.initialize();

// Background job for ship list
refreshShipList().then(() => true);
setInterval(refreshShipList, 900_000);

DiscordHandlers.login();
DiscordHandlers.registerOnReady();
DiscordHandlers.registerOnMessage();
DiscordHandlers.registerOnUserUpdate();
