import { addShip, addShipCheck, getGuildId, replyTo } from "../utils";
import { FleetBotCommandInteraction } from "./FleetBotCommand";
import { CommandInteraction } from "discord.js";

export const AddShipCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  const guildId = await getGuildId(message);
  if (guildId == null) return;
  if (!message.isChatInputCommand()) return;

  const shipName = message.options.getString("vehicle", true);

  if (shipName.length <= 1) {
    replyTo(message, "Could you be more specific?");
  }

  const verify = await addShipCheck(message, guildId);
  if (verify) {
    const addedShip = await addShip(shipName, message, guildId);

    if (addedShip) {
      replyTo(message, `added **${addedShip.name}** to your fleet.`);
    } else {
      replyTo(message, `Unknown ship.`);
    }
  }
};
