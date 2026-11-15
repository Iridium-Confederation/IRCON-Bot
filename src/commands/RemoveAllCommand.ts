import { FleetBotCommandInteraction } from "./FleetBotCommand";
import { ShipDao } from "../models/Ships";
import { getGuildId, replyTo } from "../utils";
import { CommandInteraction } from "discord.js";

export const RemoveAllCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  if (!message.isChatInputCommand()) return;
  const guildId = await getGuildId(message);
  if (guildId == null) return;

  const user = message.options.getUser("user", true);
  const count = await ShipDao.clearInventory(user.id, guildId);
  return replyTo(message, count > 0 ? `${count} ships deleted.` : "User has no ships.");
};
