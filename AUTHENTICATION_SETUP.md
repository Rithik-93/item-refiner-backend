# Zoho Authentication Setup (File-based)

## Problem
You're getting a 401 "You are not authorized to perform this operation" error because the application is missing the `zoho_tokens.json` file, which is required for API authentication.

## Solution: Create the `zoho_tokens.json` file
The application uses a file called `zoho_tokens.json` to store and automatically refresh your API credentials. You can generate this file easily using the provided setup script.

### Step 1: Get your Zoho Credentials
Before running the script, you need to gather four pieces of information from your Zoho account.

#### 1. Client ID & Client Secret
1. Go to the [Zoho Developer Console](https://api-console.zoho.com/).
2. Create a new **Server-based Application**.
3. Fill in the required details and use `https://www.zoho.com/books/oauthredirect` as the **Redirect URI**.
4. After creation, you will get your **Client ID** and **Client Secret**. Keep these handy.

#### 2. Organization ID
1. Log into [Zoho Books](https://www.zoho.com/books/).
2. Click on **Settings** -> **Organization Profile**.
3. Your **Organization ID** will be listed there. Copy it.

#### 3. Grant Token (for one-time use)
1. In your browser, construct and visit the following URL. **Remember to replace `YOUR_CLIENT_ID`** with the ID you got in step 1.
   ```
   https://accounts.zoho.com/oauth/v2/auth?scope=ZohoBooks.fullaccess.all&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=https://www.zoho.com/books/oauthredirect
   ```
2. Authorize the application. You will be redirected to a new URL containing a `code=` parameter.
3. The value of this `code` parameter is your **Grant Token**. It is a long string and is only valid for a few minutes. **Copy it immediately.**

### Step 2: Run the Setup Script
Now that you have all four credentials, you can create your token file.

1. **Start the server:**
   ```bash
   bun dev
   ```

2. **In a new terminal, run the setup script:**
   ```bash
   node setup.js
   ```

3. **Follow the prompts**, entering the Client ID, Client Secret, Grant Token, and Organization ID when requested.

4. **The script will create a `zoho_tokens.json` file** in your project root.

### Step 3: Verify and Run
1. After the setup is complete, you can stop and restart the server if you wish.
2. The application will now automatically use the tokens from `zoho_tokens.json` for all API calls.
3. The access token will be automatically refreshed and rewritten to the file whenever it expires.
4. You should now be able to use the `/api/detect-duplicates` endpoint without any 401 errors.

## Security Note
*   Never commit your `zoho_tokens.json` file to version control. It contains sensitive credentials. Make sure it is listed in your `.gitignore` file.
*   The Grant Token is for one-time use only and expires quickly.
