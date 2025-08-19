import axios from 'axios';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  client_id: string;
  client_secret: string;
}

const TOKENS_FILE = 'zoho_tokens.json';

// Save tokens to file
function saveTokens(tokens: StoredTokens): void {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  console.log('Tokens saved successfully to zoho_tokens.json');
}

// Load tokens from file
function loadTokens(): StoredTokens | null {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('Error loading tokens:', error);
  }
  return null;
}

// Check if access token is still valid (with 5 minute buffer)
function isTokenValid(tokens: StoredTokens): boolean {
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  return tokens.expires_at > (now + bufferTime);
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  api_domain: string;
}

// Refresh access token using refresh token
async function refreshAccessToken(tokens: StoredTokens): Promise<string> {
  try {
    const postData = new URLSearchParams({
      client_id: tokens.client_id,
      client_secret: tokens.client_secret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token
    });

    console.log('Refreshing access token...');

    const response = await axios.post<TokenResponse>(
      'https://accounts.zoho.com/oauth/v2/token',
      postData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (response.data.access_token) {
      // Update stored tokens with new access token
      const updatedTokens: StoredTokens = {
        ...tokens,
        access_token: response.data.access_token,
        expires_at: Date.now() + (response.data.expires_in * 1000)
      };
      
      saveTokens(updatedTokens);
      console.log('Access token refreshed and saved successfully!');
      return response.data.access_token;
    } else {
      throw new Error('No access token in refresh response');
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log('Refresh error response:', JSON.stringify(error.response?.data, null, 2));
      const errorDetail = error.response?.data?.error_description || error.response?.data?.error || error.message;
      throw new Error(`Token refresh failed: ${errorDetail}`);
    }
    throw new Error(`Token refresh failed: ${error}`);
  }
}

interface ZohoConfig {
  client_id: string;
  client_secret: string;
  organization_id: string;
}

// Get access token using grant token (first time setup)
async function getInitialTokens(config: ZohoConfig & { grant_token: string }): Promise<StoredTokens> {
  try {
    const postData = new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      grant_type: 'authorization_code',
      code: config.grant_token
    });

    console.log('Getting initial tokens with grant token...');

    const response = await axios.post<TokenResponse>(
      'https://accounts.zoho.com/oauth/v2/token',
      postData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (response.data.access_token && response.data.refresh_token) {
      const tokens: StoredTokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + (response.data.expires_in * 1000),
        client_id: config.client_id,
        client_secret: config.client_secret
      };
      
      saveTokens(tokens);
      console.log('Initial tokens obtained and saved successfully!');
      return tokens;
    } else {
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      throw new Error('Missing access_token or refresh_token in response');
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log('Error response:', JSON.stringify(error.response?.data, null, 2));
      const errorDetail = error.response?.data?.error_description || error.response?.data?.error || error.message;
      throw new Error(`Initial token request failed: ${errorDetail}`);
    }
    throw new Error(`Initial token request failed: ${error}`);
  }
}

// Setup function to initialize tokens with a grant token
export async function setupZohoAuth(clientId: string, clientSecret: string, grantToken: string, organizationId: string): Promise<void> {
  try {
    console.log('Setting up Zoho authentication...');
    
    const config: ZohoConfig & { grant_token: string } = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_token: grantToken,
      organization_id: organizationId
    };
    
    await getInitialTokens(config);
    console.log('Zoho authentication setup completed successfully!');
    
  } catch (error) {
    console.error('Failed to setup Zoho authentication:', error);
    throw error;
  }
}

/**
 * Fetches items from Zoho Books using Axios, handling pagination to retrieve all items.
 */
async function fetchZohoItems(accessToken: string, orgId: string) {
  console.log('Fetching all items from Zoho...');
  
  const allItems: any[] = [];
  let page = 1;
  const perPage = 1000; // Zoho API's max limit is 1000 items per page
  let hasMorePages = true;

  const url = 'https://www.zohoapis.com/books/v3/items';
  const headers = {
    'Authorization': `Zoho-oauthtoken ${accessToken}`
  };

  while (hasMorePages) {
    const params = {
      organization_id: orgId,
      per_page: perPage,
      page: page
    };

    try {
      console.log(`Fetching page ${page}...`);
      const response = await axios.get(url, { headers, params });

      if (response.data && response.data.items && response.data.items.length > 0) {
        allItems.push(...response.data.items);
        console.log(`Fetched ${response.data.items.length} items on this page. Total items so far: ${allItems.length}`);
      }

      if (response.data.page_context && response.data.page_context.has_more_page) {
        page++;
      } else {
        hasMorePages = false;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.message || error.message;
        const statusCode = error.response?.status;
        console.error(`Error fetching items (page ${page}, status ${statusCode}): ${errorMsg}`);
        throw new Error(`Zoho API Error (${statusCode}): ${errorMsg}`);
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error fetching items on page ${page}:`, errMsg);
        throw error;
      }
    }
  }

  console.log(`Finished fetching all items. Total: ${allItems.length}`);
  return allItems;
}

export async function getItems(organizationId?: string) {
  try {
    if (!organizationId) {
      throw new Error('Organization ID is required. Pass it as an argument or set ORGANIZATION_ID in your .env file.');
    }

    let tokens = loadTokens();
    if (!tokens) {
      throw new Error('No authentication tokens found. Please run the setup process first.');
    }
    
    let accessToken: string;

    // Check if token is valid, refresh if needed
    if (isTokenValid(tokens)) {
      console.log('Using existing valid access token from file.');
      accessToken = tokens.access_token;
    } else {
      console.log('Access token expired or invalid, refreshing...');
      accessToken = await refreshAccessToken(tokens);
    }
    
    const items = await fetchZohoItems(accessToken, organizationId);
    console.log('Items retrieved:', items.length);

    const projectedItems = (items || []).map((item: any) => ({
      item_name: item?.item_name ?? null,
      rate: item?.rate ?? null,
      unit: item?.unit ?? null
    }));

    return projectedItems;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMsg = error.response?.data?.message || error.message;
      const statusCode = error.response?.status;
      console.error(`Zoho API Error (${statusCode}): ${errorMsg}`);
    } else {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('Error:', errMsg);
    }
    return [];
  }
}
