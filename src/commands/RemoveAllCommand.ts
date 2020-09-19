import Discord from "discord.js";
import { FleetBotCommand } from "./FleetBotCommand";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";
import { getCommand, getGuildId, replyTo } from "../utils";

export const RemoveAllCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const { commandArgs } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;

  const user = (await User.findByTag(commandArgs))[0];
  if (user) {
    const ships = await ShipDao.findShipsByOwnerId(user.discordUserId, guildId);

    let count = 0;
    ships.map((s) => {
      count++;
      s.destroy();
    });
    replyTo(message, `${count} ships deleted.`);
  } else {
    replyTo(message, `User not found.`);
  }
};
