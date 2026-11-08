process.env.JWT_SECRET = 'security-tests-only-secret';
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createApp } = require('../src/app');
const logger = require('../src/utils/logger');

function unsignedToken() {
  const encode = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'user-1' })}.`;
}
function modifiedPayload() {
  const parts = jwt.sign({ sub: 'user-1' }, process.env.JWT_SECRET).split('.');
  parts[1] = Buffer.from(JSON.stringify({ sub: 'user-2' })).toString('base64url');
  return parts.join('.');
}

describe('CA-46: REST authentication security', () => {
  const app = createApp();
  const tokens = [
    ['unsigned', unsignedToken()],
    ['modified payload', modifiedPayload()],
    ['wrong signature', jwt.sign({ sub: 'user-1' }, 'wrong-secret')],
    ['expired', jwt.sign({ sub: 'user-1' }, process.env.JWT_SECRET, { expiresIn: -1 })],
  ];
  test.each(tokens)('rejects %s JWT', async (_label, token) => {
    const response = await request(app).get('/api/conversations').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_FAILED');
  });
});

test('the structured logger excludes unapproved sensitive fields', () => {
  const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    logger.error('security_test', { password: 'test-password', token: 'test-token', content: 'test-message', code: 'SAFE_CODE' });
    const line = String(write.mock.calls[0][0]);
    expect(line).toContain('SAFE_CODE');
    for (const secret of ['test-password', 'test-token', 'test-message']) expect(line).not.toContain(secret);
  } finally { write.mockRestore(); }
});
