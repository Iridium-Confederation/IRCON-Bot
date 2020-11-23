import Discord from "discord.js";
import {
  addShip,
  addShipCheck,
  getCommand,
  getGuildId,
  replyTo,
} from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";

export const AddShipCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const { commandArgs } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;

  const shipName = commandArgs.toLowerCase();

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
