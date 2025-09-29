/**
 * Simple Test for Shared-With-Me Endpoint
 * Quick test to verify the enhanced functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Simple test function
async function testEndpoint() {
  console.log('🧪 Testing Shared-With-Me Endpoint');
  console.log('=' .repeat(40));
  
  try {
    // Test without authentication first to see the structure
    const response = await axios.get(`${BASE_URL}/passwords/shared-with-me`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Request successful');
    console.log('📊 Status:', response.status);
    console.log('📋 Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log('❌ Request failed');
    
    if (error.response) {
      console.log('📊 Status:', error.response.status);
      console.log('🚨 Error:', JSON.stringify(error.response.data, null, 2));
      
      // If it's an auth error, that's expected
      if (error.response.status === 401) {
        console.log('ℹ️  Authentication required (expected behavior)');
      }
    } else {
      console.log('🚨 Network Error:', error.message);
    }
  }
}

// Test with a sample token (you can replace this with a real token)
async function testWithSampleAuth() {
  console.log('\n🧪 Testing with Sample Authorization');
  console.log('=' .repeat(40));
  
  try {
    const response = await axios.get(`${BASE_URL}/passwords/shared-with-me`, {
      headers: {
        'Authorization': 'Bearer sample_token',
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Request successful');
    console.log('📋 Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log('❌ Request failed (expected with sample token)');
    console.log('📊 Status:', error.response?.status);
    console.log('🚨 Error:', error.response?.data?.message || error.message);
  }
}

// Run tests
async function runSimpleTest() {
  console.log('🚀 Starting Simple Shared-With-Me Test');
  console.log('=' .repeat(50));
  
  await testEndpoint();
  await testWithSampleAuth();
  
  console.log('\n📝 Next Steps:');
  console.log('1. If you see authentication errors, that\'s normal');
  console.log('2. Use a real JWT token or Telegram init data for full testing');
  console.log('3. Check that the endpoint structure includes the new sharedBy field');
}

runSimpleTest().catch(console.error);