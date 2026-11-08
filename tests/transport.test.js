const fs = require('fs');
const http = require('http');
const https = require('https');
const { createTransport } = require('../src/transport');

const app = () => {};
const dev = { environment: 'development', tlsKeyPath: '', tlsCertPath: '' };
const production = { environment: 'production', tlsKeyPath: '/key', tlsCertPath: '/cert', jwtSecret: 'x'.repeat(32), allowedOrigin: 'https://chat.example.com' };
afterEach(() => jest.restoreAllMocks());

test('allows plain HTTP for local development only', () => {
  const spy = jest.spyOn(http, 'createServer').mockReturnValue('http');
  expect(createTransport(app, dev)).toBe('http');
  expect(spy).toHaveBeenCalledWith(app);
  expect(() => createTransport(app, { ...dev, environment: 'production' })).toThrow('Production requires TLS');
});
test('rejects incomplete TLS paths, weak secrets and non-HTTPS origins', () => {
  expect(() => createTransport(app, { ...dev, tlsKeyPath: '/key' })).toThrow('Both TLS');
  expect(() => createTransport(app, { ...production, jwtSecret: 'weak' })).toThrow('strong JWT');
  expect(() => createTransport(app, { ...production, jwtSecret: 'change-me-to-a-long-random-string' })).toThrow('strong JWT');
  expect(() => createTransport(app, { ...production, allowedOrigin: 'http://localhost:3000' })).toThrow('HTTPS allowed origin');
  expect(() => createTransport(app, { ...production, allowedOrigin: 'not a URL' })).toThrow('HTTPS allowed origin');
});
test('uses both certificate files and enforces TLS 1.2 or newer', () => {
  jest.spyOn(fs, 'readFileSync').mockImplementation((path) => Buffer.from(path));
  const spy = jest.spyOn(https, 'createServer').mockReturnValue('https');
  expect(createTransport(app, production)).toBe('https');
  expect(spy).toHaveBeenCalledWith({ key: Buffer.from('/key'), cert: Buffer.from('/cert'), minVersion: 'TLSv1.2' }, app);
});
