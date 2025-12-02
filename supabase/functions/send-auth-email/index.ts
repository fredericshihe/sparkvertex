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
    console.log("Received payload for:", payload.user?.email);
    
    // Prepare the email sending task
    const sendEmailTask = async () => {
        try {
            const { user, email_data } = payload;
            
            // 1. Determine Locale
            let locale = user.user_metadata?.locale || 'en';
            
            if (email_data.redirect_to) {
                try {
                    const url = new URL(email_data.redirect_to);
                    const langParam = url.searchParams.get('lang');
                    if (langParam === 'zh' || langParam === 'en') {
                        locale = langParam;
                    }
                } catch (e) {
                    console.warn("Invalid URL in redirect_to, skipping lang detection from URL:", email_data.redirect_to);
                }
            }

            const lang = (locale === 'zh' ? 'zh' : 'en') as keyof typeof translations;
            const t = translations[lang];

            // 2. Construct Link
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
                frontendOrigin = email_data.site_url;
            }
            
            frontendOrigin = frontendOrigin.replace(/\/$/, '');
            
            const verifyUrl = `${frontendOrigin}/api/auth/verify?token_hash=${email_data.token_hash}&type=${email_data.email_action_type}&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;

            // 3. Select Content
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
                subject = "Spark Vertex Notification";
                htmlContent = `<p>Please click the link below:</p><a href="${verifyUrl}">Verify</a>`;
            }

            console.log(`Sending ${email_data.email_action_type} email to ${user.email} in ${lang}`);

            // 4. Send Email
            const apiKey = RESEND_API_KEY ? RESEND_API_KEY.trim() : "";
            
            if (apiKey) {
                const fromEmail = "noreply@sparkvertex.com";
                console.log(`Attempting to send email from ${fromEmail} to ${user.email}`);
                
                const res = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        from: `Spark Vertex <${fromEmail}>`, 
                        to: user.email,
                        subject: subject,
                        html: htmlContent,
                    }),
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    console.error(`Resend API Error (${res.status}):`, errorText);
                } else {
                    console.log("Email sent successfully via Resend");
                }
            } else {
                console.log("RESEND_API_KEY not set. Logging email content:");
                console.log("Subject:", subject);
                console.log("HTML:", htmlContent);
            }
        } catch (err) {
            console.error("Background email task failed:", err);
        }
    };

    // Use EdgeRuntime.waitUntil to run in background without blocking the response
    // @ts-ignore
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        console.log("Using EdgeRuntime.waitUntil for background email sending");
        // @ts-ignore
        EdgeRuntime.waitUntil(sendEmailTask());
    } else {
        console.warn("EdgeRuntime.waitUntil not available, running without await (might be killed)");
        sendEmailTask();
    }

    // Return success immediately to Supabase Auth
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });

  } catch (error: any) {
    console.error("Error handling email hook:", error);
    // Always return 200 to prevent blocking auth
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
  }
});
