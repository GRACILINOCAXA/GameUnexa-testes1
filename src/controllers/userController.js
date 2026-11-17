import bcrypt from 'bcryptjs';
import { getSession } from '../config/neo4j.js';

const sanitizeText = (value = '') => String(value || '').trim();

export const renderProfileSettings = async (req, res) => {
  const userId = req.user.id;
  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (u:User { id: $userId })
      RETURN u
      `,
      { userId }
    );

    if (result.records.length === 0) {
      return res.status(404).send('Usuário não encontrado.');
    }

    const user = result.records[0].get('u').properties;

    return res.render('profile-settings', {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio || '',
        avatarUrl: user.avatarUrl || '',
        preferredPlatform: user.preferredPlatform || 'PC',
        steamUrl: user.steamUrl || '',
        psnUrl: user.psnUrl || '',
        xboxLiveUrl: user.xboxLiveUrl || ''
      },
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    return res.status(500).send('Erro ao carregar configurações do perfil.');
  } finally {
    await session.close();
  }
};

export const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const session = getSession();

  const bio = sanitizeText(req.body.bio).slice(0, 300);
  const preferredPlatform = ['PC', 'PlayStation', 'Xbox', 'Nintendo'].includes(req.body.preferredPlatform)
    ? req.body.preferredPlatform
    : 'PC';
  const avatarUrl = sanitizeText(req.body.avatarUrl).slice(0, 500);
  const steamUrl = sanitizeText(req.body.steamUrl).slice(0, 500);
  const psnUrl = sanitizeText(req.body.psnUrl).slice(0, 500);
  const xboxLiveUrl = sanitizeText(req.body.xboxLiveUrl).slice(0, 500);

  try {
    await session.run(
      `
      MATCH (u:User { id: $userId })
      SET u.bio = $bio,
          u.avatarUrl = $avatarUrl,
          u.preferredPlatform = $preferredPlatform,
          u.steamUrl = $steamUrl,
          u.psnUrl = $psnUrl,
          u.xboxLiveUrl = $xboxLiveUrl
      `,
      {
        userId,
        bio,
        avatarUrl,
        preferredPlatform,
        steamUrl,
        psnUrl,
        xboxLiveUrl
      }
    );

    return res.redirect('/profile');
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    return res.status(500).send('Erro ao atualizar perfil.');
  } finally {
    await session.close();
  }
};

export const updatePassword = async (req, res) => {
  const userId = req.user.id;
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const session = getSession();

  try {
    if (!currentPassword || !newPassword) {
      return res.status(400).render('profile-settings', {
        error: 'Informe a senha atual e a nova senha.',
        success: null,
        user: { username: req.user.username }
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).render('profile-settings', {
        error: 'A nova senha deve ter pelo menos 6 caracteres.',
        success: null,
        user: { username: req.user.username }
      });
    }

    const result = await session.run(
      `
      MATCH (u:User { id: $userId })
      RETURN u.passwordHash AS passwordHash
      `,
      { userId }
    );

    if (result.records.length === 0) {
      return res.status(404).send('Usuário não encontrado.');
    }

    const storedHash = result.records[0].get('passwordHash');
    const isValid = await bcrypt.compare(currentPassword, storedHash);

    if (!isValid) {
      return res.status(401).render('profile-settings', {
        error: 'Senha atual inválida.',
        success: null,
        user: { username: req.user.username }
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await session.run(
      `
      MATCH (u:User { id: $userId })
      SET u.passwordHash = $passwordHash
      `,
      { userId, passwordHash: hashedPassword }
    );

    return res.redirect('/profile');
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).send('Erro ao alterar a senha.');
  } finally {
    await session.close();
  }
};

export const deleteAccount = async (req, res) => {
  const userId = req.user.id;
  const session = getSession();

  try {
    await session.run(
      `
      MATCH (u:User { id: $userId })
      OPTIONAL MATCH (u)-[r]-() DETACH DELETE u
      `,
      { userId }
    );

    res.clearCookie('token');
    return res.redirect('/auth/register');
  } catch (error) {
    console.error('Erro ao excluir conta:', error);
    return res.status(500).send('Erro ao excluir conta.');
  } finally {
    await session.close();
  }
};
