import { Pool, Client } from 'pg';
import { config } from '../../config.js';

let pool: Pool | null = null;

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  connectionString?: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Get database configuration from environment
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    connectionString: config.DATABASE_URL,
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD
  };
}

/**
 * Create and get PostgreSQL connection pool
 */
export async function getDatabasePool(): Promise<Pool> {
  if (pool && !pool.ended) {
    return pool;
  }

  try {
    const dbConfig = getDatabaseConfig();
    
    // Use connection string if available, otherwise use individual parameters
    const poolConfig = dbConfig.connectionString 
      ? { connectionString: dbConfig.connectionString }
      : {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
          password: dbConfig.password
        };

    pool = new Pool({
      ...poolConfig,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    });

    // Test the connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    console.log('✅ PostgreSQL database connection established');
    return pool;

  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL database:', error);
    throw error;
  }
}

/**
 * Execute a query with parameters
 */
export async function executeQuery<T = any>(
  text: string, 
  params: any[] = []
): Promise<T[]> {
  try {
    const pool = await getDatabasePool();
    const result = await pool.query(text, params);
    return result.rows;
  } catch (error) {
    console.error('❌ Database query error:', error);
    console.error('Query:', text);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * Execute a query and return a single row
 */
export async function executeQuerySingle<T = any>(
  text: string, 
  params: any[] = []
): Promise<T | null> {
  const rows = await executeQuery<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Close database connection pool
 */
export async function closeDatabasePool(): Promise<void> {
  if (pool && !pool.ended) {
    await pool.end();
    console.log('🔌 PostgreSQL database connection pool closed');
  }
}

/**
 * Test database connection
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const pool = await getDatabasePool();
    const result = await pool.query('SELECT NOW() as current_time, version() as db_version');
    console.log('📊 Database connection test successful');
    console.log('Current time:', result.rows[0].current_time);
    console.log('Database version:', result.rows[0].db_version);
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    return false;
  }
}
