import Discord from "discord.js";
import { User } from "../models/User";
import { replyTo } from "../utils";
import { FleetBotCommand } from "./FleetBotCommand";

export class HelpCommand implements FleetBotCommand {
  execute(message: Discord.Message) {
    let msg =
      "Looking for the exact name of your ship? See: <https://fleetyards.net/ships/>\n\n" +
      "**!add <ship>** \n\t Add a ship to your fleet.\n" +
      "**!remove {ship|-all}** \n\t Remove ships from your fleet.\n" +
      "**!search <ship>** \n\t List all owners of a certain ship.\n" +
      "**!inventory [username]** \n\t List all ships a certain user owns. Leave blank for your own\n" +
      "**!fleetview {user|-org}** \n\t Generate a fleetview.json file for the org or a user.\n" +
      "**!import** \n\t Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.\n" +
      "**!stats [ship]** \n\t Display org fleet statistics or show detailed info about a single ship.\n";

    msg +=
      "**!removeall _user#xxxx_** \n\t (Management): Delete all data for a user.\n";

    if (User.isAdmin(message.author.id)) {
      msg +=
        "**!update** \n\t (Admin): Update to the latest version of the bot.\n";
    }

    if (User.isAdmin(message.author.id)) {
      msg += "**!db** \n\t (Admin): Fetch db.\n";
    }

    replyTo(message, msg);
  }
}
