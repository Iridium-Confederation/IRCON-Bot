import { FleetBotCommandInteraction } from "./FleetBotCommand";
import { getGuildId } from "../utils";
import { CommandInteraction } from "discord.js";
import { client } from "../handlers/DiscordHandlers";
import { openFleetBrowser } from "./fleet-browser";

export const InventoryCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  if (!message.isChatInputCommand()) return;
  const guildId = await getGuildId(message);
  if (guildId == null) return;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const owner = message.options.getSubcommand() === "org"
    ? undefined : message.options.getUser("user", false) || message.user;
  return openFleetBrowser(message, guildId, guild.name, !!message.options.getBoolean("loaners", false), owner);
};
