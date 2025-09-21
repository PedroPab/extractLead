
import express from 'express';
import { authMiddleware } from '../auth.js';
import { startFindGuides, getJobStatus, downloadJobFile, listAllJobs } from "./findGuides.js";
import guidesRoutes from './guidesRoutes.js';

const router = express.Router();

router.get('/public', (req, res) => {
    res.json({ mensaje: 'Este endpoint es público.' });
});

router.get('/private', authMiddleware, (req, res) => {
    res.json({ mensaje: 'Este endpoint es privado y autenticado.' });
});

// health para saber que el server sigue vivo
router.get("/health", (_req, res) => res.send("ok"));

// inicia export sin bloquear
router.get("/export", startFindGuides);            // ?stardate=YYYY-MM-DD HH:mm:ss&enddate=...

// mostrart todos los jobs (debug)
router.get("/jobs", listAllJobs);

// consulta de estado/logs
router.get("/jobs/:id", getJobStatus);

// descarga cuando esté listo
router.get("/jobs/:id/download", downloadJobFile);

//hacer publica la carpeta temp
router.use('/temp', express.static('temp'));

// Rutas de guías (API separada)
router.use('/guides', guidesRoutes);

export default router;