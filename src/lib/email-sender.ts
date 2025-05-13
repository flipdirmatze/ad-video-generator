import { resend, EMAIL_FROM } from './resend';
import { getVerificationEmailHtml, getVerificationEmailText, VerificationEmailProps } from './email-templates';

interface SendVerificationEmailOptions extends VerificationEmailProps {
  email: string;
}

/**
 * Sendet eine E-Mail zur Verifizierung der E-Mail-Adresse.
 * @param options Die Optionen für die E-Mail (E-Mail-Adresse, Name, Verifizierungstoken)
 * @returns Die Resend-Antwort oder einen Fehler
 */
export async function sendVerificationEmail({ 
  email, 
  name, 
  verificationToken 
}: SendVerificationEmailOptions) {
  try {
    const data = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Bestätige deine E-Mail-Adresse für AI Ad Generator',
      html: getVerificationEmailHtml({ name, verificationToken }),
      text: getVerificationEmailText({ name, verificationToken }),
    });
    
    console.log('Verification email sent:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Error sending verification email:', error);
    return { success: false, error };
  }
} 