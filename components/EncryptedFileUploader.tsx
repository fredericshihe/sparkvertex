'use client';

import { useState, useCallback, useRef } from 'react';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  path: string;
  encrypted: boolean;
  uploadedAt: Date;
}

interface EncryptedFileUploaderProps {
  appId: string;
  apiBase?: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // bytes
  compress?: boolean;
  onUploadComplete?: (files: UploadedFile[]) => void;
  className?: string;
}

export default function EncryptedFileUploader({
  appId,
  apiBase = '',
  accept = '*/*',
  multiple = false,
  maxSize = 50 * 1024 * 1024, // 50MB
  compress = true,
  onUploadComplete,
  className = ''
}: EncryptedFileUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 处理文件选择
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: File[] = [];
    const errors: string[] = [];

    Array.from(selectedFiles).forEach(file => {
      if (file.size > maxSize) {
        errors.push(`${file.name} 超过大小限制 (${formatSize(maxSize)})`);
        return;
      }
      newFiles.push(file);
    });

    if (errors.length > 0) {
      setError(errors.join('\n'));
    }

    if (multiple) {
      setFiles(prev => [...prev, ...newFiles]);
    } else {
      setFiles(newFiles.slice(0, 1));
    }
  }, [maxSize, multiple]);

  // 压缩图片
  const compressImage = async (file: File): Promise<File> => {
    if (!compress || !file.type.startsWith('image/') || file.type === 'image/gif') {
      return file;
    }

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        // 计算新尺寸
        let { width, height } = img;
        const maxDim = 1920;

        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // 创建 Canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // 白色背景
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }

            const compressed = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });

            resolve(compressed);
          },
          'image/jpeg',
          0.8
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };

      img.src = url;
    });
  };

  // 加密文件
  const encryptFile = async (file: File): Promise<{
    data: Blob;
    key: string;
    iv: number[];
  }> => {
    // 生成 AES 密钥
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt']
    );

    // 生成 IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 读取文件
    const arrayBuffer = await file.arrayBuffer();

    // 加密
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      arrayBuffer
    );

    // 导出密钥
    const rawKey = await crypto.subtle.exportKey('raw', aesKey);
    const rawKeyBytes = new Uint8Array(rawKey);

    return {
      data: new Blob([encrypted]),
      key: btoa(Array.from(rawKeyBytes).map(b => String.fromCharCode(b)).join('')),
      iv: Array.from(iv)
    };
  };

  // 上传文件
  const uploadFile = async (file: File): Promise<UploadedFile> => {
    // 压缩
    const processedFile = await compressImage(file);
    
    // 更新进度
    setProgress(prev => ({ ...prev, [file.name]: 10 }));

    // 加密
    const { data, key, iv } = await encryptFile(processedFile);
    
    setProgress(prev => ({ ...prev, [file.name]: 40 }));

    // 准备表单
    const formData = new FormData();
    formData.append('file', data, 'encrypted');
    formData.append('app_id', appId);
    formData.append('encrypted_key', key);
    formData.append('iv', JSON.stringify(iv));
    formData.append('original_name', file.name);
    formData.append('original_size', file.size.toString());
    formData.append('mime_type', file.type);

    // 上传
    const xhr = new XMLHttpRequest();
    
    const uploadPromise = new Promise<{ path: string }>((resolve, reject) => {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const p = 40 + (e.loaded / e.total) * 60;
          setProgress(prev => ({ ...prev, [file.name]: p }));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
    });

    xhr.open('POST', `${apiBase}/api/mailbox/upload`);
    xhr.send(formData);

    const result = await uploadPromise;

    setProgress(prev => ({ ...prev, [file.name]: 100 }));

    return {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      path: result.path,
      encrypted: true,
      uploadedAt: new Date()
    };
  };

  // 开始上传
  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    setProgress({});

    const results: UploadedFile[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const result = await uploadFile(file);
        results.push(result);
      } catch (e) {
        errors.push(`${file.name}: ${(e as Error).message}`);
      }
    }

    setUploadedFiles(prev => [...prev, ...results]);
    setFiles([]);
    setUploading(false);

    if (errors.length > 0) {
      setError(errors.join('\n'));
    }

    if (results.length > 0) {
      onUploadComplete?.(results);
    }
  };

  // 移除待上传文件
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 格式化大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 拖放处理
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          🔐 加密文件上传
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          文件将被端到端加密后上传，仅您可解密
        </p>
      </div>

      {/* 上传区域 */}
      <div className="p-4">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
          
          <div className="text-4xl mb-2">📁</div>
          <p className="text-gray-600 dark:text-gray-400">
            拖拽文件到此处或
            <span className="text-blue-500 ml-1">点击选择</span>
          </p>
          <p className="text-xs text-gray-400 mt-2">
            最大 {formatSize(maxSize)}
            {compress && ' • 图片将自动压缩'}
          </p>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      {/* 待上传文件列表 */}
      {files.length > 0 && (
        <div className="px-4 pb-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            待上传文件
          </h4>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl">
                    {file.type.startsWith('image/') ? '🖼️' : '📄'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
                  </div>
                </div>
                {!uploading && (
                  <button
                    onClick={() => removeFile(index)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
                {uploading && progress[file.name] !== undefined && (
                  <div className="w-24">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${progress[file.name]}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-right mt-0.5">
                      {Math.round(progress[file.name])}%
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="mt-3 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? '上传中...' : `上传 ${files.length} 个文件`}
          </button>
        </div>
      )}

      {/* 已上传文件列表 */}
      {uploadedFiles.length > 0 && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            已上传文件
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-green-500">✓</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatSize(file.size)} • {file.encrypted ? '🔒 已加密' : '未加密'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
