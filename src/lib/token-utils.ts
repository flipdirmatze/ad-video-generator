import crypto from 'crypto';

/**
 * Generiert einen zufälligen Token für die E-Mail-Verifizierung
 * @returns Ein zufälliger Token als String
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Berechnet das Ablaufdatum eines Tokens
 * @param hours Die Anzahl der Stunden, nach denen der Token ablaufen soll
 * @returns Das Ablaufdatum als Date-Objekt
 */
export function getTokenExpiryDate(hours: number = 24): Date {
  const expiryDate = new Date();
  expiryDate.setHours(expiryDate.getHours() + hours);
  return expiryDate;
} 