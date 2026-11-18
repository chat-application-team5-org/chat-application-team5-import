function getPacedSendOffsets(clientCount, intervalMs) {
  if (!Number.isInteger(clientCount) || clientCount < 1) {
    throw new TypeError('clientCount must be a positive integer.');
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new TypeError('intervalMs must be a positive number.');
  }

  return Array.from({ length: clientCount }, (_, index) =>
    Math.floor((intervalMs * index) / clientCount)
  );
}

module.exports = { getPacedSendOffsets };
