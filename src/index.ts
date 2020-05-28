import {deserialize} from "v8";

const token = require('../botconfig.json');
import * as Discord from 'discord.js'
import {Op} from 'sequelize';
import {Sequelize, Table, Column, Model} from 'sequelize-typescript';
import _ from 'lodash';
const { exec } = require('child_process');
import fetch from 'node-fetch';

const client = new Discord.Client();
const PREFIX = '!';

if (!client.login(token)){
  console.log("Failed to login.")
}

interface FleetViewShip {
  name: string
  description: string
  size: string
  rsiName: string
  focus: string
  classification: string
  rsiSlug: string
  slug: string
  type: string
  brochure: string
}

@Table
class Ships extends Model<Ships> {
  @Column
  username!: string;
 
  @Column
  shipname!: string;
}

new Sequelize('database', 'user', 'password', {
  host: 'localhost',
  dialect: 'sqlite',
  logging: false,
  storage: 'database.sqlite',
  models: [Ships]
});

let allowedShips:FleetViewShip[]

(async () => {
  try {
    const p1 = await fetch("https://api.fleetyards.net/v1/models?perPage=200&page=1");
    const p2 = await fetch("https://api.fleetyards.net/v1/models?perPage=200&page=2");

    allowedShips = (await p1.json()).concat(await p2.json())
  }catch(e){
    console.log("Failed to fetch ship list.")
    process.exit(1);
  }
})();

client.once('ready', () => {
  Ships.sync();
});

function hasRole(message: Discord.Message, role: string) {
  const hasRole = client
    .guilds
    .cache
    .map(g => g.roles.cache.find(r => r.name === role))
    .find(r => r && r.members.find(member => member.id === message.author.id))

  return hasRole != null
}

function sanitizeSlug(shipName: string) {
  return shipName.replace(/[.']/g, "-");
}

function findShip(shipName: string) : FleetViewShip|undefined {
  shipName = shipName?.toLowerCase()

  const success = allowedShips
    .find(s =>
      s.name.toLowerCase() === shipName ||
      s.rsiName.toLowerCase() === shipName ||
      s.rsiSlug.toLowerCase() === sanitizeSlug(shipName) ||
      s.slug.toLowerCase() === sanitizeSlug(shipName) ||
      s.rsiName.toLowerCase().replace(/-/gi, " ") === shipName
    );

  if (success){
    return success
  }else if (/\s/g.test(shipName)){
    return (
      findShip(shipName.substring(0, shipName.lastIndexOf(" "))) ||
      findShip(shipName.substring(shipName.indexOf(" ") + 1)) ||
      findShip(shipName.replace(/\s/g, "")) ||
      shipName.split(" ").map(t => findShip(t)).find(t => t)

  )
  }else{
    const re = new RegExp(shipName, 'i')
    return allowedShips.find(s => s.name.match(re))
  }
}

function addShip(shipName: string, message: Discord.Message) {
  const foundShip = findShip(shipName)
  if (foundShip) {
    Ships.create({
      username: message.author.tag,
      shipname: foundShip.name,
    });
    return foundShip
  }else{
    return
  }
}

function replyTo(message: Discord.Message, ...contents:Parameters<Discord.TextChannel['send']>) {
  if (contents.length >= 2000){
    return message.channel.send("Reply too long. Try a smaller query.")
  }else{
    return message.channel.send(...contents);
  }
}

//check for command
client.on('message', async (message: Discord.Message) => {
  if (message.content.startsWith(PREFIX)) {
    const input = message.content.slice(PREFIX.length).split(' ');
    const command = input.shift();
    const commandArgs = input.join(' ');

    //Command to add a ship to your fleet !add "ship"
    if (command === 'add' && hasRole(message, "Member")) {
      const shipName = commandArgs.toLowerCase();
      const addedShip = addShip(shipName, message)
      if (addedShip){
        await message.reply(`added **${addedShip.name}** to your fleet.`);
      }else{
        await message.reply(`Unknown ship.`)
      }
    }

    //Command to remove ship !remove "ship"
    else if (command === 'remove' && hasRole(message, "Member")) {
      const shipName = commandArgs.toLowerCase();
      const rowCount = await Ships.destroy({
        where: {
          shipname: {
            [Op.like]: commandArgs === "-all" ? "%" : shipName
          },
          username: message.author.tag
        },
        limit: commandArgs === "-all" ? Number.MAX_SAFE_INTEGER : 1
      });
      return message.reply(rowCount ? `${rowCount} ship${rowCount > 1 ? "s" : ""} removed from your fleet.` : 'You do not own that ship.');
    }

    //Command to list what ships a certain owner has !inventory "owner"
    else if (command === 'inventory' && hasRole(message, "Member")) {
      const user = commandArgs === "" ? message.author.tag : commandArgs

      const matches = await Ships.findAll({
        where: {
          username: {
            [Op.like]: user + (commandArgs === "" ? "" : '#%')
          }
      }});

      const reply =
        `${user.split("#")[0]}'s inventory:\n` +
        Object.entries(_.groupBy(matches, ship => findShip(ship.shipname)?.rsiName))
        .map(group => {
          const shipNameDb = group[0]
          const shipCount = group[1].length
          const ship = findShip(shipNameDb)

          return `**${ship?.rsiName}**` + (shipCount > 1 ? " x " + shipCount : "")
        })
        .sort()
        .join("\n")
      return replyTo(message, reply);
    }

    //Command to list owners of specific ships !search "ship"
    else if (command === 'search' && hasRole(message, "Member")) {
      const shipName = commandArgs.toLowerCase();
      const matches = await Ships.findAll({
        where: {
          shipname: {[Op.like]: "%" + shipName + "%"}
        }
      });

      const reply = Object.entries(_.groupBy(matches, ship => findShip(ship.shipname)?.rsiName))
        .map(group => {
          const shipNameDb = group[0]
          const users = group[1]
          const userCount = _.groupBy(users, 'username')
          const ship = findShip(shipNameDb)

          return `**${ship?.rsiName}**` + ": " +
            Object.entries(userCount)
              .map(user => {
                const username = user[0].split("#")[0]
                const count = user[1].length
                return username + (count > 1 ? " x " + user[1].length : "")
              })
              .join(', ')
        })
        .sort()
        .join("\n")

      return replyTo(message, reply === "" ? "No owners found." : reply);
    }

    //Command to remove all ships of a user !removeall "user#XXXX"
    else if (command === "removeall" && hasRole(message, "Management")) {
      const deletedUser = commandArgs;
      await Ships.destroy({where: {username: deletedUser}});
      return replyTo(message, `User ${deletedUser} has had his fleet deleted.`);
    }

    //Command to retrieve fleetview.json file !fleetview "user"
    else if (command === 'fleetview' && hasRole(message, "Member")) {
      let username
      if (commandArgs === "-org"){
        username = "%"
      }else if (Boolean(commandArgs)){
        username = commandArgs + "#%"
      }else{
        username = message.author.tag
      }

      const fleetview = await Ships.findAll({
        where: {
          username: {
            [Op.like]: username
          }
        }
      }).map((t:Ships) => {
        return {
          name: t.shipname,
          shipname: t.username.split('#')[0]
        }
      })

      if (fleetview.length === 0) {
        await replyTo(message, "No results found.")
      } else {
        await replyTo(message, "Click <https://www.starship42.com/fleetview/> -> Choose File -> Upload this attachment.\n")
        await replyTo(message, new Discord.MessageAttachment(Buffer.from(JSON.stringify(fleetview)), 'fleetview.json'))
      }
    }

    else if (command === 'update' && hasRole(message, "Database developer")) {
      console.log("Starting update...")
      await replyTo(message, "Starting update. Party time.");
      exec('./update.sh')
    }

    //Command to import from file !import
    else if (command === 'import' && hasRole(message, "Member")) {
      const attachment = message.attachments.find(() => true)

      if (attachment){
        let body:FleetViewShip[]

        try {
          const response = await fetch(attachment.url);
          body = await response.json();
        }catch(e){
          await replyTo(message, "Error: Failed to parse attachment.\n " + e)
          return;
        }

        let successCount = 0
        let failureCount = 0
        let failures = new Set()

        const format = body.find(item => item.type) ?  "fleetview" : "hangar-explorer"

        body
          .filter((item:any) => format === "fleetview" && item.type && item.type === "ship" || format === "hangar-explorer")
          .map((item:any) => {
            let isSuccess = addShip(item.name.toLowerCase().trim(), message)

            if (!isSuccess){
              failures.add(item.name.trim())
              failureCount++
            }else{
              successCount++
            }
          })

        if (successCount){
          await replyTo(message, `Successfully imported **${successCount}** items.`)
        }
        if (failureCount){
          await replyTo(message, `Failed to import **${failureCount}** items.`)

          await replyTo(message, Array.from(failures).join(', '))
        }
      }else{
        await replyTo(message, "Attach a fleetview or hangar explorer json file with a description of **!import**");
      }
    }

    else if (command === "brochure" && hasRole(message, "Member")){
      const ship = findShip(commandArgs)
      if (ship?.brochure){
        await replyTo(message, `${ship.name}: <${ship.brochure}>`)
      }else{
        await replyTo(message, "No brochure found.")
      }
    }

    else if (command === "stats" && hasRole(message, "Member")){
      if (commandArgs){
        const ship = findShip(commandArgs)
        if (ship){
          let msg = ""
          msg += `The **${ship.rsiName}** is a **${ship.size}** vessel${ship.classification ? `, with a **${ship.classification.toLowerCase()}** specialization` : ""}. `
          msg += ship?.description + "\n\n"
          msg += ship.brochure ? "A brochure is available here for your viewing pleasure: " + ship.brochure : ""

          return replyTo(message, msg)
        }else{
          return replyTo(message, "Ship not found.")
        }
      }else{
        const ships = await Ships.findAll();
        const totalShips = await Ships.count();
        const totalOwners = Object.entries(_.groupBy(ships, 'username')).length
        let reply = `We have **${totalShips}** ships contributed by **${totalOwners}** owners.`
        await replyTo(message, reply)
      }
    }

    //Command to list all commands !help
    else if (command === "help" && hasRole(message, "Member")) {
      let msg =
        "Looking for the exact name of your ship? Names on this list appear exactly as they should be typed: <https://starship42.com/fleetview/>\n\n" +
        "User guide: https://discordapp.com/channels/226021087996149772/712454452380172328/713552865431650345 \n\n" +
        "**!add ship** \n\t Add a ship to your fleet.\n"+
        "**!remove {ship|-all}** \n\t Remove ships from your fleet.\n" +
        "**!search ship** \n\t List all owners of a certain ship.\n" +
        "**!inventory [username]** \n\t List all ships a certain user owns. Leave blank for your own\n" +
        "**!fleetview {user|-org}** \n\t Generate a fleetview.json file for the org or a user.\n" +
        "**!import** \n\t Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.\n" +
        "**!stats** \n\t Display org fleet statistics.\n"

      if (hasRole(message, "Management")){
        msg += "**!removeall _user#xxxx_** \n\t (Management): Delete all data for a user.\n"
      }

      if (hasRole(message, "Database developer")){
        msg += "**!update** \n\t (Developer): Update to the latest version of the bot.\n"
      }

      return replyTo(message, msg);
    }
  }
});
