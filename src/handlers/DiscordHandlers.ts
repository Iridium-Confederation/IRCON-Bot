import Discord, {
  CommandInteraction,
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
  sleep,
} from "../utils";
import * as Commands from "../commands";
import { commandsLogger } from "../logging/logging";
import fs from "fs";
import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import _ from "lodash";
import { findShipAutocomplete } from "../utils";

const { Routes } = require("discord-api-types/v9");

const token = require("../../botconfig.json");
const rest = new REST({ version: "9" }).setToken(token);
export const guildsIncorrectPermissions = new Set<Snowflake>();

const admins = require("../../admins.json");

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

export async function login() {
  const output = await client.login(token);

  if (!output) {
    console.log("Failed to login");
  }
}

// Do a database backup over )discord
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

async function cacheGuildMembers() {
  const guilds = Array.from(client.guilds.cache.values());

  const chunks = _.chunk(guilds, 10);
  let numFailures = 0;
  for (const chunk of chunks) {
    await sleep(1000);

    await Promise.all(
      chunk.map((g) => {
        g.members.fetch().catch(() => {
          numFailures++;
        });
      })
    );
  }
  console.log(
    `Failed fetching members for ${numFailures}/${client.guilds.cache.size} servers.`
  );

  numFailures = 0;
  for (const chunk of chunks) {
    await sleep(1000);

    await Promise.all(
      chunk.map((g) => {
        g.commands.fetch().catch(() => {
          numFailures++;
        });
      })
    );
  }
  console.log(
    `Failed fetching commands for ${numFailures}/${client.guilds.cache.size} servers.`
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

    const chunks = _.chunk(Array.from(client.guilds.cache.values()), 25);

    for (const chunk of chunks) {
      await sleep(1000);

      await Promise.all(
        chunk.map((g) => {
          rest
            .put(Routes.applicationGuildCommands(client.user.id, g.id), {
              body: commands,
            })
            .catch(() => {
              guildsIncorrectPermissions.add(g.id);
            });
        })
      );
    }
  }

  console.log(
    `Failed creating commands for ${guildsIncorrectPermissions.size}/${client.guilds.cache.size} servers.`
  );
}

async function updateGuildCommandPermissions() {
  const chunks = _.chunk(Array.from(client.guilds.cache.values()), 10);

  for (const chunk of chunks) {
    await sleep(1000);

    await Promise.all(
      chunk.map((guild) => {
        const command = guild.commands.cache.find(
          (command) => command.name === "admin"
        );

        if (command) {
          command.permissions
            .set({
              permissions: [
                {
                  id: guild.ownerId,
                  type: "USER",
                  permission: true,
                },
              ],
            })
            .catch(() => {});
        }
      })
    );
  }
}

export function registerRateLimit() {
  client.once("rateLimit", async (limitData) => {
    console.log("Rate limit: " + JSON.stringify(limitData));
  });
}

async function doIntervalActions() {
  // TODO: find a more elegant solution to rate limiting.
  // Each method here should exceed no more than 25 requests/s (out of global limit of 50).
  await cacheGuildMembers();
  await setGuildCommands();
  await updateGuildCommandPermissions();
}

export function registerOnReady() {
  client.once("ready", async () => {
    console.log("Discord client reports ready.");

    // Cache guild members (to support PM features)
    await doIntervalActions();
    setInterval(doIntervalActions, 120_000);

    // Schedule daily backups.
    await doBackup();
    setInterval(doBackup, 86_400_000);

    await User.sync();
    ShipDao.sync();
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

async function processCommand(message: CommandInteraction) {
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
      await Commands.ClearDefaultGuild(message);
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

  client.on("message", async (message: Communication) => {
    if (
      message instanceof Discord.Message &&
      client.user?.id != message.author.id
    ) {
      if (
        message.content.startsWith(await PREFIX()) ||
        (client.user?.id && message.mentions.users.has(client.user.id))
      ) {
        commandsLogger.info(
          `[${getUserTag(message)}-${getUserId(
            message
          )}] executed command [${getMessageContent(message)}]`
        );

        const { command } = await getCommand(message);

        if (command === "db" && User.isAdmin(getUserId(message))) {
          await Commands.DownloadDBCommand(message);
        } else if (command === "update" && User.isAdmin(getUserId(message))) {
          await Commands.UpdateFleetBotCommand(message);
        } else {
          replyTo(
            message,
            "The !fb prefix is being retired. Type / to see valid commands.\n\n" +
              "If you do not see any commands listed after typing /, the bot may need to be kicked and reinvited using this link:\n" +
              "https://discord.com/oauth2/authorize?client_id=744369194140958740&permissions=51200&scope=bot%20applications.commands\n\n" +
              "Questions? Join the Fleetbot development Discord server.\n" +
              "https://discord.gg/Ru8WqyG"
          );
        }
      }
    }
  });
}
