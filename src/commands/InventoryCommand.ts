import { FleetBotCommand } from "./FleetBotCommand";
import {
  Communication,
  findShip,
  getCommand,
  getGuildId,
  getTotalUec,
  getUserGuilds,
  getUserId,
  loanersMap,
  replyTo,
} from "../utils";
import { ShipDao } from "../models/Ships";
import _ from "lodash";
import Discord from "discord.js";

export const InventoryCommand: FleetBotCommand = async (
  message: Communication
) => {
  const { command, commandArgs, subCommand } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;

  let ships;
  if (commandArgs.includes("-org") || command === "inventory_all") {
    ships = await ShipDao.findAll(guildId);
  } else if (message instanceof Discord.Message) {
    ships =
      commandArgs === ""
        ? await ShipDao.findShipsByOwnerId(getUserId(message), guildId)
        : await ShipDao.findShipsByOwnerLike(`%${commandArgs}%#%`, guildId);
  } else {
    const opUser = message.options.getUser("user", false);
    ships = await ShipDao.findShipsByOwnerId(
      opUser ? opUser.id : getUserId(message),
      guildId
    );
  }

  const totalUec = getTotalUec(ships).toLocaleString();

  let firstUserFound: string = "";
  const shipStr = Object.entries(
    _.groupBy(ships, (ship) => findShip(ship.shipname)?.rsiName)
  )
    .map((group) => {
      const shipNameDb = group[0];
      const shipCount = group[1].length;
      const ship = findShip(shipNameDb);
      const loaners = loanersMap.get(ship?.id);

      firstUserFound = firstUserFound
        ? firstUserFound
        : group[1][0].owner.lastKnownTag;

      const showItem =
        firstUserFound === group[1][0].owner.lastKnownTag ||
        commandArgs.includes("-org");

      const loanerStr = loaners
        ? `\nLoaner: *${loaners.map((l) => l.rsiName).join(", ")}*`
        : "";

      const line =
        `**${ship?.rsiName} ${shipCount > 1 ? " x " + shipCount : ""}** ` +
        loanerStr;

      return showItem ? line : "";
    })
    .sort()
    .filter((s) => s.length > 0)
    .join("\n");

  const currentGuild = (await getUserGuilds(message)).get(guildId);
  let header;
  let subHeader = "**Ship x Quantity** *(Loaners)*\n\n";

  if (commandArgs.includes("-org")) {
    header = `${currentGuild?.name}'s inventory:\n`;
  } else {
    if (firstUserFound) {
      header = `${
        firstUserFound.split("#")[0]
      }'s inventory (**${totalUec} UEC**):\n`;
    } else {
      header = "User not found or has no ships.";
      subHeader = "";
    }
  }

  replyTo(message, subHeader + shipStr, undefined, header);
};
