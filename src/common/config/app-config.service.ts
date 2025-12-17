import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AppConfig = {
  nodeEnv: string;
  mongodbUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtAccessTokenExpiresIn: string;
  jwtRefreshTokenExpiresIn: string;
  encryptionKey: string;
  telegramBotToken?: string;
  telegramBotUrl?: string;
  adminTelegramId?: string;
  maxReportsBeforeBan: number;
  maxPercentageOfReportsRequiredForBan: number;
  isStaging: boolean;
  telegramApiId?: number;
  telegramApiHash?: string;
  telegramSessionPath: string;
  telegramRequestTimeoutMs: number;
  telegramMaxRetries: number;
  telegramRetryDelayMs: number;
  telegramDebug: boolean;
  telegramCacheTtlSeconds: number;
  telegramMaxContactsPerRequest: number;
};

@Injectable()
export class AppConfigService {
  private readonly cfg: Readonly<AppConfig>;

  constructor(private readonly configService: ConfigService) {
    const nodeEnv =
      this.getString('NODE_ENV', { defaultValue: 'development' }) ||
      'development';

    const cfg: AppConfig = {
      nodeEnv,
      mongodbUri: this.getRequiredString('MONGODB_URI'),
      jwtSecret: this.getRequiredString('JWT_SECRET'),
      jwtExpiresIn: this.getString('JWT_EXPIRES_IN', { defaultValue: '24h' })!,
      jwtAccessTokenExpiresIn: this.getString('JWT_ACCESS_TOKEN_EXPIRES_IN', {
        defaultValue: '15m',
      })!,
      jwtRefreshTokenExpiresIn: this.getString('JWT_REFRESH_TOKEN_EXPIRES_IN', {
        defaultValue: '7d',
      })!,
      encryptionKey: this.getRequiredString('ENCRYPTION_KEY'),
      telegramBotToken: this.getString('TELEGRAM_BOT_TOKEN') || undefined,
      telegramBotUrl: this.getString('TELEGRAM_BOT_URL') || undefined,
      adminTelegramId: this.getString('ADMIN_TELEGRAM_ID') || undefined,
      maxReportsBeforeBan: this.getNumber('MAX_REPORTS_BEFORE_BAN', {
        defaultValue: 10,
        min: 1,
      })!,
      maxPercentageOfReportsRequiredForBan: this.getNumber(
        'MAX_PERCENTAGE_OF_REPORTS_REQUIRED_FOR_BAN',
        { defaultValue: 0.5, min: 0, max: 1 },
      )!,
      isStaging: this.getBoolean('IS_STAGING', { defaultValue: true })!,
      telegramApiId: this.getNumber('TELEGRAM_API_ID') || undefined,
      telegramApiHash: this.getString('TELEGRAM_API_HASH') || undefined,
      telegramSessionPath: this.getString('TELEGRAM_SESSION_PATH', {
        defaultValue: './sessions',
      })!,
      telegramRequestTimeoutMs: this.getNumber('TELEGRAM_REQUEST_TIMEOUT', {
        defaultValue: 30000,
        min: 1,
      })!,
      telegramMaxRetries: this.getNumber('TELEGRAM_MAX_RETRIES', {
        defaultValue: 3,
        min: 0,
      })!,
      telegramRetryDelayMs: this.getNumber('TELEGRAM_RETRY_DELAY', {
        defaultValue: 1000,
        min: 0,
      })!,
      telegramDebug: this.getBoolean('TELEGRAM_DEBUG', {
        defaultValue: false,
      })!,
      telegramCacheTtlSeconds: this.getNumber('TELEGRAM_CACHE_TTL', {
        defaultValue: 300,
        min: 0,
      })!,
      telegramMaxContactsPerRequest: this.getNumber(
        'TELEGRAM_MAX_CONTACTS_PER_REQUEST',
        { defaultValue: 100, min: 1 },
      )!,
    };

    this.cfg = Object.freeze(cfg);
  }

  get nodeEnv(): string {
    return this.cfg.nodeEnv;
  }

  get isProduction(): boolean {
    return this.cfg.nodeEnv === 'production';
  }

  get mongodbUri(): string {
    return this.cfg.mongodbUri;
  }

  get jwtSecret(): string {
    return this.cfg.jwtSecret;
  }

  get jwtExpiresIn(): string {
    return this.cfg.jwtExpiresIn;
  }

  get jwtAccessTokenExpiresIn(): string {
    return this.cfg.jwtAccessTokenExpiresIn;
  }

  get jwtRefreshTokenExpiresIn(): string {
    return this.cfg.jwtRefreshTokenExpiresIn;
  }

  get encryptionKey(): string {
    return this.cfg.encryptionKey;
  }

  get telegramBotToken(): string | undefined {
    return this.cfg.telegramBotToken;
  }

  get telegramBotUrl(): string | undefined {
    return this.cfg.telegramBotUrl;
  }

  get adminTelegramId(): string | undefined {
    return this.cfg.adminTelegramId;
  }

  get maxReportsBeforeBan(): number {
    return this.cfg.maxReportsBeforeBan;
  }

  get maxPercentageOfReportsRequiredForBan(): number {
    return this.cfg.maxPercentageOfReportsRequiredForBan;
  }

  get isStaging(): boolean {
    return this.cfg.isStaging;
  }

  get telegramApiId(): number | undefined {
    return this.cfg.telegramApiId;
  }

  get telegramApiHash(): string | undefined {
    return this.cfg.telegramApiHash;
  }

  get telegramSessionPath(): string {
    return this.cfg.telegramSessionPath;
  }

  get telegramRequestTimeoutMs(): number {
    return this.cfg.telegramRequestTimeoutMs;
  }

  get telegramMaxRetries(): number {
    return this.cfg.telegramMaxRetries;
  }

  get telegramRetryDelayMs(): number {
    return this.cfg.telegramRetryDelayMs;
  }

  get telegramDebug(): boolean {
    return this.cfg.telegramDebug;
  }

  get telegramCacheTtlSeconds(): number {
    return this.cfg.telegramCacheTtlSeconds;
  }

  get telegramMaxContactsPerRequest(): number {
    return this.cfg.telegramMaxContactsPerRequest;
  }

  private getRequiredString(key: string): string {
    const value = this.getString(key);
    if (!value) {
      throw new Error(
        `${key} is not configured. Please set this environment variable.`,
      );
    }
    return value;
  }

  private getString(
    key: string,
    options?: { defaultValue?: string; allowEmpty?: boolean },
  ): string | undefined {
    const raw = this.configService.get<string>(key) ?? options?.defaultValue;
    if (raw === undefined || raw === null) return undefined;
    const value = String(raw).trim();
    if (!options?.allowEmpty && value === '') return undefined;
    return value;
  }

  private getNumber(
    key: string,
    options?: { defaultValue?: number; min?: number; max?: number },
  ): number | undefined {
    const raw = this.configService.get<string>(key);
    const candidate =
      raw === undefined || raw === null || String(raw).trim() === ''
        ? options?.defaultValue
        : Number(raw);
    if (candidate === undefined) return undefined;
    if (!Number.isFinite(candidate)) {
      throw new Error(`${key} must be a valid number.`);
    }
    if (options?.min !== undefined && candidate < options.min) {
      throw new Error(`${key} must be >= ${options.min}.`);
    }
    if (options?.max !== undefined && candidate > options.max) {
      throw new Error(`${key} must be <= ${options.max}.`);
    }
    return candidate;
  }

  private getBoolean(
    key: string,
    options?: { defaultValue?: boolean },
  ): boolean | undefined {
    const raw = this.configService.get<string>(key);
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return options?.defaultValue;
    }
    const normalized = String(raw).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    throw new Error(`${key} must be a valid boolean (true/false).`);
  }
}
