import Discord from "discord.js";
import { findShip, getCommand, getGuildId, replyTo } from "../utils";
import { ShipDao } from "../models/Ships";
import _ from "lodash";
import { FleetBotCommand } from "./FleetBotCommand";

export const SearchCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const guildId = await getGuildId(message);

  const { commandArgs } = getCommand(message);
  if (guildId == null) return;

  const shipName = commandArgs.toLowerCase();
  const matches = await ShipDao.findShipsByName(`%${shipName}%`, await guildId);

  const reply = Object.entries(
    _.groupBy(matches, (ship) => findShip(ship.shipname)?.rsiName)
  )
    .map((group) => {
      const shipNameDb = group[0];
      const ships = group[1];
      const userCount = _.groupBy(ships, (ship) => ship.owner.lastKnownTag);
      const ship = findShip(shipNameDb);

      return (
        `**${ship?.rsiName}**` +
        ": " +
        Object.entries(userCount)
          .map((user) => {
            const username = user[0].split("#")[0];
            const count = user[1].length;
            return username + (count > 1 ? " x " + user[1].length : "");
          })
          .join(", ")
      );
    })
    .sort()
    .join("\n");

  return replyTo(message, reply === "" ? "No owners found." : reply);
};
