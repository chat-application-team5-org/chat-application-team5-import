
// Mock backend so the UI can be demoed before the real API exists.
// Enable by opening the app with ?mock in the URL.
window.Chat = window.Chat || {};

(function (Chat) {
  const enabled = new URLSearchParams(location.search).has('mock');

  const users = [
    { userId: 'u2', username: 'bob', displayName: 'Bob' },
    { userId: 'u3', username: 'carol', displayName: 'Carol' },
    { userId: 'u4', username: 'dave', displayName: 'Dave' },
  ];

  const conversations = [
    {
      _id: 'c1',
      type: 'PRIVATE',
      name: 'Bob',
      participants: ['u1', 'u2'],
      lastMessage: 'See you at the demo',
      unreadCount: 2,
    },
    {
      _id: 'c2',
      type: 'GROUP',
      name: 'Team 5',
      participants: ['u1', 'u2', 'u3'],
      lastMessage: 'Sprint 1 starts today',
      unreadCount: 0,
    },
  ];

  function fail(status, code, message) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
  }

  async function handle(method, path, body) {
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Register
    if (method === 'POST' && path === '/api/auth/register') {
      if (body.username.toLowerCase() === 'bob') {
        throw fail(
          409,
          'DUPLICATE_USER',
          'Username or email is already in use'
        );
      }

      return {
        userId: 'u1',
        username: body.username,
      };
    }

    // Login
    if (method === 'POST' && path === '/api/auth/login') {
      if (body.password !== 'Password1') {
        throw fail(
          401,
          'AUTH_INVALID_CREDENTIALS',
          'Invalid credentials'
        );
      }

      return {
        token: 'mock-token',
        expiresIn: 86400,
        user: {
          userId: 'u1',
          username: body.identifier,
          displayName: body.identifier,
        },
      };
    }

    // List conversations
    if (method === 'GET' && path === '/api/conversations') {
      return { conversations };
    }

    // Create or retrieve an existing private conversation
    if (method === 'POST' && path === '/api/conversations') {
      const user = users.find(
        (u) => u.userId === body.participantId
      );

      if (!user) {
        throw fail(404, 'USER_NOT_FOUND', 'User not found');
      }

      if (user.userId === 'u1') {
        throw fail(
          400,
          'INVALID_PARTICIPANT',
          'Cannot start a conversation with yourself'
        );
      }

      let conversation = conversations.find(
        (c) =>
          c.type === 'PRIVATE' &&
          c.participants.includes('u1') &&
          c.participants.includes(user.userId)
      );

      if (!conversation) {
        conversation = {
          _id: 'c-' + user.userId,
          type: 'PRIVATE',
          name: user.displayName || user.username,
          participants: ['u1', user.userId],
          unreadCount: 0,
        };

        conversations.push(conversation);
      }

      return {
        conversation,
        messages: [],
      };
    }

    // Search users by partial username (case-insensitive)
    if (method === 'GET' && path.startsWith('/api/users/search')) {
      const params = new URLSearchParams(path.split('?')[1] || '');
      const q = (params.get('q') || '').trim().toLowerCase();

      if (!q) {
        return [];
      }

      return users.filter((user) =>
        user.username.toLowerCase().includes(q)
      );
    }

    // Group information and admin actions for the group demo.
    const groupParts = path.split('/').filter(Boolean);
    const groupId = groupParts[2];
    const groupTail = groupParts.slice(3);
    if (groupParts[0] === 'api' && groupParts[1] === 'groups' && groupId === 'c2') {
      const group = conversations.find((item) => item._id === 'c2' && item.type === 'GROUP');
      if (!group) throw fail(404, 'NOT_FOUND', 'Group not found');
      const currentUserId = 'u1';

      if (method === 'GET' && groupTail.length === 0) {
        return {
          conversation: {
            conversationId: 'c2',
            type: 'GROUP',
            name: group.name,
            createdBy: currentUserId,
            members: group.participants.map((userId) => {
              const user = userId === currentUserId
                ? { username: 'you', displayName: 'You' }
                : users.find((candidate) => candidate.userId === userId) || { username: userId };
              return {
                userId,
                username: user.username,
                displayName: user.displayName || user.username,
                role: userId === currentUserId ? 'ADMIN' : 'MEMBER',
              };
            }),
          },
        };
      }

      if (method === 'PATCH' && groupTail.length === 0) {
        group.name = String(body.name || '').trim();
        return {
          conversation: {
            conversationId: 'c2',
            type: 'GROUP',
            name: group.name,
            participants: group.participants.slice(),
          },
        };
      }

      if (method === 'POST' && groupTail.length === 1 && groupTail[0] === 'members') {
        const user = users.find((candidate) => candidate.userId === body.userId);
        if (!user) throw fail(404, 'NOT_FOUND', 'User not found');
        if (group.participants.includes(user.userId)) {
          throw fail(409, 'ALREADY_MEMBER', 'This user is already a group member.');
        }
        group.participants.push(user.userId);
        return {
          conversation: {
            conversationId: 'c2',
            type: 'GROUP',
            name: group.name,
            participants: group.participants.slice(),
          },
        };
      }

      if (method === 'DELETE' && groupTail.length === 2 && groupTail[0] === 'members') {
        if (group.participants.length <= 3) {
          throw fail(400, 'VALIDATION_ERROR', 'A group must have at least three members.');
        }
        group.participants = group.participants.filter((userId) => userId !== groupTail[1]);
        return {
          conversation: {
            conversationId: 'c2',
            type: 'GROUP',
            name: group.name,
            participants: group.participants.slice(),
          },
        };
      }

      if (method === 'POST' && groupTail.length === 1 && groupTail[0] === 'leave') {
        group.participants = group.participants.filter((userId) => userId !== currentUserId);
        const deleted = group.participants.length < 3;
        if (deleted) conversations.splice(conversations.indexOf(group), 1);
        return { left: true, deleted };
      }
    }

    // Get messages for a conversation
    const messageMatch = path.match(
      /^\/api\/conversations\/([^/]+)\/messages/
    );

    if (method === 'GET' && messageMatch) {
      return {
        messages: sampleMessages(messageMatch[1]),
        hasMore: false,
      };
    }

    throw fail(404, 'NOT_FOUND', 'Not found');
  }

  function minutesAgo(minutes) {
    return new Date(
      Date.now() - minutes * 60000
    ).toISOString();
  }

  // Sample messages for the mock conversation
  function sampleMessages(conversationId) {
    const doc = (
      id,
      sender,
      content,
      minutes,
      status
    ) => ({
      _id: id,
      conversation: conversationId,
      sender,
      content,
      status,
      createdAt: minutesAgo(minutes),
    });

    if (conversationId === 'c1') {
      return [
        doc(
          'm1',
          'u2',
          'Hey! Did you push the skeleton?',
          50,
          'READ'
        ),
        doc(
          'm2',
          'u1',
          'Yes, CA-12 is merged.',
          48,
          'READ'
        ),
        doc(
          'm3',
          'u2',
          'Great. See you at the demo',
          46,
          'READ'
        ),
        doc(
          'm4',
          'u1',
          'Sprint 1 review tomorrow.\nBring the board screenshots.',
          10,
          'DELIVERED'
        ),
      ];
    }

    return [];
  }

  // Simulates WebSocket message acknowledgements and replies
  function send(payload) {
    const messageId = 'srv-' + Date.now();

    const at = (ms, callback) =>
      setTimeout(callback, ms);

    at(300, () =>
      Chat.ws.inject('message:status', {
        clientMsgId: payload.clientMsgId,
        messageId,
        status: 'SENT',
      })
    );

    at(900, () =>
      Chat.ws.inject('message:status', {
        messageId,
        status: 'DELIVERED',
      })
    );

    at(1600, () =>
      Chat.ws.inject('message:status', {
        messageId,
        status: 'READ',
      })
    );

    at(2200, () =>
      Chat.ws.inject('message:new', {
        message: {
          _id: 'srv-r-' + Date.now(),
          conversation: payload.conversationId,
          sender: 'u2',
          content: 'Got it!',
          status: 'SENT',
          createdAt: new Date().toISOString(),
        },
      })
    );

    return true;
  }

  Chat.mock = {
    enabled,
    handle,
    users,
    send,
  };
})(window.Chat);
