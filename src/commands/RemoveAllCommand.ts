import { FleetBotCommand } from "./FleetBotCommand";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";
import { Communication, getCommand, getGuildId, replyTo } from "../utils";
import { CommandInteraction } from "discord.js";

export const RemoveAllCommand: FleetBotCommand = async (
  message: Communication
) => {
  const { commandArgs } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;

  let user;

  if (message instanceof CommandInteraction) {
    const discordUser = message.options.getUser("user", true);
    user = (await User.findById(discordUser.id))[0];
  } else {
    user = (await User.findByTag(commandArgs))[0];
  }

  if (user) {
    const ships = await ShipDao.findShipsByOwnerId(user.discordUserId, guildId);

    let count = 0;
    ships.map((s) => {
      count++;
      s.destroy();
    });
    replyTo(
      message,
      count > 0 ? `${count} ships deleted.` : `User has no ships.`
    );
  } else {
    replyTo(message, `User has no ships.`);
  }
};
