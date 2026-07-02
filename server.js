const express = require("express");
const cors = require("cors");
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;
let tokens = new Map();
let workerStatus = { 1: "Starting", 2: "Starting", 3: "Starting" };

// --- 1. إدارة الموارد ---
process.on('SIGINT', async () => process.exit());

// --- 2. محرك الإنتاج الذكي ---
async function spawnWorker(id) {
    const run = async () => {
        let browser;
        try {
            workerStatus[id] = "Launching...";
            // استخدام المسار المباشر للكروم (مهم جداً على Render)
            browser = await puppeteer.launch({ 
                headless: "new",
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage', 
                    '--disable-gpu', 
                    '--no-zygote'
                ] 
            });

            const page = await browser.newPage();
            workerStatus[id] = "Navigating...";
            await page.goto('https://gartic.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });

            // كود الحقن: يراقب ظهور التوكن ويرسله فوراً للسيرفر
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
            await new Promise(r => setTimeout(r, 3 * 60 * 1000)); // يعمل 3 دقائق ثم يعيد التدوير

        } catch (e) {
            workerStatus[id] = `Error: ${e.message}`;
            console.error(`Worker ${id} Error: ${e.message}`);
        } finally {
            if (browser) await browser.close();
            workerStatus[id] = "Restarting...";
            setTimeout(run, 5000); // Backoff strategy
        }
    };
    run();
}

// --- 3. نقاط الوصول ---
app.use(cors());

app.get("/add-token", (req, res) => {
    const { token } = req.query;
    if (token) {
        tokens.set(token, Date.now());
    }
    res.sendStatus(200);
});

app.get("/copy-tokens", (req, res) => {
    const limit = Date.now() - 5 * 60 * 1000;
    for (let [token, time] of tokens) if (time < limit) tokens.delete(token);
    res.json({ tokens: Array.from(tokens.keys()), count: tokens.size });
});

app.get("/status", (req, res) => {
    res.json({ serverTime: new Date().toISOString(), workers: workerStatus, totalTokens: tokens.size });
});

app.listen(PORT, () => {
    console.log(`🚀 Janus Production Engine running on port ${PORT}`);
    [1, 2, 3].forEach(spawnWorker);
});

