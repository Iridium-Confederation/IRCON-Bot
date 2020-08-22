import Discord from "discord.js";
import { FleetBotCommand } from "./FleetBotCommand";
import {
  findShip,
  getCommand,
  getGuildId,
  getTotalUec,
  replyTo,
} from "../utils";
import { ShipDao } from "../models/Ships";
import _ from "lodash";

export const InventoryCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const { commandArgs } = getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;

  const ships =
    commandArgs === ""
      ? await ShipDao.findShipsByOwnerId(message.author.id, guildId)
      : await ShipDao.findShipsByOwnerLike(`%${commandArgs}%#%`, guildId);

  const totalUec = getTotalUec(ships).toLocaleString();

  let firstUserFound: string = "";
  const shipStr = Object.entries(
    _.groupBy(ships, (ship) => findShip(ship.shipname)?.rsiName)
  )
    .map((group) => {
      const shipNameDb = group[0];
      const shipCount = group[1].length;
      const ship = findShip(shipNameDb);

      firstUserFound = firstUserFound
        ? firstUserFound
        : group[1][0].owner.lastKnownTag;
      return firstUserFound === group[1][0].owner.lastKnownTag
        ? `**${ship?.rsiName}**` + (shipCount > 1 ? " x " + shipCount : "")
        : "";
    })
    .sort()
    .join("\n");

  let header;

  if (firstUserFound) {
    header = `${
      firstUserFound.split("#")[0]
    }'s inventory (**${totalUec} UEC**):\n`;
  } else {
    header = "User not found or has no ships.";
  }

  replyTo(message, header + shipStr);
};
