import { APP_URL } from './resend';

export interface VerificationEmailProps {
  name: string;
  verificationToken: string;
}

export function getVerificationEmailHtml({ name, verificationToken }: VerificationEmailProps): string {
  const verificationUrl = `${APP_URL}/api/auth/verify-email?token=${verificationToken}`;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Bestätige deine E-Mail-Adresse</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f9f9f9;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            padding: 20px 0;
            background: linear-gradient(to right, #6d28d9, #8b5cf6);
            margin: -20px -20px 20px;
            border-radius: 8px 8px 0 0;
          }
          .header h1 {
            color: white;
            margin: 0;
            font-size: 24px;
          }
          .content {
            padding: 20px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background: linear-gradient(to right, #6d28d9, #8b5cf6);
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 12px;
            color: #666;
          }
          .link-note {
            margin-top: 15px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>AI Ad Generator</h1>
          </div>
          <div class="content">
            <p>Hallo ${name},</p>
            <p>vielen Dank für deine Registrierung bei AI Ad Generator. Bitte bestätige deine E-Mail-Adresse, indem du auf den untenstehenden Button klickst:</p>
            
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">E-Mail-Adresse bestätigen</a>
            </div>
            
            <p>Dieser Link ist 24 Stunden gültig.</p>
            
            <p>Falls du dich nicht für ein Konto bei AI Ad Generator registriert hast, kannst du diese E-Mail ignorieren.</p>
            
            <div class="link-note">
              Falls der Button nicht funktioniert, kopiere bitte diesen Link in deinen Browser:<br>
              <a href="${verificationUrl}">${verificationUrl}</a>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} AI Ad Generator. Alle Rechte vorbehalten.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function getVerificationEmailText({ name, verificationToken }: VerificationEmailProps): string {
  const verificationUrl = `${APP_URL}/api/auth/verify-email?token=${verificationToken}`;
  
  return `
Hallo ${name},

Vielen Dank für deine Registrierung bei AI Ad Generator. 

Bitte bestätige deine E-Mail-Adresse, indem du auf den folgenden Link klickst:
${verificationUrl}

Dieser Link ist 24 Stunden gültig.

Falls du dich nicht für ein Konto bei AI Ad Generator registriert hast, kannst du diese E-Mail ignorieren.

© ${new Date().getFullYear()} AI Ad Generator. Alle Rechte vorbehalten.
  `;
} 