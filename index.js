var Path = require('path')
var config = require(process.env.CONFIG_FILE || Path.join(__dirname, 'config.json'))

var winston = require('winston')
var transports = [
  new (winston.transports.Console)({'timestamp': true})
]

if (config && config.logPath) {
  transports.push(new (winston.transports.File)({ filename: config.logPath, json: false }))
}

var logger = new (winston.Logger)({
  transports: transports
})

var _ = require('lodash')
var Push = require('pushover-notifications')

var twitterConfig = config.twitter
var Twit = require('twit')
var client = new Twit(twitterConfig)
var p = new Push(config.pushover)

var request = require('request')
var lastMessage = null
var moment = require('moment')

var start = moment('2015-07-16 7:00', 'YYYY-MM-DD HH:mm')
var end = moment('2015-07-19 23:00', 'YYYY-MM-DD HH:mm')
// var interval = null
// var fs = require('fs')

var vorgaben = {
  '1': 4,
  '2': 4,
  '3': 4,
  '4': 4,
  '5': 5,
  '6': 4,
  '7': 4,
  '8': 3,
  '9': 4,
  '10': 4,
  '11': 3,
  '12': 4,
  '13': 4,
  '14': 5,
  '15': 4,
  '16': 4,
  '17': 4,
  '18': 4
}

var vorgabeNamen = {
  '-2': 'Eagle',
  '-1': 'Birdie',
  '0': 'Par',
  '1': 'Bogey',
  '2': 'Double Bogey',
  '3': 'Triple Bogey'
}

var sent = {}
var internals = {
  cleanup: function (text) {
    if (typeof text === 'string') {
      return text.replace(/http:\/\/[^\s#]*/g, '').replace(/#GoalFlash/g, '').replace(/^Correction: /g, 'Korrektur: ').replace(/[\s]{2,50}/g, ' ')
    }
    return text
  },
  post: function (text) {
    if (!text || config.post !== true) {
      return
    }

    client.post('statuses/update', {
      status: text
    }, function (error, data, response) {
      if (error) {
        logger.log('error', 'Tweet failed', error.message)
      } else {
        logger.log('info', 'Tweet posted:', text)
      }
    })
  },
  notify: function (text) {
    if (!text || config.push !== true) {
      return
    }

    var title = 'Pushscore'

    if (text.indexOf('#Bundesliga') !== -1) {
      title = 'Bundesliga'
    } else if (text.indexOf('#ChampionsLeague') !== -1) {
      title = 'Champions League'
    }

    p.send({
      message: text,
      title: title
    }, function (err, result) {
      if (err) {
        throw err
      }

      logger.log('info', 'Push message sent: ' + text, result)
    })
  },
  onMessage: function (message) {
    if (lastMessage === message) {
      return
    }

    lastMessage = message
    logger.log('info', 'Pushing message: %s', message)
    message = internals.cleanup(message)
    internals.notify(message)
    internals.post(message)
  },
  onError: function (error) {
    throw error
  },
  processHoles: function (body) {
    var results = _.filter(body, function (player) {
      var filter = false

      if (player.Nationality.Code === 'GER') {
        filter = true
      }

      return filter
    })

    _.each(results, function (result) {
      if (!result || result.RoundStarted !== true) {
        return
      }

      var splitted = result.Name.split(',')
      var name = splitted[0].toLowerCase().trim()
      name = splitted[1].trim() + ' ' + name.charAt(0).toUpperCase() + name.slice(1)

      var lastPlayedHole = _.last(_.filter(result.Holes, function (hole) {
        return hole.Score !== ''
      }))

      if (lastPlayedHole != null) {
        var vorgabe = vorgaben[lastPlayedHole.HoleNumber]
        var type = vorgabeNamen[lastPlayedHole.Score - vorgabe] === undefined ? 'Par bei ' + vorgabe : vorgabeNamen[lastPlayedHole.Score - vorgabe]
        var message = name + ' auf Loch ' + lastPlayedHole.HoleNumber + ' mit ' + lastPlayedHole.Score + ' Schlägen (' + type + ') bei ' + result.Today + '/' + result.ToPar + ' Tag/Turnier auf Pos '

        // console.log(lastPlayedHole.Score)
        // console.log(lastPlayedHole.HoleNumber)
        // console.log(result.ToPar)
        // console.log(result.Today)
        // console.log(result.Movers)
        // console.log(result.Position.DisplayValue)
        // console.log(result.ID)
        // console.log(result.RoundStarted)
        // console.log(result.Status)
        // console.log(vorgabe)

        if (sent[result.ID] !== message) {
          sent[result.ID] = message
          logger.log('info', message + result.Position.DisplayValue + ' #theopen')
          internals.onMessage(message + result.Position.DisplayValue + ' #theopen')
        }
      }
    })
  },
  start: function () {
    if (config.message) {
      internals.post(config.message)
    }

    setInterval(function () {
      var now = moment()
      if (!now.isBetween(start, end)) {
        return
      }

      var round = moment.duration(now.valueOf() - start.valueOf()).days() + 1

      request({ url: 'http://www.theopen.com/api/holebyhole?roundno=' + round, json: true }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
          internals.processHoles(body)
        }
      })
      // internals.processHoles(JSON.parse(fs.readFileSync('./holes.json')))
    }, 15000)
  }
}

logger.log('info', 'Starting pushscore')
internals.start()
module.exports = internals
