import { Model } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { PublicAddressDocument } from '../public-addresses/schemas/public-address.schema';

export interface UserSearchInfo {
  username?: string;
  userId?: string;
  telegramId?: string;
  publicAddress?: string;
}

export interface UserFoundInfo {
  userId: string;
  username: string;
  telegramId: string;
  publicAddress: string;
}

export class UserFinderUtil {
  /**
   * Find user by any available information (userId, username, telegramId, or publicAddress)
   * This utility method can be used across the entire project to locate users
   * @param userInfo - Object containing any combination of user identifiers
   * @param userModel - Mongoose model for User collection
   * @param publicAddressModel - Mongoose model for PublicAddress collection
   * @returns Promise<UserFoundInfo | null> - User information or null if not found
   */
  static async findUserByAnyInfo(
    userInfo: UserSearchInfo,
    userModel: Model<UserDocument>,
    publicAddressModel: Model<PublicAddressDocument>,
  ): Promise<UserFoundInfo | null> {
    try {
      let user = null;

      // Try to find user by userId first (most reliable)
      if (userInfo.userId) {
        user = await userModel
          .findOne({ _id: userInfo.userId, isActive: true })
          .exec();
      }

      // If not found, try by username (case-insensitive)
      if (!user && userInfo.username) {
        user = await userModel
          .findOne({
            username: { $regex: new RegExp(`^${userInfo.username}$`, 'i') },
            isActive: true,
          })
          .exec();
      }

      // If not found, try by telegramId
      if (!user && userInfo.telegramId) {
        // Try both string and number formats for telegramId
        user = await userModel
          .findOne({
            $or: [
              { telegramId: userInfo.telegramId },
              { telegramId: String(userInfo.telegramId) },
              { telegramId: Number(userInfo.telegramId) },
            ],
            isActive: true,
          })
          .exec();
      }

      // If not found, try by publicAddress
      if (!user && userInfo.publicAddress) {
        const publicAddressRecord = await publicAddressModel
          .findOne({ publicKey: userInfo.publicAddress })
          .populate('userIds')
          .exec();

        if (
          publicAddressRecord &&
          publicAddressRecord.userIds &&
          publicAddressRecord.userIds.length > 0
        ) {
          // Find the first active user
          const users = publicAddressRecord.userIds as UserDocument[];
          const activeUser = users.find((u) => u.isActive);
          if (activeUser) {
            user = activeUser;
          }
        }
      }

      if (!user) {
        return null;
      }

      // Get latest public address
      const publicAddress = await publicAddressModel
        .findOne({ userIds: user._id })
        .sort({ updatedAt: -1 })
        .exec();

      const result: UserFoundInfo = {
        userId: user._id ? String(user._id) : '',
        username: user.username || '',
        telegramId: user.telegramId || '',
        publicAddress: publicAddress?.publicKey || '',
      };

      return result;
    } catch (error) {
      console.error('Error in findUserByAnyInfo:', error);
      return null;
    }
  }

  static async findUsersByPublicAddress(
    publicAddress: string,
    userModel: Model<UserDocument>,
    publicAddressModel: Model<PublicAddressDocument>,
  ): Promise<UserFoundInfo[]> {
    try {
      const record = await publicAddressModel
        .findOne({ publicKey: publicAddress })
        .populate('userIds')
        .exec();

      if (
        !record ||
        !record.userIds ||
        (record.userIds as any[]).length === 0
      ) {
        return [];
      }

      const users = (record.userIds as unknown as UserDocument[]).filter(
        (u) => u && u.isActive,
      );

      const results = await Promise.all(
        users.map(async (u) => {
          const latest = await publicAddressModel
            .findOne({ userIds: u._id })
            .sort({ updatedAt: -1 })
            .exec();
          return {
            userId: u._id ? String(u._id) : '',
            username: u.username || '',
            telegramId: u.telegramId || '',
            publicAddress: latest?.publicKey || publicAddress,
          } as UserFoundInfo;
        }),
      );

      return results;
    } catch {
      return [];
    }
  }
}
