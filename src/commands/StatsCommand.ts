import Discord from "discord.js";
import {
  findShip,
  getCommand,
  getGuildId,
  getTotalUec,
  getTotalUsd,
  replyTo,
} from "../utils";
import { ShipDao, Ships } from "../models/Ships";
import _ from "lodash";
import { FleetBotCommand } from "./FleetBotCommand";

export class StatsCommand implements FleetBotCommand {
  async execute(message: Discord.Message): Promise<void> {
    const { commandArgs } = getCommand(message);

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
      const guildId = getGuildId(message);
      if (guildId == null) return;

      const ships: Ships[] = await ShipDao.findAll(guildId);
      const totalShips = await ShipDao.count();

      const owners = Object.entries(
        _.groupBy(ships, (ship: Ships) => ship.owner.lastKnownTag)
      );

      const totalUsd = getTotalUsd(ships).toLocaleString();
      const totalUec = getTotalUec(ships).toLocaleString();

      let reply =
        `We have **${totalShips}** ships contributed by **${owners.length}** owners ` +
        `with a total ship value of **$${totalUsd}** ` +
        `(**${totalUec} UEC** for ships available for in-game purchase).\n\n`;

      reply +=
        "**Contributors**: " +
        owners
          .map((o) => o[0].split("#")[0])
          .sort()
          .join(", ");

      replyTo(message, reply);
    }
  }
}
