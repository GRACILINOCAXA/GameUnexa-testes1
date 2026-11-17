import { getSession } from '../config/neo4j.js';

const platforms = ['PC', 'PlayStation', 'Xbox', 'Nintendo'];

const getProfileValues = body => ({
  bio: typeof body.bio === 'string' ? body.bio.trim() : '',
  avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '',
  preferredPlatform: typeof body.preferredPlatform === 'string' ? body.preferredPlatform : '',
  steamUrl: typeof body.steamUrl === 'string' ? body.steamUrl.trim() : '',
  psnUrl: typeof body.psnUrl === 'string' ? body.psnUrl.trim() : '',
  xboxLiveUrl: typeof body.xboxLiveUrl === 'string' ? body.xboxLiveUrl.trim() : '',
  libraryVisibility: typeof body.libraryVisibility === 'string' ? body.libraryVisibility : 'PUBLIC'
});

const normalizeHttpsUrl = (value, label) => {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) {
      return url.toString();
    }
  } catch {
    // The form validation below reports invalid URLs to the user.
  }

  throw new Error(`${label} deve ser uma URL HTTPS válida.`);
};

const renderSettings = (res, profile, error, status = 200) =>
  res.status(status).render('profile-settings', { profile, error, platforms });

export const renderProfileSettings = async (req, res) => {
  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (u:User { id: $userId })
      RETURN u.bio AS bio,
             u.avatarUrl AS avatarUrl,
             u.preferredPlatform AS preferredPlatform,
             u.steamUrl AS steamUrl,
             u.psnUrl AS psnUrl,
             u.xboxLiveUrl AS xboxLiveUrl,
             coalesce(u.libraryVisibility, 'PUBLIC') AS libraryVisibility
      `,
      { userId: req.user.id }
    );

    if (result.records.length === 0) {
      return res.status(404).send('Jogador não encontrado.');
    }

    const record = result.records[0];
    return renderSettings(res, {
      bio: record.get('bio') || '',
      avatarUrl: record.get('avatarUrl') || '',
      preferredPlatform: record.get('preferredPlatform') || '',
      steamUrl: record.get('steamUrl') || '',
      psnUrl: record.get('psnUrl') || '',
      xboxLiveUrl: record.get('xboxLiveUrl') || '',
      libraryVisibility: record.get('libraryVisibility') || 'PUBLIC'
    }, null);
  } catch (error) {
    console.error('Erro ao carregar configurações do perfil:', error);
    return res.status(500).send('Erro ao carregar configurações do perfil.');
  } finally {
    await session.close();
  }
};

export const updateProfile = async (req, res) => {
  const profile = getProfileValues(req.body);

  if (profile.bio.length > 500) {
    return renderSettings(res, profile, 'A biografia deve ter no máximo 500 caracteres.', 400);
  }

  if (profile.preferredPlatform && !platforms.includes(profile.preferredPlatform)) {
    return renderSettings(res, profile, 'Selecione uma plataforma válida.', 400);
  }

  if (!['PUBLIC', 'FRIENDS'].includes(profile.libraryVisibility)) {
    return renderSettings(res, profile, 'Selecione uma visibilidade válida para a biblioteca.', 400);
  }

  let urls;
  try {
    urls = {
      avatarUrl: normalizeHttpsUrl(profile.avatarUrl, 'A foto de perfil'),
      steamUrl: normalizeHttpsUrl(profile.steamUrl, 'O link da Steam'),
      psnUrl: normalizeHttpsUrl(profile.psnUrl, 'O link da PSN'),
      xboxLiveUrl: normalizeHttpsUrl(profile.xboxLiveUrl, 'O link do Xbox Live')
    };
  } catch (error) {
    return renderSettings(res, profile, error.message, 400);
  }

  if (Object.values(urls).some(url => url && url.length > 2048)) {
    return renderSettings(res, profile, 'Cada URL deve ter no máximo 2048 caracteres.', 400);
  }

  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (u:User { id: $userId })
      SET u.bio = $bio,
          u.avatarUrl = $avatarUrl,
          u.preferredPlatform = $preferredPlatform,
          u.steamUrl = $steamUrl,
          u.psnUrl = $psnUrl,
          u.xboxLiveUrl = $xboxLiveUrl,
          u.libraryVisibility = $libraryVisibility
      RETURN u.id AS id
      `,
      {
        userId: req.user.id,
        bio: profile.bio || null,
        avatarUrl: urls.avatarUrl,
        preferredPlatform: profile.preferredPlatform || null,
        steamUrl: urls.steamUrl,
        psnUrl: urls.psnUrl,
        xboxLiveUrl: urls.xboxLiveUrl,
        libraryVisibility: profile.libraryVisibility
      }
    );

    if (result.records.length === 0) {
      return res.status(404).send('Jogador não encontrado.');
    }

    return res.redirect('/profile');
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    return renderSettings(res, profile, 'Não foi possível salvar as alterações do perfil.', 500);
  } finally {
    await session.close();
  }
};