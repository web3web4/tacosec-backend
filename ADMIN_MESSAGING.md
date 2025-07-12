# Admin Messaging

This guide explains how to send messages from regular users to admins via the bot.

## How It Works

### 1. Admin Identification
Admin users are identified through the `role` field in the database:
- Regular users: `role: 'user'`
- Admin users: `role: 'admin'`

### 2. Sending Messages to Admin

#### Send to All Admins
```
POST /telegram/send-to-admin
```

#### Send to Specific Admin
```
POST /telegram/send-to-specific-admin
```

#### Headers
```
Content-Type: application/json
X-Telegram-Init-Data: [telegram_init_data]
```

#### Request Body
```json
{
  "message": "Message text to send to admin",
  "subject": "Message subject (optional)"
}
```

#### Response for Sending to All Admins
```json
{
  "success": true,
  "adminCount": 2
}
```

#### Response for Sending to Specific Admin
```json
{
  "success": true,
  "adminTelegramId": "123456789"
}
```

### 3. Usage Examples

#### JavaScript/TypeScript
```javascript
const sendMessageToAdmin = async (message, subject = null) => {
  try {
    const response = await fetch('/telegram/send-to-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': window.Telegram.WebApp.initData
      },
      body: JSON.stringify({
        message: message,
        subject: subject
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`Message sent to ${result.adminCount} admins`);
    } else {
      console.log('Failed to send message');
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
};

// Usage for sending to all admins
sendMessageToAdmin('Hello, I need help using the application', 'Help Request');

// Function for sending to specific admin
const sendMessageToSpecificAdmin = async (message, subject = null) => {
  try {
    const response = await fetch('/telegram/send-to-specific-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': window.Telegram.WebApp.initData
      },
      body: JSON.stringify({
        message: message,
        subject: subject
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`Message sent to admin: ${result.adminTelegramId}`);
    } else {
      console.log('Failed to send message');
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
};

// Usage for sending to specific admin
sendMessageToSpecificAdmin('Hello, I need urgent help', 'Urgent Help Request');
```

#### cURL

##### For Sending to All Admins
```bash
curl -X POST "http://localhost:3000/telegram/send-to-admin" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Init-Data: [your_telegram_init_data]" \
  -d '{
    "message": "Hello, I need help",
    "subject": "Help Request"
  }'
```

##### For Sending to Specific Admin
```bash
curl -X POST "http://localhost:3000/telegram/send-to-specific-admin" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Init-Data: [your_telegram_init_data]" \
  -d '{
    "message": "Hello, I need urgent help",
    "subject": "Urgent Help Request"
  }'
```

## Message Format Sent to Admin

When a user sends a message to admin, it is formatted as follows:

```
🆘 Support Request

👤 User: [First Name] [Last Name]
🪪 Telegram Username: [username]
🆔 Telegram ID: [telegram_id]
📋 Subject: [Subject] (if specified)
💬 Message:
[Message text]

⏰ Date: [Date and time]
```

The message supports both Arabic and English languages, and users can send messages in either language.

## Admin User Setup

### Setting Up Admin in Database
To make a user an admin, you need to update the `role` field in the database:

```javascript
// MongoDB
db.users.updateOne(
  { telegramId: "123456789" },
  { $set: { role: "admin" } }
);
```

### Setting Up Specific Admin (for New API)
To use the specific admin messaging API, you need to add `ADMIN_TELEGRAM_ID` in the `.env` file:

```env
# Admin Telegram ID for direct messaging
ADMIN_TELEGRAM_ID=123456789
```

**Important Note**: 
- You must replace `123456789` with the actual Telegram ID of the admin
- You can get the Telegram ID through bots like `@userinfobot`
- The admin must have previously started a conversation with the bot to enable message sending

## Limits and Constraints

- **Message Length**: Maximum 4000 characters
- **Subject Length**: Maximum 200 characters
- **Authentication**: User must be authenticated via Telegram
- **Active Users Only**: Messages are sent only to active admins (`isActive: true`)

## Troubleshooting

### For Sending to All Admins

#### No Admins in System
```json
{
  "success": false,
  "adminCount": 0
}
```

### For Sending to Specific Admin

#### ADMIN_TELEGRAM_ID Not Set
```json
{
  "success": false
}
```
**Solution**: Make sure to add `ADMIN_TELEGRAM_ID` in the `.env` file

#### Failed to Send Message to Specific Admin
```json
{
  "success": false
}
```
**Possible Causes**:
- Incorrect Telegram ID
- Admin has not started a conversation with the bot
- Bot is blocked by the admin

### General Issues

#### Failed to Send Message
- Check the validity of `TELEGRAM_BOT_TOKEN`
- Make sure the bot can send messages to admins
- Verify that admins have started a conversation with the bot

### Authentication Error
- Make sure `X-Telegram-Init-Data` is valid
- Verify that the user is registered in the system

## Security

- Telegram data is validated before sending the message
- All sending attempts are logged
- Unauthenticated users cannot send messages
- Message length is limited to prevent abuse