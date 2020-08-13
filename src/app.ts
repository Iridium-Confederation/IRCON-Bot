import { Ships } from "./models/Ships";

const token = require("../botconfig.json");
const fs = require("fs");
import * as Discord from "discord.js";
import _ from "lodash";
import fetch from "node-fetch";
import { User } from "./models/User";
import { TextChannel } from "discord.js";

const { exec } = require("child_process");

const client = new Discord.Client();
const PREFIX = "!";

if (!client.login(token)) {
  console.log("Failed to login.");
}

Ships.initialize();

let allowedShips: FleetViewShip[];

async function refreshShipList() {
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

(async () => {
  await refreshShipList();
})();
setInterval(refreshShipList, 900_000);

client.once("ready", () => {
  User.sync();
  Ships.sync();
});

function hasRole(message: Discord.Message, role: string) {
  const hasRole = client.guilds.cache
    .map((g) => g.roles.cache.find((r) => r.name === role))
    .find(
      (r) => r && r.members.find((member) => member.id === message.author.id)
    );

  return hasRole != null;
}

function sanitizeSlug(shipName: string) {
  return shipName.replace(/[.']/g, "-");
}

function findShip(shipName: string): FleetViewShip | undefined {
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

function addShip(shipName: string, message: Discord.Message) {
  const foundShip = findShip(shipName);
  if (foundShip) {
    Ships.create({
      shipname: foundShip.name,
      discordUserId: message.author.id,
    });
    return foundShip;
  } else {
    return;
  }
}

function replyTo(
  message: Discord.Message,
  ...contents: Parameters<Discord.TextChannel["send"]>
) {
  if (contents[0].length >= 2000) {
    return message.channel.send("Reply too long. Try a smaller query.");
  } else {
    return message.channel.send(...contents);
  }
}

async function deleteShips(
  shipName: string,
  owner: string,
  deleteAll: boolean
) {
  const searchedShip = findShip(shipName);
  const removed = new Set<FleetViewShip>();
  const matches = await Ships.findShipsByOwner(owner);
  matches.find((m: Ships) => {
    const dbShip = findShip(m.shipname);

    if (
      dbShip &&
      (deleteAll || (searchedShip && searchedShip.slug === dbShip.slug))
    ) {
      m.destroy();
      removed.add(dbShip);

      if (!deleteAll) {
        return removed;
      }
    }
  });

  return removed;
}

async function updateUser(newUser: Discord.User | Discord.PartialUser) {
  let dbUser = (await User.findById(newUser.id))[0];
  if (!dbUser) {
    dbUser = new User();
    dbUser.lastKnownTag = newUser.tag ? newUser.tag : "";
  }
  dbUser.discordUserId = newUser.id;
  dbUser.lastKnownTag = newUser.tag ? newUser.tag : "";
  dbUser.save();
}

client.on(
  "userUpdate",
  async (
    oldUser: Discord.User | Discord.PartialUser,
    newUser: Discord.User | Discord.PartialUser
  ) => {
    await updateUser(newUser);
  }
);

function getTotalUsd(ships: Ships[]): Number {
  const total = ships
    .map((ship) => findShip(ship.shipname)?.lastPledgePrice)
    .reduce((a, b) => (a ? a : 0) + (b ? b : 0));

  return total ? total : 0;
}

function getTotalUec(ships: Ships[]): Number {
  const total = ships
    .map((ship) => findShip(ship.shipname)?.price)
    .reduce((a, b) => (a ? a : 0) + (b ? b : 0));

  return total ? total : 0;
}

client.on("guildMemberAdd", (member) => {
  // Send the message to a designated channel on a server:
  const channel = member.guild.channels.cache.find(
    (ch) => ch.name === "recruitment_info"
  );

  // Do nothing if the channel wasn't found on this server
  if (!channel) return;

  if (!((channel): channel is TextChannel => channel.type === "text")(channel))
    return;

  // Send the message, mentioning the member
  channel.send(`A user has joined the server: ${member}`);
});

client.on("message", async (message: Discord.Message) => {
  if (message.content.startsWith(PREFIX)) {
    await updateUser(message.author);

    const input = message.content.slice(PREFIX.length).split(" ");
    const command = input.shift();
    const commandArgs = input.join(" ");

    //Command to add a ship to your fleet !add "ship"
    if (command === "add" && hasRole(message, "Member")) {
      const shipName = commandArgs.toLowerCase();

      if (shipName.length <= 1) {
        return message.reply("Could you be more specific?");
      }

      const addedShip = addShip(shipName, message);
      if (addedShip) {
        await message.reply(`added **${addedShip.name}** to your fleet.`);
      } else {
        await message.reply(`Unknown ship.`);
      }
    }

    //Command to remove ship !remove "ship"
    else if (command === "remove" && hasRole(message, "Member")) {
      const shipName = commandArgs.toLowerCase();
      const removedShips = await deleteShips(
        shipName,
        message.author.tag,
        commandArgs === "-all"
      );
      const rowCount = removedShips.size;
      if (commandArgs === "-all") {
        return message.reply(
          `${rowCount} ship${rowCount > 1 ? "s" : ""} removed from your fleet.`
        );
      } else if (shipName.length <= 1) {
        return message.reply("Could you be more specific?");
      } else {
        const deletedShip = removedShips.values().next().value;
        return message.reply(
          deletedShip
            ? `Removed **${deletedShip.rsiName}** from your fleet.`
            : "You do not own that ship."
        );
      }
    }
    //Command to list what ships a certain owner has !inventory "owner"
    else if (command === "inventory" && hasRole(message, "Member")) {
      const ships =
        commandArgs === ""
          ? await Ships.findShipsByOwnerId(message.author.id)
          : await Ships.findShipsByOwnerLike(`%${commandArgs}%#%`);

      const totalUec = getTotalUec(ships).toLocaleString();

      let firstUserFound: string = "";
      const shipStr = Object.entries(
        _.groupBy(ships, (ship) => findShip(ship.shipname)?.rsiName)
      )
        .map((group) => {
          const shipNameDb = group[0];
          const shipCount = group[1].length;
          const ship = findShip(shipNameDb);

          firstUserFound = firstUserFound
            ? firstUserFound
            : group[1][0].owner.lastKnownTag;
          return firstUserFound === group[1][0].owner.lastKnownTag
            ? `**${ship?.rsiName}**` + (shipCount > 1 ? " x " + shipCount : "")
            : "";
        })
        .sort()
        .join("\n");

      let header;

      if (firstUserFound) {
        header = `${
          firstUserFound.split("#")[0]
        }'s inventory (**${totalUec} UEC**):\n`;
      } else {
        header = "User not found or has no ships.";
      }

      return replyTo(message, header + shipStr);
    }

    //Command to list owners of specific ships !search "ship"
    else if (command === "search" && hasRole(message, "Member")) {
      const shipName = commandArgs.toLowerCase();
      const matches = await Ships.findShipsByName(`%${shipName}%`);

      const reply = Object.entries(
        _.groupBy(matches, (ship) => findShip(ship.shipname)?.rsiName)
      )
        .map((group) => {
          const shipNameDb = group[0];
          const ships = group[1];
          const userCount = _.groupBy(ships, (ship) => ship.owner.lastKnownTag);
          const ship = findShip(shipNameDb);

          return (
            `**${ship?.rsiName}**` +
            ": " +
            Object.entries(userCount)
              .map((user) => {
                const username = user[0].split("#")[0];
                const count = user[1].length;
                return username + (count > 1 ? " x " + user[1].length : "");
              })
              .join(", ")
          );
        })
        .sort()
        .join("\n");

      return replyTo(message, reply === "" ? "No owners found." : reply);
    }

    //Command to remove all ships of a user !removeall "user#XXXX"
    else if (command === "removeall" && hasRole(message, "Management")) {
      const user = (await User.findByTag(commandArgs))[0];
      if (user) {
        const ships = await Ships.findShipsByOwnerId(user.discordUserId);

        let count = 0;
        ships.map((s) => {
          count++;
          s.destroy();
        });
        return replyTo(message, `1 user deleted. ${count} ships deleted.`);
      } else {
        return replyTo(message, `User not found.`);
      }
    }

    //Command to retrieve fleetview.json file !fleetview "user"
    else if (command === "fleetview" && hasRole(message, "Member")) {
      let username;
      if (commandArgs === "-org") {
        username = "%";
      } else if (Boolean(commandArgs)) {
        username = commandArgs + "#%";
      } else {
        username = message.author.tag;
      }

      const fleetview = (await Ships.findShipsByOwnerLike(username)).map(
        (t: Ships) => {
          return {
            name: t.shipname,
            shipname: t.owner.lastKnownTag.split("#")[0],
          };
        }
      );

      if (fleetview.length === 0) {
        await replyTo(message, "No results found.");
      } else {
        await replyTo(
          message,
          "Click <https://www.starship42.com/fleetview/> -> Choose File -> Upload this attachment.\n"
        );
        await replyTo(
          message,
          new Discord.MessageAttachment(
            Buffer.from(JSON.stringify(fleetview)),
            "fleetview.json"
          )
        );
      }
    } else if (command === "update" && hasRole(message, "Database developer")) {
      if (commandArgs.includes("-docker")) {
        exec("kill $(pidof npm)");
      } else {
        console.log("Starting update...");
        await replyTo(message, "Starting update. Party time.");
        exec("./update.sh");
      }
    }

    //Command to import from file !import
    else if (command === "import" && hasRole(message, "Member")) {
      const attachment = message.attachments.find(() => true);

      if (attachment) {
        let body: FleetViewShip[];

        try {
          const response = await fetch(attachment.url);
          body = await response.json();
        } catch (e) {
          await replyTo(message, "Error: Failed to parse attachment.\n " + e);
          return;
        }

        let successCount = 0;
        let failureCount = 0;
        let failures = new Set();

        const format = body.find((item) => item.type)
          ? "fleetview"
          : "hangar-explorer";

        body
          .filter(
            (item: any) =>
              (format === "fleetview" && item.type && item.type === "ship") ||
              format === "hangar-explorer"
          )
          .map((item: any) => {
            let isSuccess = addShip(item.name.toLowerCase().trim(), message);

            if (!isSuccess) {
              failures.add(item.name.trim());
              failureCount++;
            } else {
              successCount++;
            }
          });

        if (successCount) {
          await replyTo(
            message,
            `Successfully imported **${successCount}** items.`
          );
        }
        if (failureCount) {
          await replyTo(message, `Failed to import **${failureCount}** items.`);

          await replyTo(message, Array.from(failures).join(", "));
        }
      } else {
        await replyTo(
          message,
          "Attach a fleetview or hangar explorer json file with a description of **!import**"
        );
      }
    } else if (command === "db" && hasRole(message, "Database developer")) {
      const data = fs.readFileSync("database.sqlite");
      await replyTo(
        message,
        new Discord.MessageAttachment(data, "database.sqlite")
      );
    } else if (command === "stats" && hasRole(message, "Member")) {
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

          return replyTo(message, msg);
        } else {
          return replyTo(message, "Ship not found.");
        }
      } else {
        // Total org statistics
        const ships: Ships[] = await Ships.findAll({ include: [User] });
        const totalShips = await Ships.count();
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

        await replyTo(message, reply);
      }
    }

    //Command to list all commands !help
    else if (command === "help" && hasRole(message, "Member")) {
      let msg =
        "Looking for the exact name of your ship? See: <https://fleetyards.net/ships/>\n\n" +
        "User guide: https://discordapp.com/channels/226021087996149772/712454452380172328/713552865431650345 \n\n" +
        "**!add <ship>** \n\t Add a ship to your fleet.\n" +
        "**!remove {ship|-all}** \n\t Remove ships from your fleet.\n" +
        "**!search <ship>** \n\t List all owners of a certain ship.\n" +
        "**!inventory [username]** \n\t List all ships a certain user owns. Leave blank for your own\n" +
        "**!fleetview {user|-org}** \n\t Generate a fleetview.json file for the org or a user.\n" +
        "**!import** \n\t Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.\n" +
        "**!stats [ship]** \n\t Display org fleet statistics or show detailed info about a single ship.\n";

      if (hasRole(message, "Management")) {
        msg +=
          "**!removeall _user#xxxx_** \n\t (Management): Delete all data for a user.\n";
      }

      if (hasRole(message, "Database developer")) {
        msg +=
          "**!update** \n\t (Developer): Update to the latest version of the bot.\n";
      }

      if (hasRole(message, "Database developer")) {
        msg += "**!db** \n\t (Developer): Fetch db.\n";
      }

      return replyTo(message, msg);
    }
  }
});
