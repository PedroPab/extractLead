// controllers/guidesController.js
import fs from 'node:fs';
import path from 'node:path';

// Cache de guías por tienda: { [storeName]: { data: [...], timestamp: Date } }
const guidesCache = new Map();

// Limpieza automática de la caché cada 10 minutos
setInterval(() => {
    const now = Date.now();
    for (const [store, entry] of guidesCache.entries()) {
        if (now - entry.timestamp > 60 * 60 * 1000) { // 1 hora
            // Guardar en disco antes de borrar de memoria
            try {
                const outDir = path.resolve(process.cwd(), 'temp', 'cache');
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                const file = path.join(outDir, `${store}_${entry.timestamp}.json`);
                fs.writeFileSync(file, JSON.stringify(entry.data, null, 2));
            } catch { }
            guidesCache.delete(store);
        }
    }
}, 10 * 60 * 1000);

/** Agregar datos de guías a la caché */
export const addToCache = (storeName, data) => {
    guidesCache.set(storeName || 'default', { data, timestamp: Date.now() });
};

/** Obtener todas las guías de la caché con filtros avanzados */
export const getGuides = (req, res) => {
    const { storeName, page = 1, limit = 100, ...filters } = req.query;

    try {
        // Si se especifica tienda, buscar solo en esa tienda
        let allGuides = [];
        if (storeName) {
            const storeCache = guidesCache.get(storeName);
            if (storeCache) {
                allGuides = storeCache.data.map(guide => ({ ...guide, _store: storeName }));
            }
        } else {
            // Combinar guías de todas las tiendas
            for (const [store, cache] of guidesCache.entries()) {
                allGuides.push(...cache.data.map(guide => ({ ...guide, _store: store })));
            }
        }

        // Aplicar filtros dinámicos
        allGuides = applyFilters(allGuides, filters);

        // Paginación
        const offset = (page - 1) * limit;
        const paginatedGuides = allGuides.slice(offset, offset + parseInt(limit));

        res.json({
            data: paginatedGuides,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: allGuides.length,
                totalPages: Math.ceil(allGuides.length / limit)
            },
            cache: {
                stores: Array.from(guidesCache.keys()),
                lastUpdate: Math.max(...Array.from(guidesCache.values()).map(c => c.timestamp))
            }
        });
    } catch (err) {
        res.status(500).json({ error: "Error al consultar guías", details: err.message });
    }
};

/** Buscar una guía específica por cualquier campo */
export const getGuideByField = (req, res) => {
    const { field, value, storeName } = req.params;

    try {
        let allGuides = [];
        if (storeName) {
            const storeCache = guidesCache.get(storeName);
            if (storeCache) {
                allGuides = storeCache.data.map(guide => ({ ...guide, _store: storeName }));
            }
        } else {
            // Buscar en todas las tiendas
            for (const [store, cache] of guidesCache.entries()) {
                allGuides.push(...cache.data.map(guide => ({ ...guide, _store: store })));
            }
        }

        // Buscar por el campo específico
        const foundGuides = allGuides.filter(guide => {
            const fieldValue = guide[field];
            if (fieldValue === undefined || fieldValue === null) return false;
            return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
        });

        if (foundGuides.length === 0) {
            return res.status(404).json({ error: `No se encontró ninguna guía con ${field} = ${value}` });
        }

        res.json({
            data: foundGuides,
            found: foundGuides.length,
            searchCriteria: { field, value, storeName: storeName || 'all' }
        });
    } catch (err) {
        res.status(500).json({ error: "Error al buscar guía", details: err.message });
    }
};

/** Obtener estadísticas de la caché */
export const getCacheStats = (_req, res) => {
    const stats = {};
    for (const [store, cache] of guidesCache.entries()) {
        stats[store] = {
            count: cache.data.length,
            lastUpdate: new Date(cache.timestamp).toISOString(),
            ageInMinutes: Math.floor((Date.now() - cache.timestamp) / (1000 * 60))
        };
    }
    res.json(stats);
};

/** Obtener campos disponibles para filtrar */
export const getAvailableFields = (_req, res) => {
    const fields = new Set();

    for (const [, cache] of guidesCache.entries()) {
        if (cache.data.length > 0) {
            Object.keys(cache.data[0]).forEach(key => fields.add(key));
        }
    }

    res.json({
        fields: Array.from(fields).sort(),
        examples: {
            byField: "/guides/search/numero_guia/12345",
            byPhone: "/guides/search/telefono/3001234567",
            byClient: "/guides/search/cliente/empresa",
            withFilters: "/guides?desde=2025-01-01&hasta=2025-12-31&estado=entregado"
        }
    });
};

/** Aplicar filtros dinámicos a las guías */
function applyFilters(guides, filters) {
    return guides.filter(guide => {
        // Filtros especiales
        if (filters.desde || filters.hasta) {
            const fechaGuia = guide.fecha || guide.Fecha || guide.date || guide.Date;
            if (fechaGuia) {
                const fecha = new Date(fechaGuia);
                if (filters.desde && fecha < new Date(filters.desde)) return false;
                if (filters.hasta && fecha > new Date(filters.hasta)) return false;
            }
        }

        // Filtros dinámicos por cualquier campo
        for (const [key, value] of Object.entries(filters)) {
            if (['desde', 'hasta', 'page', 'limit', 'storeName'].includes(key)) continue;

            const guideValue = guide[key];
            if (guideValue === undefined || guideValue === null) continue;

            // Búsqueda parcial (contiene)
            if (!String(guideValue).toLowerCase().includes(String(value).toLowerCase())) {
                return false;
            }
        }

        return true;
    });
}