import { FleetBotCommandInteraction } from "./FleetBotCommand";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";
import { getGuildId, replyTo } from "../utils";
import { CommandInteraction } from "discord.js";

export const RemoveAllCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  const guildId = await getGuildId(message);
  if (guildId == null)  return;


  const discordUser = message.isChatInputCommand() ? message.options.getUser("user", true) : null;

  let user;
  if (discordUser){
    user = (await User.findById(discordUser.id))[0];
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
