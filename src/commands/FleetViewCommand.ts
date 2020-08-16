import Discord from "discord.js";
import { getCommand, getGuildId, replyTo } from "../utils";
import { ShipDao, Ships } from "../models/Ships";
import { FleetBotCommand } from "./FleetBotCommand";

export class FleetViewCommand implements FleetBotCommand {
  async execute(message: Discord.Message): Promise<void> {
    const { commandArgs } = getCommand(message);

    const guildId = getGuildId(message);
    if (guildId == null) return;

    let username;
    if (commandArgs === "-org") {
      username = "%";
    } else if (Boolean(commandArgs)) {
      username = commandArgs + "#%";
    } else {
      username = message.author.tag;
    }

    const fleetview = (
      await ShipDao.findShipsByOwnerLike(username, guildId as string)
    ).map((t: Ships) => {
      return {
        name: t.shipname,
        shipname: t.owner.lastKnownTag.split("#")[0],
      };
    });

    if (fleetview.length === 0) {
      replyTo(message, "No results found.");
    } else {
      replyTo(
        message,
        "Click <https://www.starship42.com/fleetview/> -> Choose File -> Upload this attachment.\n"
      );
      replyTo(
        message,
        new Discord.MessageAttachment(
          Buffer.from(JSON.stringify(fleetview)),
          "fleetview.json"
        )
      );
    }
  }
}