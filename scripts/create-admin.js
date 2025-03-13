#!/usr/bin/env node

/**
 * Admin-Benutzer-Erstellungsskript
 * 
 * Dieses Skript erstellt einen Admin-Benutzer in der Datenbank.
 * 
 * Verwendung:
 * node scripts/create-admin.js <email> <password> <name>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Überprüfe, ob die MongoDB URI verfügbar ist
if (!process.env.MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is not set');
  process.exit(1);
}

// Hole Kommandozeilenargumente
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node scripts/create-admin.js <email> <password> <name>');
  process.exit(1);
}

const [email, password, name] = args;

// User Schema und Model definieren (vereinfachte Version des Models)
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, default: 'user' },
  subscriptionPlan: { type: String, default: 'free' },
  subscriptionActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  // Default-Limits für Admin
  limits: {
    maxVideosPerMonth: { type: Number, default: 100 },
    maxVideoLength: { type: Number, default: 3600 }, 
    maxStorageSpace: { type: Number, default: 10737418240 }, // 10GB
    maxResolution: { type: String, default: "1080p" },
    allowedFeatures: { type: [String], default: ["voiceover", "templates", "customBranding"] }
  },
  // Default-Stats für Admin
  stats: {
    totalVideosCreated: { type: Number, default: 0 },
    totalStorage: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now }
  }
});

// Verbindung zur Datenbank herstellen
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // User Model erstellen, falls es nicht bereits existiert
    const User = mongoose.models.User || mongoose.model('User', UserSchema);
    
    try {
      // Überprüfen, ob ein Benutzer mit dieser E-Mail bereits existiert
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        console.log(`Ein Benutzer mit der E-Mail ${email} existiert bereits.`);
        console.log('Möchten Sie den bestehenden Benutzer zum Admin machen? (j/n)');
        
        // Lese Benutzereingabe
        process.stdin.once('data', async (data) => {
          const input = data.toString().trim().toLowerCase();
          
          if (input === 'j' || input === 'y') {
            // Aktualisiere den Benutzer mit Admin-Rolle
            existingUser.role = 'admin';
            existingUser.updatedAt = new Date();
            await existingUser.save();
            console.log(`Benutzer ${email} wurde zum Admin gemacht.`);
          } else {
            console.log('Vorgang abgebrochen.');
          }
          
          mongoose.connection.close();
          process.exit(0);
        });
      } else {
        // Passwort hashen
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Neuen Admin-Benutzer erstellen
        const adminUser = new User({
          email,
          password: hashedPassword,
          name,
          role: 'admin',
          subscriptionPlan: 'enterprise',
          subscriptionActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Benutzer speichern
        await adminUser.save();
        
        console.log(`Admin-Benutzer wurde erfolgreich erstellt:`);
        console.log(`E-Mail: ${email}`);
        console.log(`Name: ${name}`);
        console.log(`Rolle: admin`);
        
        mongoose.connection.close();
        console.log('Verbindung zur Datenbank geschlossen');
        process.exit(0);
      }
    } catch (error) {
      console.error('Fehler beim Erstellen des Admin-Benutzers:', error);
      mongoose.connection.close();
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Fehler bei der Verbindung zur MongoDB:', err);
    process.exit(1);
  }); 