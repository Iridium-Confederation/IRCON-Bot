import Discord from "discord.js";
import { getCommand, getGuildId } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";
import { deleteShips } from "../models/Ships";

export class RemoveShipCommand implements FleetBotCommand {
  async execute(message: Discord.Message): Promise<void> {
    const { commandArgs } = getCommand(message);

    const guildId = getGuildId(message);
    if (guildId == null) return;

    const shipName = commandArgs.toLowerCase();
    const removedShips = await deleteShips(
      shipName,
      message.author.tag,
      guildId,
      commandArgs === "-all"
    );
    const rowCount = removedShips.size;
    if (commandArgs === "-all") {
      message.reply(
        `${rowCount} ship${rowCount > 1 ? "s" : ""} removed from your fleet.`
      );
    } else if (shipName.length <= 1) {
      message.reply("Could you be more specific?");
    } else {
      const deletedShip = removedShips.values().next().value;
      message.reply(
        deletedShip
          ? `Removed **${deletedShip.rsiName}** from your fleet.`
          : "You do not own that ship."
      );
    }
  }
}
