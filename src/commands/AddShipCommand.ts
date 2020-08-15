import Discord from "discord.js";
import { addShip, getCommand } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";

export class AddShipCommand implements FleetBotCommand {
  async execute(message: Discord.Message): Promise<void> {
    const { commandArgs } = getCommand(message);

    const shipName = commandArgs.toLowerCase();

    if (shipName.length <= 1) {
      message.reply("Could you be more specific?");
    }

    const addedShip = addShip(shipName, message);
    if (addedShip) {
      await message.reply(`added **${addedShip.name}** to your fleet.`);
    } else {
      await message.reply(`Unknown ship.`);
    }
  }
}
