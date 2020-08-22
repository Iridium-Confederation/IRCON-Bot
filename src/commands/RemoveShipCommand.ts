import Discord from "discord.js";
import { getCommand, getGuildId, replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";
import { deleteShips } from "../models/Ships";

export const RemoveShipCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const { commandArgs } = getCommand(message);

  const guildId = await getGuildId(message);
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
    replyTo(
      message,
      `${rowCount} ship${rowCount > 1 ? "s" : ""} removed from your fleet.`
    );
  } else if (shipName.length <= 1) {
    replyTo(message, "Could you be more specific?");
  } else {
    const deletedShip = removedShips.values().next().value;
    replyTo(
      message,
      deletedShip
        ? `Removed **${deletedShip.rsiName}** from your fleet.`
        : "You do not own that ship."
    );
  }
};
