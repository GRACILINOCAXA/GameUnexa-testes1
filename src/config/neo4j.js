import neo4j from 'neo4j-driver';
import 'dotenv/config';

const getEnvValue = (primaryKey, fallbackKey) => {
  return process.env[primaryKey] || process.env[fallbackKey] || '';
};

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = getEnvValue('NEO4J_USER', 'NEO4J_USERNAME') || 'neo4j';
const password = process.env.NEO4J_PASSWORD || '';

export const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

export const verifyConnection = async () => {
  try {
    const serverInfo = await driver.getServerInfo();
    console.log('Conectado ao Neo4j com sucesso!');
    console.log(`   Endereço: ${serverInfo.address} | Versão: ${serverInfo.agent}`);
  } catch (error) {
    console.error('Erro ao conectar no Neo4j:', error.message);
  }
};

export const getSession = () => {
  return driver.session();
};