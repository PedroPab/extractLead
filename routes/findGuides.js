import ExcelJS from "exceljs";
// controllers/findGuides.controller.js
import { randomUUID } from "crypto";
import EffiExporter from "../controllers/effi-exporter.js";


/** “DB” en memoria */
const jobs = new Map();

// Cache de guías por tienda: { [storeName]: { data: [...], timestamp: Date } }
const guidesCache = new Map();

// Limpieza automática de la caché cada 10 minutos
setInterval(async () => {
    const now = Date.now();
    for (const [store, entry] of guidesCache.entries()) {
        if (now - entry.timestamp > 60 * 60 * 1000) { // 1 hora
            // Guardar en disco antes de borrar de memoria
            try {
                const fs = await import('node:fs');
                const path = await import('node:path');
                const outDir = path.resolve(process.cwd(), 'temp', 'cache');
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                const file = path.join(outDir, `${store}_${entry.timestamp}.json`);
                fs.writeFileSync(file, JSON.stringify(entry.data, null, 2));
            } catch { }
            guidesCache.delete(store);
        }
    }
}, 10 * 60 * 1000);


/** Inicia el job sin bloquear: retorna 202 + jobId */
export const startFindGuides = (req, res) => {
    const { stardate, enddate, storeName } = req.query; // (mantengo tus nombres)

    // Resolver fechas (si no llegan, último mes)
    const now = new Date();
    const hasta = enddate ? new Date(enddate) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const desde = stardate ? new Date(stardate) : new Date(hasta);
    if (!stardate) { desde.setMonth(desde.getMonth() - 1); desde.setHours(0, 0, 0, 0); }

    const id = randomUUID();
    const job = { id, status: "queued", logs: [], result: null, error: null, createdAt: Date.now(), params: { stardate, enddate } };
    jobs.set(id, job);

    // responder de inmediato (no bloquea)
    res.status(202).json({ jobId: id, status: job.status });

    //escojermos la tienda
    const { username, password } = escojerTienda(storeName);

    // correr en background
    (async () => {
        job.status = "running";
        job.logs.push("Iniciando export…");

        const exporter = new EffiExporter({
            username: username,
            password: password,
            storeName: storeName,
            headless: true,
            onProgress: (msg) => job.logs.push(`[${new Date().toISOString()}] ${msg}`),
        });

        try {
            const filePath = await exporter.exportGuiasTransporte(desde, hasta);
            // Convertir a JSON y guardar en caché por tienda
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            const worksheet = workbook.worksheets[0];
            let headers = [];
            const data = [];
            worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                if (rowNumber === 1) {
                    headers = row.values.slice(1);
                } else {
                    const obj = {};
                    row.values.slice(1).forEach((val, idx) => {
                        obj[headers[idx]] = val;
                    });
                    data.push(obj);
                }
            });
            guidesCache.set(storeName || 'default', { data, timestamp: Date.now() });
            job.status = "done";
            job.result = { filePath };
            job.logs.push("✔️ Completado y cache actualizado");
        } catch (err) {
            job.status = "error";
            job.error = String(err?.message || err);
            job.logs.push(`❌ Error: ${job.error}`);
        }
    })();
};

/** Consulta estado/logs del job */
export const getJobStatus = (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });
    res.json(job);
};


/** Descargar el archivo XLSX o su versión JSON */
export const downloadJobFile = (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });
    if (job.status !== "done" || !job.result?.filePath) {
        return res.status(409).json({ error: "job not finished" });
    }
    // Si el usuario solicita ?format=json, convertir y enviar el JSON
    if (req.query.format === "json") {
        const workbook = new ExcelJS.Workbook();
        workbook.xlsx.readFile(job.result.filePath)
            .then(() => {
                const worksheet = workbook.worksheets[0];
                const data = [];
                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                    if (rowNumber === 1) {
                        // Guardar encabezados
                        data.headers = row.values.slice(1);
                    } else {
                        const obj = {};
                        row.values.slice(1).forEach((val, idx) => {
                            obj[data.headers[idx]] = val;
                        });
                        data.push(obj);
                    }
                });
                res.json(data);
            })
            .catch(err => {
                res.status(500).json({ error: "Error al convertir a JSON", details: err.message });
            });
    } else {
        res.download(job.result.filePath);
    }
};

// mostrart todos los jobs (debug)
export const listAllJobs = (_req, res) => {
    res.json(Array.from(jobs.values()));
};

/** API para consultar guías desde la caché en memoria */
export const getGuides = (req, res) => {
    const { storeName, id, desde, hasta, page = 1, limit = 100 } = req.query;

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

        // Filtrar por ID si se especifica
        if (id) {
            allGuides = allGuides.filter(guide =>
                guide.id === id || guide.ID === id || guide.Id === id ||
                guide.numero === id || guide.Numero === id
            );
        }

        // Filtrar por rango de fechas si se especifica
        if (desde || hasta) {
            allGuides = allGuides.filter(guide => {
                const fechaGuia = guide.fecha || guide.Fecha || guide.date || guide.Date;
                if (!fechaGuia) return true;

                const fecha = new Date(fechaGuia);
                if (desde && fecha < new Date(desde)) return false;
                if (hasta && fecha > new Date(hasta)) return false;
                return true;
            });
        }

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


function escojerTienda(storeName) {
    // Buscar tiendas por variables *_USERNAME y *_PASSWORD
    const tiendas = [];
    for (const [key, value] of Object.entries(process.env)) {
        const match = key.match(/^EFFI_STORE_(.+)_USERNAME$/);
        if (match) {
            const name = match[1];
            const username = value;
            const password = process.env[`EFFI_STORE_${name}_PASSWORD`];
            if (password) {
                tiendas.push({ name, username, password });
            }
        }
    }

    if (tiendas.length === 0) {
        throw new Error("No hay tiendas configuradas en las variables de entorno (EFFI_STORE_*_USERNAME y EFFI_STORE_*_PASSWORD)");
    }

    let tiendaSeleccionada;
    if (storeName) {
        tiendaSeleccionada = tiendas.find(t => t.name.toLowerCase() === storeName.toLowerCase());
        if (!tiendaSeleccionada) {
            throw new Error(`No se encontró la tienda con nombre '${storeName}'. Tiendas disponibles: ${tiendas.map(t => t.name).join(", ")}`);
        }
    } else {
        if (tiendas.length > 1) {
            throw new Error(`Hay varias tiendas configuradas. Debes especificar cuál usar con el parámetro 'storeName'. Tiendas disponibles: ${tiendas.map(t => t.name).join(", ")}`);
        }
        tiendaSeleccionada = tiendas[0];
    }

    if (!tiendaSeleccionada.username || !tiendaSeleccionada.password) {
        throw new Error(`La tienda '${tiendaSeleccionada.name}' no tiene usuario o contraseña configurados correctamente.`);
    }

    return tiendaSeleccionada;
}