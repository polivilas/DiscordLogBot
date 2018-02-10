var fs = require('fs');
var mkdirp = require('mkdirp');
var co = require('co');
var request = require('request');
var sanitize = require("sanitize-filename");

process.on('unhandledRejection', (reason) => {
    console.error(reason);
});

try {
    var Discord = require("discord.js");
} catch (e) {
    console.log(e.stack);
}

try {
    var AuthDetails = require("./auth.json");
} catch (e) {
    console.log("Please create an auth.json like auth.json.example.\n" + e.stack);
}

var Permissions = {}
try {
    Permissions = require("./permissions.json");
} catch (e) {
    Permissions.global = {}
    Permissions.users = {}
}

Permissions.checkPermission = function(user, permission) {
    try {
        var allowed = true;
        try {
            if (Permissions.global.hasOwnProperty(permission)) {
                allowed = Permissions.global[permission] === true;
            }
        } catch (e) {}
        try {
            if (Permissions.users[user.id].hasOwnProperty(permission)) {
                allowed = Permissions.users[user.id][permission] === true;
            }
        } catch (e) {}
        return allowed;
    } catch (e) {}
    return false;
}
fs.writeFile("./permissions.json", JSON.stringify(Permissions, null, 2));


var Config = {}
try {
    Config = require("./config.json");
} catch (e) {
    Config.debug = false;
    Config.commandPrefix = '!';
    try {
        if (fs.lstatSync("./config.json").isFile()) {
            console.log("WARNING: config.json found but can't read it!\n" + e.stack);
        }
    } catch (e2) {
        fs.writeFile("./config.json", JSON.stringify(Config, null, 2));
    }
}

if (!Config.hasOwnProperty("commandPrefix")) {
    Config.commandPrefix = '!';
}

var blacklist;
try {
    blacklist = require("./blacklist.json");
} catch (e) {
    blacklist = {}
}

var commands = {
    "ping": {
        process: function(bot, msg, suffix, isEdit, user) {
            msg.channel.send(msg.author + " pong!");
        }
    },
    "idle": {
        process: function(bot, msg, suffix, isEdit, user) {
            bot.user.setStatus("idle");
        }
    },
    "online": {
        process: function(bot, msg, suffix, isEdit, user) {
            bot.user.setStatus("online");
        }
    },
    "say": {
        process: function(bot, msg, suffix, isEdit, user) {
            msg.channel.send(suffix);
        }
    },
    "announce": {
        process: function(bot, msg, suffix, isEdit, user) {
            msg.channel.send(suffix, {
                tts: true
            });
        }
    },
    "blacklist": {
        process: function(bot, msg, suffix, isEdit, user) {
            if (blacklist[msg.guild.id]) {
                blacklist[msg.guild.id] = false;
                msg.edit("Whitelisted " + msg.guild.name);
            } else {
                blacklist[msg.guild.id] = true;
                msg.edit("Blacklisted " + msg.guild.name);
            }
            fs.writeFile("./blacklist.json", JSON.stringify(blacklist, null, 2), null);
            msg.delete(8000)
        }
    },
    "invite": {
        process: function(bot, msg, suffix, isEdit, user) {
            if (!bot.user.bot) {
                msg.edit("You aint a bot, huh?");
                msg.delete(8000)
                return;
            }
            msg.channel.send("Invite link: https://discordapp.com/oauth2/authorize?&client_id=" + AuthDetails.client_id + "&scope=bot&permissions=0");
        }
    },
    "dump": {
        process: function(bot, msg, suffix, isEdit, user) {
			let args = suffix.split(" ");
			msg.delete(3000);
            msg.channel.send("Getting all messages...").then((message => message.delete(3000)))
            dumpChannel(msg.channel, msg.id, user, args[0]);
        }
    },
    "getlogs": {
        process: function(bot, msg, suffix, isEdit, user) {
            if (!bot.user.bot) {
                msg.edit("Dumping all messages on user account is not a good idea...");
                msg.delete(8000)
                return;
            }
            msg.channel.send("PM'd you the logs :)").then((message => message.delete(8000)))
            var serv = (msg.guild || {
                name: 'Direct Messages'
            }).name.replace(/\//g, '_')
            var chan = (msg.channel.name || 'Group DM').replace(/\//g, '_')
            serv = sanitize(serv, {
                replacement: "_"
            });
            chan = sanitize(chan, {
                replacement: "_"
            });
			if (fs.existsSync(`Logs/${serv}/${chan}/chat.txt`)) {
				user.send("Here you go :)", {
					file: `Logs/${serv}/${chan}/chat.txt`
				});
			} else {
				user.send("Doesn't seem to be anything here :eyes:");
			}
            
        }
    },
	"getdelet": {
        process: function(bot, msg, suffix, isEdit, user) {
            if (!bot.user.bot) {
                msg.edit("Dumping all messages on user account is not a good idea...");
                msg.delete(8000)
                return;
            }
            msg.channel.send("PM'd you the deleted messages :)").then((message => message.delete(8000)))
            var serv = (msg.guild || {
                name: 'Direct Messages'
            }).name.replace(/\//g, '_')
            var chan = (msg.channel.name || 'Group DM').replace(/\//g, '_')
            serv = sanitize(serv, {
                replacement: "_"
            });
            chan = sanitize(chan, {
                replacement: "_"
            });
			if (fs.existsSync(`Logs/${serv}/${chan}/deletedMessages.txt`)) {
				user.send("Here you go :)", {
					file: `Logs/${serv}/${chan}/deletedMessages.txt`
				});
			} else {
				user.send("Doesn't seem to be anything here :eyes:");
			}
            
        }
    }
}

var bot = new Discord.Client({
    messageCacheMaxSize: -1,
    messageCacheLifetime: 3600,
    messageSweepInterval: 600
});

bot.on("ready", function() {
    console.log("Logged in! Currently in " + bot.guilds.array().length + " servers");
});

bot.on("disconnected", function() {
    console.log("Disconnected!");
});

function dumpChannel(channel, snowflake, user, target) {
    var nextSnowflake;
    var oldestTimestamp;
    channel.fetchMessages({
            limit: 50,
            before: snowflake
        })
        .then(messages => {
            console.log(`Received ${messages.size} messages`);
            for (var i = 0, len = messages.size; i < len; i++) {
				if (target != undefined && target != "") {
					if (target == (messages.array())[i].author.username)
					{
						checkMessage((messages.array())[i], false, true);
					}
				} else {
					checkMessage((messages.array())[i], false, true);
				};
                if (!oldestTimestamp) {
                    oldestTimestamp = (messages.array())[i].createdTimestamp;
                }
                if ((messages.array())[i].createdTimestamp < oldestTimestamp) {
                    oldestTimestamp = (messages.array())[i].createdTimestamp;
                    nextSnowflake = (messages.array())[i].id;
                }
            }
            if (messages.size < 50) {
                console.log("No more messages!");
                return
            } else {
                console.log("Iteration done!");
                setTimeout(function() {
                    dumpChannel(channel, nextSnowflake, user, target)
                    return
                }, 2000);
            }
            return;
        }).catch(console.error);
    return;
}

function checkMessage(msg, isEdit, dump) {
    if (!dump) {
		if (((msg.author.id != bot.user.id && bot.user.bot) || (msg.author.id == bot.user.id && !bot.user.bot)) && (msg.content.startsWith(Config.commandPrefix))) {
			var cmdTxt = msg.content.split(" ")[0].substring(Config.commandPrefix.length);
			var suffix = msg.content.substring(cmdTxt.length + Config.commandPrefix.length + 1);
			var cmd = commands[cmdTxt];
			if (cmd) {
				if (Permissions.checkPermission(msg.author, cmdTxt)) {
					try {
						cmd.process(bot, msg, suffix, isEdit, msg.author);
					} catch (e) {
						var msgTxt = "!UH OH! " + cmdTxt + " failed!";
						msgTxt += "\n" + e.stack;
						msg.channel.send(msgTxt);
					}
				} else {
					msg.channel.send("You are not allowed to run " + cmdTxt + "!");
				}
			} else {
				msg.channel.send(cmdTxt + " not recognized!").then((message => message.delete(5000)))
			}
		}
		if (msg.guild) {
			blacklisted = blacklist[msg.guild.id];
			if (blacklisted) {
				return
			}
		}
    }
    var serv = (msg.guild || {
        name: 'Direct Messages'
    }).name.replace(/\//g, '_')
    var chan = (msg.channel.name || 'Group DM').replace(/\//g, '_')
    if (msg.channel.recipient) {
        chan = (msg.channel.recipient.username.concat("#").concat(msg.channel.recipient.discriminator)).replace(/\//g, '_')
    }
    var user = (msg.author.username).replace(/\//g, '_')
    serv = sanitize(serv, {
        replacement: "_"
    });
    chan = sanitize(chan, {
        replacement: "_"
    });
    user = sanitize(user, {
        replacement: "_"
    });
    mkdirp(`Logs/${serv}/${chan}/${user}`, function(err) {
        if (err) console.error(err)
        else {
			fs.appendFile(`Logs/${serv}/${chan}/chat.txt`, (msg.createdAt.toLocaleString()).concat(" ").concat(msg.author.username).concat("#").concat(msg.author.discriminator).concat(" - ").concat(msg.cleanContent).concat("\r\n"));
			fs.appendFile(`Logs/${serv}/${chan}/${user}/chat.txt`, (msg.cleanContent).concat("\r\n"));
		}
		return;
    });
    msg.attachments.map(co.wrap(function*(file) {
        console.log(`Received attachment from ${serv}/${chan}/${user}`)
        mkdirp(`Logs/${serv}/${chan}/${user}`, function(err) {
            if (err) console.error(err)
            else {
                request(file.url).pipe(fs.createWriteStream(`Logs/${serv}/${chan}/${user}/${file.id} - ${file.filename}`));
                fs.appendFile(`Logs/${serv}/${chan}/chat.txt`, (msg.author.username).concat("#").concat(msg.author.discriminator).concat(" - Sent file : ").concat(file.id).concat(" - ").concat(file.filename).concat("\r\n"), (err) => {
                    if (err) throw err;
                    return;
                });
                return;
            }
            return;
        });
        return;
    }))
    if (msg.isMentioned(bot.user)) {
        mkdirp(`Logs/${serv}`, function(err) {
            if (err) console.error(err)
            else fs.appendFile(`Logs/${serv}/mentions.txt`, (msg.createdAt.toLocaleString()).concat(" ").concat(msg.author.username).concat("#").concat(msg.author.discriminator).concat(" - ").concat(msg.cleanContent).concat("\r\n"));
            console.log((msg.author.username).concat(" mentioned you at ").concat(`${serv}`).concat(" in #").concat(`${chan}`));
            return;
        });
    }
    return;
}

bot.on("message", (msg) => {
    checkMessage(msg, false, false);
    return;
});
bot.on("messageUpdate", (oldMessage, newMessage) => {
    checkMessage(newMessage, true, false);
    return;
});

bot.on("messageDelete", (msg) => {
	if (msg.author.id == bot.user.id) {
		return
	}
    if (msg.guild) {
        blacklisted = blacklist[msg.guild.id];
        if (blacklisted) {
            return
        }
    }

    var serv = (msg.guild || {
        name: 'Direct Messages'
    }).name.replace(/\//g, '_')
    var chan = (msg.channel.name || 'Group DM').replace(/\//g, '_')
    if (msg.channel.recipient) {
        chan = (msg.channel.recipient.username.concat("#").concat(msg.channel.recipient.discriminator)).replace(/\//g, '_')
    }
    var user = (msg.author.username).replace(/\//g, '_')
    serv = sanitize(serv, {
        replacement: "_"
    });
    chan = sanitize(chan, {
        replacement: "_"
    });
    user = sanitize(user, {
        replacement: "_"
    });
    console.log((user).concat(" deleted a message at ").concat(serv).concat(" in #").concat(`${chan}`).concat("!"));
    mkdirp(`Logs/${serv}/${chan}`, function(err) {
        if (err) console.error(err)
        else fs.appendFile(`Logs/${serv}/${chan}/deletedMessages.txt`, (msg.createdAt.toLocaleString()).concat(" ").concat(msg.author.username).concat("#").concat(msg.author.discriminator).concat(" - ").concat(msg.cleanContent).concat("\r\n"));
        return;
    });
    return;
});

if (AuthDetails.bot_token) {
    console.log("Logging in");
    bot.login(AuthDetails.bot_token);
} else {
    console.log("Logging in with user credentials is no longer supported!\nYou can use token based log in with a user account, see\nhttps://discord.js.org/#/docs/main/master/general/updating");
}

bot.on('uncaughtException', function(err) {
    console.error(err);
    console.log("Shit gone wrong yo");
});
