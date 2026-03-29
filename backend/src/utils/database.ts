import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'aqbobek_portal'
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: './knex/migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './knex/seeds'
  }
});

export const initDatabase = async () => {
  try {
    await db.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('Database extensions created successfully');
    
    await db.migrate.latest();
    console.log('Database migrations completed successfully');
    
    return true;
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

export default db;
