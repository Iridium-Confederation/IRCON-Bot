import Discord, {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonInteraction,
  Interaction,
  InteractionUpdateOptions,
  MessageActionRowComponentBuilder,
  SelectMenuInteraction,
  Snowflake,
} from "discord.js";
import fetch from "node-fetch";
import { ShipDao, Ships } from "./models/Ships";
import { User } from "./models/User";
import { client, memberGuildsCache } from "./handlers/DiscordHandlers";

import { SetDefaultGuild } from "./commands";

let allowedShips: FleetViewShip[] = [];

const MAX_SHIP_SEARCH_LENGTH = 200;
const MAX_SHIP_SEARCH_TOKENS = 20;

export type Communication = Discord.Message | Discord.CommandInteraction;

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function reply(
  message: Communication | ButtonInteraction | SelectMenuInteraction,
  body: string,
  attachment: AttachmentBuilder | undefined,
  title: string | undefined,
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] | undefined,
  ephemeral: boolean,
  followUp: boolean
) {
  const embed = new Discord.EmbedBuilder().setColor("#0099ff");
  if (body) embed.setDescription(body);
  if (title) embed.setTitle(title);
  const payload = {
    embeds: [embed], files: attachment ? [attachment] : [],
    components: rows || [], allowedMentions: { parse: [] as never[] },
  };
  if (message instanceof Discord.Message) {
    await message.reply(payload);
  } else if (followUp || message.replied) {
    await message.followUp({ ...payload, flags: ephemeral ? Discord.MessageFlags.Ephemeral : undefined });
  } else if (message.deferred) {
    await message.editReply(payload);
  } else {
    await message.reply({ ...payload, flags: ephemeral ? Discord.MessageFlags.Ephemeral : undefined });
  }
}

export function update(
  message: SelectMenuInteraction | ButtonInteraction,
  updateOptions: InteractionUpdateOptions
) {
  message
    .update(updateOptions)
    .catch((e) => console.log(e))
    .then(() => {});
}
export async function replyTo(
  message: Communication | ButtonInteraction | SelectMenuInteraction,
  contents: string,
  attachment?: AttachmentBuilder,
  title?: string,
  rows?: ActionRowBuilder<MessageActionRowComponentBuilder>[],
  ephemeral?: boolean
) {
  const privateReply = ephemeral === true || (!(message instanceof Discord.Message) && message.ephemeral === true);
  const chunks: string[] = [];
  if (contents.length < 2000) {
    chunks.push(contents);
  } else {
    for (let start = 0; start < contents.length;) {
      let end = Math.min(start + 1800, contents.length);
      if (end < contents.length) {
        const newline = contents.lastIndexOf("\n", end - 1);
        if (newline >= start) end = newline + 1;
        // Do not split a UTF-16 surrogate pair across Discord messages.
        else if (contents.charCodeAt(end - 1) >= 0xd800 && contents.charCodeAt(end - 1) <= 0xdbff) end--;
      }
      chunks.push(contents.slice(start, end));
      start = end;
    }
  }
  try {
    for (let index = 0; index < chunks.length; index++) {
      await reply(message, chunks[index], index === 0 ? attachment : undefined,
        index === 0 ? title : undefined, index === 0 ? rows : undefined,
        privateReply, index > 0);
    }
  } catch (error) {
    console.log(error);
  }
}

export async function getCommand(message: Communication) {
  if (message instanceof Discord.Message && message.mentions.users.size > 0) {
    const input = message.content.replaceAll(/<.*> /g, "").split(" ");

    const command = input.shift();
    const commandArgs = input.join(" ");

    return { command, commandArgs };
  } else if (message instanceof Discord.Message) {
    const command = "";
    const commandArgs = "";
    return { command, commandArgs };
  } else if (message.isChatInputCommand()) {
    const command = message.commandName;
    const subCommand = message.options.getSubcommand(false);
    const commandArgs = "";
    return { command, commandArgs, subCommand };
  } else {
    const command = message.commandName;
    const commandArgs = "";
    return { command, commandArgs };
  }
}

export function sanitizeSlug(shipName: string) {
  return shipName.replace(/[.']/g, "-");
}

export function findShipAutocomplete(shipName: string): FleetViewShip[] {
  return allowedShips
    .filter((s) => s.name.toLowerCase().startsWith(shipName.toLowerCase()))
    .sort()
    .slice(0, 20);
}

function findExactShip(shipName: string): FleetViewShip | undefined {
  return allowedShips.find(
    (s) =>
      s.name.toLowerCase() === shipName ||
      s.rsiName.toLowerCase() === shipName ||
      s.rsiSlug.toLowerCase() === sanitizeSlug(shipName) ||
      s.slug.toLowerCase() === sanitizeSlug(shipName) ||
      s.rsiName.toLowerCase().replace(/-/gi, " ") === shipName
  );
}

function findPartialShip(shipName: string): FleetViewShip | undefined {
  const literalName = shipName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${literalName}\\b`, "i");
  return allowedShips.find((s) => s.name.match(re));
}

export function findShip(
  shipName: string,
  ship: Ships | null = null
): FleetViewShip | undefined {
  // A list of tokens people shouldn't be able to search on. This helps keep searches accurate.
  const blacklist = ["pirate", "edition", "explorer", "executive"];
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
      ship.save().then(() => {});
    }
  }

  shipName = shipName.toLowerCase();
  const success = findExactShip(shipName);

  if (success) {
    return success;
  } else if (/\s/g.test(shipName)) {
    const normalizedName = shipName.trim().replace(/\s+/g, " ");
    if (
      normalizedName !== shipName &&
      (blacklist.includes(normalizedName) || normalizedName.length <= 1)
    ) {
      return;
    }

    const normalizedMatch = findExactShip(normalizedName);
    if (normalizedMatch) {
      return normalizedMatch;
    }

    if (normalizedName.length > MAX_SHIP_SEARCH_LENGTH) {
      return;
    }

    const tokens = normalizedName.split(" ");
    if (tokens.length > MAX_SHIP_SEARCH_TOKENS) {
      return;
    }

    if (tokens.length === 1) {
      return findPartialShip(normalizedName);
    }

    // Preserve the previous suffix-first lookup order without recomputing
    // overlapping token ranges recursively.
    const candidates: [number, number][] = [
      [0, tokens.length - 1],
      [1, tokens.length],
    ];
    const searchedCandidates = new Set<string>();

    while (candidates.length > 0) {
      const [start, end] = candidates.pop() as [number, number];
      const candidate = tokens.slice(start, end).join(" ");

      if (searchedCandidates.has(candidate)) {
        continue;
      }
      searchedCandidates.add(candidate);

      if (blacklist.includes(candidate) || candidate.length <= 1) {
        continue;
      }

      const candidateMatch = findExactShip(candidate);
      if (candidateMatch) {
        return candidateMatch;
      }

      if (end - start === 1) {
        const partialMatch = findPartialShip(candidate);
        if (partialMatch) {
          return partialMatch;
        }
      } else {
        candidates.push([start, end - 1], [start + 1, end]);
      }
    }

    return;
  } else {
    if (shipName.length > MAX_SHIP_SEARCH_LENGTH) {
      return;
    }
    return findPartialShip(shipName);
  }
}

export async function refreshShipList() {
  try {
    const readPage = async (page: number): Promise<FleetViewShip[]> => {
      const response = await fetch(
        `https://api.fleetyards.net/v1/models?perPage=240&page=${page}`
      );
      if (!response.ok) throw new Error(`Catalog request failed (status ${response.status}).`);
      const body = await response.json();
      if (!Array.isArray(body?.items)) throw new Error("Invalid catalog response.");
      return body.items;
    };
    const first = await readPage(1);
    const second = await readPage(2);
    const nextShips = first.concat(second)
      .filter((ship) => typeof ship?.rsiName === "string" && ship.rsiName.length > 0 && typeof ship.name === "string")
      .sort((a, b) => a.rsiName.split(" ")[0].localeCompare(b.rsiName.split(" ")[0]) || a.rsiName.length - b.rsiName.length);
    if (!nextShips.length) throw new Error("Catalog contains no ship records.");
    allowedShips = nextShips;
  } catch (error) {
    console.log(`Failed to fetch ship list: ${error}`);
    // A transient refresh failure must not replace a working catalog or restart the bot.
    if (!allowedShips.length) throw error;
  }
}

export function getTotalUsd(ships: Ships[]): Number {
  const total = ships
    .map((ship) => findShip(ship.shipname)?.lastPledgePrice)
    .reduce((a, b) => (a ? a : 0) + (b ? b : 0), 0);

  return total ? total : 0;
}

export async function getUserGuilds(
  message: Communication | Interaction,
  guildId?: string
) {
  const userId = getUserId(message);
  const memberGuilds = guildId
    ? new Set([guildId])
    : new Set(memberGuildsCache.get(userId));

  if (message.inGuild() && message.guild) {
    const value = new Map<string, Discord.Guild>();
    value.set(message.guildId, message.guild);
    return value;
  }

  if (!guildId) {
    for (const guild of client.guilds.cache.values()) {
      if (guild.members.cache?.has(userId)) memberGuilds.add(guild.id);
    }
  }

  const guilds = (
    await Promise.all(
      Array.from(memberGuilds.values()).map(
        async (guildId) => {
          const guild = client.guilds.cache.find(
            (guild) => guild.id == guildId
          );
          if (guild) {
            try {
              await guild.members.fetch(userId);
              return guild;
            } catch (error) {
              if (error && typeof error === "object" && "code" in error && error.code === Discord.RESTJSONErrorCodes.UnknownMember) return;
              throw error;
            }
          }
        }
      )
    )
  ).filter((guild) => guild) as Discord.Guild[];

  return guilds.reduce((map, guild) => {
    map.set(guild.id, guild);
    return map;
  }, new Map<string, Discord.Guild>());
}

export function getUserTag(message: Communication | Interaction) {
  return message instanceof Discord.Message
    ? message.author.tag
    : message.user.tag;
}

export function getUserId(message: Communication | Interaction) {
  return message instanceof Discord.Message
    ? message.author.id
    : message.user.id;
}

export async function getGuildUser(userid: string, guildId: string, live?: boolean) {
  if (live){
    // fetch live
    const guild = await client.guilds.fetch(guildId).catch(() => undefined);
    return guild
      ? guild.members.fetch(userid).catch(() => undefined)
      : undefined;
  }else{
    const guild = client.guilds.cache.get(guildId);
    return guild
      ? guild.members.cache.find((member) => member.id === userid)
      : undefined;
  }

}

export async function getGuildId(
  message: Communication | ButtonInteraction | SelectMenuInteraction,
  reply: boolean = true
): Promise<string | null> {
  if (message.guild) {
    return message.guild.id;
  } else {
    const user = (await User.findById(getUserId(message)))[0];
    const guilds = await getUserGuilds(message);

    if (user.defaultGuildId) {
      if (guilds.get(user.defaultGuildId) == null) {
        if (reply) {
          await replyTo(
            message,
            "You are no longer connected to your default guild. Please set a new one.\n"
          );
        }
        user.defaultGuildId = null;
        await user.save();
      } else {
        return user.defaultGuildId;
      }
    }

    if (guilds.size > 1 && user.defaultGuildId == null) {
      if (reply) {
        await SetDefaultGuild(message, guilds);
      }
    } else if (guilds.size == 1) {
      return guilds.values().next().value?.id ?? null;
    } else {
      if (reply) {
        await replyTo(
          message,
          "You are not part of any Discord guilds serviced by FleetBot."
        );
      }
    }

    return null;
  }
}

export function bulkFindShips(ships: string[]): FleetViewShip[] {
  const foundByName = new Map<string, FleetViewShip | undefined>();

  return ships
    .map((ship) => {
      if (!foundByName.has(ship)) {
        foundByName.set(ship, findShip(ship));
      }
      return foundByName.get(ship);
    })
    .filter((ship): ship is FleetViewShip => ship != null);
}

export async function bulkCreateShips(
  foundShips: FleetViewShip[],
  message: Communication,
  guildId: Snowflake
): Promise<boolean> {
  return ShipDao.bulkCreate(
    foundShips.map((ship) => {
      return {
        shipname: ship.name,
        discordUserId: getUserId(message),
        guildId: guildId,
      };
    })
  );
}

export async function addShip(
  shipName: string,
  message: Communication,
  guildId: Snowflake
): Promise<FleetViewShip | null | undefined> {
  const foundShip = findShip(shipName);

  if (foundShip) {
    const created = await ShipDao.create({
      shipname: foundShip.name,
      discordUserId: getUserId(message),
      guildId: guildId,
    });
    return created ? foundShip : null;
  } else {
    return;
  }
}

export async function updateUser(newUser: Discord.User | Discord.PartialUser) {
  let dbUser = (await User.findById(newUser.id))[0];
  if (!dbUser) {
    dbUser = new User();
    dbUser.lastKnownTag = newUser.tag ? newUser.tag : "";
    dbUser.lastKnownDisplayName = newUser.displayName ? newUser.displayName : "";
  }
  dbUser.discordUserId = newUser.id;
  dbUser.lastKnownTag = newUser.tag ? newUser.tag : "";
  dbUser.lastKnownDisplayName = newUser.displayName ? newUser.displayName : "";
  await dbUser.save();
}
