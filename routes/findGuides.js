// controllers/findGuides.controller.js
import { randomUUID } from "crypto";
import EffiExporter from "../controllers/effi-exporter.js";

/** “DB” en memoria */
const jobs = new Map();

/** Inicia el job sin bloquear: retorna 202 + jobId */
export const startFindGuides = (req, res) => {
    const { stardate, enddate } = req.query; // (mantengo tus nombres)

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

    // correr en background
    (async () => {
        job.status = "running";
        job.logs.push("Iniciando export…");

        const exporter = new EffiExporter({
            username: process.env.EFFI_USER,
            password: process.env.EFFI_PASS,
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

/** (Opcional) Descargar el archivo cuando termine */
export const downloadJobFile = (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });
    if (job.status !== "done" || !job.result?.filePath) {
        return res.status(409).json({ error: "job not finished" });
    }
    res.download(job.result.filePath);
};

// mostrart todos los jobs (debug)
export const listAllJobs = (_req, res) => {
    res.json(Array.from(jobs.values()));
};
