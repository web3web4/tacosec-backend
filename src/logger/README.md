# Logger Module

## Overview
The Logger module provides error logging functionality with flexible authentication support. It allows users to save error logs and retrieve them with pagination and filtering capabilities. The module supports both JWT token authentication and Telegram authentication.

## Features
- **Flexible Authentication**: Supports both JWT tokens and Telegram init data
- **Error Log Storage**: Save JSON error data with automatic user identification and timestamps
- **Pagination**: Retrieve logs with customizable pagination
- **Filtering**: Filter logs by date range and search within log data
- **User Isolation**: Each user can only access their own logs
- **Automatic Timestamps**: MongoDB automatically handles createdAt and updatedAt fields

## API Endpoints

### POST /logger
Save a new error log entry.

**Authentication**: Flexible (JWT Token or Telegram Init Data)

**Headers**:
```
Authorization: Bearer <jwt_token>  // For JWT authentication
x-telegram-init-data: <telegram_init_data>  // For Telegram authentication
Content-Type: application/json
```

**Request Body**:
```json
{
  "logData": {
    "error": "Error message",
    "stack": "Stack trace information",
    "url": "/api/endpoint",
    "method": "POST",
    "userAgent": "Mozilla/5.0...",
    "timestamp": "2024-01-01T00:00:00Z",
    "additionalData": "Any additional error context"
  }
}
```

**Response**:
```json
{
  "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
  "userId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "telegramId": "123456789",
  "username": "john_doe",
  "logData": {
    "error": "Error message",
    "stack": "Stack trace information",
    "url": "/api/endpoint",
    "method": "POST",
    "userAgent": "Mozilla/5.0...",
    "timestamp": "2024-01-01T00:00:00Z",
    "additionalData": "Any additional error context"
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### GET /logger
Retrieve error logs with pagination and filtering.

**Authentication**: Flexible (JWT Token or Telegram Init Data)

**Headers**:
```
Authorization: Bearer <jwt_token>  // For JWT authentication
x-telegram-init-data: <telegram_init_data>  // For Telegram authentication
```

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `startDate` (optional): Filter logs from this date (ISO string)
- `endDate` (optional): Filter logs until this date (ISO string)
- `search` (optional): Search in log data (searches in message, error, stack fields)

**Example Request**:
```
GET /logger?page=1&limit=20&startDate=2024-01-01&search=error
```

**Response**:
```json
{
  "data": [
    {
      "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
      "userId": "60f7b3b3b3b3b3b3b3b3b3b3",
      "telegramId": "123456789",
      "username": "john_doe",
      "logData": {
        "error": "Error message",
        "stack": "Stack trace information"
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalCount": 50,
    "limit": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### GET /logger/:id
Retrieve a specific error log by ID.

**Authentication**: Flexible (JWT Token or Telegram Init Data)

**Headers**:
```
Authorization: Bearer <jwt_token>  // For JWT authentication
x-telegram-init-data: <telegram_init_data>  // For Telegram authentication
```

**Response**:
```json
{
  "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
  "userId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "telegramId": "123456789",
  "username": "john_doe",
  "logData": {
    "error": "Error message",
    "stack": "Stack trace information"
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### DELETE /logger/:id
Delete a specific error log by ID.

**Authentication**: Flexible (JWT Token or Telegram Init Data)

**Headers**:
```
Authorization: Bearer <jwt_token>  // For JWT authentication
x-telegram-init-data: <telegram_init_data>  // For Telegram authentication
```

**Response**:
```json
{
  "message": "Error log deleted successfully"
}
```

## Authentication Methods

### JWT Token Authentication
Include the JWT token in the Authorization header:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Telegram Authentication
Include the Telegram init data in the x-telegram-init-data header:
```
x-telegram-init-data: query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A279058397...
```

## Error Handling

### 400 Bad Request
- Missing or invalid request body
- Invalid query parameters

### 401 Unauthorized
- Missing authentication headers
- Invalid JWT token
- Invalid Telegram init data

### 404 Not Found
- Error log not found
- User doesn't have access to the requested log

### 500 Internal Server Error
- Database connection issues
- Unexpected server errors

## Database Schema

The `errorlogs` collection stores documents with the following structure:

```javascript
{
  _id: ObjectId,
  userId: String,        // User ID from JWT token (optional)
  telegramId: String,    // Telegram ID from init data (optional)
  username: String,      // Username from authentication data (optional)
  logData: Object,       // The actual error log data (flexible structure)
  createdAt: Date,       // Automatically managed by MongoDB
  updatedAt: Date        // Automatically managed by MongoDB
}
```

## Indexes
The following indexes are created for optimal query performance:
- `userId` (ascending)
- `telegramId` (ascending)
- `createdAt` (descending)

## Usage Examples

### Frontend JavaScript Example
```javascript
// Save error log with JWT authentication
const saveErrorLog = async (errorData) => {
  try {
    const response = await fetch('/logger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        logData: errorData
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save error log');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error saving log:', error);
  }
};

// Retrieve error logs with pagination
const getErrorLogs = async (page = 1, limit = 10) => {
  try {
    const response = await fetch(`/logger?page=${page}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to retrieve error logs');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error retrieving logs:', error);
  }
};
```

### Telegram Bot Example
```javascript
// Save error log with Telegram authentication
const saveErrorLogTelegram = async (errorData, telegramInitData) => {
  try {
    const response = await fetch('/logger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-init-data': telegramInitData
      },
      body: JSON.stringify({
        logData: errorData
      })
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error saving log:', error);
  }
};
```

## Security Considerations

1. **User Isolation**: Each user can only access their own error logs
2. **Authentication Required**: All endpoints require valid authentication
3. **Input Validation**: All input data is validated using DTOs
4. **Rate Limiting**: Consider implementing rate limiting for production use
5. **Data Sanitization**: Log data is stored as-is, ensure sensitive data is not logged

## Dependencies

- `@nestjs/common`
- `@nestjs/mongoose`
- `mongoose`
- `class-validator`
- `class-transformer`
- Custom authentication guards and services