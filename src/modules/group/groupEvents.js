
const { EventEmitter } = require('events');

const emitter = new EventEmitter();

function publishGroupUpdate(recipientId, payload) {
  emitter.emit('group:update', {
    recipientId: String(recipientId),
    payload,
  });
}

function onGroupUpdate(handler) {
  emitter.on('group:update', handler);

  return () => {
    emitter.off('group:update', handler);
  };
}

module.exports = {
  publishGroupUpdate,
  onGroupUpdate,
};
