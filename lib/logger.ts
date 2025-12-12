/**
 * 统一日志工具
 * 在开发环境输出详细日志，生产环境只输出错误
 */

const isDev = process.env.NODE_ENV === 'development';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  /** 是否强制在生产环境也输出 */
  force?: boolean;
  /** 附加数据 */
  data?: unknown;
}

/**
 * 创建带前缀的日志器
 */
export function createLogger(prefix: string) {
  const formatMessage = (level: LogLevel, message: string) => {
    return `[${prefix}] ${message}`;
  };

  return {
    debug: (message: string, data?: unknown) => {
      if (isDev) {
        if (data !== undefined) {
          console.log(formatMessage('debug', message), data);
        } else {
          console.log(formatMessage('debug', message));
        }
      }
    },

    info: (message: string, data?: unknown) => {
      if (isDev) {
        if (data !== undefined) {
          console.info(formatMessage('info', message), data);
        } else {
          console.info(formatMessage('info', message));
        }
      }
    },

    warn: (message: string, data?: unknown) => {
      if (isDev) {
        if (data !== undefined) {
          console.warn(formatMessage('warn', message), data);
        } else {
          console.warn(formatMessage('warn', message));
        }
      }
    },

    error: (message: string, error?: unknown) => {
      // 错误日志始终输出
      if (error !== undefined) {
        console.error(formatMessage('error', message), error);
      } else {
        console.error(formatMessage('error', message));
      }
    },
  };
}

/**
 * 全局日志器
 */
export const logger = createLogger('App');

/**
 * 预定义的日志器
 */
export const loggers = {
  api: createLogger('API'),
  auth: createLogger('Auth'),
  db: createLogger('Database'),
  payment: createLogger('Payment'),
  rag: createLogger('RAG'),
  preview: createLogger('Preview'),
  cache: createLogger('Cache'),
  sw: createLogger('ServiceWorker'),
};

export default logger;
