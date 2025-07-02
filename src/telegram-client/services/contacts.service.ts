import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { TelegramClientService } from '../telegram-client.service';
import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import { GetContactsDto, SearchContactsDto } from '../dto';
import {
  ITelegramRealContact,
  IContactSyncResult,
  ContactStatus,
  ContactSyncStatus,
} from '../interfaces';

/**
 * Contacts Service for Telegram Client
 * Handles real contact operations using MTProto
 */
@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);
  private readonly contactsCache = new Map<
    number,
    { contacts: ITelegramRealContact[]; timestamp: number }
  >();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(private readonly telegramClientService: TelegramClientService) {}

  /**
   * Get user's contacts from Telegram
   * @param userId - User ID
   * @param getContactsDto - Query parameters
   * @returns List of contacts
   */
  async getContacts(userId: number, getContactsDto: GetContactsDto) {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID provided');
    }

    try {
      // Check cache first
      const cached = this.getCachedContacts(userId);
      if (cached) {
        return this.formatContactsResponse(cached, getContactsDto);
      }

      // Get fresh contacts from Telegram
      const contacts = await this.fetchContactsFromTelegram(userId);

      // Cache the results
      this.cacheContacts(userId, contacts);

      return this.formatContactsResponse(contacts, getContactsDto);
    } catch (error) {
      this.logger.error(`Failed to get contacts for user ${userId}:`, error);

      // Re-throw specific BadRequestException errors
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to retrieve contacts');
    }
  }

  /**
   * Search contacts by query
   * @param userId - User ID
   * @param searchContactsDto - Search parameters
   * @returns Filtered contacts
   */
  async searchContacts(userId: number, searchContactsDto: SearchContactsDto) {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID provided');
    }

    const { query, limit = 50 } = searchContactsDto;

    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }

    try {
      // Get all contacts first
      const allContacts = await this.getContacts(userId, { limit: 1000 });

      // Filter contacts based on search query
      const filteredContacts = allContacts.contacts
        .filter((contact) => {
          const searchTerm = query.toLowerCase();
          return (
            contact.firstName?.toLowerCase().includes(searchTerm) ||
            contact.lastName?.toLowerCase().includes(searchTerm) ||
            contact.username?.toLowerCase().includes(searchTerm) ||
            contact.phoneNumber?.includes(query)
          );
        })
        .slice(0, limit);

      return {
        success: true,
        contacts: filteredContacts,
        total: filteredContacts.length,
        query,
      };
    } catch (error) {
      this.logger.error(`Failed to search contacts for user ${userId}:`, error);
      throw new BadRequestException('Failed to search contacts');
    }
  }

  /**
   * Sync contacts from Telegram
   * @param userId - User ID
   * @returns Sync result
   */
  async syncContacts(userId: number): Promise<IContactSyncResult> {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID provided');
    }

    try {
      this.logger.log(`Starting contact sync for user ${userId}`);

      // Clear cache to force fresh fetch
      this.clearContactsCache(userId);

      // Fetch fresh contacts
      const contacts = await this.fetchContactsFromTelegram(userId);

      // Cache the new contacts
      this.cacheContacts(userId, contacts);

      this.logger.log(
        `Contact sync completed for user ${userId}. Found ${contacts.length} contacts`,
      );

      const now = new Date();
      return {
        status: ContactSyncStatus.COMPLETED,
        syncId: `sync_${userId}_${Date.now()}`,
        startedAt: now,
        completedAt: now,
        totalContacts: contacts.length,
        processedContacts: contacts.length,
        newContacts: contacts.length,
        updatedContacts: 0,
        deletedContacts: 0,
        errors: [],
        progress: 100,
      };
    } catch (error) {
      this.logger.error(`Contact sync failed for user ${userId}:`, error);

      const now = new Date();
      return {
        status: ContactSyncStatus.FAILED,
        syncId: `sync_${userId}_${Date.now()}`,
        startedAt: now,
        completedAt: now,
        totalContacts: 0,
        processedContacts: 0,
        newContacts: 0,
        updatedContacts: 0,
        deletedContacts: 0,
        errors: [error.message || 'Failed to sync contacts'],
        progress: 0,
      };
    }
  }

  /**
   * Get contact details by contact ID
   * @param userId - User ID
   * @param contactId - Contact ID
   * @returns Contact details
   */
  async getContactDetails(userId: number, contactId: number) {
    if (!userId || userId <= 0) {
      throw new BadRequestException('Invalid user ID provided');
    }

    if (!contactId || contactId <= 0) {
      throw new BadRequestException('Invalid contact ID provided');
    }

    try {
      // Get all contacts
      const contacts = await this.getContacts(userId, { limit: 1000 });

      // Find specific contact
      const contact = contacts.contacts.find((c) => c.id === contactId);

      if (!contact) {
        return null;
      }

      return contact;
    } catch (error) {
      this.logger.error(
        `Failed to get contact details for user ${userId}, contact ${contactId}:`,
        error,
      );
      throw new BadRequestException('Failed to get contact details');
    }
  }

  /**
   * Fetch contacts from Telegram using MTProto
   * @param userId - User ID
   * @returns Array of contacts
   */
  private async fetchContactsFromTelegram(
    userId: number,
  ): Promise<ITelegramRealContact[]> {
    // Check if user has session
    if (!this.telegramClientService.hasUserSession(userId)) {
      throw new UnauthorizedException('User not authenticated with Telegram');
    }

    // Get client for user
    const client: TelegramClient = this.telegramClientService.getClient(userId);
    if (!client) {
      throw new BadRequestException('Client not found for user');
    }

    try {
      // Connect the client if it has a connect method (real client)
      if (typeof client.connect === 'function') {
        await client.connect();
      }

      // Get contacts from Telegram
      const result = await client.invoke(new Api.contacts.GetContacts({}));

      if (!(result instanceof Api.contacts.Contacts)) {
        throw new Error('Unexpected response type from Telegram API');
      }

      // Process contacts
      const contacts: ITelegramRealContact[] = [];

      for (const user of result.users) {
        if (user instanceof Api.User && !user.self) {
          contacts.push({
            id: Number(user.id),
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            username: user.username || '',
            phoneNumber: user.phone || '',
            isBot: user.bot || false,
            isVerified: user.verified || false,
            isPremium: user.premium || false,
            isContact: user.contact || false,
            isMutualContact: user.mutualContact || false,
            languageCode: user.langCode || '',
            accessHash: user.accessHash?.toString() || '',
            status: this.mapUserStatus(user.status),
            lastSeen: this.getLastSeenTimestamp(user.status),
            photo:
              user.photo && user.photo instanceof Api.UserProfilePhoto
                ? {
                    photoId: user.photo.photoId?.toString() || '',
                    hasPhoto: true,
                  }
                : { hasPhoto: false },
          });
        }
      }

      this.logger.log(`Fetched ${contacts.length} contacts for user ${userId}`);
      return contacts;
    } catch (error) {
      this.logger.error(
        `Failed to fetch contacts from Telegram for user ${userId}:`,
        error,
      );

      if (error.message?.includes('AUTH_KEY_UNREGISTERED')) {
        throw new UnauthorizedException(
          'Session expired. Please re-authenticate.',
        );
      }

      throw error;
    } finally {
      if (client) {
        await this.telegramClientService.disconnectClient(client);
      }
    }
  }

  /**
   * Map Telegram user status to our status enum
   * @param status - Telegram user status
   * @returns Status enum value
   */
  private mapUserStatus(status: any): ContactStatus {
    if (!status) return ContactStatus.UNKNOWN;

    if (status instanceof Api.UserStatusOnline) return ContactStatus.ONLINE;
    if (status instanceof Api.UserStatusOffline) return ContactStatus.OFFLINE;
    if (status instanceof Api.UserStatusRecently) return ContactStatus.RECENTLY;
    if (status instanceof Api.UserStatusLastWeek)
      return ContactStatus.LAST_WEEK;
    if (status instanceof Api.UserStatusLastMonth)
      return ContactStatus.LAST_MONTH;

    return ContactStatus.UNKNOWN;
  }

  /**
   * Get last seen timestamp from user status
   * @param status - Telegram user status
   * @returns Timestamp or null
   */
  private getLastSeenTimestamp(status: any): number | null {
    if (status instanceof Api.UserStatusOffline && status.wasOnline) {
      return Number(status.wasOnline);
    }
    if (status instanceof Api.UserStatusOnline && status.expires) {
      return Number(status.expires);
    }
    return null;
  }

  /**
   * Format contacts response with pagination
   * @param contacts - Array of contacts
   * @param options - Query options
   * @returns Formatted response
   */
  private formatContactsResponse(
    contacts: ITelegramRealContact[],
    options: GetContactsDto,
  ) {
    const { limit = 50, offset = 0, search } = options;

    let filteredContacts = contacts;

    // Apply search filter if provided
    if (search && search.trim().length > 0) {
      const searchTerm = search.toLowerCase();
      filteredContacts = contacts.filter(
        (contact) =>
          contact.firstName?.toLowerCase().includes(searchTerm) ||
          contact.lastName?.toLowerCase().includes(searchTerm) ||
          contact.username?.toLowerCase().includes(searchTerm),
      );
    }

    // Apply pagination
    const paginatedContacts = filteredContacts.slice(offset, offset + limit);

    return {
      contacts: paginatedContacts,
      total: filteredContacts.length,
      limit,
      offset,
      hasMore: offset + limit < filteredContacts.length,
    };
  }

  /**
   * Get cached contacts for a user
   * @param userId - User ID
   * @returns Cached contacts or null
   */
  private getCachedContacts(userId: number): ITelegramRealContact[] | null {
    const cached = this.contactsCache.get(userId);
    if (!cached) return null;

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.contactsCache.delete(userId);
      return null;
    }

    return cached.contacts;
  }

  /**
   * Cache contacts for a user
   * @param userId - User ID
   * @param contacts - Contacts to cache
   */
  private cacheContacts(
    userId: number,
    contacts: ITelegramRealContact[],
  ): void {
    this.contactsCache.set(userId, {
      contacts,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear contacts cache for a user
   * @param userId - User ID
   */
  clearContactsCache(userId: number): void {
    this.contactsCache.delete(userId);
    this.logger.log(`Cleared contacts cache for user ${userId}`);
  }

  /**
   * Clear all contacts cache
   */
  clearAllCache(): void {
    this.contactsCache.clear();
    this.logger.log('Cleared all contacts cache');
  }
}
