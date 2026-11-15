import { CommandInteraction } from "discord.js";
import {
  findShip,
  getGuildId,
  getGuildUser,
  getTotalUsd,
  getUserGuilds,
  replyTo,
} from "../utils";
import { ShipDao, Ships } from "../models/Ships";
import _ from "lodash";
import { FleetBotCommandInteraction } from "./FleetBotCommand";
import { User } from "../models/User";
import { escapeDiscordText } from "../discord-text";

export const StatsCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  const guildId = await getGuildId(message);
  if (!guildId) return;
  if (!message.isChatInputCommand()) return;

  const commandArgs = message.options.getString("vehicle", false);

  if (commandArgs) {
    const ship = findShip(commandArgs);
    if (ship) {
      let msg = "";
      msg += `The **${escapeDiscordText(ship.rsiName)}** is a **${escapeDiscordText(ship.metrics?.sizeLabel || ship.metrics?.size || ship.size || "Unknown size")}** vessel${
        ship.classification
          ? `, with a **${escapeDiscordText(ship.classification.toLowerCase())}** specialization`
          : ""
      }. `;
      msg += ship.description ? escapeDiscordText(ship.description) : "";
      msg += "\n\n";
      msg += ship.brochure ? `[Brochure](${ship.brochure}) - ` : "";
      msg += ship.storeUrl ? `[RSI Store](${ship.storeUrl})\n` : "";
      msg += !ship.onSale
        ? `Not currently available for pledge. Last known pledge cost **$${ship.lastPledgePrice}**.\n`
        : "";
      msg += ship.onSale
        ? `Currently available for pledge for **$${ship.pledgePrice}**. Pledging is completely optional and exists so you can support the game.\n`
        : "";

      replyTo(message, msg);
    } else {
      replyTo(message, "Ship not found.");
    }
  } else {
    // Total org statistics
    const ships: Ships[] = await ShipDao.findAll(guildId);
    const totalShips = ships.length;

    const owners = Object.entries(
      _.groupBy(ships, (ship: Ships) => ship.owner.discordUserId)
    );

    const totalUsd = getTotalUsd(ships).toLocaleString();
    const currentGuild = (await getUserGuilds(message)).get(guildId);

    let reply =
      `**${escapeDiscordText(currentGuild?.name || "Unknown server")}** currently has **${totalShips}** ships contributed by **${owners.length}** owners ` +
      `with a total ship value of **$${totalUsd}**.\n\n`;

    const values = await Promise.all(
      owners.map(async (o) => {
        const dbId = o[0];
        const member = await getGuildUser(dbId, guildId);
        const retVal =
          member && member.nickname
            ? member.nickname
            : (await User.findById(dbId))[0].lastKnownTag.split("#")[0];
        return escapeDiscordText(retVal);
      })
    );
    reply += "**Contributors**: ";
    reply += values.sort().join(", ");
    if (owners.length == 0) {
      reply += "None yet. Why not be the first?";
    }
    return replyTo(message, reply);
  }
};
