import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface EmailPayload {
  user: {
    email: string;
    user_metadata: {
      locale?: string;
      full_name?: string;
    };
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: "signup" | "recovery" | "invite" | "magiclink" | "email_change_current" | "email_change_new";
    site_url: string;
    token_new: string;
    token_hash_new: string;
  };
}

const translations = {
  en: {
    signup: {
      subject: "Confirm your signup",
      heading: "Welcome to Spark Vertex!",
      button: "Confirm your email",
      text: "Follow this link to confirm your user:"
    },
    recovery: {
      subject: "Reset Password",
      heading: "Reset Password",
      button: "Reset Password",
      text: "Follow this link to reset the password for your user:"
    }
  },
  zh: {
    signup: {
      subject: "确认您的注册",
      heading: "欢迎来到 Spark Vertex!",
      button: "确认您的邮箱",
      text: "请点击下方链接确认您的注册："
    },
    recovery: {
      subject: "重置密码",
      heading: "重置密码",
      button: "重置密码",
      text: "请点击下方链接重置您的密码："
    }
  }
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload: EmailPayload = await req.json();
    const { user, email_data } = payload;
    
    // 1. Determine Locale
    // Priority: User Metadata -> URL Param in redirect_to -> Default 'en'
    let locale = user.user_metadata?.locale || 'en';
    
    // Fallback: Check if redirect_to has lang param (e.g. for password reset initiated from a specific page)
    if (email_data.redirect_to) {
        const url = new URL(email_data.redirect_to);
        const langParam = url.searchParams.get('lang');
        if (langParam === 'zh' || langParam === 'en') {
            locale = langParam;
        }
    }

    // Ensure valid locale
    const lang = (locale === 'zh' ? 'zh' : 'en') as keyof typeof translations;
    const t = translations[lang];

    // 2. Construct Link
    // Supabase sends the token. We need to construct the link that the user clicks.
    // Usually: {{ .SiteURL }}/auth/v1/verify?token={{ .Token }}&type=signup&redirect_to={{ .RedirectTo }}
    // But for Custom SMTP, we construct it manually.
    // IMPORTANT: We must encode the redirect_to parameter because it contains query parameters (?lang=...)
    // FIX: We also need to append the API Key because hitting the Supabase API directly requires it.
    // FIX: Use SUPABASE_URL (API URL) instead of site_url (Frontend URL) for the verify endpoint.
    // UPDATE: To solve VPN issues in China and Redirect issues, we now point to our own Next.js API route.
    // This route (/api/auth/verify) will handle the verification server-side and redirect the user.
    
    // Robust way to determine the frontend origin from redirect_to
    // This ensures we point to the actual frontend (localhost or production) and not the Supabase API URL
    let frontendOrigin = '';
    try {
        if (email_data.redirect_to) {
            const url = new URL(email_data.redirect_to);
            frontendOrigin = url.origin;
        }
    } catch (e) {
        console.error('Error parsing redirect_to:', e);
    }
    
    if (!frontendOrigin) {
        // Fallback to site_url if redirect_to is missing or invalid
        frontendOrigin = email_data.site_url;
    }
    
    // Remove trailing slash
    frontendOrigin = frontendOrigin.replace(/\/$/, '');
    
    // We use token_hash for secure verification
    const verifyUrl = `${frontendOrigin}/api/auth/verify?token_hash=${email_data.token_hash}&type=${email_data.email_action_type}&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;

    // 3. Select Content based on Action Type
    let subject = "";
    let htmlContent = "";

    if (email_data.email_action_type === "signup") {
        subject = t.signup.subject;
        htmlContent = `
          <h2>${t.signup.heading}</h2>
          <p>${t.signup.text}</p>
          <a href="${verifyUrl}" style="background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">${t.signup.button}</a>
        `;
    } else if (email_data.email_action_type === "recovery") {
        subject = t.recovery.subject;
        htmlContent = `
          <h2>${t.recovery.heading}</h2>
          <p>${t.recovery.text}</p>
          <a href="${verifyUrl}" style="background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">${t.recovery.button}</a>
        `;
    } else {
        // Fallback for other types
        subject = "Spark Vertex Notification";
        htmlContent = `<p>Please click the link below:</p><a href="${verifyUrl}">Verify</a>`;
    }

    console.log(`Sending ${email_data.email_action_type} email to ${user.email} in ${lang}`);

    // 4. Send Email (using Resend as an example)
    if (RESEND_API_KEY) {
        // IMPORTANT: You must verify a domain in Resend to send from it.
        // For testing without a domain, use 'onboarding@resend.dev'
        // Once you have a domain, change this to 'noreply@yourdomain.com'
        const fromEmail = "noreply@sparkvertex.com"; 
        
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: `Spark Vertex <${fromEmail}>`, 
                to: user.email,
                subject: subject,
                html: htmlContent,
            }),
        });

        if (!res.ok) {
            const error = await res.text();
            console.error("Resend API Error:", error);
            // Return 500 so Supabase knows it failed, but include details
            return new Response(JSON.stringify({ error: `Resend Error: ${error}` }), { status: 500 });
        }
    } else {
        console.log("RESEND_API_KEY not set. Logging email content:");
        console.log("Subject:", subject);
        console.log("HTML:", htmlContent);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error handling email hook:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
