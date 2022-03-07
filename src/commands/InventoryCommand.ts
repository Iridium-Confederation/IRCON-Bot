import { FleetBotCommandInteraction } from "./FleetBotCommand";
import {
  findShip,
  getCommand,
  getGuildId,
  getGuildUser,
  getTotalUec,
  getUserGuilds,
  getUserId,
  replyTo,
} from "../utils";
import { ShipDao } from "../models/Ships";
import _ from "lodash";
import { CommandInteraction } from "discord.js";
import { client } from "../handlers/DiscordHandlers";
import { User } from "../models/User";

export const InventoryCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  const { commandArgs } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;
  const guild = await client.guilds.cache.get(guildId);
  if (!guild) return;

  const opUser = message.options.getUser("user", false);
  const ships = await ShipDao.findShipsByOwnerId(
    opUser ? opUser.id : getUserId(message),
    guildId
  );

  const totalUec = getTotalUec(ships).toLocaleString();

  let firstUserFound: string = "";
  const shipStr = Object.entries(
    _.groupBy(ships, (ship) => findShip(ship.shipname)?.rsiName)
  )
    .map((group) => {
      const shipNameDb = group[0];
      const shipCount = group[1].length;
      const ship = findShip(shipNameDb);
      const loaners = ship?.loaners;

      firstUserFound = firstUserFound
        ? firstUserFound
        : group[1][0].owner.discordUserId;

      const showItem =
        firstUserFound === group[1][0].owner.discordUserId ||
        commandArgs.includes("-org");

      const loanerStr =
        loaners && loaners.length > 0
          ? `\nLoaner: *${loaners
              .map((l) => findShip(l.slug)?.name)
              .filter((s) => s)
              .join(", ")}*`
          : "";

      const line =
        `**${ship?.rsiName} ${shipCount > 1 ? " x " + shipCount : ""}** ` +
        loanerStr;

      return showItem ? line : "";
    })
    .sort()
    .filter((s) => s.length > 0)
    .join("\n");

  const currentGuild = (await getUserGuilds(message)).get(guildId);
  let header;
  let subHeader = "**Ship x Quantity** *(Loaners)*\n\n";

  if (commandArgs.includes("-org")) {
    header = `${currentGuild?.name}'s inventory:\n`;
  } else {
    if (firstUserFound) {
      const discordUser = await getGuildUser(firstUserFound, guildId);

      header = `${
        discordUser?.displayName
          ? discordUser.displayName
          : (await User.findById(firstUserFound))[0].lastKnownTag.split("#")[0]
      }'s inventory (**${totalUec} UEC**):\n`;
    } else {
      header = "User not found or has no ships.";
      subHeader = "";
    }
  }

  replyTo(message, subHeader + shipStr, undefined, header);
};
