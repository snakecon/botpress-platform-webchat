import _ from 'lodash'
import Promise from 'bluebird'

import users from './users'
import db from './db'

const outgoingTypes = ['text', 'login_prompt', 'file', 'carousel']

module.exports = async (bp, config) => {
  const knex = await bp.db.get()
  const { appendBotMessage, getOrCreateRecentConversation } = db(knex, bp.botfile)
  const { getOrCreateUser } = await users(bp, config)

  const { botName = 'Bot', bot_avatar = null } = config || {}

  bp.middlewares.register({
    name: 'webchat.sendMessages',
    type: 'outgoing',
    order: 100,
    handler: outgoingHandler,
    module: 'botpress-platform-webchat',
    description:
      'Sends out messages that targets platform = webchat.' +
      ' This middleware should be placed at the end as it swallows events once sent.'
  })

  async function outgoingHandler(event, next) {
    if (event.platform !== 'webchat') {
      return next()
    }

    if (!_.includes(outgoingTypes, event.type)) {
      return next('Unsupported event type: ' + event.type)
    }

    let user = await getOrCreateUser(event.user.id)

    const typing = parseTyping(event)

    const conversationId = _.get(event, 'raw.conversationId') || (await getOrCreateRecentConversation(user.id))

    const socketId = user.userId.replace(/webchat:/ig, '')

    if (typing) {
      bp.events.emit('guest.webchat.typing', {
        timeInMs: typing,
        userId: null,
        __room: 'visitor:' + socketId,
        conversationId
      })

      await Promise.delay(typing)
    }

    const message = await appendBotMessage(botName, bot_avatar, conversationId, event)

    Object.assign(message, {
      __room: 'visitor:' + socketId // This is used to send to the relevant user's socket
    })

    bp.events.emit('guest.webchat.message', message)

    // Resolve the event promise
    event._promise && event._resolve && event._resolve()
  }
}

function parseTyping(msg) {
  if (msg.raw && !!msg.raw.typing) {
    if (isNaN(msg.raw.typing)) {
      return 1000
    } else {
      return Math.max(msg.raw.typing, 500)
    }
  }

  return false
}
