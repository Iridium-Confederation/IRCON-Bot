const Discord = require('discord.js');
const Sequelize = require('sequelize');
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

//check for command
client.on('message', async message => {
	if (message.content.startsWith(PREFIX)) {
		const input = message.content.slice(PREFIX.length).split(' ');
		const command = input.shift();
		const commandArgs = input.join(' ');

//Command to add a ship to your fleet !addship "ship"
if (command === 'addship' && message.member.roles.cache.some(r => r.name === "Member")) {
  const splitArgs = commandArgs.split(' ');
  const shipName = splitArgs.join(' ').toLowerCase();

  const ship = await Ships.create({
    username: message.author.tag,
    shipname: shipName,
    });

    if (ship.shipname === "100i" || ship.shipname === "125a" || ship.shipname === "125a" || ship.shipname === "135c" || ship.shipname === "300i" || ship.shipname === "315p" || ship.shipname === "325a" || ship.shipname === "350r" || ship.shipname === "600i" || ship.shipname === "85x" || ship.shipname === "890 jump" || ship.shipname === "a2 hercules" || ship.shipname === "apollo medivac" || ship.shipname === "apollo triage" || ship.shipname === "ares inferno" || ship.shipname === "ares ion" || ship.shipname === "arrow" || ship.shipname === "aurora cl" || ship.shipname === "aurora es" || ship.shipname === "aurora ln" || ship.shipname === "aurora lx" || ship.shipname === "aurora mr" || ship.shipname === "avenger stalker" || ship.shipname === "avenger titan" || ship.shipname === "avenger titan renegade" || ship.shipname === "avenger warlock" || ship.shipname === "ballista" || ship.shipname === "blade" || ship.shipname === "buccaneer" || ship.shipname === "c2 hercules" || ship.shipname === "c8x pisces expedition" || ship.shipname === "carrack" || ship.shipname === "caterpillar" || ship.shipname === "constellation andromeda" || ship.shipname === "constellation aquila" || ship.shipname === "constellation phoenix" || ship.shipname === "constellation taurus" || ship.shipname === "corsair" || ship.shipname === "crucible" || ship.shipname === "cutlass black" || ship.shipname === "cutlass blue" || ship.shipname === "cutlass red" || ship.shipname === "cyclone" || ship.shipname === "cyclone-aa" || ship.shipname === "cyclone-rc" || ship.shipname === "cyclone-rn" || ship.shipname === "cyclone-tr" || ship.shipname === "defender" || ship.shipname === "dragonfly" || ship.shipname === "eclipse" || ship.shipname === "endeavor" || ship.shipname === "f7c hornet" || ship.shipname === "f7c hornet wildfire" || ship.shipname === "f7c-m super hornet" || ship.shipname === "f7c-r hornet tracker" || ship.shipname === "f7c-S hornet ghost" || ship.shipname === "freelancer" || ship.shipname === "freelancer dur" || ship.shipname === "freelancer max" || ship.shipname === "freelancer mis" || ship.shipname === "genesis starliner" || ship.shipname === "gladiator" || ship.shipname === "gladius" || ship.shipname === "gladius valiant" || ship.shipname === "glaive" || ship.shipname === "hammerhead" || ship.shipname === "hawk" || ship.shipname === "herald" || ship.shipname === "hull a" || ship.shipname === "hull b" || ship.shipname === "hull c" || ship.shipname === "hull d" || ship.shipname === "hull e" || ship.shipname === "hurricane" || ship.shipname === "idris-k" || ship.shipname === "idris-m" || ship.shipname === "idris-p" || ship.shipname === "javelin" || ship.shipname === "khartu-al" || ship.shipname === "kraken" || ship.shipname === "kraken privateer" || ship.shipname === "m2 hercules" || ship.shipname === "m50" || ship.shipname === "mantis" || ship.shipname === "merchantman" || ship.shipname === "mercury star runner" || ship.shipname === "mole" || ship.shipname === "mpuv-1c" || ship.shipname === "mpuv-1p" || ship.shipname === "mustang alpha" || ship.shipname === "mustang beta" || ship.shipname === "mustang delta" || ship.shipname === "mustang gamma" || ship.shipname === "nautilus" || ship.shipname === "nova" || ship.shipname === "nox	aopoa" || ship.shipname === "orion" || ship.shipname === "p-52 merlin" || ship.shipname === "p-72 archimedes" || ship.shipname === "pioneer" || ship.shipname === "polaris" || ship.shipname === "prospector" || ship.shipname === "prowler" || ship.shipname === "ptv" || ship.shipname === "ranger cv" || ship.shipname === "ranger rc" || ship.shipname === "ranger tr" || ship.shipname === "razor" || ship.shipname === "razor ex" || ship.shipname === "razor lx" || ship.shipname === "reclaimer" || ship.shipname === "redeemer" || ship.shipname === "reliant kore" || ship.shipname === "reliant mako" || ship.shipname === "reliant Sen" || ship.shipname === "reliant tana" || ship.shipname === "retaliator" || ship.shipname === "sabre" || ship.shipname === "sabre comet" || ship.shipname === "san'tok.yāi" || ship.shipname === "scythe" || ship.shipname === "srv" || ship.shipname === "starfarer" || ship.shipname === "starfarer gemini" || ship.shipname === "terrapin" || ship.shipname === "ursa" || ship.shipname === "valkyrie" || ship.shipname === "vanguard harbinger" || ship.shipname === "vanguard hoplite" || ship.shipname === "vanguard sentinel" || ship.shipname === "vanguard warden" || ship.shipname === "vulcan" || ship.shipname === "vulture" || ship.shipname === "x1" || ship.shipname === "x1 force" || ship.shipname === "x1 velocity")
    {
      return message.reply(`added the ${ship.shipname} to their fleet.`);
    }

    else {
      await Ships.destroy({
        where: {
          shipname: shipName,
          username: message.author.tag
          }
      });
      return message.reply("This ship does not exist.");
    }
  }

//Command to list your own ships !showships
else if (command === 'showships' && message.member.roles.cache.some(r => r.name === "Member")) {
  const shipList = await Ships.findAll({
    where: {
      username: message.author.tag
      }
  });
  const shipString = shipList.map(t => t.shipname).join(', ') || 'No ships owned.';
  return message.channel.send(`Ships you own: ${shipString}`);
		}

//Command to list what ships a certain owner has !whatships "owner"
else if (command === 'whatships' && message.member.roles.cache.some(r => r.name === "Member")) {
  const otherUser = commandArgs.toLowerCase();
  const shipList = await Ships.findAll({where: {username: otherUser}})
  const userString = shipList.map(t => t.shipname).join(', ') || `${otherUser} doesn't own anything.`;
  return message.channel.send(`${otherUser} owns: ${userString}`);
}

//Command to list owners of specific ships !showowners "ship"
else if (command === 'showowners' && message.member.roles.cache.some(r => r.name === "Member")) {
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

else if (command === "help" && message.member.roles.cache.some(r => r.name === "Member")) {
  return message.channel.send("Looking for the exact name of your ship? Names on this list appear exactly as they should be typed: https://starcitizen.tools/List_of_Ship_and_Vehicle_Prices\n\nCommands:\n\n!addship 'Ship Name' - Add a ship to your fleet.\n!removeship 'Ship Name' - Remove a ship from your fleet.\n!showships - Lists all your current ships.\n!showowners 'Ship Name' - Lists all owners of a certain ship.\n!whatships 'user#XXXX' - List all ships a certain user owns.\n!removeall 'user#XXXX' - MANAGEMENT ONLY: Delete all data for a user.");
}

//Command to remove all ships of a user !removeall "user#XXXX"

else if (command === "removeall" && message.member.roles.cache.some(r => r.name === "Management")) {
  const deletedUser = commandArgs.toLowerCase();
	await Ships.destroy({where: {username: deletedUser}});
	return message.channel.send(`User ${deletedUser} has had his fleet deleted.`);
}

//Command to remove ship !removeship "ship"
else if (command === 'removeship' && message.member.roles.cache.some(r => r.name === "Member")) {
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
