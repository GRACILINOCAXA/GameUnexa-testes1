import bcrypt from 'bcryptjs';
import { getSession } from '../config/neo4j.js';
import { setAuthCookie } from '../authHelpers.js';

const renderAccountPage = (res, account, error = null, success = null, status = 200) =>
  res.status(status).render('account-settings', { account, error, success });

const renderCurrentAccountError = async (req, res, error, status = 400) => {
  const session = getSession();

  try {
    const result = await session.run(
      'MATCH (u:User { id: $userId }) RETURN u.username AS username, u.email AS email',
      { userId: req.user.id }
    );

    if (result.records.length === 0) {
      return res.status(404).send('Conta não encontrada.');
    }

    return renderAccountPage(res, {
      username: result.records[0].get('username'),
      email: result.records[0].get('email')
    }, error, null, status);
  } catch (loadError) {
    console.error('Erro ao carregar dados da conta para exibir uma falha:', loadError);
    return res.status(500).send('Erro ao carregar configurações da conta.');
  } finally {
    await session.close();
  }
};

const getAccountInput = body => ({
  username: typeof body.username === 'string' ? body.username.trim() : '',
  email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
});

export const renderAccountSettings = async (req, res) => {
  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (u:User { id: $userId })
      RETURN u.username AS username, u.email AS email
      `,
      { userId: req.user.id }
    );

    if (result.records.length === 0) {
      return res.status(404).send('Conta não encontrada.');
    }

    const record = result.records[0];
    const success = req.query.updated === '1'
      ? 'Dados cadastrais atualizados.'
      : req.query.passwordChanged === '1'
        ? 'Senha alterada com sucesso.'
        : null;

    return renderAccountPage(res, {
      username: record.get('username'),
      email: record.get('email')
    }, null, success);
  } catch (error) {
    console.error('Erro ao carregar configurações da conta:', error);
    return res.status(500).send('Erro ao carregar configurações da conta.');
  } finally {
    await session.close();
  }
};

export const updateAccountDetails = async (req, res) => {
  const account = getAccountInput(req.body);
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';

  if (!account.username || account.username.length > 40 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email) ||
      !currentPassword) {
    return renderAccountPage(res, account, 'Informe um nome de usuário, e-mail válido e sua senha atual.', null, 400);
  }

  const session = getSession();

  try {
    const result = await session.executeWrite(async tx => {
      const current = await tx.run(
        'MATCH (u:User { id: $userId }) RETURN u.passwordHash AS passwordHash',
        { userId: req.user.id }
      );

      if (current.records.length === 0) return 'NOT_FOUND';
      const passwordHash = current.records[0].get('passwordHash');
      if (typeof passwordHash !== 'string' || !await bcrypt.compare(currentPassword, passwordHash)) {
        return 'INVALID_PASSWORD';
      }

      const updated = await tx.run(
        `
        MATCH (u:User { id: $userId })
        SET u.username = $username, u.email = $email
        RETURN u.id AS id
        `,
        { userId: req.user.id, ...account }
      );
      return updated.records.length ? 'UPDATED' : 'NOT_FOUND';
    });

    if (result === 'NOT_FOUND') {
      return res.status(404).send('Conta não encontrada.');
    }
    if (result === 'INVALID_PASSWORD') {
      return renderAccountPage(res, account, 'Senha atual incorreta.', null, 400);
    }

    setAuthCookie(res, { id: req.user.id, username: account.username });
    return res.redirect('/user/account?updated=1');
  } catch (error) {
    if (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
      return renderAccountPage(res, account, 'Este e-mail ou nome de usuário já está em uso.', null, 400);
    }
    console.error('Erro ao atualizar dados da conta:', error);
    return renderAccountPage(res, account, 'Não foi possível atualizar os dados da conta.', null, 500);
  } finally {
    await session.close();
  }
};

export const changePassword = async (req, res) => {
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (!currentPassword || newPassword.length < 8 ||
      Buffer.byteLength(newPassword, 'utf8') > 72 ||
      newPassword !== confirmPassword) {
    return renderCurrentAccountError(
      req,
      res,
      'Informe a senha atual, uma nova senha de 8 a 72 bytes e a confirmação correspondente.',
      400
    );
  }

  const session = getSession();

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await session.executeWrite(async tx => {
      const current = await tx.run(
        'MATCH (u:User { id: $userId }) RETURN u.passwordHash AS passwordHash',
        { userId: req.user.id }
      );

      if (current.records.length === 0) return 'NOT_FOUND';
      const currentHash = current.records[0].get('passwordHash');
      if (typeof currentHash !== 'string' || !await bcrypt.compare(currentPassword, currentHash)) {
        return 'INVALID_PASSWORD';
      }

      await tx.run(
        `
        MATCH (u:User { id: $userId })
        SET u.passwordHash = $passwordHash,
            u.passwordUpdatedAt = datetime()
        `,
        { userId: req.user.id, passwordHash }
      );
      return 'UPDATED';
    });

    if (result === 'NOT_FOUND') {
      return res.status(404).send('Conta não encontrada.');
    }
    if (result === 'INVALID_PASSWORD') {
      return renderCurrentAccountError(req, res, 'Senha atual incorreta.', 400);
    }

    return res.redirect('/user/account?passwordChanged=1');
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return renderCurrentAccountError(req, res, 'Não foi possível alterar a senha.', 500);
  } finally {
    await session.close();
  }
};

export const deleteAccount = async (req, res) => {
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const confirmation = typeof req.body.confirmation === 'string' ? req.body.confirmation : '';

  if (!currentPassword || confirmation !== 'EXCLUIR') {
    return renderCurrentAccountError(
      req,
      res,
      'Informe sua senha atual e digite EXCLUIR para confirmar.',
      400
    );
  }

  const session = getSession();

  try {
    const result = await session.executeWrite(async tx => {
      const current = await tx.run(
        'MATCH (u:User { id: $userId }) RETURN u.passwordHash AS passwordHash',
        { userId: req.user.id }
      );

      if (current.records.length === 0) return 'NOT_FOUND';
      const passwordHash = current.records[0].get('passwordHash');
      if (typeof passwordHash !== 'string' || !await bcrypt.compare(currentPassword, passwordHash)) {
        return 'INVALID_PASSWORD';
      }

      const ownedData = await tx.run(
        `
        MATCH (user:User { id: $userId })
        CALL {
          WITH user
          OPTIONAL MATCH (user)-[:PUBLISHED]->(post:Post)
          OPTIONAL MATCH (postComment:Comment)-[:ON_POST]->(post)
          RETURN collect(DISTINCT post.id) AS postIds,
                 collect(DISTINCT postComment.id) AS postCommentIds
        }
        CALL {
          WITH user
          OPTIONAL MATCH (user)-[:POSTED]->(review:Review)
          OPTIONAL MATCH (reviewComment:Comment)-[:ON_REVIEW]->(review)
          RETURN collect(DISTINCT review.id) AS reviewIds,
                 collect(DISTINCT reviewComment.id) AS reviewCommentIds
        }
        CALL {
          WITH user
          OPTIONAL MATCH (user)-[:WROTE]->(root:Comment)
          OPTIONAL MATCH (descendant:Comment)-[:REPLY_TO*1..]->(root)
          RETURN collect(DISTINCT root.id) + collect(DISTINCT descendant.id) AS authoredCommentIds
        }
        RETURN postIds,
               reviewIds,
               postCommentIds + reviewCommentIds + authoredCommentIds AS commentIds
        `,
        { userId: req.user.id }
      );

      if (ownedData.records.length === 0) return 'NOT_FOUND';

      const data = ownedData.records[0];
      const postIds = data.get('postIds');
      const reviewIds = data.get('reviewIds');
      const commentIds = [...new Set(data.get('commentIds').filter(Boolean))];

      await tx.run(
        'UNWIND $ids AS id MATCH (comment:Comment { id: id }) DETACH DELETE comment',
        { ids: commentIds }
      );
      await tx.run(
        'UNWIND $ids AS id MATCH (post:Post { id: id }) DETACH DELETE post',
        { ids: postIds }
      );
      await tx.run(
        'UNWIND $ids AS id MATCH (review:Review { id: id }) DETACH DELETE review',
        { ids: reviewIds }
      );
      await tx.run(
        `
        MATCH (u:User { id: $userId })
        WITH u, u.id AS deletedUserId
        DETACH DELETE u
        RETURN deletedUserId
        `,
        { userId: req.user.id }
      );

      return 'DELETED';
    });

    if (result === 'NOT_FOUND') {
      return res.status(404).send('Conta não encontrada.');
    }
    if (result === 'INVALID_PASSWORD') {
      return renderCurrentAccountError(req, res, 'Senha atual incorreta.', 400);
    }

    res.clearCookie('token');
    return res.redirect('/auth/login?accountDeleted=1');
  } catch (error) {
    console.error('Erro ao excluir conta:', error);
    return renderCurrentAccountError(req, res, 'Não foi possível excluir a conta.', 500);
  } finally {
    await session.close();
  }
};
