import Discord, {
  CommandInteraction,
  DiscordAPIError,
  Partials,
} from "discord.js";
import { User } from "../models/User";
import { ShipDao } from "../models/Ships";
import * as Utils from "../utils";
import {
  Communication,
  findShipAutocomplete,
  getCommand,
  getGuildId,
  getUserGuilds,
  getUserId,
  getUserTag,
  sleep,
} from "../utils";
import * as Commands from "../commands";
import { commandsLogger } from "../logging/logging";
import fs from "fs";
import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import _ from "lodash";
import { SetDefaultGuild } from "../commands";

const { Routes } = require("discord-api-types/v9");

const token = require("../../botconfig.json");
new REST({ version: "9" }).setToken(token);
const admins = require("../../admins.json");
const { GatewayIntentBits } = require("discord.js");

export const client = new Discord.Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
});

export async function login() {
  const output = await client.login(token);

  if (!output) {
    console.log("Failed to login");
  }
}

// Do a database backup over discord
async function doBackup() {
  admins
    .map((a: any) => client.users.cache.get(a.discordId))
    .forEach((backupUser: Discord.User) => {
      if (backupUser) {
        fs.readFileSync("database.sqlite");
        backupUser.send({ files: ["database.sqlite"] });
      }
    });
}

export const memberGuildsCache = new Map<string, Set<string>>();

async function cacheGuildMembers() {
  const guilds = Array.from(client.guilds.cache.values());

  const chunks = _.chunk(guilds, 5);
  for (const chunk of chunks) {
    await sleep(250);

    await Promise.all(
      chunk.map((g) => {
        return g.members
          .fetch({ time: 60_000 })
          .then((memberList) => {
            for (const entry of memberList) {
              const snowflake = entry[0];
              let guilds = memberGuildsCache.get(snowflake);
              if (!guilds) {
                guilds = new Set();
                memberGuildsCache.set(snowflake, guilds);
              }
              guilds.add(g.id);
            }
          })
          .catch((e) => console.log(e));
      })
    );
  }
}

export function registerRateLimit() {
  client.on("rateLimited", async (limitData) => {
    console.log("Rate limit: " + JSON.stringify(limitData));
  });
}

async function doIntervalActions() {
  // TODO: find a more elegant solution to rate limiting.
  // Each method here should exceed no more than 25 requests/s (out of global limit of 50).

  await cacheGuildMembers();
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("admin")
      .setDMPermission(false)
      .setDefaultMemberPermissions("0")
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
    new SlashCommandBuilder()
      .setName("inventory")
      .setDescription("Manager inventory")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("add")
          .setDescription("Add a vehicle to your fleet.")
          .addStringOption((option) =>
            option
              .setName("vehicle")
              .setDescription("Vehicle to add")
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("remove")
          .setDescription("Remove a vehicle from your fleet.")
          .addStringOption((option) =>
            option
              .setName("vehicle")
              .setDescription("Vehicle to remove")
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("clear")
          .setDescription("Remove all vehicles from your inventory.")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("view")
          .setDescription("View an inventory.")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("User to search for")
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("org").setDescription("View org inventory.")
      ),
    new SlashCommandBuilder()
      .setName("search")
      .setDescription("Search your organization for a vehicle.")
      .addStringOption((option) =>
        option
          .setName("vehicle")
          .setRequired(true)
          .setDescription("Search for a vehicle")
          .setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName("import")
      .setDescription("Uplaod a FleetView or Hangar XPLORer JSON file")
      .addAttachmentOption((option) =>
        option
          .setName("file")
          .setRequired(true)
          .setDescription("FleetView or Hangar XPLORer JSON file")
      ),
    new SlashCommandBuilder()
      .setName("fleetview")
      .setDescription("Generates a FleetView export file.")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("user")
          .setDescription(
            "Generates a Fleetview export file for the specified user."
          )
          .addUserOption((option) =>
            option.setName("user").setDescription("Search for a user")
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("org")
          .setDescription(
            "Generates a Fleetview export file for the entire organization."
          )
      ),
    new SlashCommandBuilder()
      .setName("stats")
      .setDescription(
        "Display org fleet statistics or show detailed info about a single vehicle."
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("vehicle")
          .setDescription("Get information about a specific vehicle.")
          .addStringOption((option) =>
            option
              .setName("vehicle")
              .setDescription("Vehicle to search for")
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("org")
          .setDescription("Get statistics about this organization.")
      ),
    new SlashCommandBuilder()
      .setName("options")
      .setDescription("Set application options")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set_default_guild")
          .setDescription(
            "Set server to use in DMs. Useful if you are in multiple servers service by FleetBot."
          )
      ),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "9" }).setToken(token);

  if (client.application == null) {
    throw "Application not initialized";
  }

  console.log("Started refreshing application (/) commands.");

  await rest.put(Routes.applicationCommands(client.application.id), {
    body: commands,
  });

  console.log("Successfully set application (/) commands.");
}

export function registerOnReady() {
  client.once("ready", async () => {
    console.log("Discord client reports ready.");

    // Cache guild members (to support PM features)
    await doIntervalActions();
    setInterval(doIntervalActions, 600_000);

    // Schedule daily backups.
    await doBackup();
    setInterval(doBackup, 86_400_000);

    await User.sync();
    ShipDao.sync();

    await registerCommands();
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

async function processCommand(message: CommandInteraction) {
  await updateCache(message);

  const { command, subCommand } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (!guildId) {
    return;
  }

  commandsLogger.info(
    `[${getUserTag(message)}-${getUserId(
      message
    )}] executed command [${getMessageContent(message)}]`
  );

  switch (command) {
    case "inventory":
      switch (subCommand) {
        case "add":
          await Commands.AddShipCommand(message);
          break;
        case "remove":
        case "clear":
          await Commands.RemoveShipCommand(message);
          break;
        case "view":
        case "org":
          await Commands.InventoryCommand(message);
          break;
      }
      break;
    case "search":
      await Commands.SearchCommand(message);
      break;
    case "fleetview":
      await Commands.FleetViewCommand(message);
      break;
    case "import":
      await Commands.ImportCommand(message);
      break;
    case "admin":
      switch (subCommand) {
        case "delete":
          await Commands.RemoveAllCommand(message);
          break;
        case "disconnected":
          await Commands.AdminUsersCommand(message);
          break;
        case "clear":
          await Commands.AdminClearCommand(message);
          break;
      }
      break;
    case "stats":
      await Commands.StatsCommand(message);
      break;
    case "options":
      const guilds = await getUserGuilds(message);
      await SetDefaultGuild(message, guilds);
      break;
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
  client.on("messageCreate", async (message: Discord.Message) => {
    if (client.user?.id != message.author.id) {
      if (client.user?.id && message.mentions.users.has(client.user.id)) {
        const { command } = await getCommand(message);

        if (command === "db" && User.isAdmin(getUserId(message))) {
          await Commands.DownloadDBCommand(message);
        } else if (command === "update" && User.isAdmin(getUserId(message))) {
          await Commands.UpdateFleetBotCommand(message);
        }
      }
    }
  });
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
      } else if (interaction.isAutocomplete()) {
        const value = interaction.options.getFocused(true).value.toString();

        const options = findShipAutocomplete(value).map((s) => {
          return {
            name: s.name,
            value: s.name,
          };
        });

        await interaction.respond(options);
      }
    } catch (e) {
      if (e instanceof DiscordAPIError) {
        console.log(e);
      } else {
        throw e;
      }
    }
  });
}
