jest.mock('mongoose', () => ({
  connect: jest.fn(),
  connection: { readyState: 0 },
}));

const mongoose = require('mongoose');
const { connectDb, dbState } = require('../src/db/connect');

describe('database connection helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mongoose.connection.readyState = 0;
  });

  it('does not attempt a connection when no URI is configured', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(connectDb('')).resolves.toBe(false);

    expect(mongoose.connect).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith('MONGO_URI is not set; starting without a database.');
    warning.mockRestore();
  });

  it('connects with a bounded server-selection timeout', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    mongoose.connect.mockResolvedValue(undefined);

    await expect(connectDb('mongodb://localhost/chatapp_test')).resolves.toBe(true);

    expect(mongoose.connect).toHaveBeenCalledWith(
      'mongodb://localhost/chatapp_test',
      { serverSelectionTimeoutMS: 5000 }
    );
    expect(log).toHaveBeenCalledWith('MongoDB connected');
    log.mockRestore();
  });

  it('returns false and logs a safe connection error when MongoDB is unreachable', async () => {
    const error = new Error('connection refused');
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mongoose.connect.mockRejectedValue(error);

    await expect(connectDb('mongodb://localhost/chatapp_test')).resolves.toBe(false);

    expect(logError).toHaveBeenCalledWith('MongoDB connection failed:', 'connection refused');
    logError.mockRestore();
  });

  it.each([
    [0, 'disconnected'],
    [1, 'connected'],
    [2, 'connecting'],
    [3, 'disconnecting'],
    [4, 'unknown'],
  ])('maps MongoDB ready state %i to %s', (readyState, expected) => {
    mongoose.connection.readyState = readyState;

    expect(dbState()).toBe(expected);
  });
});
