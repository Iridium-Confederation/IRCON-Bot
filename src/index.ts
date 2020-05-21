const Discord = require('discord.js');
const Sequelize = require('sequelize');
const lineReader = require('line-reader');
const token = require('../botconfig.json');

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

client.once('ready', () => {
  Ships.sync();
});

function hasRole(message: any, role: any) {
  return message.member.roles.cache.some((r: any) => r.name === role);
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

      lineReader.eachLine('./shipList.txt', function (line: any) {
        if (line === shipName) {
          const ship = Ships.create({
            username: message.author.tag,
            shipname: line,
          });
          message.reply(`added the ${line} to their fleet.`);
          return false;
        } else if (line === "stop") {
          message.reply("this ship does not exist.");
        }
      });
    }

    //Command to list your own ships !howned
    else if (command === 'owned' && hasRole(message, "Member")) {
      const shipList = await Ships.findAll({
        where: {
          username: message.author.tag
        }
      });
      const shipString = shipList.map((t: any) => t.shipname).join(', ') || 'No ships owned.';
      return message.channel.send(`Ships you own: ${shipString}`);
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
          shipname: shipName
        }
      });
      const ownerString = ownerList.map((t: any) => t.username).join(', ') || `No ${shipName}s are owned.`;
      return message.channel.send(`These people own a ${shipName}: ${ownerString}`);
    }

    //Command to list all commands !help
    else if (command === "help" && hasRole(message, "Member")) {
      return message.channel.send(
        "Looking for the exact name of your ship? Names on this list appear exactly as they should be typed: <https://starcitizen.tools/List_of_Ship_and_Vehicle_Prices>\n\n" +
        "**!add ship** \n\t Add a ship to your fleet.\n"+
        "**!remove ship** \n\t Remove a ship from your fleet.\n" +
        "**!search ship** \n\t List all owners of a certain ship.\n" +
        "**!inventory [username]** \n\t List all ships a certain user owns. Leave blank for your own\n" +
        "**!fleetview {user|-all}** \n\t Generate a fleetview.json file for the org or a user.\n" +
        "**!removeall _user#xxxx_** \n\t MANAGEMENT ONLY: Delete all data for a user."
      );
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
  }
});
