import {
  Injectable,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Password, PasswordDocument } from '../schemas/password.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../../public-addresses/schemas/public-address.schema';
import { PublicAddressesService } from '../../public-addresses/public-addresses.service';
import { LoggerService } from '../../logger/logger.service';
import { LogEvent } from '../../logger/dto/log-event.enum';

/**
 * Password Views Service
 * Handles secret view recording and statistics
 */
@Injectable()
export class PasswordViewsService {
  constructor(
    @InjectModel(Password.name)
    protected readonly passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name)
    protected readonly userModel: Model<UserDocument>,
    @InjectModel(PublicAddress.name)
    protected readonly publicAddressModel: Model<PublicAddressDocument>,
    protected readonly publicAddressesService: PublicAddressesService,
    @Inject(forwardRef(() => LoggerService))
    protected readonly loggerService: LoggerService,
  ) {}

  /**
   * Record a secret view for a secret
   * @param secretId - The ID of the secret being viewed
   * @param telegramId - The telegram ID of the viewer
   * @param username - The username of the viewer (optional)
   * @param userId - The user ID of the viewer (optional)
   * @param publicAddress - The latest wallet address of the viewer (optional)
   * @returns Updated password document or empty object if access denied
   */
  async recordSecretView(
    secretId: string,
    telegramId: string,
    username?: string,
    userId?: string,
    publicAddress?: string,
  ): Promise<Password | Record<string, never>> {
    try {
      // Check if secret exists
      const secret = await this.passwordModel.findById(secretId).exec();
      if (!secret) {
        return {}; // Return empty response for non-existent secrets
      }

      // Check if the secret has been shared with the viewing user
      const isSharedWithUser = secret.sharedWith?.some((shared) => {
        return (
          (userId && shared.userId === userId) ||
          (username &&
            shared.username &&
            shared.username.toLowerCase() === username.toLowerCase()) ||
          (publicAddress && shared.publicAddress === publicAddress)
        );
      });

      // Check if user is the owner of the secret
      const isOwner = userId && String(secret.userId) === userId;

      // Allow parent secret owner to view child secret response even if not shared
      let isParentOwnerViewingChild = false;
      if (!isOwner && !isSharedWithUser && secret.parent_secret_id && userId) {
        const parentSecret = await this.passwordModel
          .findById(secret.parent_secret_id)
          .select('userId')
          .exec();
        if (parentSecret && String(parentSecret.userId) === String(userId)) {
          isParentOwnerViewingChild = true;
        }
      }

      if (!isOwner && !isSharedWithUser && !isParentOwnerViewingChild) {
        console.log('🚫 Access denied: Secret not shared with user');
        return {}; // Return empty response with 200 status
      }

      console.log('🔍 SECRET FOUND:', {
        secretId: secret._id,
        secretUserId: secret.userId,
        secretUserIdType: typeof secret.userId,
      });

      // Get the viewing user - try multiple methods to find the user
      let viewingUser = null;

      // First try to find by telegramId if available
      if (telegramId) {
        viewingUser = await this.userModel
          .findOne({ telegramId })
          .select('privacyMode firstName lastName')
          .exec();
      }

      // If not found by telegramId and userId is available, try by userId
      if (!viewingUser && userId) {
        viewingUser = await this.userModel
          .findById(userId)
          .select('privacyMode firstName lastName')
          .exec();
      }

      // If still not found, create a minimal user object for recording the view
      if (!viewingUser) {
        console.log('⚠️ User not found in database, but recording view anyway');
        viewingUser = {
          firstName: '',
          lastName: '',
          privacyMode: false,
        };
      }

      // Get the secret owner
      console.log('🔍 SEARCHING FOR SECRET OWNER with userId:', secret.userId);
      const secretOwner = await this.userModel
        .findById(secret.userId)
        .select('privacyMode telegramId username')
        .exec();
      if (!secretOwner) {
        console.log('❌ SECRET OWNER NOT FOUND for userId:', secret.userId);
        throw new HttpException('Secret owner not found', HttpStatus.NOT_FOUND);
      }
      console.log('✅ SECRET OWNER FOUND:', {
        ownerId: secretOwner._id,
        ownerTelegramId: secretOwner.telegramId,
        ownerUsername: secretOwner.username,
      });

      // Check if the viewing user is the owner of the secret
      console.log('=== SECRET VIEW DEBUG ===');
      console.log('Secret ID:', secretId);
      console.log('Secret userId:', secret.userId);
      console.log(
        'Secret owner telegramId:',
        secretOwner.telegramId,
        'type:',
        typeof secretOwner.telegramId,
      );
      console.log('Secret owner username:', secretOwner.username);
      console.log(
        'Viewing user telegramId:',
        telegramId,
        'type:',
        typeof telegramId,
      );
      console.log('Viewing user username:', username);
      console.log('Viewing user userId:', userId);
      console.log('========================');

      // Check if owner is viewing their own secret using multiple identifiers
      const isOwnerViewing =
        (telegramId && String(secretOwner.telegramId) === String(telegramId)) ||
        (userId && String(secret.userId) === String(userId));

      if (isOwnerViewing) {
        // Owner viewing their own secret - don't record the view
        console.log('🚫 Owner viewing own secret - not recording view');
        return secret;
      }

      // Proceed with recording view (privacy checks follow)

      // Check privacy settings - if either the viewing user or secret owner has privacy mode enabled, don't record the view
      if (viewingUser.privacyMode || secretOwner.privacyMode) {
        // Return the secret without recording the view
        if (secretOwner.privacyMode) {
          console.log(
            '🔒 Secret owner has privacy mode enabled - not recording view',
          );
        }
        if (viewingUser.privacyMode) {
          console.log(
            '🔒 Viewing user has privacy mode enabled - not recording view',
          );
        }
        return secret;
      }

      // Check if this telegram user has already viewed this secret before (ever)
      const existingView = secret.secretViews?.find(
        (view) =>
          (telegramId && view.telegramId === telegramId) ||
          (userId && view.userId === userId) ||
          (username && view.username === username),
      );

      // If user has never viewed this secret before, add new view
      if (!existingView) {
        console.log(
          '✅ Recording new secret view for user:',
          telegramId || 'no-telegram',
          username || 'no-username',
          userId || 'no-userId',
        );

        // Get the latest public address for the viewing user
        let currentpublicAddress = publicAddress;

        try {
          if (!currentpublicAddress || currentpublicAddress.trim() === '') {
            if (telegramId) {
              const addressByTelegramId =
                await this.publicAddressesService.getLatestAddressByTelegramId(
                  telegramId,
                );
              if (addressByTelegramId.success && addressByTelegramId.data) {
                currentpublicAddress = addressByTelegramId.data.publicKey;
              }
            }
          }

          // If no address found by telegramId or telegramId is empty, try by userId
          if (!currentpublicAddress || currentpublicAddress.trim() === '') {
            if (userId) {
              const addressByUserId =
                await this.publicAddressesService.getLatestAddressByUserId(
                  userId,
                );
              if (addressByUserId.success && addressByUserId.data) {
                currentpublicAddress = addressByUserId.data.publicKey;
              }
            }
          }
        } catch (error) {
          console.log(
            '⚠️ Could not retrieve latest wallet address:',
            error.message,
          );
          // Continue with the provided publicAddress or undefined
        }

        const newView = {
          telegramId: telegramId || '',
          username: username || '',
          userId: userId || '',
          publicAddress: currentpublicAddress,
          firstName: viewingUser.firstName || '',
          lastName: viewingUser.lastName || '',
          viewedAt: new Date(),
        };

        const updatedSecret = await this.passwordModel
          .findByIdAndUpdate(
            secretId,
            { $push: { secretViews: newView } },
            { new: true },
          )
          .exec();

        // Log secret view event (separate for Telegram vs non-Telegram viewers)
        try {
          const eventName = newView.telegramId
            ? LogEvent.SecretViewedByTelegram
            : LogEvent.SecretViewedByNonTelegram;
          await this.loggerService.saveSystemLog(
            {
              event: eventName,
              message: 'Secret viewed',
              secretId: String(updatedSecret?._id || secretId),
              key: updatedSecret?.key || secret.key,
              viewerHasTelegram: !!newView.telegramId,
              viewerPublicAddress: newView.publicAddress || undefined,
            },
            {
              userId: newView.userId || undefined,
              telegramId: newView.telegramId || undefined,
              username: newView.username || undefined,
            },
          );
        } catch (e) {
          console.error('Failed to log secret view', e);
        }

        return updatedSecret;
      } else {
        console.log(
          '🔄 User has already viewed this secret before - not recording',
        );
      }

      // User has already viewed this secret before - don't record another view
      return secret;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to record secret view',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get secret view statistics for a secret with deduplication
   * @param secretId - The ID of the secret
   * @param userId - The user ID of the requesting user
   * @param telegramId - The telegram ID of the requesting user
   * @param username - The username of the requesting user
   * @param publicAddress - The latest wallet address of the requesting user
   * @returns View statistics including count and viewer details with deduplication
   */
  async getSecretViewStats(
    secretId: string,
    userId: string,
    telegramId: string,
    username: string,
    publicAddress?: string,
  ): Promise<{
    totalViews: number;
    uniqueViewers: number;
    totalSharedUsers: number;
    viewDetails: Array<{
      telegramId: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      userId?: string;
      publicAddress?: string;
      viewedAt: Date;
    }>;
    notViewedUsers: Array<{
      username?: string;
      firstName?: string;
      lastName?: string;
      telegramId?: string;
    }>;
    notViewedUsersCount: number;
    unknownUsers: Array<{
      username?: string;
    }>;
    unknownCount: number;
    requestingUserInfo: {
      userId: string;
      telegramId: string;
      username: string;
      publicAddress?: string;
      hasViewedSecret: boolean;
      isOwner: boolean;
    };
  }> {
    try {
      // Find the secret and verify ownership
      const secret = await this.passwordModel.findById(secretId).exec();
      if (!secret) {
        throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
      }

      // Use userId parameter for more efficient user lookup if available
      let user;
      if (userId) {
        user = await this.userModel
          .findOne({ _id: userId, isActive: true })
          .exec();
      }

      // Fallback to telegramId if userId lookup failed
      if (!user) {
        user = await this.userModel
          .findOne({ telegramId, isActive: true })
          .exec();
      }

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Find the secret owner to check privacy mode
      const secretOwner = await this.userModel.findById(secret.userId).exec();
      if (!secretOwner) {
        throw new HttpException('Secret owner not found', HttpStatus.NOT_FOUND);
      }

      // Check if requesting user is the owner
      const isOwner = String(secret.userId) === String(user._id);

      // Check if requesting user has viewed this secret
      const hasViewedSecret =
        secret.secretViews?.some(
          (view) =>
            view.telegramId === telegramId ||
            view.userId === userId ||
            (view.username && view.username === username) ||
            (view.publicAddress &&
              publicAddress &&
              view.publicAddress === publicAddress),
        ) || false;

      const secretViews = secret.secretViews || [];

      // Enhanced deduplication using all available identifiers including the requesting user's data
      const uniqueViewsMap = new Map<string, any>();

      for (const view of secretViews) {
        // Use the most reliable identifier as the primary key (userId > telegramId > username > walletAddress)
        const primaryKey =
          view.userId || view.telegramId || view.username || view.publicAddress;

        // If this user hasn't been seen before, or if this is a more complete record
        if (
          !uniqueViewsMap.has(primaryKey) ||
          (uniqueViewsMap.get(primaryKey) &&
            view.userId &&
            !uniqueViewsMap.get(primaryKey).userId)
        ) {
          uniqueViewsMap.set(primaryKey, view);
        }
      }

      // Convert deduplicated views back to array
      const deduplicatedViews = Array.from(uniqueViewsMap.values());

      // Get user details for each deduplicated view to include firstName and lastName
      const viewDetailsWithUserInfo = await Promise.all(
        deduplicatedViews.map(async (view) => {
          let userInfo = null;
          let currentpublicAddress = view.publicAddress;

          // Try to get user info from database if firstName/lastName not in view
          if (!view.firstName || !view.lastName) {
            userInfo = await this.userModel
              .findOne({ telegramId: view.telegramId })
              .select('firstName lastName')
              .exec();
          }

          // If publicAddress is missing, null, or empty, try to fetch the latest one
          if (!currentpublicAddress || currentpublicAddress.trim() === '') {
            try {
              // First try to get address by telegramId if available
              if (view.telegramId) {
                const addressResponse =
                  await this.publicAddressesService.getLatestAddressByTelegramId(
                    view.telegramId,
                  );
                if (addressResponse.success && addressResponse.data) {
                  currentpublicAddress = addressResponse.data.publicKey;
                }
              }

              // If no address found by telegramId, try by userId
              if (!currentpublicAddress && view.userId) {
                const addressResponse =
                  await this.publicAddressesService.getLatestAddressByUserId(
                    view.userId,
                  );
                if (addressResponse.success && addressResponse.data) {
                  currentpublicAddress = addressResponse.data.publicKey;
                }
              }

              // If still no address found, try to find user by username and get their address
              if (!currentpublicAddress && view.username) {
                const user = await this.userModel
                  .findOne({ username: view.username })
                  .select('_id telegramId')
                  .exec();

                if (user) {
                  // Try by telegramId first
                  if (user.telegramId) {
                    const addressResponse =
                      await this.publicAddressesService.getLatestAddressByTelegramId(
                        user.telegramId,
                      );
                    if (addressResponse.success && addressResponse.data) {
                      currentpublicAddress = addressResponse.data.publicKey;
                    }
                  }

                  // If still no address, try by userId
                  if (!currentpublicAddress) {
                    const addressResponse =
                      await this.publicAddressesService.getLatestAddressByUserId(
                        user._id.toString(),
                      );
                    if (addressResponse.success && addressResponse.data) {
                      currentpublicAddress = addressResponse.data.publicKey;
                    }
                  }
                }
              }
            } catch (error) {
              // If address retrieval fails, keep the original address (which might be null/empty)
              console.log(
                'Failed to retrieve latest wallet address for view:',
                error,
              );
            }
          }

          return {
            telegramId: view.telegramId,
            username: view.username,
            userId: view.userId,
            publicAddress: currentpublicAddress,
            firstName: userInfo?.firstName || view.firstName || '',
            lastName: userInfo?.lastName || view.lastName || '',
            viewedAt: view.viewedAt,
          };
        }),
      );

      const uniqueViewers = deduplicatedViews.length;

      // Calculate total number of users the secret has been shared with
      const totalSharedUsers = secret.sharedWith ? secret.sharedWith.length : 0;

      // Get identifiers of users who have viewed the secret (from deduplicated views)
      const viewedUserIdentifiers = new Set();
      deduplicatedViews.forEach((view) => {
        if (view.telegramId) viewedUserIdentifiers.add(view.telegramId);
        if (view.userId) viewedUserIdentifiers.add(view.userId);
        if (view.username) viewedUserIdentifiers.add(view.username);
        if (view.publicAddress) viewedUserIdentifiers.add(view.publicAddress);
      });

      // Process shared users to categorize them using enhanced matching
      const notViewedUsers = [];
      const unknownUsers = [];
      let unknownCount = 0;

      if (secret.sharedWith && secret.sharedWith.length > 0) {
        for (const sharedUser of secret.sharedWith) {
          let userDetails = null;

          // Enhanced lookup: try multiple methods to find the exact shared user
          // First, try to find by userId if available
          if (sharedUser.userId) {
            userDetails = await this.userModel
              .findById(sharedUser.userId)
              .select('telegramId firstName lastName privacyMode username')
              .exec();
          }

          // If not found by userId and username is available, try username lookup
          if (!userDetails && sharedUser.username) {
            userDetails = await this.userModel
              .findOne({ username: sharedUser.username })
              .select('telegramId firstName lastName privacyMode _id')
              .exec();
          }

          // If user details found in database
          if (userDetails) {
            // Verify this is actually the same user by cross-checking identifiers
            const isMatchingUser =
              (sharedUser.userId &&
                String(userDetails._id) === sharedUser.userId) ||
              (sharedUser.username &&
                userDetails.username === sharedUser.username) ||
              (!sharedUser.userId &&
                !sharedUser.username &&
                sharedUser.publicAddress); // User with only publicAddress

            if (isMatchingUser) {
              // Enhanced check using multiple identifiers
              const hasViewed =
                viewedUserIdentifiers.has(userDetails.telegramId) ||
                viewedUserIdentifiers.has(String(userDetails._id)) ||
                viewedUserIdentifiers.has(userDetails.username);

              // Get latest public address for the user
              let latestPublicAddress: string | undefined;
              try {
                // First try to get address by telegramId if available
                if (userDetails.telegramId) {
                  const addressResponse =
                    await this.publicAddressesService.getLatestAddressByTelegramId(
                      userDetails.telegramId,
                    );
                  if (addressResponse.success && addressResponse.data) {
                    latestPublicAddress = addressResponse.data.publicKey;
                  }
                }

                // If no address found by telegramId, try by userId
                if (!latestPublicAddress && userDetails._id) {
                  const addressResponse =
                    await this.publicAddressesService.getLatestAddressByUserId(
                      userDetails._id.toString(),
                    );
                  if (addressResponse.success && addressResponse.data) {
                    latestPublicAddress = addressResponse.data.publicKey;
                  }
                }
              } catch {
                // If address retrieval fails, latestPublicAddress remains undefined
                latestPublicAddress = undefined;
              }

              // Check if user has privacy mode enabled AND hasn't viewed the secret
              if (userDetails.privacyMode && !hasViewed) {
                unknownUsers.push({
                  username: sharedUser.username,
                  firstName: userDetails.firstName,
                  lastName: userDetails.lastName,
                  telegramId: userDetails.telegramId,
                  publicAddress: latestPublicAddress,
                });
                unknownCount++;
              } else if (!userDetails.privacyMode && !hasViewed) {
                // User hasn't viewed the secret and doesn't have privacy mode
                notViewedUsers.push({
                  username: sharedUser.username,
                  firstName: userDetails.firstName,
                  lastName: userDetails.lastName,
                  telegramId: userDetails.telegramId,
                  publicAddress: latestPublicAddress,
                });
              }
              // Note: Users with privacyMode=true who have viewed the secret
              // will only appear in viewDetails without being added to unknownUsers
            }
          } else {
            // User not found in database - this could be a user with only publicAddress
            // Only add to notViewedUsers if they have some identifying information
            if (sharedUser.username || sharedUser.publicAddress) {
              // Check if this shared user has viewed the secret using publicAddress
              const hasViewedByAddress =
                sharedUser.publicAddress &&
                viewedUserIdentifiers.has(sharedUser.publicAddress);

              if (!hasViewedByAddress) {
                notViewedUsers.push({
                  username: sharedUser.username,
                  publicAddress: sharedUser.publicAddress,
                });
              }
            }
          }
        }
      }

      return {
        totalViews: deduplicatedViews.length, // Use deduplicated count
        uniqueViewers,
        totalSharedUsers,
        viewDetails: viewDetailsWithUserInfo,
        notViewedUsers,
        notViewedUsersCount: notViewedUsers.length,
        unknownUsers,
        unknownCount,
        requestingUserInfo: {
          userId,
          telegramId,
          username,
          publicAddress,
          hasViewedSecret,
          isOwner,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get secret view statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
