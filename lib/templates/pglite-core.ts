// ============================================
// SparkVertex Local Database Core Template
// Powered by PGLite (PostgreSQL in WASM)
// ============================================

export const PGLITE_CORE_TEMPLATE = `
// ============================================
// SparkVertex Local Database Core
// Powered by PGLite (PostgreSQL in WASM)
// ============================================

class SparkDB {
  constructor() {
    this.db = null;
    this.ready = false;
    this.initPromise = null;
  }
  
  async init() {
    // 防止重复初始化
    if (this.initPromise) return this.initPromise;
    if (this.ready) return true;
    
    this.initPromise = this._doInit();
    return this.initPromise;
  }
  
  async _doInit() {
    try {
      // 动态加载 PGLite
      const { PGlite } = await import('https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js');
      
      // 使用 OPFS 获得最佳性能和持久化
      this.db = new PGlite('opfs://spark-{{APP_ID}}');
      
      // 等待数据库就绪
      await this.db.waitReady;
      
      // 初始化迁移系统
      await this.db.query(\`
        CREATE TABLE IF NOT EXISTS _spark_migrations (
          id SERIAL PRIMARY KEY,
          version INTEGER UNIQUE NOT NULL,
          applied_at TIMESTAMP DEFAULT NOW(),
          description TEXT
        );
      \`);
      
      // 初始化元数据表
      await this.db.query(\`
        CREATE TABLE IF NOT EXISTS _spark_meta (
          key TEXT PRIMARY KEY,
          value JSONB,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      \`);
      
      this.ready = true;
      console.log('🔮 SparkDB Ready (PGLite + OPFS)');
      
      // 触发就绪事件
      window.dispatchEvent(new CustomEvent('spark:db:ready'));
      
      return true;
    } catch (e) {
      console.error('SparkDB Init Failed:', e);
      this.initPromise = null;
      throw e;
    }
  }
  
  async query(sql, params = []) {
    if (!this.ready) {
      await this.init();
    }
    return this.db.query(sql, params);
  }
  
  async exec(sql) {
    if (!this.ready) {
      await this.init();
    }
    return this.db.exec(sql);
  }
  
  async getCurrentVersion() {
    const result = await this.query('SELECT MAX(version) as v FROM _spark_migrations');
    return result.rows[0]?.v || 0;
  }
  
  async applyMigration(version, sql, description = '') {
    const current = await this.getCurrentVersion();
    if (current >= version) {
      console.log(\`⏭️ Migration v\${version} already applied\`);
      return false;
    }
    
    await this.query('BEGIN');
    try {
      // 执行迁移 SQL
      await this.exec(sql);
      
      // 记录迁移
      await this.query(
        'INSERT INTO _spark_migrations (version, description) VALUES ($1, $2)',
        [version, description]
      );
      
      await this.query('COMMIT');
      console.log(\`✅ Migration v\${version} applied: \${description}\`);
      return true;
    } catch (e) {
      await this.query('ROLLBACK');
      console.error(\`❌ Migration v\${version} failed:\`, e);
      throw e;
    }
  }
  
  async applyMigrations(migrations) {
    for (const m of migrations) {
      await this.applyMigration(m.version, m.sql, m.description || '');
    }
  }
  
  async getMeta(key) {
    const result = await this.query(
      'SELECT value FROM _spark_meta WHERE key = $1',
      [key]
    );
    return result.rows[0]?.value || null;
  }
  
  async setMeta(key, value) {
    await this.query(\`
      INSERT INTO _spark_meta (key, value, updated_at) 
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    \`, [key, JSON.stringify(value)]);
  }
  
  async exportAll() {
    // 获取所有用户表
    const tables = await this.query(\`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename NOT LIKE '_spark%'
    \`);
    
    const exportData = {};
    for (const { tablename } of tables.rows) {
      const data = await this.query(\`SELECT * FROM "\${tablename}"\`);
      exportData[tablename] = data.rows;
    }
    
    return {
      app_id: '{{APP_ID}}',
      version: await this.getCurrentVersion(),
      exported_at: new Date().toISOString(),
      tables: exportData
    };
  }
  
  async importData(data) {
    if (!data.tables) throw new Error('Invalid import data');
    
    await this.query('BEGIN');
    try {
      for (const [tableName, rows] of Object.entries(data.tables)) {
        if (rows.length === 0) continue;
        
        // 清空表
        await this.query(\`DELETE FROM "\${tableName}"\`);
        
        // 插入数据
        for (const row of rows) {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = columns.map((_, i) => \`$\${i + 1}\`);
          
          await this.query(
            \`INSERT INTO "\${tableName}" (\${columns.join(', ')}) VALUES (\${placeholders.join(', ')})\`,
            values
          );
        }
      }
      
      await this.query('COMMIT');
      console.log('✅ Data imported successfully');
      return true;
    } catch (e) {
      await this.query('ROLLBACK');
      console.error('❌ Import failed:', e);
      throw e;
    }
  }
  
  async getStats() {
    const tables = await this.query(\`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename NOT LIKE '_spark%'
    \`);
    
    const stats = {};
    for (const { tablename } of tables.rows) {
      const { rows } = await this.query(\`SELECT COUNT(*) as count FROM "\${tablename}"\`);
      stats[tablename] = rows[0].count;
    }
    
    return {
      version: await this.getCurrentVersion(),
      tables: stats,
      total_rows: Object.values(stats).reduce((a, b) => a + b, 0)
    };
  }
}

// 全局实例
window.sparkDB = new SparkDB();
`;

// 生成带有具体 APP_ID 的模板
export function generatePGLiteCoreCode(appId: string): string {
  return PGLITE_CORE_TEMPLATE.replace(/\{\{APP_ID\}\}/g, appId);
}
