// services/effi-exporter.js
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

export default class EffiExporter {
    /**
     * @param {Object} opts
     * @param {string} opts.username
     * @param {string} opts.password
     * @param {string} [opts.baseUrl]
     * @param {boolean} [opts.headless]
     * @param {(msg:string)=>void} [opts.onProgress] - callback de progreso
     */
    constructor({ username, password, baseUrl = "https://effi.com.co", headless = true, onProgress } = {}) {
        this.username = username;
        this.password = password;
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.headless = headless;
        this.onProgress = onProgress;

        this.browser = null;
        this.context = null;
        this.page = null;

        // Carpeta temp en la raíz del proyecto
        this.tempDir = path.resolve(process.cwd(), "temp");
        if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
    }

    _progress(msg) {
        try { this.onProgress?.(msg); } catch { }
    }

    async _start() {
        this.browser = await chromium.launch({ headless: this.headless });
        this.context = await this.browser.newContext({
            acceptDownloads: true,
            viewport: { width: 1366, height: 768 },
        });
        // timeouts globales altos
        this.context.setDefaultTimeout(180_000);
        this.context.setDefaultNavigationTimeout(180_000);

        this.page = await this.context.newPage();

        // logs útiles
        this.page.on("download", async d => this._progress(`⬇️ download: ${await d.suggestedFilename()}`));
        this.page.on("requestfailed", r => this._progress(`⚠️ request failed: ${r.url()} - ${r.failure()?.errorText}`));
    }

    async _stop() {
        await this.context?.close();
        await this.browser?.close();
    }

    async _login() {
        this._progress("Navegando a /ingreso…");
        await this.page.goto(`${this.baseUrl}/ingreso`, { waitUntil: "domcontentloaded" });

        this._progress("Llenando credenciales…");
        await this.page.getByLabel(/email/i).or(this.page.locator("#email")).fill(this.username);
        await this.page.getByLabel(/contraseña|password/i).or(this.page.locator("#password")).fill(this.password);

        const loginBtn = this.page.getByRole("button", { name: /ingresar/i }).or(this.page.locator("button:has-text('Ingresar')"));
        this._progress("Haciendo click en Ingresar…");
        await Promise.all([this.page.waitForLoadState("networkidle"), loginBtn.click()]);

        this._progress("Esperando página post-login…");
        await this.page.waitForURL(/(agenda|home|app)/, { timeout: 20_000 });
    }

    _ensureEffiDateStr(d) {
        if (typeof d === "string") return d;
        const pad = n => String(n).padStart(2, "0");
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
     * @param {Date|string} desde
     * @param {Date|string} hasta
     * @returns {Promise<string>} ruta final del archivo
     */
    async exportGuiasTransporte(desde, hasta) {
        await this._start();
        try {
            await this._login();

            const desdeStr = this._ensureEffiDateStr(desde);
            const hastaStr = this._ensureEffiDateStr(hasta);
            const params = new URLSearchParams({ desde: desdeStr, hasta: hastaStr });

            const listUrl = `${this.baseUrl}/app/guia_transporte?${params.toString()}`;
            this._progress("Abriendo lista de guías con filtro…");
            this._progress(`Navegando a ${listUrl}…`);
            await this.page.goto(listUrl, { waitUntil: "domcontentloaded" });

            const exportBtn = this.page.locator("#toExcel").or(this.page.getByRole("button", { name: /exportar a excel/i }));
            await exportBtn.waitFor({ state: "visible", timeout: 20_000 });

            this._progress("Solicitando exportación…");
            const [download1] = await Promise.all([
                this.page.waitForEvent("download", { timeout: 50_000 }),
                exportBtn.click(),
            ]);

            // Modal opcional de confirmación
            let finalDownload = download1;
            try {
                const modalBtn = this.page.locator("#btnValidarExcel").or(this.page.getByRole("button", { name: /exportar a excel/i }));
                if (await modalBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                    this._progress("Confirmando export en modal…");
                    const [download2] = await Promise.all([
                        this.page.waitForEvent("download", { timeout: 50_000 }),
                        modalBtn.click(),
                    ]);
                    finalDownload = download2 ?? download1;
                }
            } catch { /* sin modal */ }

            const suggested = await finalDownload.suggestedFilename();
            const safeName = suggested?.trim() || `guias_transporte_${Date.now()}.xlsx`;
            const outPath = path.join(this.tempDir, safeName);

            this._progress(`Guardando archivo en ${outPath}…`);
            await finalDownload.saveAs(outPath);

            const stat = fs.statSync(outPath);
            if (stat.size < 1024) {
                throw new Error(`Archivo muy pequeño (${stat.size} bytes). Posible descarga incompleta: ${outPath}`);
            }

            this._progress("Exportación completada ✅");
            return outPath;
        } catch (err) {
            this._progress(`Error durante exportación: ${err.message || err}`);
            console.error("🚀 ~ EffiExporter ~ exportGuiasTransporte ~ error:", err);
            throw err;

        } finally {
            await this._stop();
        }
    }
}
