import { Communication, getGuildId, replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";
import { PREFIX } from "../handlers/DiscordHandlers";

export const HelpCommand: FleetBotCommand = async (message: Communication) => {
  const guildId = await getGuildId(message);
  if (guildId == null) return;

  let msg =
    "**IMPORTANT**: Discord is removing the ability for bots to read messages in April 2022. " +
    "That means you will no longer be able to interact with fleetbot using the ! commands. " +
    "To continue to interact with Fleetbot, use Discord's slash command interface (e.g. /inventory add carrack). " +
    "To see all Fleetbot slash commands, start typing / and click the FleetBot logo in the top left of the popup. " +
    "If you do not see the slash commands, please reinvite the bot using this invite link: https://discord.com/oauth2/authorize?client_id=744369194140958740&permissions=51200&scope=bot%20applications.commands\n\n" +
    "Looking for the exact name of your ship? See: <https://fleetyards.net/ships/>\n\n" +
    `**${await PREFIX()}add SHIP** \n\t Add a ship to your fleet.\n` +
    `**${await PREFIX()}remove {SHIP|-all}** \n\t Remove some or all from your fleet.\n` +
    `**${await PREFIX()}search SHIP** \n\t List all owners of a certain ship.\n` +
    `**${await PREFIX()}inventory [USER|-org]** \n\t List all ships a certain user or the org owns. Leave blank to show your personal inventory.\n` +
    `**${await PREFIX()}fleetview [USER|-org]** \n\t Generate a fleetview.json file for the org or a user. Leave blank to generate your personal FleetView.\n` +
    `**${await PREFIX()}import** \n\t Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.\n` +
    `**${await PREFIX()}stats [SHIP]** \n\t Display org fleet statistics or show detailed info about a single ship. Leave blank to show org statistics.\n`;
  msg += "\n";
  msg += `**${await PREFIX()}removeall _user#xxxx_** \n\t (Management Role): Delete all data for a user.\n`;

  replyTo(message, msg);
};
