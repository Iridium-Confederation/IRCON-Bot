import Discord from "discord.js";
import {
  Communication,
  findShip,
  getCommand,
  getGuildId,
  getGuildUser,
  getTotalUec,
  getTotalUsd,
  getUserGuilds,
  replyTo,
} from "../utils";
import { ShipDao, Ships } from "../models/Ships";
import _ from "lodash";
import { FleetBotCommand } from "./FleetBotCommand";
import { User } from "../models/User";

export const StatsCommand: FleetBotCommand = async (message: Communication) => {
  const guildId = await getGuildId(message);
  if (!guildId) return;

  const commandArgs =
    message instanceof Discord.Message
      ? (await getCommand(message)).commandArgs
      : message.options.getString("vehicle", false);

  if (commandArgs) {
    const ship = findShip(commandArgs);
    if (ship) {
      let msg = "";
      msg += `The **${ship.rsiName}** is a **${ship.size}** vessel${
        ship.classification
          ? `, with a **${ship.classification.toLowerCase()}** specialization`
          : ""
      }. `;
      msg += ship.description ? ship.description : "";
      msg += "\n\n";
      msg += ship.brochure ? `Brochure: ${ship.brochure}\n` : "";
      msg += ship.price
        ? `Available for in-game purchase for **${ship.price}** UEC.\n`
        : "";
      msg += `RSI Link: <${ship.storeUrl}>\n`;
      msg += !ship.onSale
        ? `Not currently available for pledge. Last known pledge cost **$${ship.lastPledgePrice}**.\n`
        : "";
      msg += ship.onSale
        ? `Currently available for pledge for **$${ship.pledgePrice}**. Pledging is completely optional and exists so you can support the game. All ships will be available for in-game purchase with UEC.\n`
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
    const totalUec = getTotalUec(ships).toLocaleString();
    const currentGuild = (await getUserGuilds(message)).get(guildId);

    let reply =
      `**${currentGuild?.name}** currently has **${totalShips}** ships contributed by **${owners.length}** owners ` +
      `with a total ship value of **$${totalUsd}** ` +
      `(**${totalUec} UEC** for ships available for in-game purchase).\n\n`;

    Promise.all(
      owners.map(async (o) => {
        const dbId = o[0];
        const member = await getGuildUser(dbId, guildId);
        const retVal =
          member && member.nickname
            ? member.nickname
            : (await User.findById(dbId))[0].lastKnownTag.split("#")[0];
        console.log(member);
        console.log(retVal);
        return retVal;
      })
    ).then((values) => {
      console.log(values);
      reply += "**Contributors**: ";
      reply += values.sort().join(", ");
      if (owners.length == 0) {
        reply += "None yet. Why not be the first?";
      }
      replyTo(message, reply);
    });
  }
};
