const Discord = require('discord.js');
const Sequelize = require('sequelize');
const token = require('../botconfig.json');
const fs = require('fs');
const readline = require('readline');
const http = require('https');
const _ = require('lodash');
const { exec } = require('child_process');

const client = new Discord.Client();
const PREFIX = '!';

client.login(token);

const sequelize = new Sequelize('database', 'user', 'password', {
  host: 'localhost',
  dialect: 'sqlite',
  logging: false,
  storage: 'database.sqlite',
});

//owned ship database
const Ships = sequelize.define('ships', {
    username: {
      type: Sequelize.STRING,
    },
    shipname: Sequelize.TEXT,
  },
);


const allowedShips = new Set()

const readInterface = readline.createInterface({
  input: fs.createReadStream('./shipList.txt'),
  output: process.stdout,
  console: false
});

readInterface.on('line', function(line: any) {
  allowedShips.add(line)
});

client.once('ready', () => {
  Ships.sync();
});

function hasRole(message: any, role: any) {
  const hasRole = client
    .guilds
    .cache
    .map((g:any) => g.roles.cache.find((r:any) => r.name === role))
    .filter((g:any) => g)
    .find((r:any) => r.members.find((member:any) => member.id === message.author.id))

  return hasRole != null
}

function addShip(shipName: string, message: any) {
  if (allowedShips.has(shipName)) {
    Ships.create({
      username: message.author.tag,
      shipname: shipName,
    });
    return true
  }else{
    return false
  }
}

function replyTo(message: any, contents: string) {
  if (contents.length >= 2000){
    message.channel.send("Reply too long. Try a smaller query.")
  }else{
    return message.channel.send(contents);
  }
}

function formatShipName(shipName: string) {
  return shipName
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');;
}

//check for command
client.on('message', async (message: any) => {
  if (message.content.startsWith(PREFIX)) {
    const input = message.content.slice(PREFIX.length).split(' ');
    const command = input.shift();
    const commandArgs = input.join(' ');

    //Command to add a ship to your fleet !add "ship"
    if (command === 'add' && hasRole(message, "Member")) {
      const shipName = commandArgs.toLowerCase();
      if (addShip(shipName, message)){
        message.reply(`added **${shipName}** to your fleet.`);
      }else{
        message.reply(`Unknown ship.`)
      }
    }

    //Command to remove ship !remove "ship"
    else if (command === 'remove' && hasRole(message, "Member")) {
      const shipName = commandArgs.toLowerCase();
      const rowCount = await Ships.destroy({
        where: {
          shipname: shipName,
          username: message.author.tag
        }
      });
      if (!rowCount) return message.reply('You do not own that ship.');
      return message.reply('Ship removed from your fleet.');
    }

    //Command to list what ships a certain owner has !inventory "owner"
    else if (command === 'inventory' && hasRole(message, "Member")) {
      const user = commandArgs === "" ? message.author.tag : commandArgs

      const matches = await Ships.findAll({
        where: {
          username: {
            [Sequelize.Op.like]: user + (commandArgs === "" ? "" : '#%')
          }
      }});

      const reply =
        `${user.split("#")[0]}'s inventory:\n` +
        Object.entries(_.groupBy(matches, 'shipname'))
        .map((group:any) => {
          const shipName = group[0]
          const shipCount = group[1].length

          return `**${(formatShipName(shipName))}**` + (shipCount > 1 ? " x " + shipCount : "")
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
          shipname: {[Sequelize.Op.like]: "%" + shipName + "%"}
        }
      });

      const reply = Object.entries(_.groupBy(matches, 'shipname'))
        .map(group => {
          const shipName = group[0]
          const users = group[1]
          const userCount = _.groupBy(users, 'username')

          return `**${formatShipName(shipName)}**` + ": " +
            Object.entries(userCount)
              .map((user:any) => {
                const username = user[0].split("#")[0]
                const count = user[1].length
                return username + (count > 1 ? " x " + user[1].length : "")
              })
              .join(', ')
        })
        .sort()
        .join("\n")

      return replyTo(message, reply);
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
            [Sequelize.Op.like]: username
          }
        }
      }).map((t: any) => {
        return {
          name: t.shipname
        }
      })

      if (fleetview.length === 0) {
        replyTo(message, "No results found.")
      } else {
        replyTo(message,"Click <https://www.starship42.com/fleetview/> -> Choose File -> Upload this attachment.\n")
        replyTo(message, new Discord.MessageAttachment(Buffer.from(JSON.stringify(fleetview)), 'fleetview.json'))
      }
    }

    else if (command === 'update' && hasRole(message, "Database developer")) {
      console.log("Starting update...")
      replyTo(message, "Starting update. Party time.")
      exec('./update.sh')
    }

    //Command to import from file !import
    else if (command === 'import' && hasRole(message, "Member")) {
      const attachment = message.attachments.find((a:any) => a)
      if (attachment){
        http.get(attachment.url, function(res:any){
          let body = '';

          res.on('data', function(chunk:any){
            body += chunk;
          });

          res.on('end', function(){
            Promise.resolve(body)
              .then(JSON.parse)
              .catch(e => replyTo(message, "Error: Failed to parse attachment."))
              .then(response => {
                let successCount = 0
                let failureCount = 0
                let failures = new Set()

                const format = response.find((item:any) => item.type) ?  "fleetview" : "hangar-explorer"

                response
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
                  replyTo(message, `Successfully imported **${successCount}** items.`)
                }
                if (failureCount){
                  replyTo(message, `Failed to import **${failureCount}** items.`)

                  replyTo(message, Array.from(failures).join(', '))
                }
              })
          });
        })
      }else{
        replyTo(message, "Attach a fleetview or hangar explorer json file with a description of **!import**");
      }

    }

    //Command to list all commands !help
    else if (command === "help" && hasRole(message, "Member")) {
      let msg =
        "Looking for the exact name of your ship? Names on this list appear exactly as they should be typed: <https://starship42.com/fleetview/>\n\n" +
        "User guide: https://discordapp.com/channels/226021087996149772/712454452380172328/713552865431650345 \n\n" +
        "**!add ship** \n\t Add a ship to your fleet.\n"+
        "**!remove ship** \n\t Remove a ship from your fleet.\n" +
        "**!search ship** \n\t List all owners of a certain ship.\n" +
        "**!inventory [username]** \n\t List all ships a certain user owns. Leave blank for your own\n" +
        "**!fleetview {user|-org}** \n\t Generate a fleetview.json file for the org or a user.\n" +
        "**!import** \n\t Upload a HangarXPLOR or FleetView JSON File and specify this command in the comment.\n"

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
