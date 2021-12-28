import Discord, {
  ButtonInteraction,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  MessageActionRow,
  MessageAttachment,
  MessageSelectMenu,
  SelectMenuInteraction,
  Snowflake,
} from "discord.js";
import fetch from "node-fetch";
import { ShipDao, Ships } from "./models/Ships";
import { User } from "./models/User";
import {
  client,
  guildsIncorrectPermissions,
  PREFIX,
} from "./handlers/DiscordHandlers";

let allowedShips: FleetViewShip[];

export type Communication = Discord.Message | Discord.CommandInteraction;

export function sleep(ms : number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reply(
  message: Communication | ButtonInteraction | SelectMenuInteraction,
  body: string,
  attachment: MessageAttachment | undefined,
  title?: string,
  rows?: MessageActionRow[],
  ephemeral?: boolean
) {
  if (message.channel == null) return;

  if (message.guildId && guildsIncorrectPermissions.has(message.guildId)) {
    body =
      "**Warning:** FleetBot does not have permission to create or respond to application commands on this server. " +
      "To fix this, kick the bot and reinvite it to your server using the following link: \n" +
      "https://discord.com/oauth2/authorize?client_id=744369194140958740&permissions=51200&scope=bot%20applications.commands\n\n" +
      "Once this is done, you should be able to access FleetBot's new command interface. Simply type / to view all bot commands available to you. \n" +
      "This message should go away shortly after you have reinvited FleetBot. \n" +
      "In the near future, FleetBot will stop responding to the !fb command. For more information on why Discord is requiring this change, visit the link below: \n" +
      "https://dis.gd/mcfaq\n\n" +
      body;
  }

  const embed = new Discord.MessageEmbed()
    .setColor("#0099ff")
    .setDescription(body);

  if (title) {
    embed.setTitle(title);
  }

  if (message instanceof Discord.Message) {
    message
      .reply({
        embeds: [embed],
        files: attachment ? [attachment] : [],
        components: rows ? rows : [],
      })
      .catch((e) => console.log(e))
      .then(() => {});
  } else {
    message
      .reply({
        embeds: [embed],
        files: attachment ? [attachment] : [],
        components: rows ? rows : [],
        ephemeral: ephemeral,
      })
      .catch((e) => console.log(e))
      .then(() => {});
  }
}

export function replyNew(
  message: CommandInteraction | SelectMenuInteraction | ButtonInteraction,
  options: InteractionReplyOptions,
  update?: Boolean
) {
  const embed = new Discord.MessageEmbed()
    .setColor("#0099ff")
    .setDescription(options.content ? options.content : "");

  options.content = null;
  options.embeds = [embed];

  if (update && (message.isSelectMenu() || message.isButton())) {
    message
      .update(options)
      .catch((e) => console.log(e))
      .then(() => {});
  } else {
    message
      .reply(options)
      .catch((e) => console.log(e))
      .then(() => {});
  }
}

export function replyTo(
  message: Communication | ButtonInteraction | SelectMenuInteraction,
  contents: string,
  attachment?: MessageAttachment,
  title?: string,
  rows?: MessageActionRow[],
  ephemeral?: boolean
) {
  if (contents.length >= 2000) {
    const msg: string = contents;

    let start = 0;
    const chunkSize = 1800;

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
    reply(message, contents, attachment, title, rows, ephemeral);
  }
}

export async function getCommand(message: Communication) {
  if (message instanceof Discord.Message && message.mentions.users.size > 0) {
    const input = message.content.replaceAll(/<.*> /g, "").split(" ");

    const command = input.shift();
    const commandArgs = input.join(" ");

    return { command, commandArgs };
  } else if (message instanceof Discord.Message) {
    const input = message.content
      .substr((await PREFIX()).length)
      .trimLeft()
      .split(" ");
    const command = input.shift();
    const commandArgs = input.join(" ");
    return { command, commandArgs };
  } else {
    const command = message.commandName;
    const subCommand = message.options.getSubcommand(false);
    const commandArgs = "";
    return { command, commandArgs, subCommand };
  }
}

export function sanitizeSlug(shipName: string) {
  return shipName.replace(/[.']/g, "-");
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
    allowedShips = allowedShips.sort((a, b) => {
      return (
        a.rsiName.split(" ")[0].localeCompare(b.rsiName.split(" ")[0]) ||
        a.rsiName.length - b.rsiName.length
      );
    });
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

export async function getUserGuilds(message: Communication | Interaction) {
  return client.guilds.cache.filter(
    (g) => g.members.cache.get(getUserId(message)) != null
  );
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

export async function getGuildUser(userid: string, guildId: string) {
  const guild = client.guilds.cache.get(guildId);
  return guild
    ? guild.members.cache.find((member) => member.id === userid)
    : undefined;
}

export async function getGuildId(
  message: Communication | ButtonInteraction | SelectMenuInteraction,
  reply: boolean = true
): Promise<string | null> {
  if (message.guild) {
    return message.guild.id;
  } else {
    const guilds = await getUserGuilds(message);
    const user = (await User.findById(getUserId(message)))[0];

    if (user.defaultGuildId) {
      if (guilds.get(user.defaultGuildId) == null) {
        if (reply) {
          replyTo(
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
        const row = new MessageActionRow();
        const menu = new MessageSelectMenu().setCustomId(
          "default_guild_select"
        );
        guilds.forEach((g) => {
          menu.addOptions([
            {
              label: g.name,
              value: g.id,
            },
          ]);
        });
        row.addComponents(menu);

        replyTo(
          message,
          "You have joined multiple Discord guilds serviced by FleetBot. " +
            "Select one as your default for private messaging. You can clear your default guild " +
            "by typing:\n **/options reset_default_guild**.",
          undefined,
          undefined,
          [row]
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
  message: Communication,
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
  message: Communication,
  guildId: Snowflake
): FleetViewShip | undefined {
  const foundShip = findShip(shipName);

  if (foundShip) {
    ShipDao.create({
      shipname: foundShip.name,
      discordUserId: getUserId(message),
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
  await dbUser.save();
}

export function hasRole(message: Communication, role: string) {
  const hasRole = client.guilds.cache
    .map((g) => g.roles.cache.find((r) => r.name === role))
    .find(
      (r) => r && r.members.find((member) => member.id === getUserId(message))
    );

  return hasRole != null;
}
