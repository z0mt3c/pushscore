var Twitter = require('twitter')
var _ = require('lodash')
var Push = require('pushover-notifications')
var config = require('./config.json')
var client = new Twitter(config.twitter)
var p = new Push(config.pushover)

var follow = config.follow
var params = {follow: follow.join(',')}

var notify = function (text) {
  p.send({ message: text, title: 'Bundesliga'}, function (err, result) {
    if (err) {
      throw err
    }

    console.log('Notification sent: ' + text, result)
  })
}

client.stream('statuses/filter', params, function (stream) {
  notify('Pushover service running')

  stream.on('data', function (tweet) {
    if (!tweet) {
      return
    } else if (_.contains(follow, tweet.user.id)) {
      console.log('Sending', tweet.user.name, tweet.user.id, tweet.text)
      notify(tweet.text)
    } else {
      console.log('Skipping', tweet.user.name, tweet.user.id, tweet.text)
    }
  })

  stream.on('error', function (error) {
    throw error
  })
})
