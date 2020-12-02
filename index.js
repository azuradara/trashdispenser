const Discord = require('discord.js')
const fs = require('fs')
const markov_strings = require('markov-strings')
const schedule = require('node-schedule')
const config = require('./data/config.json')
const client = new Discord.Client()
const errors = []
const PAGE_SIZE = 100

let PREFIX = '!t'
let STATE_SIZE = 2
let MAX_TRIES = 50
let MIN_SCORE = 10
let GAME = '-'
let msgObj = {messages: [],}
let msgCache = []
let killCache = []
let trashOpts = {
    stateSize: Number
}
var triggerChance = 3

function uniqCheck(arr, propertyName) {
    const uniq = []
    const dupe = {}
    for (let i = 0; i < arr.length; i+=1) {
        if (arr[i][propertyName]) {
            const value = arr[i][propertyName]
            if (!dupe[value]) {
                dupe[value] = true
                uniq.push(arr[i])
            }
        }
    }
    return uniq
}

function regurgitate() {
    console.log('processing the trash..')
    try {
        msgObj = JSON.parse(fs.readFileSync('./data/trashCan.json', 'utf8'))
    } catch (err) {
        console.log('no trashcan found, initializing..')
        msgObj = {
            messages: [
                {
                    id: '0',
                    string: '',
                },
            ],
        }
    }

    trashCan = msgObj.messages
    trashCan = uniqCheck(trashCan.concat(msgCache), 'id')
    killCache.forEach(id => {
        const killIndex = trashCan.map(item => item.id).indexOf(id)
        trashCan.splice(killIndex, 1)
    })

    killCache = []
    const trash = new markov_strings.default(trashOpts)
    msgObj.messages = trashCan
    fs.writeFileSync('./data/trashCan.json', JSON.stringify(msgObj), 'utf-8')
    msgObj.messages = []
    msgCache = []
    trash.addData(trashCan)
    fs.writeFileSync('./data/trash.json', JSON.stringify(trash.export()))
    console.log('done processing trash.')
}

function checkMsg(message) {
    const msgText = message.content.toLowerCase()
    let command = null
    const tPrefix = msgText.substring(0, PREFIX.length)
    if (message.content.includes('!trash')) { message.reply('use !t instead')}
    if (tPrefix === PREFIX) {
        const split = msgText.split(' ')
        if (split[0] === PREFIX && split.length === 1) {
            command = 'trash'
        } else if (split[1] === 'collect') {
            command = 'collect'
        } else if (split[1] === 'hlep') {
            command = 'hlep'
        } else if (split[1] === 'process') {
            command = 'process'
        } else if (split[1] === 'debug') {
            command = 'debug'
        } else if (split[1] === 'tts') {
            command = 'tts'
        } else if (split[1] === 'chance') {
            command = 'chance'
        }
    } return command
}

async function fetchTrash(message) {
    let oldtrashCache = []
    let keepCollect = true
    let oldestMsgID
    while (keepCollect) {
        const msgs = await message.channel.messages.fetch({
            before: oldestMsgID,
            limit: PAGE_SIZE
        })
        const filterBotMessage = msgs
            .filter(elem => !elem.author.bot)
            .map(elem => {
                const canObj = {
                    string: elem.content,
                    id: elem.id
                }
                if (elem.attachments.size > 0) {
                    canObj.attachment = elem.attachments.values().next().value.url
                }
                return canObj
            })
            oldtrashCache = oldtrashCache.concat(filterBotMessage)
            const lastMsg = msgs.last()
            if (!lastMsg || msgs.size < PAGE_SIZE | oldtrashCache.length > 70000) { keepCollect = false } else {
                oldestMsgID = lastMsg.id
            }
    }
    console.log(`collected ${oldtrashCache.length} messages.`)
    msgCache = msgCache.concat(oldtrashCache)
    regurgitate()
    let collectEmbed = new Discord.MessageEmbed()
        .setTitle(`Collected ${oldtrashCache.length} instances of mental ineptitude.`)
    message.channel.send(collectEmbed)
}

function genTrash(message, debug = false, tts = message.tts) {
    console.log('Dispensing..')
    const options = {
        filter: (results) => {
            return results.score >= MIN_SCORE
        },
        maxTries: MAX_TRIES,
    }
    const fsTrash = new markov_strings.default()
    const trashFile = JSON.parse(fs.readFileSync('data/trash.json', 'utf-8'))
    fsTrash.import(trashFile)
    try {
        const trashResult = fsTrash.generate(options)
        console.log('Generated Trash:', trashResult)
        const msgOpts = { tts }
        const attachRefs = trashResult.refs
            .filter(ref => Object.prototype.hasOwnProperty.call(ref, 'attachment'))
            .map(ref => ref.attachment)
        if (attachRefs.length > 0) {
            const randomRefAttach = attachRefs[Math.floor(Math.random() * attachRefs.length)]
            msgOpts.files = [randomRefAttach]
        } else {
            const randMessage = trashCan[Math.floor(Math.random() * trashCan.length)]
            if (randMessage.attachment) {
                msgOpts.files = [{ attachment: randMessage.attachment }]
            }
        }
        trashResult.string = trashResult.string.replace(/@everyone/g, '@everyone')
        message.channel.send(trashResult.string, msgOpts)
        if (debug) message.channel.send(`\`\`\`\n${JSON.stringify(trashResult, null, 2)}\n\`\`\``)
    } catch (err) {
        console.log(err);
        if (debug) message.channel.send(`\n\`\`\`\nERROR: ${err}\n\`\`\``);
    }
}

client.on('ready', () => {
    console.log('trashdispenser ready')
    if(client.user) { client.user.setActivity(GAME) }
    regurgitate()
    
})

client.on('error', err => {
    const errText = `ERROR: ${err.name} - ${err.message}`
    console.log(errText)
    errors.push(errText)
    fs.writeFile('./data/error.json', JSON.stringify(errors), fsErr => {
        if (fsErr) {
            console.log(`error writing to error file: ${fsErr.message}`)
        }
    })
})

client.on('message', message => {
    var _a, _b
    if (message.guild) {
        const command = checkMsg(message)
        if (command === 'hlep') {
            const avatarURL = ((_a = client.user) === null || _a === void 0 ? void 0 : _a.avatarURL()) || undefined
            const helpEmbed = new Discord.MessageEmbed()
                .setAuthor((_b = client.user) === null || _b === void 0 ? void 0 : _b.username, avatarURL)
                .setThumbnail(avatarURL)
                .setDescription('WIP, Im lazy')
            message.channel.send(helpEmbed).catch(() => {
                message.author.send(helpEmbed)
            })
        }
        if (command === 'collect') {
            if (message.member) {
                console.log('Collecting..')
                msgObj = {
                    message: [],
                }
                fs.writeFileSync('./data/trashCan.json', JSON.stringify(msgObj), 'utf-8')
                fetchTrash(message)
            }
        }
        if (command === 'trash') {
            genTrash(message)
        }
        if (command === 'tts') {
            generateResponse(message, false, true)
        }
        if (command === 'debug') {
            generateResponse(message, true)
        }
        if (command === 'process') {
            regurgitate()
        }
        if (command === 'chance') {
            const msgText = message.content.toLowerCase()
            triggerChance = msgText.split(' ')[2]
            message.channel.send(`Trigger chance set to **${triggerChance}%**`)
        }
        if (command === null) {
            console.log('Lurking..')
            if (Math.random() < triggerChance/100 ) {
                genTrash(message)
            }
            if (!message.author.bot && !message.content.startsWith('!t')) {
                const canObj = {
                    string: message.content,
                    id: message.id,
                }
                if (message.attachments.size > 0) {
                    canObj.attachment = message.attachments.values().next().value.url
                }
                msgCache.push(canObj)
                if (client.user && message.mentions.has(client.user)) {
                    genTrash(message)
                }
            }
        }
    }
})

client.login(config.TOKEN)
trashOpts = {stateSize : STATE_SIZE,}