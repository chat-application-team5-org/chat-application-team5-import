const mongoose = require('mongoose');

// Connects to MongoDB. Returns false (instead of throwing) when no URI is set
// or the database is unreachable, so the server can still start and /health
// can report the database state.
async function connectDb(uri) {
  if (!uri) {
    console.warn('MONGO_URI is not set; starting without a database.');
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connected');
    return true;
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    return false;
  }
}

function dbState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}

module.exports = { connectDb, dbState };
