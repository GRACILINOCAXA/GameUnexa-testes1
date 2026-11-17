import { getSession } from '../config/neo4j.js';
import { buildCommentTree } from '../socialUtils.js';

export const renderProfile = async (req, res) => {
  const loggedUserId = req.user.id;
  const targetUsername = req.params.username || req.user.username;
  const statusFilter = req.query.status || 'ALL';
  const session = getSession();

  try {
    const userResult = await session.run(
      `
      MATCH (target:User { username: $targetUsername })
      OPTIONAL MATCH (follower:User)-[:FOLLOWS]->(target)
      OPTIONAL MATCH (target)-[:FOLLOWS]->(following:User)
      OPTIONAL MATCH (me:User { id: $loggedUserId })-[isFollowing:FOLLOWS]->(target)
      RETURN target.id AS id,
             target.username AS username,
             target.bio AS bio,
             target.avatarUrl AS avatarUrl,
             target.preferredPlatform AS preferredPlatform,
             target.steamUrl AS steamUrl,
             target.psnUrl AS psnUrl,
             target.xboxLiveUrl AS xboxLiveUrl,
             coalesce(target.libraryVisibility, 'PUBLIC') AS libraryVisibility,
             EXISTS {
               MATCH (:User { id: $loggedUserId })-[friendship:FRIEND_REQUEST]-(target)
               WHERE friendship.status = 'ACCEPTED'
             } AS isFriend,
             EXISTS {
               MATCH (:User { id: $loggedUserId })-[request:FRIEND_REQUEST]->(target)
               WHERE request.status = 'PENDING'
             } AS hasOutgoingRequest,
             EXISTS {
               MATCH (target)-[request:FRIEND_REQUEST]->(:User { id: $loggedUserId })
               WHERE request.status = 'PENDING'
             } AS hasIncomingRequest,
             count(DISTINCT follower) AS followersCount,
             count(DISTINCT following) AS followingCount,
             isFollowing IS NOT NULL AS isFollowing
      `,
      { targetUsername, loggedUserId }
    );

    if (userResult.records.length === 0) {
      return res.status(404).send('Jogador não encontrado.');
    }

    const userRecord = userResult.records[0];
    const isOwnProfile = userRecord.get('id') === loggedUserId;
    const isFriend = userRecord.get('isFriend');
    const libraryVisibility = userRecord.get('libraryVisibility') || 'PUBLIC';
    const profileUser = {
      id: userRecord.get('id'),
      username: userRecord.get('username'),
      bio: userRecord.get('bio') || '',
      avatarUrl: userRecord.get('avatarUrl') || '',
      preferredPlatform: userRecord.get('preferredPlatform') || '',
      steamUrl: userRecord.get('steamUrl') || '',
      psnUrl: userRecord.get('psnUrl') || '',
      xboxLiveUrl: userRecord.get('xboxLiveUrl') || '',
      libraryVisibility,
      canViewLibrary: isOwnProfile || libraryVisibility !== 'FRIENDS' || isFriend,
      followersCount: userRecord.get('followersCount').toNumber(),
      followingCount: userRecord.get('followingCount').toNumber(),
      isFollowing: userRecord.get('isFollowing'),
      isFriend,
      hasOutgoingRequest: userRecord.get('hasOutgoingRequest'),
      hasIncomingRequest: userRecord.get('hasIncomingRequest'),
      isOwnProfile
    };

    let favorites = [];
    let library = [];

    if (profileUser.canViewLibrary) {
      const favResult = await session.run(
      `
      MATCH (u:User { id: $profileId })-[f:FAVORITED]->(g:Game)
      RETURN g.igdbId AS igdbId, g.name AS name, g.coverUrl AS coverUrl
      ORDER BY f.createdAt DESC
      `,
      { profileId: profileUser.id }
      );

      favorites = favResult.records.map(r => ({
        igdbId: r.get('igdbId'),
        name: r.get('name'),
        coverUrl: r.get('coverUrl')
      }));

      const libResult = await session.run(
      `
      MATCH (u:User { id: $profileId })-[lib:HAS_IN_LIBRARY]->(g:Game)
      WHERE $statusFilter = 'ALL' OR lib.status = $statusFilter
      RETURN g.igdbId AS igdbId,
             g.name AS name,
             g.coverUrl AS coverUrl,
             lib.status AS status,
             lib.rating AS rating
      ORDER BY lib.updatedAt DESC
      `,
      { profileId: profileUser.id, statusFilter }
      );

      library = libResult.records.map(r => ({
        igdbId: r.get('igdbId'),
        name: r.get('name'),
        coverUrl: r.get('coverUrl'),
        status: r.get('status'),
        rating: r.get('rating') ? r.get('rating').toNumber() : null
      }));
    }

    res.render('profile', {
      profileUser,
      favorites,
      library,
      statusFilter
    });
  } catch (error) {
    console.error('Erro ao carregar perfil:', error);
    res.status(500).send('Erro ao carregar perfil.');
  } finally {
    await session.close();
  }
};

export const removeFromLibrary = async (req, res) => {
  const userId = req.user.id;
  const { igdbId } = req.body;
  const session = getSession();

  try {
    await session.run(
      `
      MATCH (u:User { id: $userId })-[lib:HAS_IN_LIBRARY]->(g:Game { igdbId: $igdbId })
      DELETE lib
      `,
      { userId, igdbId: String(igdbId) }
    );
    res.redirect('/profile');
  } catch (error) {
    console.error('Erro ao remover jogo:', error);
    res.status(500).send('Erro ao remover jogo da biblioteca.');
  } finally {
    await session.close();
  }
};

export const renderCommunity = async (req, res) => {
  const userId = req.user.id;
  const search = req.query.q || '';
  const session = getSession();

  try {
    const result = await session.run(
      `
      MATCH (me:User { id: $userId })
      MATCH (other:User)
      WHERE other.id <> $userId
        AND ($search = '' OR toLower(other.username) CONTAINS toLower($search))
      WITH me, other,
           EXISTS {
             MATCH (me)-[friendship:FRIEND_REQUEST]-(other)
             WHERE friendship.status = 'ACCEPTED'
           } AS isFriend,
           EXISTS {
             MATCH (me)-[request:FRIEND_REQUEST]->(other)
             WHERE request.status = 'PENDING'
           } AS hasOutgoingRequest,
           EXISTS {
             MATCH (other)-[request:FRIEND_REQUEST]->(me)
             WHERE request.status = 'PENDING'
           } AS hasIncomingRequest,
           other.id = $userId
             OR coalesce(other.libraryVisibility, 'PUBLIC') = 'PUBLIC'
             OR EXISTS {
               MATCH (me)-[friendship:FRIEND_REQUEST]-(other)
               WHERE friendship.status = 'ACCEPTED'
             } AS canViewLibrary
      OPTIONAL MATCH (me)-[f:FOLLOWS]->(other)
      OPTIONAL MATCH (other)-[:HAS_IN_LIBRARY]->(g:Game)
      OPTIONAL MATCH (me)-[:HAS_IN_LIBRARY]->(shared:Game)<-[:HAS_IN_LIBRARY]-(other)
      RETURN other.id AS id,
             other.username AS username,
             f IS NOT NULL AS isFollowing,
             isFriend,
             hasOutgoingRequest,
             hasIncomingRequest,
             canViewLibrary,
             count(DISTINCT CASE WHEN canViewLibrary THEN g END) AS gamesCount,
             count(DISTINCT CASE WHEN canViewLibrary THEN shared END) AS sharedGamesCount
      ORDER BY sharedGamesCount DESC, gamesCount DESC, other.username ASC
      `,
      { userId, search: search.trim() }
    );

    const players = result.records.map(r => ({
      id: r.get('id'),
      username: r.get('username'),
      isFollowing: r.get('isFollowing'),
      isFriend: r.get('isFriend'),
      hasOutgoingRequest: r.get('hasOutgoingRequest'),
      hasIncomingRequest: r.get('hasIncomingRequest'),
      canViewLibrary: r.get('canViewLibrary'),
      gamesCount: r.get('gamesCount').toNumber(),
      sharedGamesCount: r.get('sharedGamesCount').toNumber()
    }));

    const requestsResult = await session.run(
      `
      MATCH (sender:User)-[request:FRIEND_REQUEST { status: 'PENDING' }]->(me:User { id: $userId })
      RETURN sender.id AS id, sender.username AS username, request.createdAt AS createdAt
      ORDER BY request.createdAt DESC
      `,
      { userId }
    );
    const friendRequests = requestsResult.records.map(r => ({
      id: r.get('id'),
      username: r.get('username')
    }));

    res.render('community', { players, search, friendRequests });
  } catch (error) {
    console.error('Erro ao carregar comunidade:', error);
    res.status(500).send('Erro ao carregar comunidade.');
  } finally {
    await session.close();
  }
};

export const toggleFollow = async (req, res) => {
  const userId = req.user.id;
  const { targetId } = req.params;
  const redirectTo = req.body.redirectTo || '/community';
  const session = getSession();

  try {
    if (userId === targetId) {
      return res.redirect(redirectTo);
    }

    await session.run(
      `
      MATCH (me:User { id: $userId }), (target:User { id: $targetId })
      OPTIONAL MATCH (me)-[f:FOLLOWS]->(target)
      FOREACH (_ IN CASE WHEN f IS NULL THEN [1] ELSE [] END |
        CREATE (me)-[:FOLLOWS { createdAt: datetime() }]->(target)
      )
      FOREACH (_ IN CASE WHEN f IS NOT NULL THEN [1] ELSE [] END |
        DELETE f
      )
      `,
      { userId, targetId }
    );

    res.redirect(redirectTo);
  } catch (error) {
    console.error('Erro ao seguir/deixar de seguir:', error);
    res.status(500).send('Erro ao atualizar seguidor.');
  } finally {
    await session.close();
  }
};

export const renderFeed = async (req, res) => {
  const userId = req.user.id;
  const session = getSession();

  try {
    const feedResult = await session.run(
      `
      MATCH (me:User { id: $userId })-[:FOLLOWS]->(friend:User)
      CALL {
        WITH friend
        MATCH (friend)-[lib:HAS_IN_LIBRARY]->(g:Game)
        WHERE coalesce(friend.libraryVisibility, 'PUBLIC') <> 'FRIENDS'
           OR friend.id = $userId
           OR EXISTS {
             MATCH (:User { id: $userId })-[friendship:FRIEND_REQUEST]-(friend)
             WHERE friendship.status = 'ACCEPTED'
           }
        RETURN 'LIBRARY' AS type,
               friend.username AS username,
               g.igdbId AS igdbId,
               g.name AS gameName,
               g.coverUrl AS coverUrl,
               lib.status AS status,
               lib.rating AS rating,
               null AS text,
               lib.updatedAt AS timestamp
        UNION
        WITH friend
        MATCH (friend)-[fav:FAVORITED]->(g:Game)
        WHERE coalesce(friend.libraryVisibility, 'PUBLIC') <> 'FRIENDS'
           OR friend.id = $userId
           OR EXISTS {
             MATCH (:User { id: $userId })-[friendship:FRIEND_REQUEST]-(friend)
             WHERE friendship.status = 'ACCEPTED'
           }
        RETURN 'FAVORITE' AS type,
               friend.username AS username,
               g.igdbId AS igdbId,
               g.name AS gameName,
               g.coverUrl AS coverUrl,
               null AS status,
               null AS rating,
               null AS text,
               fav.createdAt AS timestamp
        UNION
        WITH friend
        MATCH (friend)-[:POSTED]->(rev:Review)-[:ABOUT]->(g:Game)
        RETURN 'REVIEW' AS type,
               friend.username AS username,
               g.igdbId AS igdbId,
               g.name AS gameName,
               g.coverUrl AS coverUrl,
               null AS status,
               null AS rating,
               rev.text AS text,
               rev.createdAt AS timestamp
      }
      RETURN type, username, igdbId, gameName, coverUrl, status, rating, text, toString(timestamp) AS timestamp
      ORDER BY timestamp DESC
      LIMIT 30
      `,
      { userId }
    );

    const activities = feedResult.records.map(r => ({
      type: r.get('type'),
      username: r.get('username'),
      igdbId: r.get('igdbId'),
      gameName: r.get('gameName'),
      coverUrl: r.get('coverUrl'),
      status: r.get('status'),
      rating: r.get('rating') ? r.get('rating').toNumber() : null,
      text: r.get('text'),
      timestamp: r.get('timestamp')
    }));

    const recResult = await session.run(
      `
      MATCH (me:User { id: $userId })-[:FOLLOWS]->(friend:User)-[rel:HAS_IN_LIBRARY|FAVORITED]->(g:Game)
      WHERE NOT (me)-[:HAS_IN_LIBRARY]->(g)
        AND (
          coalesce(friend.libraryVisibility, 'PUBLIC') <> 'FRIENDS'
          OR EXISTS {
            MATCH (me)-[friendship:FRIEND_REQUEST]-(friend)
            WHERE friendship.status = 'ACCEPTED'
          }
        )
      WITH g, collect(DISTINCT friend.username) AS recommendedBy
      RETURN g.igdbId AS igdbId,
             g.name AS name,
             g.coverUrl AS coverUrl,
             recommendedBy,
             size(recommendedBy) AS score
      ORDER BY score DESC, g.name ASC
      LIMIT 5
      `,
      { userId }
    );

    const recommendations = recResult.records.map(r => ({
      igdbId: r.get('igdbId'),
      name: r.get('name'),
      coverUrl: r.get('coverUrl'),
      recommendedBy: r.get('recommendedBy')
    }));

    const postsResult = await session.run(
      `
      MATCH (me:User { id: $userId })
      MATCH (author:User)-[:PUBLISHED]->(post:Post)-[:ABOUT]->(game:Game)
      WHERE post.visibility = 'PUBLIC'
         OR author.id = $userId
         OR EXISTS {
           MATCH (me)-[friendship:FRIEND_REQUEST]-(author)
           WHERE friendship.status = 'ACCEPTED'
         }
      CALL {
        WITH me, post
        OPTIONAL MATCH (liker:User)-[:LIKED]->(post)
        WITH me, post, count(DISTINCT liker) AS likesCount
        OPTIONAL MATCH (me)-[myLike:LIKED]->(post)
        RETURN likesCount, myLike IS NOT NULL AS isLiked
      }
      CALL {
        WITH post
        OPTIONAL MATCH (commentAuthor:User)-[:WROTE]->(comment:Comment)-[:ON_POST]->(post)
        OPTIONAL MATCH (comment)-[:REPLY_TO]->(parent:Comment)
        RETURN collect(DISTINCT CASE WHEN comment IS NULL THEN null ELSE {
          id: comment.id,
          text: comment.text,
          author: commentAuthor.username,
          parentId: parent.id,
          createdAt: toString(comment.createdAt)
        } END) AS comments
      }
      RETURN post.id AS id,
             post.text AS text,
             post.visibility AS visibility,
             toString(post.createdAt) AS createdAt,
             author.id AS authorId,
             author.username AS username,
             game.igdbId AS igdbId,
             game.name AS gameName,
             game.coverUrl AS coverUrl,
             likesCount,
             isLiked,
             [comment IN comments WHERE comment IS NOT NULL] AS comments
      ORDER BY post.createdAt DESC
      LIMIT 30
      `,
      { userId }
    );

    const posts = postsResult.records.map(r => ({
      id: r.get('id'),
      text: r.get('text'),
      visibility: r.get('visibility') || 'PUBLIC',
      createdAt: r.get('createdAt'),
      authorId: r.get('authorId'),
      username: r.get('username'),
      igdbId: r.get('igdbId'),
      gameName: r.get('gameName'),
      coverUrl: r.get('coverUrl'),
      likesCount: r.get('likesCount').toNumber(),
      isLiked: r.get('isLiked'),
      comments: buildCommentTree(r.get('comments'))
    }));

    const gamesResult = await session.run(
      `
      MATCH (g:Game)
      RETURN g.igdbId AS igdbId, g.name AS name
      ORDER BY g.name ASC
      LIMIT 100
      `
    );
    const games = gamesResult.records.map(r => ({
      igdbId: r.get('igdbId'),
      name: r.get('name')
    }));

    res.render('feed', {
      activities,
      recommendations,
      posts,
      games,
      postError: req.query.postError || ''
    });
  } catch (error) {
    console.error('Erro ao carregar feed:', error);
    res.status(500).send('Erro ao carregar feed de atividades.');
  } finally {
    await session.close();
  }
};