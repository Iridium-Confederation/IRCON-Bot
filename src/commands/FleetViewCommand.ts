import Discord from "discord.js";
import {
  Communication,
  getCommand,
  getGuildId,
  getUserTag,
  replyTo,
} from "../utils";
import { ShipDao, Ships } from "../models/Ships";
import { FleetBotCommand } from "./FleetBotCommand";

export const FleetViewCommand: FleetBotCommand = async (
  message: Communication
) => {
  const { commandArgs, subCommand } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;

  let username;
  if (message instanceof Discord.Message) {
    if (commandArgs === "-org") {
      username = "%";
    } else if (Boolean(commandArgs)) {
      username = commandArgs + "#%";
    } else {
      username = getUserTag(message);
    }
  } else if (subCommand === "user") {
    const user = message.options.getUser("user");
    if (user) {
      username = user.tag;
    } else {
      username = getUserTag(message);
    }
  } else {
    username = "%";
  }

  const fleetview = (await ShipDao.findShipsByOwnerLike(username, guildId)).map(
    (t: Ships) => {
      return {
        name: t.shipname,
        shipname: t.owner.lastKnownTag.split("#")[0],
      };
    }
  );

  if (fleetview.length === 0) {
    replyTo(message, "No vehicles found.");
  } else {
    const replyStr =
      "Export options:\n\n" +
      "<https://www.starship42.com/fleetview/>\n" +
      "1. Click **Choose File**\n" +
      "2. Click **Upload this attachment**\n" +
      "\n" +
      "<https://fleet-manager.space>\n" +
      "1. Login\n" +
      "2. Click **Import**\n";

    replyTo(
      message,
      replyStr,
      new Discord.MessageAttachment(
        Buffer.from(JSON.stringify(fleetview)),
        "fleetview"
      )
    );
  }
};
