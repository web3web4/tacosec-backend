import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Parse MongoDB ObjectId Pipe
 * Validates and transforms string to MongoDB ObjectId
 */
@Injectable()
export class ParseMongoIdPipe implements PipeTransform<string, Types.ObjectId> {
  transform(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid MongoDB ObjectId: ${value}`);
    }
    return new Types.ObjectId(value);
  }
}

/**
 * Parse Optional MongoDB ObjectId Pipe
 * Same as ParseMongoIdPipe but allows undefined/null values
 */
@Injectable()
export class ParseOptionalMongoIdPipe implements PipeTransform<
  string | undefined,
  Types.ObjectId | undefined
> {
  transform(value: string | undefined): Types.ObjectId | undefined {
    if (!value) {
      return undefined;
    }
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid MongoDB ObjectId: ${value}`);
    }
    return new Types.ObjectId(value);
  }
}
