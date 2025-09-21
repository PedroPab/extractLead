
import express from 'express';
import { authMiddleware } from '../auth.js';
import { startFindGuides, getJobStatus, downloadJobFile, listAllJobs, getGuides, getCacheStats } from "./findGuides.js";
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

// API de guías (consultar caché como base de datos)
router.get("/guides", getGuides);           // ?storeName=X&id=Y&desde=Z&hasta=W&page=1&limit=100
router.get("/cache/stats", getCacheStats);  // estadísticas de la caché

export default router;