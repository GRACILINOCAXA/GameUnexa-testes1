import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../config/neo4j.js';

const getRedirectUrl = (value, fallback) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : fallback;

const redirectToCommunity = req => getRedirectUrl(req.body.redirectTo, '/community');

export const sendFriendRequest = async (req, res) => {
  const userId = req.user.id;
  const { targetId } = req.params;
  const session = getSession();

  try {
    if (userId === targetId) {
      return res.redirect(redirectToCommunity(req));
    }

    await session.run(
      `
      MATCH (me:User { id: $userId }), (target:User { id: $targetId })
      WHERE NOT EXISTS {
        MATCH (me)-[existing:FRIEND_REQUEST]-(target)
        WHERE existing.status IN ['PENDING', 'ACCEPTED']
      }
      CREATE (me)-[:FRIEND_REQUEST {
        id: $requestId,
        status: 'PENDING',
        createdAt: datetime()
      }]->(target)
      `,
      { userId, targetId, requestId: uuidv4() }
    );

    return res.redirect(redirectToCommunity(req));
  } catch (error) {
    console.error('Erro ao enviar pedido de amizade:', error);
    return res.status(500).send('Erro ao enviar pedido de amizade.');
  } finally {
    await session.close();
  }
};

export const acceptFriendRequest = async (req, res) => {
  const session = getSession();

  try {
    await session.run(
      `
      MATCH (sender:User { id: $targetId })-[request:FRIEND_REQUEST { status: 'PENDING' }]->(me:User { id: $userId })
      SET request.status = 'ACCEPTED',
          request.respondedAt = datetime()
      `,
      { userId: req.user.id, targetId: req.params.targetId }
    );

    return res.redirect(redirectToCommunity(req));
  } catch (error) {
    console.error('Erro ao aceitar pedido de amizade:', error);
    return res.status(500).send('Erro ao aceitar pedido de amizade.');
  } finally {
    await session.close();
  }
};

export const declineFriendRequest = async (req, res) => {
  const session = getSession();

  try {
    await session.run(
      `
      MATCH (sender:User { id: $targetId })-[request:FRIEND_REQUEST { status: 'PENDING' }]->(me:User { id: $userId })
      DELETE request
      `,
      { userId: req.user.id, targetId: req.params.targetId }
    );

    return res.redirect(redirectToCommunity(req));
  } catch (error) {
    console.error('Erro ao recusar pedido de amizade:', error);
    return res.status(500).send('Erro ao recusar pedido de amizade.');
  } finally {
    await session.close();
  }
};

export const cancelFriendRequest = async (req, res) => {
  const session = getSession();

  try {
    await session.run(
      `
      MATCH (me:User { id: $userId })-[request:FRIEND_REQUEST { status: 'PENDING' }]->(target:User { id: $targetId })
      DELETE request
      `,
      { userId: req.user.id, targetId: req.params.targetId }
    );

    return res.redirect(redirectToCommunity(req));
  } catch (error) {
    console.error('Erro ao cancelar pedido de amizade:', error);
    return res.status(500).send('Erro ao cancelar pedido de amizade.');
  } finally {
    await session.close();
  }
};

export const createPost = async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  const igdbId = typeof req.body.igdbId === 'string' ? req.body.igdbId.trim() : '';
  const visibility = req.body.visibility || 'PUBLIC';

  if (!text || text.length > 1000 || !igdbId || !['PUBLIC', 'FRIENDS'].includes(visibility)) {
    return res.status(400).send('Informe o texto, um jogo do catálogo e uma visibilidade válida.');
  }

  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (author:User { id: $userId })
      MATCH (game:Game { igdbId: $igdbId })
      CREATE (post:Post {
        id: $postId,
        text: $text,
        visibility: $visibility,
        createdAt: datetime()
      })
      CREATE (author)-[:PUBLISHED]->(post)-[:ABOUT]->(game)
      RETURN post.id AS id
      `,
      {
        userId: req.user.id,
        igdbId,
        postId: uuidv4(),
        text,
        visibility
      }
    );

    if (result.records.length === 0) {
      return res.status(400).send('O jogo selecionado não está no catálogo.');
    }

    return res.redirect('/feed');
  } catch (error) {
    console.error('Erro ao criar publicação:', error);
    return res.status(500).send('Erro ao criar publicação.');
  } finally {
    await session.close();
  }
};
