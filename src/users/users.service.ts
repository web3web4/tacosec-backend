import { Injectable } from '@nestjs/common';
import { MongoDBService } from '../database/mongodb.service';
import * as bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';

@Injectable()
export class UsersService {
  constructor(private readonly mongoDBService: MongoDBService) {}

  private getUsersCollection() {
    return this.mongoDBService.getDatabase().collection('users');
  }

  async create(createUserDto: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const result = await this.getUsersCollection().insertOne({
      ...createUserDto,
      password: hashedPassword,
      createdAt: new Date()
    });
    return result;
  }

  async findAll() {
    return this.getUsersCollection().find().toArray();
  }

  async findOne(id: string) {
    return this.getUsersCollection().findOne({ _id: new ObjectId(id) });
  }

  async findByEmail(email: string) {
    return this.getUsersCollection().findOne({ email });
  }

  async update(id: string, updateUserDto: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  }) {
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    return this.getUsersCollection().updateOne(
      { _id: new ObjectId(id) },
      { $set: updateUserDto }
    );
  }

  async remove(id: string) {
    return this.getUsersCollection().deleteOne({ _id: new ObjectId(id) });
  }

  async validatePassword(email: string, password: string): Promise<boolean> {
    const user = await this.findByEmail(email);
    if (!user) {
      return false;
    }
    return bcrypt.compare(password, user.password);
  }
} 