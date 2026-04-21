// src/infrastructure/services/LoggerService.ts
// Servicio de logging centralizado - SERVER ONLY

import 'server-only';
import fs from 'fs';
import winston from 'winston';

const isServerlessRuntime =
  process.env.VERCEL === '1' ||
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const enableFileLogging =
  process.env.NODE_ENV === 'production' &&
  process.env.ENABLE_FILE_LOGS === 'true' &&
  !isServerlessRuntime;

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  })
];

if (enableFileLogging) {
  try {
    fs.mkdirSync('logs', { recursive: true });
    transports.push(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
    transports.push(new winston.transports.File({ filename: 'logs/combined.log' }));
  } catch (error) {
    // Fallback silencioso a consola para no romper rutas API en runtime.
    console.error('Logger file transport disabled:', error);
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'sirius-pirolisis' },
  transports,
});

export class LoggerService {
  static info(message: string, meta?: any) {
    logger.info(message, meta);
  }

  static error(message: string, error?: Error, meta?: any) {
    logger.error(message, { error: error?.message, stack: error?.stack, ...meta });
  }

  static warn(message: string, meta?: any) {
    logger.warn(message, meta);
  }

  static debug(message: string, meta?: any) {
    logger.debug(message, meta);
  }
}