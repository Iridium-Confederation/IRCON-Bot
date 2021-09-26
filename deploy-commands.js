const { SlashCommandBuilder } = require("@discordjs/builders");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const token = require("./botconfig.json");

const clientId = "712862078389583953";
const guildId = "450060203845484554";

const commands = [
  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("Manager your inventory.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a vehicle to your fleet.")
        .addStringOption((option) =>
          option
            .setName("vehicle")
            .setDescription("Vehicle to add")
            .setRequired(true)
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
        .setDescription("View a user's inventory.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to search for")
            .setRequired(false)
        )
    ),
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search your organization for a vehicle.")
    .addStringOption((option) =>
      option
        .setName("vehicle")
        .setRequired(true)
        .setDescription("Search for a vehicle")
    ),
  new SlashCommandBuilder()
    .setName("fleetview")
    .setDescription("Generates a FleetView file for yourself or others.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Search for a user")
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
            .setDescription("Vehicle to search for.")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("org")
        .setDescription("Get statistics about this organization.")
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "9" }).setToken(token);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: [],
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
