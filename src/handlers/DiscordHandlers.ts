import Discord from "discord.js";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";
import { getCommand, getGuildId, hasRole, updateUser } from "../utils";
import { AddShipCommand } from "../commands/AddShipCommand";
import { RemoveShipCommand } from "../commands/RemoveShipCommand";
import { InventoryCommand } from "../commands/InventoryCommand";
import { SearchCommand } from "../commands/SearchCommand";
import { RemoveAllCommand } from "../commands/RemoveAllCommand";
import { FleetViewCommand } from "../commands/FleetViewCommand";
import { UpdateFleetBotCommand } from "../commands/UpdateFleetBotCommand";
import { ImportCommand } from "../commands/ImportCommand";
import { StatsCommand } from "../commands/StatsCommand";
import { HelpCommand } from "../commands/HelpCommand";
const token = require("../../botconfig.json");
export const client = new Discord.Client();
import { DownloadDBCommand } from "../commands/DownloadDBCommand";

export class DiscordHandlers {
  static login() {
    if (!client.login(token)) {
      console.log("Failed to login.");
    }
  }

  static registerOnReady() {
    client.once("ready", () => {
      User.sync();
      ShipDao.sync();
    });
  }

  static registerOnUserUpdate() {
    client.on(
      "userUpdate",
      async (
        oldUser: Discord.User | Discord.PartialUser,
        newUser: Discord.User | Discord.PartialUser
      ) => {
        await updateUser(newUser);
      }
    );
  }

  static registerOnMessage() {
    client.on("message", async (message: Discord.Message) => {
      // Disables PM support for now.
      const guildId = getGuildId(message);
      if (guildId == null) return;

      let PREFIX = "!";
      if (message.content.startsWith(PREFIX)) {
        await updateUser(message.author);

        const { command } = getCommand(message);

        if (command === "add") {
          return new AddShipCommand().execute(message);
        } else if (command === "remove") {
          return new RemoveShipCommand().execute(message);
        } else if (command === "inventory") {
          return new InventoryCommand().execute(message);
        } else if (command === "search") {
          return new SearchCommand().execute(message);
        } else if (command === "removeall" && hasRole(message, "Management")) {
          return new RemoveAllCommand().execute(message);
        } else if (command === "fleetview") {
          return new FleetViewCommand().execute(message);
        } else if (command === "update" && User.isAdmin(message.author.id)) {
          return new UpdateFleetBotCommand().execute(message);
        } else if (command === "import") {
          return new ImportCommand().execute(message);
        } else if (command === "db" && User.isAdmin(message.author.id)) {
          return new DownloadDBCommand().execute(message);
        } else if (command === "stats") {
          return new StatsCommand().execute(message);
        } else if (command === "help") {
          return new HelpCommand().execute(message);
        }
      }
    });
  }
}
