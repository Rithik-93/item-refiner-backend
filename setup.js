const readline = require('readline');
const axios = require('axios');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupZoho() {
  console.log('🔧 Zoho Authentication Setup\n');
  console.log('This script will help you create the zoho_tokens.json file for authentication.\n');
  console.log('You will need:');
  console.log('1. Zoho Client ID');
  console.log('2. Zoho Client Secret');
  console.log('3. Zoho Grant Token (one-time use)');
  console.log('4. Zoho Organization ID\n');
  
  try {
    const clientId = await question('Enter your Zoho Client ID: ');
    const clientSecret = await question('Enter your Zoho Client Secret: ');
    const grantToken = await question('Enter your Zoho Grant Token: ');
    const organizationId = await question('Enter your Zoho Organization ID: ');
    
    console.log('\n🚀 Setting up authentication and creating token file...');
    
    const response = await axios.post('http://localhost:3001/api/setup-zoho', {
      clientId,
      clientSecret,
      grantToken,
      organizationId
    });
    
    console.log('✅ Setup successful!');
    console.log(response.data.message);
    console.log(response.data.note);
    console.log('\nYou can now run the duplicate detection server without authentication issues.');
    
  } catch (error) {
    if (error.response) {
      console.error('❌ Setup failed:', error.response.data.error);
      if (error.response.data.details) {
        console.error('Details:', error.response.data.details);
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ Cannot connect to server. Make sure the server is running on http://localhost:3001');
    } else {
      console.error('❌ Setup failed:', error.message);
    }
  } finally {
    rl.close();
  }
}

// Check if server is running first
async function checkServer() {
  try {
    await axios.get('http://localhost:3001/api/health');
    setupZoho();
  } catch (error) {
    console.error('❌ Server is not running. Please start the server first with:');
    console.error('   bun dev');
    console.error('\nThen run this setup script again.');
    rl.close();
  }
}

checkServer();
