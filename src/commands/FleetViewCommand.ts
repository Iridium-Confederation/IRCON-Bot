import { AttachmentBuilder, CommandInteraction } from "discord.js";
import { getCommand, getGuildId, replyTo } from "../utils";
import { ShipDao, Ships } from "../models/Ships";
import { FleetBotCommandInteraction } from "./FleetBotCommand";

export const FleetViewCommand: FleetBotCommandInteraction = async (
  message: CommandInteraction
) => {
  if (!message.isChatInputCommand()) return;
  const { subCommand } = await getCommand(message);

  const guildId = await getGuildId(message);
  if (guildId == null) return;

  const ships = subCommand === "user"
    ? await ShipDao.findShipsByOwnerId((message.options.getUser("user") || message.user).id, guildId)
    : await ShipDao.findAll(guildId);
  const fleetview = ships.map(
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
      "<https://fleetyards.net/>\n" +
      "1. Login\n" +
      "2. Click **My Hangar**\n" +
      "3. Click **... → Import** \n\n" +
      "Note: As of October 2025, Starship42 has been retired and is no longer maintained.\n";


    replyTo(
      message,
      replyStr,
      new AttachmentBuilder(Buffer.from(JSON.stringify(fleetview))).setName(
        "fleetview"
      )
    );
  }
};
