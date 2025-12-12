// ============================================
// SparkVertex Code Templates - Index
// ============================================

export * from './pglite-core';
export * from './sync-service';
export * from './backup-service';
export * from './crypto';
export * from './cms-publish';
export * from './cms-viewer';
export * from './image-compress';
export * from './chunked-upload';

// ============================================
// 模板组合生成器
// ============================================

import { generatePGLiteCoreCode } from './pglite-core';
import { generateSyncServiceCode } from './sync-service';
import { generateBackupServiceCode } from './backup-service';
import { generateCryptoCode } from './crypto';
import { generateCMSPublishCode } from './cms-publish';
import { generateCMSViewerCode } from './cms-viewer';
import { generateImageCompressCode } from './image-compress';
import { generateChunkedUploadCode } from './chunked-upload';

export interface AppConfig {
  appId: string;
  appName: string;
  apiBase: string;
  schema: string;
  features: {
    localDB?: boolean;
    cloudSync?: boolean;
    backup?: boolean;
    encryption?: boolean;
    cmsPublish?: boolean;
    cmsViewer?: boolean;
    imageCompress?: boolean;
    chunkedUpload?: boolean;
  };
}

/**
 * 根据应用配置生成完整的基础设施代码
 */
export function generateAppInfrastructure(config: AppConfig): string {
  const { appId, appName, apiBase, schema, features } = config;
  
  const parts: string[] = [
    '// ============================================',
    `// ${appName} - SparkVertex Infrastructure`,
    '// Auto-generated Local-First Application Code',
    '// ============================================',
    '',
  ];
  
  // 加密工具（如果需要同步）
  if (features.encryption || features.cloudSync) {
    parts.push('// === Crypto Utilities ===');
    parts.push(generateCryptoCode());
    parts.push('');
  }
  
  // 本地数据库
  if (features.localDB !== false) {
    parts.push('// === Local Database (PGLite) ===');
    parts.push(generatePGLiteCoreCode(appId));
    parts.push('');
  }
  
  // 云端同步
  if (features.cloudSync) {
    parts.push('// === Cloud Sync Service ===');
    parts.push(generateSyncServiceCode(appId, apiBase));
    parts.push('');
  }
  
  // 本地备份
  if (features.backup) {
    parts.push('// === Local Backup Service ===');
    parts.push(generateBackupServiceCode(appName));
    parts.push('');
  }
  
  // CMS 发布
  if (features.cmsPublish) {
    parts.push('// === CMS Publishing Service ===');
    parts.push(generateCMSPublishCode(appId, apiBase));
    parts.push('');
  }
  
  // CMS 查看器
  if (features.cmsViewer) {
    parts.push('// === CMS Content Viewer ===');
    parts.push(generateCMSViewerCode(apiBase));
    parts.push('');
  }
  
  // 图片压缩
  if (features.imageCompress) {
    parts.push('// === Image Compression ===');
    parts.push(generateImageCompressCode());
    parts.push('');
  }
  
  // 分片上传
  if (features.chunkedUpload) {
    parts.push('// === Chunked Upload ===');
    parts.push(generateChunkedUploadCode(apiBase));
    parts.push('');
  }
  
  // 初始化代码
  parts.push('// === Initialization ===');
  parts.push(generateInitCode(config));
  
  return parts.join('\n');
}

function generateInitCode(config: AppConfig): string {
  const { appName, features } = config;
  
  return `
async function initSparkInfrastructure() {
  console.log('🚀 Initializing ${appName}...');
  
  try {
    ${features.encryption || features.cloudSync ? `
    // Initialize crypto
    window.sparkCrypto = new SparkCrypto();
    await window.sparkCrypto.init();
    ` : ''}
    
    ${features.localDB !== false ? `
    // Initialize local database
    window.sparkDB = new SparkDB();
    await window.sparkDB.init();
    ` : ''}
    
    ${features.backup ? `
    // Initialize backup service
    window.sparkBackup = new SparkBackup('${appName}');
    const hasAccess = await window.sparkBackup.init();
    if (!hasAccess) {
      console.log('💡 Click "Enable Backup" to select a backup folder');
    }
    ` : ''}
    
    ${features.cloudSync ? `
    // Initialize sync service
    const privateKey = await window.sparkCrypto.keyPair?.privateKey;
    if (privateKey) {
      window.sparkSync = new SparkSync('${config.appId}', privateKey);
      // Don't auto-start, let user control
    }
    ` : ''}
    
    ${features.cmsPublish ? `
    // Initialize CMS
    window.sparkCMS = new SparkCMSPublish('${config.appId}');
    ` : ''}
    
    console.log('✅ ${appName} initialized successfully');
    
    window.dispatchEvent(new CustomEvent('spark:ready'));
    
    return true;
  } catch (e) {
    console.error('❌ Initialization failed:', e);
    window.dispatchEvent(new CustomEvent('spark:error', { detail: e }));
    return false;
  }
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSparkInfrastructure);
} else {
  initSparkInfrastructure();
}
`;
}
