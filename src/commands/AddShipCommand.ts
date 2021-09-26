import {
  addShip,
  addShipCheck,
  Communication,
  getCommand,
  getGuildId,
  replyTo,
} from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";
import Discord from "discord.js";

export const AddShipCommand: FleetBotCommand = async (
  message: Communication
) => {
  const { commandArgs } = await getCommand(message);
  const guildId = await getGuildId(message);
  if (guildId == null) return;

  const shipName =
    message instanceof Discord.Message
      ? commandArgs.toLowerCase()
      : message.options.getString("vehicle", true);

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
