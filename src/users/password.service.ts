import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Password, PasswordDocument } from './schemas/password.schema';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  constructor(
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async create(createPasswordDto: {
    userId: Types.ObjectId;
    passwordName: string;
    telegramPassword?: string;
    facebookPassword?: string;
  }): Promise<Password> {
    const { telegramPassword, facebookPassword, ...rest } = createPasswordDto;
    
    const hashedData: any = { ...rest };
    
    if (telegramPassword) {
      hashedData.telegramPassword = await this.hashPassword(telegramPassword);
    }
    
    if (facebookPassword) {
      hashedData.facebookPassword = await this.hashPassword(facebookPassword);
    }

    const createdPassword = new this.passwordModel(hashedData);
    return createdPassword.save();
  }

  async findByUserId(userId: Types.ObjectId): Promise<Password[]> {
    return this.passwordModel.find({ userId, isActive: true }).exec();
  }

  async update(
    id: string,
    updatePasswordDto: Partial<Password>,
  ): Promise<Password> {
    const { telegramPassword, facebookPassword, ...rest } = updatePasswordDto;
    
    const updateData: any = { ...rest };
    
    if (telegramPassword) {
      updateData.telegramPassword = await this.hashPassword(telegramPassword);
    }
    
    if (facebookPassword) {
      updateData.facebookPassword = await this.hashPassword(facebookPassword);
    }

    return this.passwordModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
  }

  async delete(id: string): Promise<Password> {
    return this.passwordModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  async verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
} 