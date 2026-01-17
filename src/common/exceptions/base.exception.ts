import {
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ERROR_MESSAGES } from '../constants/error-messages.constant';

/**
 * Base application exception
 * All custom exceptions should extend this class
 */
export class AppException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    public readonly errorCode?: string,
  ) {
    super(
      {
        success: false,
        message,
        errorCode,
        timestamp: new Date().toISOString(),
      },
      status,
    );
  }
}

// ============================================
// User Exceptions
// ============================================

export class UserNotFoundException extends NotFoundException {
  constructor(identifier?: string) {
    super({
      success: false,
      message: identifier
        ? `${ERROR_MESSAGES.USER.NOT_FOUND}: ${identifier}`
        : ERROR_MESSAGES.USER.NOT_FOUND,
      errorCode: 'USER_NOT_FOUND',
    });
  }
}

export class UserInactiveException extends ForbiddenException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.USER.INACTIVE,
      errorCode: 'USER_INACTIVE',
    });
  }
}

export class UserAlreadyExistsException extends ConflictException {
  constructor(identifier?: string) {
    super({
      success: false,
      message: identifier
        ? `${ERROR_MESSAGES.USER.ALREADY_EXISTS}: ${identifier}`
        : ERROR_MESSAGES.USER.ALREADY_EXISTS,
      errorCode: 'USER_ALREADY_EXISTS',
    });
  }
}

// ============================================
// Authentication Exceptions
// ============================================

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS,
      errorCode: 'INVALID_CREDENTIALS',
    });
  }
}

export class InvalidSignatureException extends UnauthorizedException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.AUTH.INVALID_SIGNATURE,
      errorCode: 'INVALID_SIGNATURE',
    });
  }
}

export class InvalidTokenException extends UnauthorizedException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.AUTH.INVALID_TOKEN,
      errorCode: 'INVALID_TOKEN',
    });
  }
}

export class TokenExpiredException extends UnauthorizedException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.AUTH.TOKEN_EXPIRED,
      errorCode: 'TOKEN_EXPIRED',
    });
  }
}

export class AuthenticationRequiredException extends UnauthorizedException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.AUTH.REQUIRED,
      errorCode: 'AUTH_REQUIRED',
    });
  }
}

export class SignatureRequiredException extends BadRequestException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.AUTH.SIGNATURE_REQUIRED,
      errorCode: 'SIGNATURE_REQUIRED',
    });
  }
}

// ============================================
// Password/Secret Exceptions
// ============================================

export class PasswordNotFoundException extends NotFoundException {
  constructor(id?: string) {
    super({
      success: false,
      message: id
        ? `${ERROR_MESSAGES.PASSWORD.NOT_FOUND}: ${id}`
        : ERROR_MESSAGES.PASSWORD.NOT_FOUND,
      errorCode: 'PASSWORD_NOT_FOUND',
    });
  }
}

export class PasswordAccessDeniedException extends ForbiddenException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.PASSWORD.ACCESS_DENIED,
      errorCode: 'PASSWORD_ACCESS_DENIED',
    });
  }
}

export class PasswordAlreadySharedException extends ConflictException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.PASSWORD.ALREADY_SHARED,
      errorCode: 'PASSWORD_ALREADY_SHARED',
    });
  }
}

// ============================================
// Public Address Exceptions
// ============================================

export class PublicAddressNotFoundException extends NotFoundException {
  constructor(address?: string) {
    super({
      success: false,
      message: address
        ? `${ERROR_MESSAGES.PUBLIC_ADDRESS.NOT_FOUND}: ${address}`
        : ERROR_MESSAGES.PUBLIC_ADDRESS.NOT_FOUND,
      errorCode: 'PUBLIC_ADDRESS_NOT_FOUND',
    });
  }
}

export class PublicAddressAlreadyExistsException extends ConflictException {
  constructor(address?: string) {
    super({
      success: false,
      message: address
        ? `${ERROR_MESSAGES.PUBLIC_ADDRESS.ALREADY_EXISTS}: ${address}`
        : ERROR_MESSAGES.PUBLIC_ADDRESS.ALREADY_EXISTS,
      errorCode: 'PUBLIC_ADDRESS_ALREADY_EXISTS',
    });
  }
}

export class InvalidPublicAddressException extends BadRequestException {
  constructor() {
    super({
      success: false,
      message: ERROR_MESSAGES.PUBLIC_ADDRESS.INVALID,
      errorCode: 'INVALID_PUBLIC_ADDRESS',
    });
  }
}

// ============================================
// Validation Exceptions
// ============================================

export class ValidationException extends BadRequestException {
  constructor(message: string, field?: string) {
    super({
      success: false,
      message,
      field,
      errorCode: 'VALIDATION_ERROR',
    });
  }
}

export class RequiredFieldException extends BadRequestException {
  constructor(fieldName: string) {
    super({
      success: false,
      message: `${fieldName} is required`,
      field: fieldName,
      errorCode: 'REQUIRED_FIELD',
    });
  }
}

// ============================================
// Database Exceptions
// ============================================

export class DatabaseOperationException extends InternalServerErrorException {
  constructor(operation: string) {
    super({
      success: false,
      message: `Database operation failed: ${operation}`,
      errorCode: 'DATABASE_ERROR',
    });
  }
}
