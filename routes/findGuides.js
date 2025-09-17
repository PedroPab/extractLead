import ExcelJS from "exceljs";
// controllers/findGuides.controller.js
import { randomUUID } from "crypto";
import EffiExporter from "../controllers/effi-exporter.js";

/** “DB” en memoria */
const jobs = new Map();

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
            job.status = "done";
            job.result = { filePath };
            job.logs.push("✔️ Completado");
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