// services/effi-exporter.js
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

export default class EffiExporter {
    constructor({ storeName, username, password, baseUrl = "https://effi.com.co", headless = true, onProgress } = {}) {
        this.storeName = storeName;
        this.username = username;
        this.password = password;
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.headless = headless;
        this.onProgress = onProgress;

        this.browser = null;
        this.context = null;
        this.page = null;

        this.tempDir = path.resolve(process.cwd(), "temp");
        if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
    }

    _progress(msg) { try { this.onProgress?.(msg); } catch { } }

    async _start() {
        this.browser = await chromium.launch({ headless: this.headless });
        this.context = await this.browser.newContext({
            acceptDownloads: true,
            viewport: { width: 1366, height: 768 },
        });
        this.context.setDefaultTimeout(180_000);
        this.context.setDefaultNavigationTimeout(180_000);
        this.page = await this.context.newPage();

        this.page.on("download", async d => this._progress(`⬇️ download: ${await d.suggestedFilename()}`));
        this.page.on("requestfailed", r => this._progress(`⚠️ request failed: ${r.url()} - ${r.failure()?.errorText}`));
    }

    async _stop() { await this.context?.close(); await this.browser?.close(); }

    async _login() {
        this._progress("Navegando a /ingreso…");
        await this.page.goto(`${this.baseUrl}/ingreso`, { waitUntil: "domcontentloaded" });

        this._progress("Llenando credenciales…");
        await this.page.getByLabel(/email/i).or(this.page.locator("#email")).fill(this.username);
        await this.page.getByLabel(/contraseña|password/i).or(this.page.locator("#password")).fill(this.password);

        const loginBtn = this.page.getByRole("button", { name: /ingresar/i })
            .or(this.page.locator("button:has-text('Ingresar')"));
        this._progress("Haciendo click en Ingresar…");
        await Promise.all([this.page.waitForLoadState("networkidle"), loginBtn.click()]);

        this._progress("Esperando página post-login…");
        await this.page.waitForURL(/(agenda|home|app)/, { timeout: 20_000 });
    }

    _ensureEffiDateStr(d) {
        if (typeof d === "string") return d;
        const pad = n => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    /**
     * Descarga Excel: clic en "Exportar a Excel" -> aparece modal -> clic en confirmar (descarga)
     */
    async exportGuiasTransporte(desde, hasta) {
        await this._start();
        try {
            await this._login();

            const desdeStr = this._ensureEffiDateStr(desde);
            const hastaStr = this._ensureEffiDateStr(hasta);
            const listUrl = `${this.baseUrl}/app/guia_transporte?${new URLSearchParams({ desde: desdeStr, hasta: hastaStr })}`;

            this._progress(`Abriendo lista de guías con filtro…`);
            this._progress(`Navegando a ${listUrl}…`);
            await this.page.goto(listUrl, { waitUntil: "domcontentloaded" });
            await this.page.waitForLoadState("networkidle").catch(() => { });

            // PASO 1: abrir la modal (NO esperamos download aquí)
            const exportBtn = this.page.locator("#toExcel")
                .or(this.page.getByRole("button", { name: /exportar.*excel/i }));
            await exportBtn.waitFor({ state: "visible", timeout: 30_000 });
            this._progress("Clic en 'Exportar a Excel' (abre modal) …");
            await exportBtn.click();

            // PASO 2: confirmar en la modal y AHÍ esperar el download
            const modalBtn = this.page.locator("#btnValidarExcel")
                .or(this.page.getByRole("button", { name: /exportar.*excel/i }));
            const modalVisible = await modalBtn.isVisible({ timeout: 30_000 }).catch(() => false);
            if (!modalVisible) {
                const diag = path.join(this.tempDir, `diag_modal_no_visible_${Date.now()}.png`);
                await this.page.screenshot({ path: diag, fullPage: true });
                throw new Error(`No se detectó la modal de exportación. Screenshot: ${diag}`);
            }

            this._progress("Confirmando export en la modal… (ahora sí espero download)");
            const [download] = await Promise.all([
                this.page.waitForEvent("download", { timeout: 300_000 }), // hasta 5 min
                modalBtn.click(),
            ]);

            const suggested = `${this.storeName}_guias_transporte_${Date.now()}.xlsx`;
            const outPath = path.join(this.tempDir, suggested);
            this._progress(`Guardando archivo en ${outPath}…`);
            await download.saveAs(outPath);

            const stat = fs.statSync(outPath);
            if (stat.size < 1024) throw new Error(`Archivo muy pequeño (${stat.size} bytes). Posible descarga incompleta: ${outPath}`);

            this._progress("Exportación completada ✅");
            return outPath;
        } catch (err) {
            this._progress(`Error durante exportación: ${err.message || err}`);
            throw err;
        } finally {
            await this._stop();
        }
    }
}
