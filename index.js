var Twitter = require('twitter')
var _ = require('lodash')
var Push = require('pushover-notifications')
var config = require('./config.json')
var client = new Twitter(config.twitter)
var p = new Push(config.pushover)

var follow = config.follow
var params = {follow: follow.join(',')}

var cleanup = function (text) {
  if (typeof text === 'string') {
    return text.replace(/http:\/\/[^\s#]*/g, '').replace(/#GoalFlash/g, '').replace(/^Correction: /g, 'Korrektur: ').replace(/[\s]{2,50}/g, ' ')
  }
  return text
}

var post = function (text) {
  if (!text || config.post !== true) {
    return
  }

  client.post('statuses/update', {status: text}, function (error, tweet, response) {
    if (error) {
      console.log(error)
    } else {
      console.log('Tweet posted: ' + text)
    }
  })
}

var notify = function (text) {
  if (!text || config.push !== true) {
    return
  }

  var title = 'Pushscore'

  if (text.indexOf('#Bundesliga') !== -1) {
    title = 'Bundesliga'
  } else if (text.indexOf('#ChampionsLeague') !== -1) {
    title = 'Champions League'
  }

  p.send({ message: text, title: title }, function (err, result) {
    if (err) {
      throw err
    }

    console.log('Notification sent: ' + text, result)
  })
}

client.stream('statuses/filter', params, function (stream) {
  post(config.message)

  stream.on('data', function (tweet) {
    if (!tweet) {
      return
    } else if (_.contains(follow, tweet.user.id)) {
      console.log('Pushing updated', tweet.user.name, tweet.user.id, tweet.text)
      var message = cleanup(tweet.text)
      notify(message)
      post(message)
    }
  })

  stream.on('error', function (error) {
    throw error
  })
})
