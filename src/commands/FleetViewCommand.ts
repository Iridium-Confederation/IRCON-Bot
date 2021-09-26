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
  const { commandArgs } = await getCommand(message);

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
  } else {
    const user = message.options.getUser("user");
    if (user) {
      username = user.tag;
    } else {
      username = getUserTag(message);
    }
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
    replyTo(message, "No results found.");
  } else {
    replyTo(
      message,
      "Click <https://www.starship42.com/fleetview/> -> Choose File -> Upload this attachment.\n",
      new Discord.MessageAttachment(
        Buffer.from(JSON.stringify(fleetview)),
        "fleetview.json"
      )
    );
  }
};
