const { SlashCommandBuilder } = require("@discordjs/builders");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const token = require("./botconfig.json");

const clientId = "712862078389583953";
const guildId = "450060203845484554";

const commands = [
  new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a vehicle to your inventory.")
    .addStringOption((option) =>
      option
        .setName("vehicle")
        .setRequired(true)
        .setDescription("Add a vehicle")
    ),
  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a vehicle from your inventory.")
    .addStringOption((option) =>
      option
        .setName("vehicle")
        .setRequired(true)
        .setDescription("Remove a vehicle")
    ),
  new SlashCommandBuilder()
    .setName("remove_all")
    .setDescription("Removes all vehicles from your fleet."),
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
    .setName("inventory")
    .setDescription("Display your inventory or someone else's inventory.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Search for a user")
    ),
  // new SlashCommandBuilder()
  //   .setName("inventory_org")
  //   .setDescription("List all org vehicles."),
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
    .addStringOption((option) =>
      option.setName("user").setDescription("Vehicle to search for.")
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "9" }).setToken(token);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(clientId), {
      body: [],
    });

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
