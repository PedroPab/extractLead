// effi-exporter.js
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

export default class EffiExporter {
    /**
     * @param {Object} opts
     * @param {string} opts.username  - Usuario Effi
     * @param {string} opts.password  - Contraseña Effi
     * @param {string} [opts.baseUrl] - URL base (por defecto https://effi.com.co)
     * @param {boolean} [opts.headless] - Modo headless (por defecto true)
     */
    constructor({ username, password, baseUrl = "https://effi.com.co", headless = true }) {
        this.username = username;
        this.password = password;
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.headless = headless;
        this.browser = null;
        this.context = null;
        this.page = null;

        // Carpeta temp en la raíz del proyecto
        this.tempDir = path.resolve(process.cwd(), "temp");
        if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
    }

    async _start() {
        this.browser = await chromium.launch({ headless: this.headless });
        this.context = await this.browser.newContext({
            acceptDownloads: true,
            viewport: { width: 1366, height: 768 },
        });
        this.page = await this.context.newPage();
    }

    async _stop() {
        await this.context?.close();
        await this.browser?.close();
    }

    /**
     * Login a Effi
     */
    async _login() {
        await this.page.goto(`${this.baseUrl}/ingreso`, { waitUntil: "domcontentloaded" });

        await this.page.getByLabel(/email/i).or(this.page.locator("#email")).fill(this.username);
        await this.page.getByLabel(/contraseña|password/i).or(this.page.locator("#password")).fill(this.password);

        // Botón "Ingresar"
        const loginBtn = this.page.getByRole("button", { name: /ingresar/i }).or(this.page.locator("button:has-text('Ingresar')"));
        await Promise.all([
            this.page.waitForLoadState("networkidle"),
            loginBtn.click(),
        ]);

        // Señal post-login (ajusta si cambia la ruta)
        await this.page.waitForURL(/(agenda|home|app)/, { timeout: 20_000 });
    }

    /**
     * Convierte Date o string "YYYY-MM-DD HH:mm:ss" a ese mismo formato
     */
    _ensureEffiDateStr(d) {
        if (typeof d === "string") return d; // asume ya formateado
        const pad = (n) => String(n).padStart(2, "0");
        const yyyy = d.getFullYear();
        const MM = pad(d.getMonth() + 1);
        const dd = pad(d.getDate());
        const HH = pad(d.getHours());
        const mm = pad(d.getMinutes());
        const ss = pad(d.getSeconds());
        return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
    }

    /**
     * Exporta Guías de transporte con un rango de fechas y guarda el Excel en ./temp
     * @param {Date|string} desde  - Date o "YYYY-MM-DD HH:mm:ss"
     * @param {Date|string} hasta  - Date o "YYYY-MM-DD HH:mm:ss"
     * @returns {Promise<string>}  - Ruta final del archivo guardado
     */
    async exportGuiasTransporte(desde, hasta) {
        await this._start();
        try {
            await this._login();

            const desdeStr = this._ensureEffiDateStr(desde);
            const hastaStr = this._ensureEffiDateStr(hasta);
            const params = new URLSearchParams({
                desde: desdeStr,
                hasta: hastaStr,
            });

            const listUrl = `${this.baseUrl}/app/guia_transporte?${params.toString()}`;
            await this.page.goto(listUrl, { waitUntil: "domcontentloaded" });

            // Botón "Exportar a excel"
            const exportBtn = this.page.locator("#toExcel").or(this.page.getByRole("button", { name: /exportar a excel/i }));
            await exportBtn.waitFor({ state: "visible", timeout: 20_000 });

            // Preparar la espera del evento de descarga y hacer clic
            const [download1] = await Promise.all([
                this.page.waitForEvent("download"),
                exportBtn.click(),
            ]);

            // Algunas UI muestran una modal de confirmación con otro botón
            // Si aparece, clic en #btnValidarExcel y esperar otra descarga (fallback por si ya descargó al primer clic)
            let finalDownload = download1;
            try {
                const modalBtn = this.page.locator("#btnValidarExcel").or(this.page.getByRole("button", { name: /exportar a excel/i }));
                const modalVisible = await modalBtn.isVisible({ timeout: 2000 }).catch(() => false);
                if (modalVisible) {
                    const [download2] = await Promise.all([
                        this.page.waitForEvent("download"),
                        modalBtn.click(),
                    ]);
                    finalDownload = download2 ?? download1;
                }
            } catch {
                // Si no hay modal, seguimos con la primera descarga
            }

            // Guardar con nombre sugerido en ./temp
            const suggested = await finalDownload.suggestedFilename();
            const safeName = suggested?.trim() || `guias_transporte_${Date.now()}.xlsx`;
            const outPath = path.join(this.tempDir, safeName);
            await finalDownload.saveAs(outPath);

            // Validar tamaño mínimo (> 1KB)
            const stat = fs.statSync(outPath);
            if (stat.size < 1024) {
                throw new Error(`Archivo muy pequeño (${stat.size} bytes). Posible descarga incompleta: ${outPath}`);
            }

            return outPath;
        } finally {
            await this._stop();
        }
    }
}
