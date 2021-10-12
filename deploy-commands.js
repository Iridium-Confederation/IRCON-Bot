const { SlashCommandBuilder } = require("@discordjs/builders");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const token = require("./botconfig.json");

// production
// const clientId = "744369194140958740";
// development
const clientId = "712862078389583953";
// const guildId = "744366532636967085";

const commands = [
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
        .setDescription("View an inventory.")
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
        .setName("reset_default_guild")
        .setDescription("Resets your default guild for PM communication.")
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "9" }).setToken(token);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    // await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    //   body: [],
    // });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
