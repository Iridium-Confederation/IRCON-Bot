import Discord from "discord.js";
import { getGuildId, replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";
import { PREFIX } from "../handlers/DiscordHandlers";

export const HelpCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const guildId = await getGuildId(message);
  if (guildId == null) return;

  let msg =
    "Looking for the exact name of your ship? See: <https://fleetyards.net/ships/>\n\n" +
    `**${PREFIX()}add SHIP** \n\t Add a ship to your fleet.\n` +
    `**${PREFIX()}remove {SHIP|-all}** \n\t Remove ships from your fleet.\n` +
    `**${PREFIX()}search SHIP** \n\t List all owners of a certain ship.\n` +
    `**${PREFIX()}inventory [USER|-org]** \n\t List all ships a certain user or the org owns. Leave blank to show your personal inventory.\n` +
    `**${PREFIX()}fleetview [USER|-org]** \n\t Generate a fleetview.json file for the org or a user. Leave blank to generate your personal FleetView.\n` +
    `**${PREFIX()}import** \n\t Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.\n` +
    `**${PREFIX()}stats [SHIP]** \n\t Display org fleet statistics or show detailed info about a single ship. Leave blank to show org statistics.\n`;
  msg += "\n";
  msg += `**${PREFIX()}removeall _user#xxxx_** \n\t (Management Role): Delete all data for a user.\n`;

  replyTo(message, msg);
};
