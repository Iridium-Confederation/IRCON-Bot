import Discord from "discord.js";
import { FleetBotCommand } from "./FleetBotCommand";
import {
  findShip,
  getCommand,
  getGuildId,
  getTotalUec,
  getUserGuilds,
  loanersMap,
  replyTo,
} from "../utils";
import { ShipDao } from "../models/Ships";
import _ from "lodash";

export const InventoryCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const { commandArgs } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;

  let ships;
  if (commandArgs.includes("-org")) {
    ships = await ShipDao.findAll(guildId);
  } else {
    ships =
      commandArgs === ""
        ? await ShipDao.findShipsByOwnerId(message.author.id, guildId)
        : await ShipDao.findShipsByOwnerLike(`%${commandArgs}%#%`, guildId);
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
        ? `*(${loaners.map((l) => l.rsiName).join(", ")})*`
        : "";

      const line =
        `**${ship?.rsiName} ${shipCount > 1 ? " x " + shipCount : ""}** ` +
        loanerStr;

      return showItem ? line : "";
    })
    .sort()
    .filter((s) => s.length > 0)
    .join("\n");

  const currentGuild = getUserGuilds(message).get(guildId);
  let header;

  if (commandArgs.includes("-org")) {
    header = `${currentGuild?.name}'s inventory:\n`;
  } else {
    if (firstUserFound) {
      header = `${
        firstUserFound.split("#")[0]
      }'s inventory (**${totalUec} UEC**):\n`;
    } else {
      header = "User not found or has no ships.";
    }
  }

  replyTo(message, header + shipStr);
};
