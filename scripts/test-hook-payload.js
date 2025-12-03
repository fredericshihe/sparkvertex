// const fetch = require('node-fetch'); // Use built-in fetch

const FUNCTION_URL = "https://waesizzoqodntrlvrwhw.supabase.co/functions/v1/send-auth-email";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!ANON_KEY) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Please set it in your environment variables.");
  process.exit(1);
}

const payload = {
  "user": {
    "id": "12345678-1234-1234-1234-123456789012",
    "aud": "authenticated",
    "role": "authenticated",
    "email": "test_hook_payload@example.com",
    "email_confirmed_at": null,
    "phone": "",
    "confirmation_sent_at": "2025-12-03T00:00:00Z",
    "confirmed_at": null,
    "recovery_sent_at": null,
    "last_sign_in_at": null,
    "app_metadata": {
      "provider": "email",
      "providers": [
        "email"
      ]
    },
    "user_metadata": {
      "full_name": "Test User",
      "locale": "zh"
    },
    "identities": [],
    "created_at": "2025-12-03T00:00:00Z",
    "updated_at": "2025-12-03T00:00:00Z"
  },
  "email_data": {
    "token": "123456",
    "token_hash": "abcdef123456",
    "redirect_to": "http://localhost:3000/welcome",
    "email_action_type": "signup",
    "site_url": "http://localhost:3000",
    "token_new": "123456",
    "token_hash_new": "abcdef123456"
  }
};

async function testHook() {
  console.log("Testing Hook URL:", FUNCTION_URL);
  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`
      },
      body: JSON.stringify(payload)
    });

    console.log("Status:", response.status);
    const text = await response.text();
    console.log("Response:", text);
  } catch (error) {
    console.error("Error:", error);
  }
}

testHook();
