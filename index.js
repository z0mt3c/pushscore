var Path = require('path')
var config = require(Path.join(__dirname, (process.env.CONFIG_FILE || './config.json')))

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

var follow = config.follow
var params = {
  follow: follow.join(',')
}

var stream
var reconnectSheduled = false

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
  onTweet: function (tweet) {
    if (!tweet) {
      return
    } else if (_.contains(follow, tweet.user.id)) {
      logger.log('info', 'Forwarding tweet @%s: %s (userId:%d)', tweet.user.name, tweet.text, tweet.user.id)
      var message = internals.cleanup(tweet.text)
      internals.notify(message)
      internals.post(message)
    }
  },
  onError: function (error) {
    throw error
  },
  start: function () {
    stream = client.stream('statuses/filter', params)
    internals.post(config.message)

    stream.on('disconnect', function (disconnectMessage) {
      logger.log('info', 'Stream disconnect:', disconnectMessage)
    })

    stream.on('connect', function (request) {
      logger.log('info', 'Stream connect')
      reconnectSheduled = false
    })

    stream.on('warning', function (warning) {
      logger.log('info', 'Stream warning:', warning)
    })

    stream.on('reconnect', function (request, response, connectInterval) {
      logger.log('info', 'Stream reconnect sheduled in %d ms', connectInterval)
      reconnectSheduled = true
    })

    stream.on('tweet', internals.onTweet)
    stream.on('error', internals.onError)
  },
  restart: function () {
    if (reconnectSheduled) {
      logger.log('info', 'Restart cancelled, reconnect sheduled')
      return
    }

    logger.log('info', 'Stopping stream... (Restart in 60s)')
    stream.stop()

    setTimeout(function () {
      logger.log('info', 'Starting stream...')
      stream.start()
    }, 60100)
  }
}

logger.log('info', 'Starting pushscore')
internals.start()
module.exports = internals
