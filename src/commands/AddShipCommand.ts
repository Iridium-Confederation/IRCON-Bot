import Discord from "discord.js";
import { addShip, getCommand, getGuildId } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";

export class AddShipCommand implements FleetBotCommand {
  async execute(message: Discord.Message): Promise<void> {
    const { commandArgs } = getCommand(message);

    const guildId = getGuildId(message);
    if (guildId == null) return;

    const shipName = commandArgs.toLowerCase();

    if (shipName.length <= 1) {
      await message.reply("Could you be more specific?");
    }

    const addedShip = addShip(shipName, message);
    if (addedShip) {
      await message.reply(`added **${addedShip.name}** to your fleet.`);
    } else {
      await message.reply(`Unknown ship.`);
    }
  }
}
