import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Password, PasswordDocument } from './schemas/password.schema';
import { CreatePasswordDto } from './dto/create-password.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  constructor(
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
  ) {}

  async create(createPasswordDto: CreatePasswordDto): Promise<Password> {
    // const { value, ...rest } = createPasswordDto;
    const { ...rest } = createPasswordDto;
    const hashedData: Partial<Password> = { ...rest };
    hashedData.isActive = true;

    // if (value) {
    //   hashedData.value = await this.hashPassword(value);
    // }

    const createdPassword = new this.passwordModel(hashedData);
    return createdPassword.save();
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return bcrypt.hash(password, salt);
  }

  async findOne(filter: Partial<Password>): Promise<Password> {
    return this.passwordModel.findOne(filter).exec();
  }

  async findById(id: string): Promise<Password> {
    return this.passwordModel.findById(id).exec();
  }

  async findByUserId(userId: Types.ObjectId): Promise<Password[]> {
    return this.passwordModel.find({ userId, isActive: true }).exec();
  }

  async findOneAndUpdate(
    filter: Partial<Password>,
    update: Partial<Password>,
  ): Promise<Password> {
    return this.passwordModel
      .findOneAndUpdate(filter, update, { new: true })
      .exec();
  }

  async findByIdAndUpdate(
    id: string,
    update: Partial<Password>,
  ): Promise<Password> {
    return this.passwordModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
  }

  async findOneAndDelete(filter: Partial<Password>): Promise<Password> {
    return this.passwordModel.findOneAndDelete(filter).exec();
  }

  async findByIdAndDelete(id: string): Promise<Password> {
    return this.passwordModel.findByIdAndDelete(id).exec();
  }

  async update(
    id: string,
    updatePasswordDto: Partial<Password>,
  ): Promise<Password> {
    // const { value, ...rest } = updatePasswordDto;
    const { ...rest } = updatePasswordDto;
    const updateData: Partial<Password> = { ...rest };
    updateData.isActive = true;

    // if (value) {
    //   updateData.value = await this.hashPassword(value);
    // }

    return this.passwordModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
  }

  async delete(id: string): Promise<Password> {
    return this.passwordModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  async verifyPassword(
    hashedPassword: string,
    plainPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
