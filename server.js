const express = require("express");
const cors = require("cors");
const puppeteer = require('puppeteer-extra');
const TurnstilePlugin = require('puppeteer-extra-plugin-turnstile');

puppeteer.use(TurnstilePlugin());

const app = express();
const PORT = process.env.PORT || 3000;
let tokens = new Map();

// سجل حالة العمال للمراقبة
let workerStatus = { 1: "Starting", 2: "Starting", 3: "Starting" };

// --- 1. إدارة الموارد ---
process.on('SIGINT', async () => process.exit());

// --- 2. محرك الإنتاج مع مراقبة الحالة ---
async function spawnWorker(id) {
    const run = async () => {
        let browser;
        try {
            workerStatus[id] = "Launching Browser...";
            browser = await puppeteer.launch({ 
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
            });

            const page = await browser.newPage();
            workerStatus[id] = "Navigating to Site...";
            await page.goto('https://gartic.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });

            workerStatus[id] = "Waiting for Turnstile...";
            await page.exposeFunction('reportToken', (token) => {
                tokens.set(token, Date.now());
                console.log(`[${new Date().toLocaleTimeString()}] Worker ${id} captured token`);
            });

            await page.evaluate(() => {
                const observer = new MutationObserver(() => {
                    const token = window.turnstile?.getResponse();
                    if (token) window.reportToken(token);
                });
                observer.observe(document.body, { childList: true, subtree: true });
            });

            workerStatus[id] = "Active & Mining";
            
            // إعادة تدوير المتصفح كل 3 دقائق
            await new Promise(r => setTimeout(r, 3 * 60 * 1000));

        } catch (e) {
            workerStatus[id] = `Error: ${e.message}`;
            console.error(`Worker ${id} Error: ${e.message}`);
        } finally {
            if (browser) await browser.close();
            workerStatus[id] = "Restarting...";
            setTimeout(run, 5000);
        }
    };
    run();
}

// --- 3. نقاط الوصول (Endpoints) ---
app.get("/copy-tokens", (req, res) => {
    // تنظيف تلقائي عند كل طلب
    const limit = Date.now() - 5 * 60 * 1000;
    for (let [token, time] of tokens) if (time < limit) tokens.delete(token);
    
    res.json({ tokens: Array.from(tokens.keys()), count: tokens.size });
});

// مراقبة حالة العمال (Health Check)
app.get("/status", (req, res) => {
    res.json({
        serverTime: new Date().toISOString(),
        workers: workerStatus,
        totalTokens: tokens.size
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Janus Engine Online on port ${PORT}`);
    [1, 2, 3].forEach(spawnWorker);
});
