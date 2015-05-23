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
  start: function () {
    request({ url: 'http://bmwgolf-api-masters.elasticbeanstalk.com/json/?playerId=32204', json: true }, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        var listOfRounds = _.reduce(body, function (memo, round, name) {
          if (name.indexOf('round_') === 0) {
            memo.push({ name: name, round: round })
          }
          return memo
        }, [])

        var lastRound = _.last(listOfRounds)
        var round = lastRound.round
        var scores = _.filter(round.scores, function (score) { return score.strokes > 0})
        var lastScore = _.last(scores)
        var total = _.reduce(listOfRounds, function (memo, round) {
          memo += round.round.topar
          return memo
        }, 0)

        var message = 'Martin Kaymer auf Loch ' + lastScore.hole + ' mit ' + lastScore.strokes + ' Schlägen. Jetzt bei ' + total + '.'
        internals.onMessage(message)
      }
    })
  }
}

logger.log('info', 'Starting pushscore')
internals.start()
module.exports = internals
