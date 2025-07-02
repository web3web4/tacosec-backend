/**
 * Interface for real Telegram contact from MTProto API
 */
export interface ITelegramRealContact {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  phoneNumber?: string;
  isBot: boolean;
  isVerified: boolean;
  isPremium: boolean;
  isContact: boolean;
  isMutualContact: boolean;
  languageCode?: string;
  accessHash?: string;
  status: ContactStatus;
  lastSeen?: number | null;
  photo?: {
    photoId?: string;
    hasPhoto: boolean;
  };
}

/**
 * Contact status enum
 */
export enum ContactStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  RECENTLY = 'recently',
  LAST_WEEK = 'last_week',
  LAST_MONTH = 'last_month',
  UNKNOWN = 'unknown',
}

/**
 * Contact photo interface
 */
export interface IContactPhoto {
  photoId?: string;
  hasPhoto: boolean;
  smallPhotoUrl?: string;
  bigPhotoUrl?: string;
}

/**
 * Contact filter interface
 */
export interface IContactFilter {
  isBot?: boolean;
  isVerified?: boolean;
  isPremium?: boolean;
  isContact?: boolean;
  isMutualContact?: boolean;
  status?: ContactStatus[];
  hasPhoto?: boolean;
}

/**
 * Contact sort options
 */
export interface IContactSort {
  field: 'firstName' | 'lastName' | 'username' | 'lastSeen';
  order: 'asc' | 'desc';
}
