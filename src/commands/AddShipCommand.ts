import { addShip, getGuildId, replyTo } from "../utils";
import { FleetBotCommandInteraction } from "./FleetBotCommand";
import { CommandInteraction } from "discord.js";

export const AddShipCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  if (!message.isChatInputCommand()) return;
  const guildId = await getGuildId(message);
  if (guildId == null) return;

  const shipName = message.options.getString("vehicle", true);

  if (shipName.length <= 1) {
    return replyTo(message, "Could you be more specific?");
  }

  const addedShip = await addShip(shipName, message, guildId);
  return replyTo(message, addedShip === null
    ? "Org limit reached. Contact developers to increase limit."
    : addedShip ? `added **${addedShip.name}** to your fleet.` : "Unknown ship.");
};
