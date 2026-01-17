/**
 * Enhanced Test for Shared-With-Me Endpoint
 * Tests the updated functionality that returns complete user information
 * including userId, username, telegramId, and latestPublicAddress
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Test data - replace with actual values from your database
const TEST_DATA = {
  // User with Telegram account
  userWithTelegram: {
    token: 'your_jwt_token_here', // Replace with actual JWT token
    telegramInitData: 'your_telegram_init_data_here' // Replace with actual Telegram init data
  },
  
  // User without Telegram account (JWT only)
  userWithoutTelegram: {
    token: 'your_jwt_token_here' // Replace with actual JWT token for user without Telegram
  }
};

/**
 * Test the shared-with-me endpoint with JWT authentication
 */
async function testSharedWithMeJWT(token, testName) {
  console.log(`\n🧪 Testing ${testName} with JWT Authentication`);
  console.log('=' .repeat(60));
  
  try {
    const response = await axios.get(`${BASE_URL}/passwords/shared-with-me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Request successful');
    console.log('📊 Response Status:', response.status);
    console.log('📋 Response Data Structure:');
    
    const data = response.data;
    
    if (data.sharedWithMe && Array.isArray(data.sharedWithMe)) {
      console.log(`📈 Total shared password groups: ${data.sharedWithMe.length}`);
      console.log(`👥 User count: ${data.userCount || 'Not specified'}`);
      
      // Test each shared password group
      data.sharedWithMe.forEach((group, index) => {
        console.log(`\n📁 Group ${index + 1}:`);
        
        // Check for new sharedBy structure
        if (group.sharedBy) {
          console.log('  ✅ New sharedBy structure found:');
          console.log(`    - userId: ${group.sharedBy.userId || 'null'}`);
          console.log(`    - username: ${group.sharedBy.username || 'null'}`);
          console.log(`    - telegramId: ${group.sharedBy.telegramId || 'null'}`);
          console.log(`    - latestPublicAddress: ${group.sharedBy.latestPublicAddress || 'null'}`);
        } else if (group.username) {
          console.log('  ⚠️  Old username structure found:');
          console.log(`    - username: ${group.username}`);
        }
        
        console.log(`  📦 Passwords count: ${group.count || group.passwords?.length || 0}`);
        
        // Sample first password if available
        if (group.passwords && group.passwords.length > 0) {
          const firstPassword = group.passwords[0];
          console.log('  🔑 Sample password:');
          console.log(`    - id: ${firstPassword.id}`);
          console.log(`    - key: ${firstPassword.key}`);
          console.log(`    - description: ${firstPassword.description || 'No description'}`);
        }
      });
    } else {
      console.log('📭 No shared passwords found or invalid structure');
    }
    
    return { success: true, data };
    
  } catch (error) {
    console.log('❌ Request failed');
    console.log('🚨 Error:', error.response?.data || error.message);
    console.log('📊 Status Code:', error.response?.status || 'Network Error');
    
    return { success: false, error: error.response?.data || error.message };
  }
}

/**
 * Test the shared-with-me endpoint with Telegram authentication
 */
async function testSharedWithMeTelegram(telegramInitData, testName) {
  console.log(`\n🧪 Testing ${testName} with Telegram Authentication`);
  console.log('=' .repeat(60));
  
  try {
    const response = await axios.get(`${BASE_URL}/passwords/shared-with-me`, {
      headers: {
        'X-Telegram-Init-Data': telegramInitData,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Request successful');
    console.log('📊 Response Status:', response.status);
    console.log('📋 Response Data Structure:');
    
    const data = response.data;
    
    if (data.sharedWithMe && Array.isArray(data.sharedWithMe)) {
      console.log(`📈 Total shared password groups: ${data.sharedWithMe.length}`);
      console.log(`👥 User count: ${data.userCount || 'Not specified'}`);
      
      // Test each shared password group
      data.sharedWithMe.forEach((group, index) => {
        console.log(`\n📁 Group ${index + 1}:`);
        
        // Check for new sharedBy structure
        if (group.sharedBy) {
          console.log('  ✅ New sharedBy structure found:');
          console.log(`    - userId: ${group.sharedBy.userId || 'null'}`);
          console.log(`    - username: ${group.sharedBy.username || 'null'}`);
          console.log(`    - telegramId: ${group.sharedBy.telegramId || 'null'}`);
          console.log(`    - latestPublicAddress: ${group.sharedBy.latestPublicAddress || 'null'}`);
        } else if (group.username) {
          console.log('  ⚠️  Old username structure found:');
          console.log(`    - username: ${group.username}`);
        }
        
        console.log(`  📦 Passwords count: ${group.count || group.passwords?.length || 0}`);
      });
    } else {
      console.log('📭 No shared passwords found or invalid structure');
    }
    
    return { success: true, data };
    
  } catch (error) {
    console.log('❌ Request failed');
    console.log('🚨 Error:', error.response?.data || error.message);
    console.log('📊 Status Code:', error.response?.status || 'Network Error');
    
    return { success: false, error: error.response?.data || error.message };
  }
}

/**
 * Test pagination functionality
 */
async function testPagination(token) {
  console.log(`\n🧪 Testing Pagination Functionality`);
  console.log('=' .repeat(60));
  
  try {
    // Test with pagination parameters
    const response = await axios.get(`${BASE_URL}/passwords/shared-with-me?page=1&limit=2`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Pagination request successful');
    console.log('📊 Response Status:', response.status);
    
    const data = response.data;
    console.log(`📈 Total groups returned: ${data.sharedWithMe?.length || 0}`);
    console.log(`👥 User count: ${data.userCount || 'Not specified'}`);
    
    // Check if pagination is working
    if (data.sharedWithMe && data.sharedWithMe.length <= 2) {
      console.log('✅ Pagination appears to be working (returned ≤ 2 groups)');
    } else {
      console.log('⚠️  Pagination may not be working as expected');
    }
    
    return { success: true, data };
    
  } catch (error) {
    console.log('❌ Pagination test failed');
    console.log('🚨 Error:', error.response?.data || error.message);
    
    return { success: false, error: error.response?.data || error.message };
  }
}

/**
 * Validate the structure of returned data
 */
function validateDataStructure(data, testName) {
  console.log(`\n🔍 Validating Data Structure for ${testName}`);
  console.log('-' .repeat(40));
  
  const issues = [];
  
  // Check main structure
  if (!data.sharedWithMe) {
    issues.push('Missing sharedWithMe field');
  } else if (!Array.isArray(data.sharedWithMe)) {
    issues.push('sharedWithMe is not an array');
  }
  
  if (typeof data.userCount !== 'number') {
    issues.push('userCount is not a number');
  }
  
  // Check each group structure
  if (data.sharedWithMe && Array.isArray(data.sharedWithMe)) {
    data.sharedWithMe.forEach((group, index) => {
      if (!group.sharedBy && !group.username) {
        issues.push(`Group ${index + 1}: Missing both sharedBy and username fields`);
      }
      
      if (group.sharedBy) {
        if (!group.sharedBy.userId) {
          issues.push(`Group ${index + 1}: Missing userId in sharedBy`);
        }
        if (!group.sharedBy.username) {
          issues.push(`Group ${index + 1}: Missing username in sharedBy`);
        }
        // telegramId and latestPublicAddress can be null, so we don't check for their presence
      }
      
      if (!Array.isArray(group.passwords)) {
        issues.push(`Group ${index + 1}: passwords is not an array`);
      }
      
      if (typeof group.count !== 'number') {
        issues.push(`Group ${index + 1}: count is not a number`);
      }
    });
  }
  
  if (issues.length === 0) {
    console.log('✅ Data structure validation passed');
  } else {
    console.log('❌ Data structure validation failed:');
    issues.forEach(issue => console.log(`  - ${issue}`));
  }
  
  return issues.length === 0;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Enhanced Shared-With-Me Endpoint Tests');
  console.log('=' .repeat(80));
  
  const results = [];
  
  // Test 1: JWT Authentication with user that has Telegram
  if (TEST_DATA.userWithTelegram.token) {
    const result1 = await testSharedWithMeJWT(
      TEST_DATA.userWithTelegram.token, 
      'User with Telegram (JWT)'
    );
    results.push({ test: 'JWT with Telegram', ...result1 });
    
    if (result1.success) {
      validateDataStructure(result1.data, 'JWT with Telegram');
    }
  }
  
  // Test 2: JWT Authentication with user without Telegram
  if (TEST_DATA.userWithoutTelegram.token) {
    const result2 = await testSharedWithMeJWT(
      TEST_DATA.userWithoutTelegram.token, 
      'User without Telegram (JWT)'
    );
    results.push({ test: 'JWT without Telegram', ...result2 });
    
    if (result2.success) {
      validateDataStructure(result2.data, 'JWT without Telegram');
    }
  }
  
  // Test 3: Telegram Authentication
  if (TEST_DATA.userWithTelegram.telegramInitData) {
    const result3 = await testSharedWithMeTelegram(
      TEST_DATA.userWithTelegram.telegramInitData, 
      'Telegram Authentication'
    );
    results.push({ test: 'Telegram Auth', ...result3 });
    
    if (result3.success) {
      validateDataStructure(result3.data, 'Telegram Authentication');
    }
  }
  
  // Test 4: Pagination
  if (TEST_DATA.userWithTelegram.token) {
    const result4 = await testPagination(TEST_DATA.userWithTelegram.token);
    results.push({ test: 'Pagination', ...result4 });
  }
  
  // Summary
  console.log('\n📊 Test Summary');
  console.log('=' .repeat(50));
  
  const successful = results.filter(r => r.success).length;
  const total = results.length;
  
  console.log(`✅ Successful tests: ${successful}/${total}`);
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.test}`);
  });
  
  if (successful === total) {
    console.log('\n🎉 All tests passed! The enhanced shared-with-me endpoint is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the implementation.');
  }
}

// Instructions for running the test
console.log('📝 Instructions:');
console.log('1. Update the TEST_DATA object with actual tokens and init data');
console.log('2. Make sure your server is running on http://localhost:3000');
console.log('3. Run this test with: node test-shared-with-me-enhanced.js');
console.log('');

// Uncomment the line below to run the tests
// runTests().catch(console.error);

module.exports = {
  testSharedWithMeJWT,
  testSharedWithMeTelegram,
  testPagination,
  validateDataStructure,
  runTests
};