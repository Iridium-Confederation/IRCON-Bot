const Discord = require('discord.js');
const Sequelize = require('sequelize');
const lineReader = require('line-reader');
const token = require('./botconfig.json');

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

function hasRole(message, role) {
    return message.member.roles.cache.some(r => r.name === role);
}

//check for command
client.on('message', async message => {
	if (message.content.startsWith(PREFIX)) {
		const input = message.content.slice(PREFIX.length).split(' ');
		const command = input.shift();
		const commandArgs = input.join(' ');

//Command to add a ship to your fleet !addship "ship"
if (command === 'addship' && hasRole(message, "Member")) {
  const shipName = commandArgs.toLowerCase();

	lineReader.eachLine('./shipList.txt', function(line) {
		if (line.includes(shipName)) {
			const ship = Ships.create({
				username: message.author.tag,
				shipname: shipName,
				});
			message.reply(`added the ${shipName} to their fleet.`);
			shipFound = true;
			return false;
		}
		else if (line.includes("stop")){
			message.reply("this ship does not exist.");
		}
	});
}

//Command to list your own ships !showships
else if (command === 'showships' && hasRole(message, "Member")) {
  const shipList = await Ships.findAll({
    where: {
      username: message.author.tag
      }
  });
  const shipString = shipList.map(t => t.shipname).join(', ') || 'No ships owned.';
  return message.channel.send(`Ships you own: ${shipString}`);
		}

//Command to list what ships a certain owner has !whatships "owner"
else if (command === 'whatships' && hasRole(message, "Member")) {
  const otherUser = commandArgs;
  const shipList = await Ships.findAll({where: {username: {[Sequelize.Op.like]: "%" + otherUser + "#%"}}})
  const userString = shipList.map(t => t.shipname).join(', ') || `${otherUser} doesn't own anything.`;
  return message.channel.send(`${otherUser} owns: ${userString}`);
}

//Command to list owners of specific ships !showowners "ship"
else if (command === 'showowners' && hasRole(message, "Member")) {
  const shipName = commandArgs.toLowerCase();
  const ownerList = await Ships.findAll({
    where: {
      shipname: shipName
      }
  });
  const ownerString = ownerList.map(t => t.username).join(', ') || `No ${shipName}s are owned.`;
  return message.channel.send(`These people own a ${shipName}: ${ownerString}`);
		}

//Command to list all commands !help

else if (command === "help" && hasRole(message, "Member")) {
  return message.channel.send(
      "Looking for the exact name of your ship? Names on this list appear exactly as they should be typed: https://starcitizen.tools/List_of_Ship_and_Vehicle_Prices\n\nCommands:\n\n" +
      "!addship 'Ship Name' - Add a ship to your fleet.\n!removeship 'Ship Name' - Remove a ship from your fleet.\n" +
      "!showships - Lists all your current ships.\n" +
      "!showowners 'Ship Name' - Lists all owners of a certain ship.\n" +
      "!whatships 'user#XXXX' - List all ships a certain user owns.\n!" +
      "!fleetview 'user' - Generate a fleetview.json file for the org or a user." +
      "!removeall 'user#XXXX' - MANAGEMENT ONLY: Delete all data for a user."
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
    const fleetview = await Ships.findAll({
        where: {
        username: {
            [Sequelize.Op.like]: "%" + commandArgs + "#%"
        }
    }
    }).map(t => {
        const ship = {}
        ship.name = t.shipname
        return ship
    })

    if (fleetview.length === 0){
        message.channel.send(`No results found for user: ${commandArgs}`)
    }else{
        message.channel.send(new Discord.MessageAttachment(Buffer.from(JSON.stringify(fleetview)), 'fleetview.json'))
    }
}

//Command to remove ship !removeship "ship"
else if (command === 'removeship' && hasRole(message, "Member")) {
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
