
import express from 'express';
import { authMiddleware } from '../auth.js';
import { findGuides } from './findGuides.js';

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

router.get('/guides', findGuides);

export default router;