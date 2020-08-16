import Discord from "discord.js";
import { User } from "../models/User";
import { getGuildId, replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";

export class HelpCommand implements FleetBotCommand {
  execute(message: Discord.Message) {
    const guildId = getGuildId(message);
    if (guildId == null) return;

    let msg =
      "Looking for the exact name of your ship? See: <https://fleetyards.net/ships/>\n\n" +
      "**!fb add <ship>** \n\t Add a ship to your fleet.\n" +
      "**!fb remove {ship|-all}** \n\t Remove ships from your fleet.\n" +
      "**!fb search <ship>** \n\t List all owners of a certain ship.\n" +
      "**!fb inventory [username]** \n\t List all ships a certain user owns. Leave blank for your own\n" +
      "**!fb fleetview {user|-org}** \n\t Generate a fleetview.json file for the org or a user.\n" +
      "**!fb import** \n\t Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.\n" +
      "**!fb stats [ship]** \n\t Display org fleet statistics or show detailed info about a single ship.\n";

    msg +=
      "**!fb removeall _user#xxxx_** \n\t (Management Role): Delete all data for a user.\n";

    if (User.isAdmin(message.author.id)) {
      msg +=
        "**!fb update** \n\t (Admin): Update to the latest version of the bot.\n";
    }

    if (User.isAdmin(message.author.id)) {
      msg += "**!fb db** \n\t (Admin): Fetch db.\n";
    }

    replyTo(message, msg);
  }
}
