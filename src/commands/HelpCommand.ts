import Discord from "discord.js";
import { User } from "../models/User";
import { getGuildId, replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";

export const HelpCommand: FleetBotCommand = async (
  message: Discord.Message
) => {
  const guildId = await getGuildId(message);
  if (guildId == null) return;

  let msg =
    "Looking for the exact name of your ship? See: <https://fleetyards.net/ships/>\n\n" +
    "**!fb add SHIP** \n\t Add a ship to your fleet.\n" +
    "**!fb remove {SHIP|-all}** \n\t Remove ships from your fleet.\n" +
    "**!fb search SHIP** \n\t List all owners of a certain ship.\n" +
    "**!fb inventory [USER]** \n\t List all ships a certain user owns. Leave blank to show your personal inventory.\n" +
    "**!fb fleetview [USER|-org]** \n\t Generate a fleetview.json file for the org or a user. Leave blank to generate your personal FleetView.\n" +
    "**!fb import** \n\t Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.\n" +
    "**!fb stats [SHIP]** \n\t Display org fleet statistics or show detailed info about a single ship. Leave blank to show org statistics.\n" +
    "**!fb {set|clear} default_guild GUILD_ID** \n\t Only necessary if you and FleetBot share multiple servers and you need private message support.\n";
  msg += "\n";
  msg +=
    "**!fb removeall _user#xxxx_** \n\t (Management Role): Delete all data for a user.\n";

  replyTo(message, msg);
};
