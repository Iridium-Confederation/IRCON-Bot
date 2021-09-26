import Discord, { DiscordAPIError, Intents, TextChannel } from "discord.js";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";
import * as Utils from "../utils";
import {
  Communication,
  getCommand,
  getGuildId,
  getUserId,
  getUserTag,
} from "../utils";
import * as Commands from "../commands";
import { commandsLogger } from "../logging/logging";
import fs from "fs";

const token = require("../../botconfig.json");

export const client = new Discord.Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
  partials: ["CHANNEL"],
});
export const PREFIX = async (message: Communication) => {
  const guildId = await getGuildId(message, false);
  if (guildId == "226021087996149772") {
    return "!";
  } else {
    return "!fb ";
  }
};

export function login() {
  if (!client.login(token)) {
    console.log("Failed to login.");
  }
}

// Do a database backup over discord
async function doBackup() {
  const backupUser = client.users.cache.get("855908206672609310");
  if (backupUser) {
    fs.readFileSync("database.sqlite");
    await backupUser.send({ files: ["database.sqlite"] });
  }
}

async function cacheGuildMembers() {
  await Promise.all(client.guilds.cache.map((g) => g.members.fetch()));
}

export function registerOnReady() {
  client.once("ready", async () => {
    await User.sync();
    ShipDao.sync();

    // Schedule daily backups.
    await doBackup();
    setInterval(doBackup, 86_400_000);

    // Cache guild members (to support PM features)
    await cacheGuildMembers();
    setInterval(cacheGuildMembers, 300_000);
  });
}

export function registerOnGuildMemberAdd() {
  client.on("guildMemberAdd", async (member) => {
    await cacheGuildMembers();

    // iridium-only feature
    if (member.guild.id == "226021087996149772") {
      // Send the message to a designated channel on a server:
      const channel = member.guild.channels.cache.find(
        (ch) => ch.name === "recruitment_info"
      );

      // Do nothing if the channel wasn't found on this server
      if (!channel) return;

      if (
        !((channel): channel is TextChannel => channel.type === "GUILD_TEXT")(
          channel
        )
      )
        return;

      // Send the message, mentioning the member
      await channel.send(`A user has joined the server: ${member}`);
    }
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

function getMessageContent(message: Communication) {
  return message instanceof Discord.Message
    ? message.content
    : message.commandName;
}

async function updateCache(message: Communication) {
  await Utils.updateUser(
    message instanceof Discord.Message ? message.author : message.user
  );
}

async function processCommand(message: Communication) {
  if (message instanceof Discord.Message) {
    if (!message.content.startsWith("!")) {
      return;
    }
  }
  await updateCache(message);
  const { command, subCommand } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (!guildId && command != "set") {
    return;
  }

  commandsLogger.info(
    `[${getUserTag(message)}-${getUserId(
      message
    )}] executed command [${getMessageContent(message)}]`
  );

  if (command === "add" || subCommand === "add") {
    await Commands.AddShipCommand(message);
  } else if (
    command === "remove" ||
    subCommand === "remove" ||
    subCommand === "clear" ||
    command === "delete_inventory"
  ) {
    await Commands.RemoveShipCommand(message);
  } else if (command === "inventory" || subCommand === "view") {
    await Commands.InventoryCommand(message);
  } else if (command === "search") {
    await Commands.SearchCommand(message);
  } else if (
    (command === "removeall" || command === "remove_all") &&
    Utils.hasRole(message, "Management")
  ) {
    await Commands.RemoveAllCommand(message);
  } else if (command === "fleetview") {
    await Commands.FleetViewCommand(message);
  } else if (command === "update" && User.isAdmin(getUserId(message))) {
    await Commands.UpdateFleetBotCommand(message);
  } else if (command === "import") {
    await Commands.ImportCommand(message);
  } else if (command === "db" && User.isAdmin(getUserId(message))) {
    await Commands.DownloadDBCommand(message);
  } else if (command === "stats" || command === "stats_org") {
    await Commands.StatsCommand(message);
  } else if (command === "help") {
    await Commands.HelpCommand(message);
  } else if (command === "set" || command === "clear") {
    await Commands.SetCommand(message);
  }
}

export function registerOnMessage() {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    await Commands.ClearConfirmationHandler(interaction);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    try {
      await processCommand(interaction);
    } catch (e) {
      if (e instanceof DiscordAPIError) {
        console.log(e);
      } else {
        throw e;
      }
    }
  });

  client.on("message", async (message: Communication) => {
    if (
      message instanceof Discord.Message &&
      client.user?.id != message.author.id &&
      message.content.startsWith(await PREFIX(message))
    ) {
      await processCommand(message);
    }
  });
}
