var winston = require('winston');
var logger = new (winston.Logger)({ transports: [ new (winston.transports.Console)({'timestamp':true}) ]});

var _ = require('lodash')
var Push = require('pushover-notifications')
var config = require('./config.json')

var twitterConfig = config.twitter;
var Twitter = require('twitter')
var client = new Twitter(twitterConfig)

var p = new Push(config.pushover)

var follow = config.follow
var params = {
  follow: follow.join(',')
}

var activeStream;

var internals = {
  cleanup: function(text) {
    if (typeof text === 'string') {
      return text.replace(/http:\/\/[^\s#]*/g, '').replace(/#GoalFlash/g, '').replace(/^Correction: /g, 'Korrektur: ').replace(/[\s]{2,50}/g, ' ')
    }
    return text
  },
  post: function(text) {
    if (!text || config.post !== true) {
      return
    }

    client.post('statuses/update', {
      status: text
    }, function(error, tweet, response) {
      if (error) {
        logger.log('error', 'Tweet failed', error)
      } else {
        logger.log('info', 'Tweet posted: ' + text)
      }
    })
  },
  notify: function(text) {
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
    }, function(err, result) {
      if (err) {
        throw err
      }

      logger.log('info', 'Push message sent: ' + text, result)
    })
  },
  onTweet: function(tweet) {
    if (!tweet) {
      return
    } else if (_.contains(follow, tweet.user.id)) {
      logger.log('info', 'Pushing updated', tweet.user.name, tweet.user.id, tweet.text)
      var message = internals.cleanup(tweet.text)
      internals.notify(message)
      internals.post(message)
    }
  },
  onError: function(error) {
    throw error
  },
  onEnd: function() {
    logger.log('info', 'stream end', arguments)
  },
  start: function() {
    client.stream('statuses/filter', params, function(stream) {
      activeStream = stream
      internals.post(config.message)
      stream.on('data', internals.onTweet)
      stream.on('error', internals.onError)
      stream.on('end', internals.onEnd)
    })
  },
  restart: function() {
    logger.log('info', 'Restarting stream...')

    if (activeStream) {
      try {
        activeStream.destroy();
      } catch (e) {
        logger.log('error', 'Destroying stream failed', e);
      }
    }

    internals.start();
  }
}

logger.log('info', 'Starting pushover')
internals.start();

module.exports = internals;