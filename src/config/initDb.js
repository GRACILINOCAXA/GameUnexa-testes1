import { getSession } from './neo4j.js';

export const initConstraints = async () => {
  const session = getSession();
  try {
    await session.run(`
      CREATE CONSTRAINT user_id_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.id IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT user_email_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.email IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT user_username_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.username IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT game_igdbId_unique IF NOT EXISTS
      FOR (g:Game) REQUIRE g.igdbId IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT review_id_unique IF NOT EXISTS
      FOR (r:Review) REQUIRE r.id IS UNIQUE
    `);

    await session.run(`
      CREATE CONSTRAINT notification_id_unique IF NOT EXISTS
      FOR (n:Notification) REQUIRE n.id IS UNIQUE
    `);

    await session.run(`
      CREATE INDEX user_email_index IF NOT EXISTS
      FOR (u:User) ON (u.email)
    `);

    await session.run(`
      CREATE INDEX user_username_index IF NOT EXISTS
      FOR (u:User) ON (u.username)
    `);

    await session.run(`
      CREATE INDEX game_igdbId_index IF NOT EXISTS
      FOR (g:Game) ON (g.igdbId)
    `);

    console.log('Constraints e índices do Neo4j verificadas/criadas.');
  } catch (error) {
    console.error('Erro ao criar constraints:', error.message);
  } finally {
    await session.close();
  }
};