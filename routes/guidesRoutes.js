// routes/guidesRoutes.js
import express from 'express';
import { authMiddleware } from '../auth.js';
import { getGuides, getGuideByField, getCacheStats, getAvailableFields } from '../controllers/guidesController.js';

const router = express.Router();

// API de guías (consultar caché como base de datos)
router.get("/", authMiddleware, getGuides);                                    // GET /guides?storeName=X&campo=valor&page=1&limit=100
router.get("/fields", authMiddleware, getAvailableFields);                     // GET /guides/fields - campos disponibles
router.get("/search/:field/:value", authMiddleware, getGuideByField);          // GET /guides/search/numero_guia/12345
router.get("/search/:storeName/:field/:value", authMiddleware, getGuideByField); // GET /guides/search/ZILONIX/telefono/3001234567
router.get("/cache/stats", authMiddleware, getCacheStats);                     // GET /guides/cache/stats

export default router;