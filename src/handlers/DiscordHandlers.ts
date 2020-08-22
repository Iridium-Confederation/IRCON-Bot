import Discord from "discord.js";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";
import * as Utils from "../utils";
import * as Commands from "../commands";
import { commandsLogger } from "../logging/logging";
const token = require("../../botconfig.json");
export const client = new Discord.Client();
export const PREFIX = () => "!fb ";

export function login() {
  if (!client.login(token)) {
    console.log("Failed to login.");
  }
}

export function registerOnReady() {
  client.once("ready", () => {
    User.sync();
    ShipDao.sync();
  });
}

export function registerOnUserUpdate() {
  client.on(
    "userUpdate",
    async (
      oldUser: Discord.User | Discord.PartialUser,
      newUser: Discord.User | Discord.PartialUser
    ) => {
      await Utils.updateUser(newUser);
    }
  );
}

export function registerOnMessage() {
  client.on("message", async (message: Discord.Message) => {
    // Disables PM support for now.
    if (message.content.startsWith(PREFIX())) {
      const { command } = Utils.getCommand(message);

      commandsLogger.info(
        `[${message.author.tag}-${message.author.id}] executed command [${message.content}]`
      );

      await Utils.updateUser(message.author);

      if (command === "add") {
        await Commands.AddShipCommand(message);
      } else if (command === "remove") {
        await Commands.RemoveShipCommand(message);
      } else if (command === "inventory") {
        await Commands.InventoryCommand(message);
      } else if (command === "search") {
        await Commands.SearchCommand(message);
      } else if (
        command === "removeall" &&
        Utils.hasRole(message, "Management")
      ) {
        await Commands.RemoveAllCommand(message);
      } else if (command === "fleetview") {
        await Commands.FleetViewCommand(message);
      } else if (command === "update" && User.isAdmin(message.author.id)) {
        await Commands.UpdateFleetBotCommand(message);
      } else if (command === "import") {
        await Commands.ImportCommand(message);
      } else if (command === "db" && User.isAdmin(message.author.id)) {
        await Commands.DownloadDBCommand(message);
      } else if (command === "stats") {
        await Commands.StatsCommand(message);
      } else if (command === "help") {
        await Commands.HelpCommand(message);
      } else if (command === "set" || command === "clear") {
        await Commands.SetCommand(message);
      }
    }
  });
}
