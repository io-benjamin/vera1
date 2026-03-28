import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

/**
 * Simple migration runner that:
 * 1. Creates a migrations table if it doesn't exist
 * 2. Reads all .sql files from the migrations folder
 * 3. Runs any migrations that haven't been applied yet
 */
export class MigrationRunner {
  private pool: Pool;
  private migrationsPath: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.migrationsPath = path.join(__dirname, 'migrations');
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    console.log('🔄 Checking for database migrations...');

    // Ensure migrations table exists
    await this.ensureMigrationsTable();

    // Get list of applied migrations
    const appliedMigrations = await this.getAppliedMigrations();

    // Get all migration files
    const migrationFiles = this.getMigrationFiles();

    if (migrationFiles.length === 0) {
      console.log('📁 No migration files found');
      return;
    }

    // Find pending migrations
    const pendingMigrations = migrationFiles.filter(
      (file) => !appliedMigrations.includes(file)
    );

    if (pendingMigrations.length === 0) {
      console.log('✅ Database is up to date');
      return;
    }

    console.log(`📦 Found ${pendingMigrations.length} pending migration(s)`);

    // Run each pending migration
    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }

    console.log('✅ All migrations completed');
  }

  /**
   * Create migrations tracking table if it doesn't exist
   */
  private async ensureMigrationsTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Get list of already applied migrations
   */
  private async getAppliedMigrations(): Promise<string[]> {
    const result = await this.pool.query(
      'SELECT name FROM _migrations ORDER BY id'
    );
    return result.rows.map((row) => row.name);
  }

  /**
   * Get all migration files sorted by name
   */
  private getMigrationFiles(): string[] {
    if (!fs.existsSync(this.migrationsPath)) {
      fs.mkdirSync(this.migrationsPath, { recursive: true });
      return [];
    }

    return fs
      .readdirSync(this.migrationsPath)
      .filter((file) => file.endsWith('.sql'))
      .sort();
  }

  /**
   * Run a single migration
   */
  private async runMigration(filename: string): Promise<void> {
    const filePath = path.join(this.migrationsPath, filename);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`  ⏳ Running migration: ${filename}`);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Run the migration SQL
      await client.query(sql);

      // Record that migration was applied
      await client.query(
        'INSERT INTO _migrations (name) VALUES ($1)',
        [filename]
      );

      await client.query('COMMIT');
      console.log(`  ✅ Completed: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`  ❌ Failed: ${filename}`);
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Run migrations with the default database connection
 */
export async function runMigrations(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const runner = new MigrationRunner(pool);

  try {
    await runner.runMigrations();
  } finally {
    await pool.end();
  }
}
