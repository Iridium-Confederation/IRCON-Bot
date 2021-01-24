import Discord, { MessageAttachment, Snowflake } from "discord.js";
import fetch from "node-fetch";
import { ShipDao, Ships } from "./models/Ships";
import { User } from "./models/User";
import { client, PREFIX } from "./handlers/DiscordHandlers";
const tabletojson = require("tabletojson").Tabletojson;

let allowedShips: FleetViewShip[];
export let loanersMap = new Map<string | undefined, FleetViewShip[]>();

function reply(
  message: Discord.Message,
  body: string,
  attachment: MessageAttachment | undefined,
  title?: string
) {
  PREFIX(message).then((prefix) => {
    const command = message.content.replace(prefix, "").split(" ")[0];
    const embed = new Discord.MessageEmbed()
      .setColor("#0099ff")
      .setTitle(title ? title : command)
      .setDescription(body);

    if (attachment) {
      embed.attachFiles([attachment]);
    }

    message.channel.send(embed).then(() => {});
  });
}

export function replyTo(
  message: Discord.Message,
  contents: string,
  attachment?: MessageAttachment,
  title?: string
) {
  if (contents.length >= 2000) {
    const msg: string = contents;

    let start = 0;
    const chunkSize = 1500;

    while (true) {
      // The remaining chunk can be smaller.
      if (start + chunkSize >= msg.length) {
        const body = msg.substring(start);
        reply(message, body, attachment, title);
        return;
      }

      // Create a chunkSize chunk, reducing it to find a newline.
      for (let index = start + chunkSize - 1; index >= start; index--) {
        if (msg[index] == "\n") {
          // newline found
          const body = msg.substring(start, index + 1);
          reply(message, body, attachment, title);
          start = index + 1;
          break;
        } else if (index == start) {
          // newline not found. Send whole chunk.
          const body = msg.substr(start, chunkSize);
          reply(message, body, attachment, title);
          start += chunkSize;
          break;
        }
      }
    }
  } else {
    reply(message, contents, attachment, title);
  }
}

export async function getCommand(message: Discord.Message) {
  const input = message.content
    .substr((await PREFIX(message)).length)
    .trimLeft()
    .split(" ");
  const command = input.shift();
  const commandArgs = input.join(" ");
  return { command, commandArgs };
}

export function sanitizeSlug(shipName: string) {
  return shipName.replace(/[.']/g, "-");
}

export function findShip(
  shipName: string,
  ship: Ships | null = null
): FleetViewShip | undefined {
  // A list of tokens people shouldn't be able to search on. This helps keep searches accurate.
  const blacklist = ["pirate", "edition", "explorer"];
  if (blacklist.find((item) => item === shipName) || shipName.length <= 1) {
    return;
  }

  // Skip search if there's a cache hit.
  if (ship && ship.fleetyardsId) {
    const cache = allowedShips.find((s) => s.id == ship.fleetyardsId);
    if (cache) {
      return cache;
    } else {
      ship.fleetyardsId = null;
      ship.save();
    }
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

export function isNotNullOrUndefined<T extends Object>(
  input: null | undefined | T
): input is T {
  return input != null;
}

function getLoaners() {
  interface Loaner {
    "Your Ship": string;
    "Loaner(s)": string;
  }

  return tabletojson.convertUrl(
    "https://www.citizen-logbook.com/loaner-ship-matrix.html",
    function (tablesAsJson: any) {
      const conceptShips: Loaner[] = tablesAsJson[0];
      const convertedLoaners = conceptShips
        .map((l) => {
          const ship = l["Your Ship"];
          const loaners = l["Loaner(s)"]
            .split(", ")
            .map((loaner) => {
              const convertedLoaner = findShip(loaner);
              if (convertedLoaner) {
                return convertedLoaner;
              } else {
                console.log("Loaner match failed: " + loaner);
              }
            })
            .filter(isNotNullOrUndefined);

          const conceptShip = findShip(ship);
          if (!conceptShip) {
            console.log("Concept ship match failed: " + ship);
          } else {
            return { key: conceptShip.id, val: loaners };
          }
        })
        .filter(isNotNullOrUndefined);

      loanersMap = new Map(convertedLoaners.map((obj) => [obj.key, obj.val]));
    }
  );
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

  try {
    await getLoaners();
  } catch (e) {
    console.warn(`Failed to fetch loaner list: ${e}`);
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

export async function getGuildId(
  message: Discord.Message,
  reply: boolean = true
): Promise<string | null> {
  if (message.guild) {
    return message.guild.id;
  } else {
    const guilds = getUserGuilds(message);
    const user = (await User.findById(message.author.id))[0];

    if (user.defaultGuildId) {
      if (guilds.get(user.defaultGuildId) == null) {
        if (reply) {
          replyTo(
            message,
            "You are no longer connected to your default guild. Please set a new one.\n"
          );
        }
        user.defaultGuildId = null;
        user.save();
      } else {
        return user.defaultGuildId;
      }
    }

    if (guilds.size > 1 && user.defaultGuildId == null) {
      if (reply) {
        replyTo(
          message,
          "You have joined multiple Discord guilds serviced by FleetBot.\n\n" +
            guilds.map((g) => `**${g.name}** (id: ${g.id})`).join("\n") +
            "\n\n" +
            `Select one as your default for private messaging using: !fb {set|clear} default_guild [GUILD_ID]**`
        );
      }
    } else if (guilds.size == 1) {
      return guilds.values().next()?.value.id;
    } else {
      if (reply) {
        replyTo(
          message,
          "You are not part of any Discord guilds serviced by FleetBot."
        );
      }
    }

    return null;
  }
}

export async function addShipCheck(
  message: Discord.Message,
  guildId: Snowflake
): Promise<boolean> {
  let orgCount = await ShipDao.count(guildId);
  if (orgCount > 3_000) {
    replyTo(
      message,
      "Org limit reached. Contact developers to increase limit."
    );
    return false;
  } else {
    return true;
  }
}

export function addShip(
  shipName: string,
  message: Discord.Message,
  guildId: Snowflake
): FleetViewShip | undefined {
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
