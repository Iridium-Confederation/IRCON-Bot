import Discord, { Snowflake } from "discord.js";
import fetch from "node-fetch";
import { ShipDao, Ships } from "./models/Ships";
import { User } from "./models/User";
import { client, PREFIX } from "./handlers/DiscordHandlers";

let allowedShips: FleetViewShip[];

export function replyTo(
  message: Discord.Message,
  ...contents: Parameters<Discord.TextChannel["send"]>
) {
  if (contents[0].length >= 2000) {
    message.channel.send("Reply too long. Try a smaller query.").then(() => {});
  } else {
    message.channel.send(...contents).then(() => {});
  }
}

export function getCommand(message: Discord.Message) {
  const input = message.content.slice(PREFIX.length + 1).split(" ");
  const command = input.shift();
  const commandArgs = input.join(" ");
  return { command, commandArgs };
}

export function sanitizeSlug(shipName: string) {
  return shipName.replace(/[.']/g, "-");
}

export function findShip(shipName: string): FleetViewShip | undefined {
  // A list of tokens people shouldn't be able to search on. This helps keep searches accurate.
  const blacklist = ["pirate", "edition", "explorer"];
  if (blacklist.find((item) => item === shipName) || shipName.length <= 1) {
    return;
  }

  shipName = shipName?.toLowerCase();
  const success = allowedShips.find(
    (s) =>
      s.name.toLowerCase() === shipName ||
      s.rsiName.toLowerCase() === shipName ||
      s.rsiSlug.toLowerCase() === sanitizeSlug(shipName) ||
      s.slug.toLowerCase() === sanitizeSlug(shipName) ||
      s.rsiName.toLowerCase().replace(/-/gi, " ") === shipName
  );

  if (success) {
    return success;
  } else if (/\s/g.test(shipName)) {
    return (
      // Everything except the first word
      findShip(shipName.substring(shipName.indexOf(" ") + 1)) ||
      // Everything except the last word
      findShip(shipName.substring(0, shipName.lastIndexOf(" "))) ||
      // findShip(shipName.replace(/\s/g, "")) ||
      shipName
        .split(" ")
        .map((t) => findShip(t))
        .find((t) => t)
    );
  } else {
    const re = new RegExp(`\\b${shipName}\\b`, "i");
    return allowedShips.find((s) => s.name.match(re));
  }
}

export async function refreshShipList() {
  try {
    const p1 = await fetch(
      "https://api.fleetyards.net/v1/models?perPage=200&page=1"
    );
    const p2 = await fetch(
      "https://api.fleetyards.net/v1/models?perPage=200&page=2"
    );

    allowedShips = (await p1.json()).concat(await p2.json());
  } catch (e) {
    console.log(`Failed to fetch ship list: ${e}`);
    process.exit(1);
  }
}

export function getTotalUsd(ships: Ships[]): Number {
  const total = ships
    .map((ship) => findShip(ship.shipname)?.lastPledgePrice)
    .reduce((a, b) => (a ? a : 0) + (b ? b : 0), 0);

  return total ? total : 0;
}

export function getTotalUec(ships: Ships[]): Number {
  const total = ships
    .map((ship) => findShip(ship.shipname)?.price)
    .reduce((a, b) => (a ? a : 0) + (b ? b : 0), 0);

  return total ? total : 0;
}

export function getUserGuilds(message: Discord.Message) {
  return client.guilds.cache.filter(
    (g) => g.members.cache.get(message.author.id) != null
  );
}

export async function getGuildId(message: Discord.Message) {
  if (message.guild) {
    return message.guild.id;
  } else {
    const guilds = getUserGuilds(message);
    const user = (await User.findById(message.author.id))[0];

    if (user.defaultGuildId) {
      if (guilds.get(user.defaultGuildId) == null) {
        replyTo(
          message,
          "You are no longer connected to your default guild. Please set a new one.\n"
        );
        user.defaultGuildId = null;
        user.save();
      } else {
        return user.defaultGuildId;
      }
    }

    if (guilds.size > 1 && user.defaultGuildId == null) {
      replyTo(
        message,
        "You have joined multiple Discord guilds serviced by FleetBot.\n\n" +
          guilds.map((g) => `**${g.name}** (id: ${g.id})`).join("\n") +
          "\n\n" +
          "Select one as your default for private messaging using: **!fb set default_guild [GUILD_ID]**"
      );
    } else if (guilds.size == 1) {
      return guilds.values().next()?.value.id;
    } else {
      replyTo(
        message,
        "You are not part of any Discord guilds serviced by FleetBot."
      );
    }
  }
}

export function addShip(
  shipName: string,
  message: Discord.Message,
  guildId: Snowflake
) {
  const foundShip = findShip(shipName);
  if (foundShip) {
    ShipDao.create({
      shipname: foundShip.name,
      discordUserId: message.author.id,
      guildId: guildId,
    });
    return foundShip;
  } else {
    return;
  }
}

export async function updateUser(newUser: Discord.User | Discord.PartialUser) {
  let dbUser = (await User.findById(newUser.id))[0];
  if (!dbUser) {
    dbUser = new User();
    dbUser.lastKnownTag = newUser.tag ? newUser.tag : "";
  }
  dbUser.discordUserId = newUser.id;
  dbUser.lastKnownTag = newUser.tag ? newUser.tag : "";
  dbUser.save();
}

export function hasRole(message: Discord.Message, role: string) {
  const hasRole = client.guilds.cache
    .map((g) => g.roles.cache.find((r) => r.name === role))
    .find(
      (r) => r && r.members.find((member) => member.id === message.author.id)
    );

  return hasRole != null;
}
