// ============================================
// SparkVertex Schema Migration Tool
// SQL Schema Diff 和迁移生成
// ============================================

/**
 * 解析 SQL CREATE TABLE 语句
 */
export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  primaryKey?: string[];
  indexes: IndexSchema[];
  foreignKeys: ForeignKeySchema[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  unique?: boolean;
}

export interface IndexSchema {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ForeignKeySchema {
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

/**
 * 解析 SQL Schema 字符串
 */
export function parseSchema(sql: string): TableSchema[] {
  const tables: TableSchema[] = [];
  
  // 匹配 CREATE TABLE 语句
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\)(?:\s*;)?/gi;
  
  let match;
  while ((match = tableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const columnsStr = match[2];
    
    const table: TableSchema = {
      name: tableName,
      columns: [],
      indexes: [],
      foreignKeys: []
    };
    
    // 分割列定义
    const lines = columnsStr.split(',').map(l => l.trim()).filter(l => l);
    
    for (const line of lines) {
      // 主键约束
      if (/PRIMARY\s+KEY/i.test(line)) {
        const pkMatch = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (pkMatch) {
          table.primaryKey = pkMatch[1].split(',').map(c => c.trim().replace(/["`]/g, ''));
        }
        continue;
      }
      
      // 外键约束
      if (/FOREIGN\s+KEY/i.test(line)) {
        const fkMatch = line.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+["`]?(\w+)["`]?\s*\(([^)]+)\)/i);
        if (fkMatch) {
          table.foreignKeys.push({
            columns: fkMatch[1].split(',').map(c => c.trim().replace(/["`]/g, '')),
            refTable: fkMatch[2],
            refColumns: fkMatch[3].split(',').map(c => c.trim().replace(/["`]/g, ''))
          });
        }
        continue;
      }
      
      // UNIQUE 约束
      if (/^UNIQUE/i.test(line)) {
        const uqMatch = line.match(/UNIQUE\s*\(([^)]+)\)/i);
        if (uqMatch) {
          table.indexes.push({
            name: `unique_${table.name}_${uqMatch[1].replace(/[,\s"`]/g, '_')}`,
            columns: uqMatch[1].split(',').map(c => c.trim().replace(/["`]/g, '')),
            unique: true
          });
        }
        continue;
      }
      
      // 普通列定义
      const colMatch = line.match(/^["`]?(\w+)["`]?\s+(\w+(?:\([^)]+\))?)\s*(.*)?$/i);
      if (colMatch) {
        const column: ColumnSchema = {
          name: colMatch[1],
          type: colMatch[2].toUpperCase(),
          nullable: !(/NOT\s+NULL/i.test(colMatch[3] || ''))
        };
        
        // 默认值
        const defaultMatch = (colMatch[3] || '').match(/DEFAULT\s+([^\s,]+)/i);
        if (defaultMatch) {
          column.default = defaultMatch[1];
        }
        
        // 主键
        if (/PRIMARY\s+KEY/i.test(colMatch[3] || '')) {
          table.primaryKey = [column.name];
        }
        
        // UNIQUE
        if (/UNIQUE/i.test(colMatch[3] || '')) {
          column.unique = true;
        }
        
        table.columns.push(column);
      }
    }
    
    tables.push(table);
  }
  
  // 解析 CREATE INDEX
  const indexRegex = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s+ON\s+["`]?(\w+)["`]?\s*\(([^)]+)\)/gi;
  
  while ((match = indexRegex.exec(sql)) !== null) {
    const isUnique = !!match[1];
    const indexName = match[2];
    const tableName = match[3];
    const columns = match[4].split(',').map(c => c.trim().replace(/["`]/g, ''));
    
    const table = tables.find(t => t.name === tableName);
    if (table) {
      table.indexes.push({
        name: indexName,
        columns,
        unique: isUnique
      });
    }
  }
  
  return tables;
}

/**
 * Schema 差异类型
 */
export type SchemaDiff = 
  | { type: 'ADD_TABLE'; table: TableSchema }
  | { type: 'DROP_TABLE'; tableName: string }
  | { type: 'ADD_COLUMN'; tableName: string; column: ColumnSchema }
  | { type: 'DROP_COLUMN'; tableName: string; columnName: string }
  | { type: 'MODIFY_COLUMN'; tableName: string; oldColumn: ColumnSchema; newColumn: ColumnSchema }
  | { type: 'ADD_INDEX'; tableName: string; index: IndexSchema }
  | { type: 'DROP_INDEX'; tableName: string; indexName: string }
  | { type: 'ADD_FOREIGN_KEY'; tableName: string; foreignKey: ForeignKeySchema }
  | { type: 'DROP_FOREIGN_KEY'; tableName: string; foreignKey: ForeignKeySchema };

/**
 * 比较两个 Schema 的差异
 */
export function diffSchema(oldSchema: TableSchema[], newSchema: TableSchema[]): SchemaDiff[] {
  const diffs: SchemaDiff[] = [];
  
  const oldTableMap = new Map(oldSchema.map(t => [t.name, t]));
  const newTableMap = new Map(newSchema.map(t => [t.name, t]));
  
  // 检查新增的表
  for (const newTable of newSchema) {
    if (!oldTableMap.has(newTable.name)) {
      diffs.push({ type: 'ADD_TABLE', table: newTable });
    }
  }
  
  // 检查删除的表
  for (const oldTable of oldSchema) {
    if (!newTableMap.has(oldTable.name)) {
      diffs.push({ type: 'DROP_TABLE', tableName: oldTable.name });
    }
  }
  
  // 检查修改的表
  for (const newTable of newSchema) {
    const oldTable = oldTableMap.get(newTable.name);
    if (!oldTable) continue;
    
    const oldColumnMap = new Map(oldTable.columns.map(c => [c.name, c]));
    const newColumnMap = new Map(newTable.columns.map(c => [c.name, c]));
    
    // 新增列
    for (const newCol of newTable.columns) {
      if (!oldColumnMap.has(newCol.name)) {
        diffs.push({ type: 'ADD_COLUMN', tableName: newTable.name, column: newCol });
      }
    }
    
    // 删除列
    for (const oldCol of oldTable.columns) {
      if (!newColumnMap.has(oldCol.name)) {
        diffs.push({ type: 'DROP_COLUMN', tableName: newTable.name, columnName: oldCol.name });
      }
    }
    
    // 修改列
    for (const newCol of newTable.columns) {
      const oldCol = oldColumnMap.get(newCol.name);
      if (oldCol && !columnsEqual(oldCol, newCol)) {
        diffs.push({
          type: 'MODIFY_COLUMN',
          tableName: newTable.name,
          oldColumn: oldCol,
          newColumn: newCol
        });
      }
    }
    
    // 索引变化
    const oldIndexMap = new Map(oldTable.indexes.map(i => [i.name, i]));
    const newIndexMap = new Map(newTable.indexes.map(i => [i.name, i]));
    
    for (const newIdx of newTable.indexes) {
      if (!oldIndexMap.has(newIdx.name)) {
        diffs.push({ type: 'ADD_INDEX', tableName: newTable.name, index: newIdx });
      }
    }
    
    for (const oldIdx of oldTable.indexes) {
      if (!newIndexMap.has(oldIdx.name)) {
        diffs.push({ type: 'DROP_INDEX', tableName: newTable.name, indexName: oldIdx.name });
      }
    }
  }
  
  return diffs;
}

function columnsEqual(a: ColumnSchema, b: ColumnSchema): boolean {
  return (
    a.type === b.type &&
    a.nullable === b.nullable &&
    a.default === b.default &&
    a.unique === b.unique
  );
}

/**
 * 生成迁移 SQL
 */
export function generateMigrationSQL(diffs: SchemaDiff[]): string {
  const statements: string[] = [];
  
  for (const diff of diffs) {
    switch (diff.type) {
      case 'ADD_TABLE':
        statements.push(generateCreateTable(diff.table));
        break;
        
      case 'DROP_TABLE':
        statements.push(`DROP TABLE IF EXISTS "${diff.tableName}";`);
        break;
        
      case 'ADD_COLUMN':
        statements.push(
          `ALTER TABLE "${diff.tableName}" ADD COLUMN ${generateColumnDef(diff.column)};`
        );
        break;
        
      case 'DROP_COLUMN':
        statements.push(
          `ALTER TABLE "${diff.tableName}" DROP COLUMN IF EXISTS "${diff.columnName}";`
        );
        break;
        
      case 'MODIFY_COLUMN':
        // PostgreSQL 需要多个 ALTER 语句
        const { tableName, oldColumn, newColumn } = diff;
        
        if (oldColumn.type !== newColumn.type) {
          statements.push(
            `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" TYPE ${newColumn.type};`
          );
        }
        
        if (oldColumn.nullable !== newColumn.nullable) {
          if (newColumn.nullable) {
            statements.push(
              `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" DROP NOT NULL;`
            );
          } else {
            statements.push(
              `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" SET NOT NULL;`
            );
          }
        }
        
        if (oldColumn.default !== newColumn.default) {
          if (newColumn.default) {
            statements.push(
              `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" SET DEFAULT ${newColumn.default};`
            );
          } else {
            statements.push(
              `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" DROP DEFAULT;`
            );
          }
        }
        break;
        
      case 'ADD_INDEX':
        const uniqueStr = diff.index.unique ? 'UNIQUE ' : '';
        statements.push(
          `CREATE ${uniqueStr}INDEX IF NOT EXISTS "${diff.index.name}" ON "${diff.tableName}" (${diff.index.columns.map(c => `"${c}"`).join(', ')});`
        );
        break;
        
      case 'DROP_INDEX':
        statements.push(`DROP INDEX IF EXISTS "${diff.indexName}";`);
        break;
    }
  }
  
  return statements.join('\n');
}

function generateCreateTable(table: TableSchema): string {
  const lines: string[] = [];
  
  for (const col of table.columns) {
    lines.push(`  ${generateColumnDef(col)}`);
  }
  
  if (table.primaryKey && table.primaryKey.length > 0) {
    lines.push(`  PRIMARY KEY (${table.primaryKey.map(c => `"${c}"`).join(', ')})`);
  }
  
  for (const fk of table.foreignKeys) {
    lines.push(
      `  FOREIGN KEY (${fk.columns.map(c => `"${c}"`).join(', ')}) ` +
      `REFERENCES "${fk.refTable}" (${fk.refColumns.map(c => `"${c}"`).join(', ')})`
    );
  }
  
  let sql = `CREATE TABLE IF NOT EXISTS "${table.name}" (\n${lines.join(',\n')}\n);`;
  
  // 添加索引
  for (const idx of table.indexes) {
    const uniqueStr = idx.unique ? 'UNIQUE ' : '';
    sql += `\nCREATE ${uniqueStr}INDEX IF NOT EXISTS "${idx.name}" ON "${table.name}" (${idx.columns.map(c => `"${c}"`).join(', ')});`;
  }
  
  return sql;
}

function generateColumnDef(col: ColumnSchema): string {
  let def = `"${col.name}" ${col.type}`;
  
  if (!col.nullable) {
    def += ' NOT NULL';
  }
  
  if (col.default !== undefined) {
    def += ` DEFAULT ${col.default}`;
  }
  
  if (col.unique) {
    def += ' UNIQUE';
  }
  
  return def;
}

/**
 * 验证迁移安全性
 */
export function validateMigration(diffs: SchemaDiff[]): {
  safe: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  for (const diff of diffs) {
    switch (diff.type) {
      case 'DROP_TABLE':
        warnings.push(`⚠️ Dropping table "${diff.tableName}" will delete all data`);
        break;
        
      case 'DROP_COLUMN':
        warnings.push(`⚠️ Dropping column "${diff.columnName}" from "${diff.tableName}" will delete data`);
        break;
        
      case 'MODIFY_COLUMN':
        if (diff.oldColumn.type !== diff.newColumn.type) {
          warnings.push(
            `⚠️ Changing column type "${diff.newColumn.name}" from ${diff.oldColumn.type} to ${diff.newColumn.type} may cause data loss`
          );
        }
        
        if (diff.oldColumn.nullable && !diff.newColumn.nullable) {
          errors.push(
            `❌ Making column "${diff.newColumn.name}" NOT NULL requires handling existing NULL values`
          );
        }
        break;
    }
  }
  
  return {
    safe: errors.length === 0,
    warnings,
    errors
  };
}

/**
 * 从自然语言描述生成 Schema
 */
export function schemaFromDescription(description: string): string {
  // 这是一个简化版本，实际应该由 AI 处理
  const lines: string[] = [];
  
  // 解析表名
  const tableMatch = description.match(/table[:\s]+(\w+)/i);
  const tableName = tableMatch ? tableMatch[1] : 'data';
  
  lines.push(`CREATE TABLE IF NOT EXISTS "${tableName}" (`);
  lines.push('  "id" SERIAL PRIMARY KEY,');
  
  // 简单的字段提取
  const fieldRegex = /(\w+)\s*:\s*(text|string|number|integer|boolean|date|timestamp|json)/gi;
  let match;
  const fields: string[] = [];
  
  while ((match = fieldRegex.exec(description)) !== null) {
    const name = match[1];
    const type = match[2].toLowerCase();
    
    let pgType = 'TEXT';
    switch (type) {
      case 'number':
      case 'integer':
        pgType = 'INTEGER';
        break;
      case 'boolean':
        pgType = 'BOOLEAN';
        break;
      case 'date':
        pgType = 'DATE';
        break;
      case 'timestamp':
        pgType = 'TIMESTAMPTZ';
        break;
      case 'json':
        pgType = 'JSONB';
        break;
    }
    
    fields.push(`  "${name}" ${pgType}`);
  }
  
  if (fields.length === 0) {
    // 默认字段
    fields.push('  "name" TEXT');
    fields.push('  "data" JSONB');
  }
  
  lines.push(fields.join(',\n') + ',');
  lines.push('  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,');
  lines.push('  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');
  lines.push(');');
  
  return lines.join('\n');
}
