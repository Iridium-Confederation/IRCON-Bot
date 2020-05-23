const Discord = require('discord.js');
const Sequelize = require('sequelize');
const token = require('../botconfig.json');
const fs = require('fs');
const readline = require('readline');
const http = require('https');
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
      const user = commandArgs;

      if (user === "") {
        const shipList = await Ships.findAll({
          where: {
            username: message.author.tag
          }
        });
        const shipString = shipList.map((t: any) => t.shipname).join(', ') || 'No ships owned.';
        return message.channel.send(`Ships you own: ${shipString}`);
      }
      else {
        const shipList = await Ships.findAll({where: {username: {[Sequelize.Op.like]: user + "#%"}}})
        const userString = shipList.map((t: any) => t.shipname).join(', ') || `${user} doesn't own anything.`;
        return message.channel.send(`${user} owns: ${userString}`);
      }
    }

    //Command to list owners of specific ships !search "ship"
    else if (command === 'search' && hasRole(message, "Member")) {
      const shipName = commandArgs.toLowerCase();
      const ownerList = await Ships.findAll({
        where: {
          shipname: {[Sequelize.Op.like]: "%" + shipName + "%"}
        }
      });
      const ownerString = ownerList.map((t: any) => t.username).join(', ') || `No ${shipName}s are owned.`;
      return message.channel.send(`These people own a ${shipName}: ${ownerString}`);
    }

    //Command to remove all ships of a user !removeall "user#XXXX"
    else if (command === "removeall" && hasRole(message, "Management")) {
      const deletedUser = commandArgs;
      await Ships.destroy({where: {username: deletedUser}});
      return message.channel.send(`User ${deletedUser} has had his fleet deleted.`);
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
        message.channel.send("No results found.")
      } else {
        message.channel.send(new Discord.MessageAttachment(Buffer.from(JSON.stringify(fleetview)), 'fleetview.json'))
      }
    }

    else if (command === 'update' && hasRole(message, "Database developer")) {
      console.log("Starting update...")
      message.channel.send("Starting update. Party time.")
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
              .catch(e => message.channel.send("Error: Failed to parse attachment."))
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
                  message.channel.send(`Successfully imported **${successCount}** items.`)
                }
                if (failureCount){
                  message.channel.send(`Failed to import **${failureCount}** items.`)

                  message.channel.send(Array.from(failures).join(', '))
                }
              })
          });
        })
      }else{
        message.channel.send("Attach a fleetview or hangar explorer json file with a description of **!import**");
      }

    }

    //Command to list all commands !help
    else if (command === "help" && hasRole(message, "Member")) {
      let msg =
        "Looking for the exact name of your ship? Names on this list appear exactly as they should be typed: <https://starship42.com/fleetview/>\n\n" +
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

      return message.channel.send(msg);
    }
  }
});
