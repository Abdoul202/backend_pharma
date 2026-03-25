const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'PharmacyManager BF API',
            version: '1.0.0',
            description: 'API REST pour la gestion complète d\'une officine pharmaceutique en Afrique de l\'Ouest',
            contact: { name: 'PharmacyManager BF', email: 'support@pharmacymanager.bf' },
        },
        servers: [
            { url: '/api', description: 'Relative path' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        nom: { type: 'string', example: 'Jean Dupont' },
                        email: { type: 'string', example: 'jean@pharmacy.bf' },
                        role: { type: 'string', enum: ['admin', 'pharmacien', 'caissier'] },
                        actif: { type: 'boolean' },
                    },
                },
                Medicine: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        nom: { type: 'string', example: 'Amoxicilline' },
                        dci: { type: 'string', example: 'Amoxicilline' },
                        forme: { type: 'string', enum: ['comprimé', 'gélule', 'sirop', 'injectable', 'pommade', 'suppositoire', 'sachet', 'gouttes', 'autre'] },
                        dosage: { type: 'string', example: '500mg' },
                        prixVente: { type: 'number', example: 1500 },
                        seuilAlerte: { type: 'number', example: 10 },
                    },
                },
                Lot: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        medicineId: { type: 'string' },
                        numeroLot: { type: 'string', example: 'LOT-ABC123' },
                        quantite: { type: 'number', example: 100 },
                        dateExpiration: { type: 'string', format: 'date', example: '2026-12-31' },
                        fournisseur: { type: 'string', example: 'CAMEG' },
                    },
                },
                Sale: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        reference: { type: 'string', example: 'VTE-20260311-00001' },
                        total: { type: 'number', example: 3500 },
                        statut: { type: 'string', enum: ['valide', 'annule'] },
                        modePaiement: { type: 'string', enum: ['especes', 'mobile_money', 'carte', 'autre'] },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string' },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: 'Auth', description: 'Authentification et gestion de session' },
            { name: 'Users', description: 'Gestion des utilisateurs (admin uniquement)' },
            { name: 'Medicines', description: 'Gestion des médicaments' },
            { name: 'Stock', description: 'Gestion du stock et des lots' },
            { name: 'Sales', description: 'Gestion des ventes' },
            { name: 'Alerts', description: 'Alertes stock bas et expiration' },
            { name: 'Dashboard', description: 'Statistiques et KPIs' },
            { name: 'Reports', description: 'Rapports mensuels et exports' },
        ],
    },
    apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
