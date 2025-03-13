// Fehlertypen von NextAuth
export const errorMessages: Record<string, string> = {
  Configuration: 'Es gibt ein Problem mit der Server-Konfiguration.',
  AccessDenied: 'Du hast keine Berechtigung, auf diese Ressource zuzugreifen.',
  Verification: 'Der Verifizierungslink ist ungültig oder abgelaufen.',
  OAuthSignin: 'Es gab ein Problem beim Starten des OAuth-Anmeldevorgangs.',
  OAuthCallback: 'Es gab ein Problem beim Verarbeiten des OAuth-Callbacks.',
  OAuthCreateAccount: 'Es gab ein Problem beim Erstellen eines Benutzerkontos mit dem OAuth-Provider.',
  EmailCreateAccount: 'Es gab ein Problem beim Erstellen deines Kontos mit der angegebenen E-Mail-Adresse.',
  Callback: 'Es gab ein Problem beim Callback-Prozess.',
  OAuthAccountNotLinked: 'Diese E-Mail-Adresse wird bereits mit einem anderen Konto verwendet.',
  EmailSignin: 'Es gab ein Problem beim Senden der E-Mail zur Anmeldung.',
  CredentialsSignin: 'Die Anmeldung ist fehlgeschlagen. Überprüfe, ob die von dir angegebenen Daten korrekt sind.',
  SessionRequired: 'Du musst angemeldet sein, um auf diese Seite zuzugreifen.',
  default: 'Es ist ein Authentifizierungsfehler aufgetreten.'
}; 