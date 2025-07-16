# Public Address in SharedWith - Test Documentation

## Overview
This document describes the implementation and testing of publicAddress support in the sharedWith functionality.

## Implementation Details

### Changes Made
1. **SharedWithDto**: Added optional `publicAddress` field
2. **PasswordService.addPassword**: Added Case 4 to handle publicAddress-only sharing
3. **PasswordService.updatePasswordWithAuth**: Added Case 4 to handle publicAddress-only sharing
4. **Dependencies**: Added PublicAddress model injection to PasswordService

### Logic Flow
When processing sharedWith array, the system now handles these cases:

1. **Case 1**: Both userId and username provided → Use userId, ignore username
2. **Case 2**: Only userId provided → Find username from userId
3. **Case 3**: Only username provided → Find userId from username
4. **Case 4**: Only publicAddress provided → Find user by public address
   - If user found: Add user's username and userId to sharedWith
   - If user not found: Keep only publicAddress in sharedWith

### API Behavior
- **Existing functionality**: Completely preserved - no breaking changes
- **New functionality**: When publicAddress is provided in sharedWith:
  - System checks if a user is associated with that address
  - If user exists: Automatically adds user info (username, userId) to database
  - If no user: Stores only the publicAddress

## Testing

### Test Case 1: PublicAddress with Associated User
```json
{
  "key": "test-secret",
  "value": "test-value",
  "description": "Test with publicAddress",
  "sharedWith": [
    {
      "publicAddress": "0x1234567890abcdef",
      "invited": false
    }
  ]
}
```

**Expected Result**: If user exists for this address, sharedWith in database will contain:
```json
{
  "username": "found_user",
  "userId": "user_object_id",
  "publicAddress": "0x1234567890abcdef",
  "invited": false
}
```

### Test Case 2: PublicAddress without Associated User
```json
{
  "key": "test-secret",
  "value": "test-value",
  "description": "Test with unknown publicAddress",
  "sharedWith": [
    {
      "publicAddress": "0xunknownaddress",
      "invited": false
    }
  ]
}
```

**Expected Result**: sharedWith in database will contain:
```json
{
  "publicAddress": "0xunknownaddress",
  "invited": false
}
```
(username and userId will be undefined)

### Test Case 3: Mixed SharedWith Array
```json
{
  "key": "test-secret",
  "value": "test-value",
  "description": "Test with mixed sharing",
  "sharedWith": [
    {
      "username": "existing_user",
      "invited": false
    },
    {
      "publicAddress": "0x1234567890abcdef",
      "invited": false
    }
  ]
}
```

**Expected Result**: Both entries processed according to their respective cases.

## Verification
- ✅ Build completed successfully
- ✅ No breaking changes to existing APIs
- ✅ PublicAddress support added to both create and update operations
- ✅ Backward compatibility maintained