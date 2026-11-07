
jest.mock('mongoose', () => ({
  connect: jest.fn(),
  connection: { readyState: 0 },
}));

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');
const { connectDb, dbState } = require('../src/db/connect');

describe('database connection helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mongoose.connection.readyState = 0;
  });

  it('does not attempt a connection when no URI is configured', async () => {
    const warning = jest.spyOn(logger, 'warn');

    await expect(connectDb('')).resolves.toBe(false);

    expect(mongoose.connect).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith('database_uri_missing', {
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });

    warning.mockRestore();
  });

  it('connects with a bounded server-selection timeout', async () => {
    const info = jest.spyOn(logger, 'info');
    mongoose.connect.mockResolvedValue(undefined);

    await expect(
      connectDb('mongodb://localhost/chatapp_test')
    ).resolves.toBe(true);

    expect(mongoose.connect).toHaveBeenCalledWith(
      'mongodb://localhost/chatapp_test',
      { serverSelectionTimeoutMS: 5000 }
    );

    expect(info).toHaveBeenCalledWith('database_connected');

    info.mockRestore();
  });

  it('returns false and logs a safe connection error when MongoDB is unreachable', async () => {
    const error = jest.spyOn(logger, 'error');
    mongoose.connect.mockRejectedValue(
      new Error('connection refused')
    );

    await expect(
      connectDb('mongodb://localhost/chatapp_test')
    ).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith('database_connection_failed', {
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });

    // The raw database error must never be passed to the logger.
    expect(error).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'connection refused' })
    );

    error.mockRestore();
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
