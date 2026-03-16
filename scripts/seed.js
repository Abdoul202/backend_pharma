require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const seed = async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pharmacy_manager_bf');
    console.log('Connected to MongoDB');

    // Clear users only
    await User.deleteMany();
    console.log('Collections cleared');

    // Créer uniquement le compte admin
    // Les pharmaciens et caissiers sont créés par l'admin via l'API POST /api/users
    const admin = await User.create({
        nom: 'Administrateur Principal',
        email: process.env.ADMIN_EMAIL || 'admin@pharmacy.bf',
        passwordHash: process.env.ADMIN_PASSWORD || 'Admin@1234',
        role: 'admin',
        actif: true,
    });

    console.log('\n🎉 Seed terminé avec succès!');
    console.log('─────────────────────────────────────');
    console.log(`Admin: ${admin.email} / ${process.env.ADMIN_PASSWORD || 'Admin@1234'}`);
    console.log('─────────────────────────────────────');
    console.log("ℹ️  Connectez-vous en tant qu'admin pour créer les pharmaciens et caissiers.");
    process.exit(0);
};

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
