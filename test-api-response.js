// Simple test to verify the API response includes latestPublicAddress
const axios = require('axios');

// This is a simple test script to verify the API response
// You can run this after starting the server to test the new functionality

async function testSearchUsersAPI() {
  try {
    // Replace with actual telegram init data and query
    const response = await axios.get('http://localhost:3000/users/search/autocomplete', {
      params: {
        query: 'test',
        limit: 5
      },
      headers: {
        'x-telegram-init-data': 'your-telegram-init-data-here'
      }
    });
    
    console.log('API Response:', JSON.stringify(response.data, null, 2));
    
    // Check if latestPublicAddress field is present
    if (response.data.data && response.data.data.length > 0) {
      const firstUser = response.data.data[0];
      if ('latestPublicAddress' in firstUser) {
        console.log('✅ latestPublicAddress field is present in the response');
      } else {
        console.log('❌ latestPublicAddress field is missing from the response');
      }
    }
    
  } catch (error) {
    console.error('Error testing API:', error.message);
  }
}

// Uncomment the line below to run the test
// testSearchUsersAPI();

console.log('Test script created. Update with real telegram init data and uncomment the last line to run.');