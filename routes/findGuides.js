import EffiExporter from "./../services/effi-exporter.js";

export const findGuides = (req, res) => {
    //sacamos de los parametros de la url los parametros de la consulta
    const { stardate, enddate } = req.query;
    res.json({ stardate, enddate });
};

const exporter = new EffiExporter({
    username: process.env.EFFI_USER,
    password: process.env.EFFI_PASS,
    headless: true,
});

(async () => {
    // Rango de ejemplo: último mes hasta fin del día actual
    const now = new Date();
    const hasta = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const desde = new Date(hasta); desde.setMonth(desde.getMonth() - 1); desde.setHours(0, 0, 0, 0);

    try {
        const filePath = await exporter.exportGuiasTransporte(desde, hasta);
        console.log("✅ Archivo guardado en:", filePath);
    } catch (err) {
        console.error("❌ Error:", err.message);
    }
})();