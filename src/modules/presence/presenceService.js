
const onlineUsers = new Map();
const lastSeenUsers = new Map();

function markOnline(userId) {
  const id = String(userId);
  const wasOffline = !onlineUsers.has(id);

  if (wasOffline) {
    onlineUsers.set(id, 0);
  }

  onlineUsers.set(id, onlineUsers.get(id) + 1);
  return wasOffline;
}

function markOffline(userId) {
  const id = String(userId);
  const connections = onlineUsers.get(id);

  if (connections === undefined) return null;

  if (connections > 1) {
    onlineUsers.set(id, connections - 1);
    return null;
  }

  onlineUsers.delete(id);

  const lastSeen = new Date();
  lastSeenUsers.set(id, lastSeen);
  return lastSeen;
}

function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

function getLastSeen(userId) {
  return lastSeenUsers.get(String(userId)) || null;
}

module.exports = {
  markOnline,
  markOffline,
  isOnline,
  getLastSeen,
};
