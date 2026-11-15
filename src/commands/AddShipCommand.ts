import { addShip, getGuildId, replyTo } from "../utils";
import { FleetBotCommandInteraction } from "./FleetBotCommand";
import { CommandInteraction } from "discord.js";
import { MemberShipLimitError } from "../shipLimits";

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

  let addedShip;
  try {
    addedShip = await addShip(shipName, message, guildId);
  } catch (error) {
    if (error instanceof MemberShipLimitError) return replyTo(message, error.message);
    throw error;
  }
  return replyTo(message, addedShip === null
    ? "Org limit reached. Contact developers to increase limit."
    : addedShip ? `added **${addedShip.name}** to your fleet.` : "Unknown ship.");
};
