const express = require('express');
const { authMiddleware } = require('./auth');

const router = express.Router();

router.get('/public', (req, res) => {
    res.json({ mensaje: 'Este endpoint es público.' });
});

router.get('/private', authMiddleware, (req, res) => {
    res.json({ mensaje: 'Este endpoint es privado y autenticado.' });
});

router.get('/', (req, res) => {
    res.json({ mensaje: 'Ruta de prueba funcionando.' });
});

module.exports = router;
