import Discord from "discord.js";
import { FleetBotCommand } from "./FleetBotCommand";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";
import { getCommand, getGuildId, replyTo } from "../utils";

export class RemoveAllCommand implements FleetBotCommand {
  async execute(message: Discord.Message): Promise<void> {
    const { commandArgs } = getCommand(message);

    const guildId = getGuildId(message);
    if (guildId == null) return;

    const user = (await User.findByTag(commandArgs))[0];
    if (user) {
      const ships = await ShipDao.findShipsByOwnerId(
        user.discordUserId,
        guildId
      );

      let count = 0;
      ships.map((s) => {
        count++;
        s.destroy();
      });
      return replyTo(message, `${count} ships deleted.`);
    } else {
      return replyTo(message, `User not found.`);
    }
  }
}
