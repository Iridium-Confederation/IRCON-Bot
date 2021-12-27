import Discord, {
  DiscordAPIError,
  Intents,
  Snowflake,
  TextChannel,
} from "discord.js";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";
import * as Utils from "../utils";
import {
  Communication,
  getCommand,
  getGuildId,
  getUserId,
  getUserTag,
  replyTo,
} from "../utils";
import * as Commands from "../commands";
import { commandsLogger } from "../logging/logging";
import fs from "fs";
import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";

const { Routes } = require("discord-api-types/v9");

const token = require("../../botconfig.json");
const rest = new REST({ version: "9" }).setToken(token);
export const guildsIncorrectPermissions = new Set<Snowflake>();

export const client = new Discord.Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
  partials: ["CHANNEL"],
});
export const PREFIX = async () => {
  return "!fb ";
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
  await Promise.all(
    client.guilds.cache.map((g) => {
      g.members.fetch().catch(() => {});
    })
  );
  await Promise.all(
    client.guilds.cache.map((g) => {
      g.commands.fetch().catch(() => {});
    })
  );
}

async function setGuildCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("admin")
      .setDefaultPermission(false)
      .setDescription("Privileged commands.")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("disconnected")
          .setDescription("Manager disconnected users (Server Owner)")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("delete")
          .setDescription("Delete a connected user (Server Owner)")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("User to delete")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("clear")
          .setDescription(
            "Clear ALL data owned by your organization (Server Owner)"
          )
      ),
  ].map((command) => command.toJSON());

  if (client.isReady()) {
    guildsIncorrectPermissions.clear();

    await Promise.allSettled(
      client.guilds.cache.map(async (guild) => {
        await rest
          .put(Routes.applicationGuildCommands(client.user.id, guild.id), {
            body: commands,
          })
          .catch(() => {
            guildsIncorrectPermissions.add(guild.id);
          });
      })
    );
  }
}

async function updateGuildCommandPermissions() {
  Promise.all(
    client.guilds.cache.map(async (guild) => {
      const command = guild.commands.cache.find(
        (command) => command.name === "admin"
      );

      if (command) {
        await command.permissions.set({
          permissions: [
            {
              id: guild.ownerId,
              type: "USER",
              permission: true,
            },
          ],
        });
      }
    })
  ).then(() => {});
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
    setInterval(cacheGuildMembers, 60_000);

    await setGuildCommands();
    setInterval(setGuildCommands, 60_000);

    await updateGuildCommandPermissions();
    setInterval(updateGuildCommandPermissions, 60_000);
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
  await updateCache(message);

  const { command, subCommand } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (!guildId && command != "options") {
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
    (command === "inventory" && subCommand === "clear") ||
    command === "delete_inventory"
  ) {
    await Commands.RemoveShipCommand(message);
  } else if (command === "inventory" || subCommand === "view") {
    await Commands.InventoryCommand(message);
  } else if (command === "search") {
    await Commands.SearchCommand(message);
  } else if (
    (command === "removeall" ||
      command === "remove_all" ||
      subCommand === "delete") &&
    Utils.hasRole(message, "Management")
  ) {
    await Commands.RemoveAllCommand(message);
  } else if (subCommand === "delete") {
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
  } else if (command === "options") {
    await Commands.ClearDefaultGuild(message);
  } else if (subCommand === "disconnected") {
    await Commands.AdminUsersCommand(message);
  } else if (command === "admin" && subCommand === "clear") {
    await Commands.AdminClearCommand(message);
  }
}

export const handlers: { [key: string]: Function } = {};

export function registerInteractionHandlers() {
  handlers["default_guild_select"] = Commands.DefaultGuildSelect;
  handlers["delete_inventory"] = Commands.ClearConfirmationHandler;
  handlers["delete_user_select"] = Commands.AdminUsersSelect;
  handlers["delete_user_button"] = Commands.AdminUsersDeleteButton;
  handlers["delete_guild"] = Commands.AdminClearButton;
  return;
}

export function registerOnMessage() {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isCommand()) {
        await processCommand(interaction);
      } else if (interaction.isButton() || interaction.isSelectMenu()) {
        const id = interaction.customId.split("#")[0];
        const handler = handlers[id];
        if (handler) {
          handler(interaction);
        }
      }
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
      client.user?.id != message.author.id
    ) {
      if (
        message.content.startsWith(await PREFIX()) ||
        (client.user?.id && message.mentions.users.has(client.user.id))
      ) {
        await processCommand(message);
      } else if (
        (message.content.startsWith("!") &&
          message.guildId === "226021087996149772") ||
        message.guild === null
      ) {
        replyTo(message, "Use !fb help or type / to see valid commands.");
      }
    }
  });
}
