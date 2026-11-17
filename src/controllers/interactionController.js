import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../config/neo4j.js';

const getRedirectUrl = (value, fallback) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : fallback;

const getTargetType = value => value === 'POST' || value === 'REVIEW' ? value : null;

export const toggleLike = async (req, res) => {
  const targetType = getTargetType(req.body.targetType);
  const targetId = typeof req.body.targetId === 'string' ? req.body.targetId : '';
  const fallback = targetType === 'POST' ? '/feed' : '/games/catalog';
  const redirectTo = getRedirectUrl(req.body.redirectTo, fallback);

  if (!targetType || !targetId) {
    return res.status(400).send('Publicação ou avaliação inválida.');
  }

  const session = getSession();

  try {
    const targetMatch = targetType === 'POST'
      ? `
        MATCH (author:User)-[:PUBLISHED]->(target:Post { id: $targetId })
        WHERE target.visibility = 'PUBLIC'
           OR author.id = $userId
           OR EXISTS {
             MATCH (:User { id: $userId })-[friendship:FRIEND_REQUEST]-(author)
             WHERE friendship.status = 'ACCEPTED'
           }
      `
      : 'MATCH (target:Review { id: $targetId })';

    const result = await session.run(
      `
      MATCH (user:User { id: $userId })
      ${targetMatch}
      OPTIONAL MATCH (user)-[existing:LIKED]->(target)
      FOREACH (_ IN CASE WHEN existing IS NULL THEN [1] ELSE [] END |
        CREATE (user)-[:LIKED { createdAt: datetime() }]->(target)
      )
      FOREACH (_ IN CASE WHEN existing IS NOT NULL THEN [1] ELSE [] END |
        DELETE existing
      )
      RETURN target.id AS id
      `,
      { userId: req.user.id, targetId }
    );

    if (result.records.length === 0) {
      return res.status(404).send('Publicação ou avaliação não encontrada.');
    }

    return res.redirect(redirectTo);
  } catch (error) {
    console.error('Erro ao atualizar curtida:', error);
    return res.status(500).send('Erro ao atualizar curtida.');
  } finally {
    await session.close();
  }
};

export const addComment = async (req, res) => {
  const targetType = getTargetType(req.body.targetType);
  const targetId = typeof req.body.targetId === 'string' ? req.body.targetId : '';
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  const parentCommentId = typeof req.body.parentCommentId === 'string'
    ? req.body.parentCommentId.trim()
    : '';
  const fallback = targetType === 'POST' ? '/feed' : '/games/catalog';
  const redirectTo = getRedirectUrl(req.body.redirectTo, fallback);

  if (!targetType || !targetId || !text || text.length > 1000) {
    return res.status(400).send('Comentário inválido. Use entre 1 e 1000 caracteres.');
  }

  const targetLabel = targetType === 'POST' ? 'Post' : 'Review';
  const targetRelationship = targetType === 'POST' ? 'ON_POST' : 'ON_REVIEW';
  const targetAccess = targetType === 'POST'
    ? `
      MATCH (owner:User)-[:PUBLISHED]->(target:${targetLabel} { id: $targetId })
      WHERE target.visibility = 'PUBLIC'
         OR owner.id = $userId
         OR EXISTS {
           MATCH (:User { id: $userId })-[friendship:FRIEND_REQUEST]-(owner)
           WHERE friendship.status = 'ACCEPTED'
         }
    `
    : `MATCH (target:${targetLabel} { id: $targetId })`;
  const parentMatch = parentCommentId
    ? `MATCH (parent:Comment { id: $parentCommentId })-[:${targetRelationship}]->(target)`
    : '';
  const parentCreate = parentCommentId
    ? 'CREATE (comment)-[:REPLY_TO]->(parent)'
    : '';
  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (user:User { id: $userId })
      ${targetAccess}
      ${parentMatch}
      CREATE (comment:Comment {
        id: $commentId,
        text: $text,
        createdAt: datetime()
      })
      CREATE (user)-[:WROTE]->(comment)-[:${targetRelationship}]->(target)
      ${parentCreate}
      RETURN comment.id AS id
      `,
      {
        userId: req.user.id,
        targetId,
        parentCommentId,
        commentId: uuidv4(),
        text
      }
    );

    if (result.records.length === 0) {
      return res.status(404).send('Publicação, avaliação ou comentário não encontrado.');
    }

    return res.redirect(redirectTo);
  } catch (error) {
    console.error('Erro ao adicionar comentário:', error);
    return res.status(500).send('Erro ao adicionar comentário.');
  } finally {
    await session.close();
  }
};
