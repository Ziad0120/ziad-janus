const express = require("express");
const cors = require("cors");
const puppeteer = require('puppeteer'); // استخدمنا الأساسي عشان مشاكل الـ Build

const app = express();
const PORT = process.env.PORT || 3000;
let tokens = new Map();

// سجل حالة العمال للمراقبة
let workerStatus = { 1: "Starting", 2: "Starting", 3: "Starting" };

// --- 1. إدارة الموارد ---
process.on('SIGINT', async () => process.exit());

// --- 2. محرك الإنتاج ---
async function spawnWorker(id) {
    const run = async () => {
        let browser;
        try {
            workerStatus[id] = "Launching...";
            browser = await puppeteer.launch({ 
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
            });

            const page = await browser.newPage();
            // User-Agent بيخلي الموقع يعاملك كمتصفح حقيقي مش بوت
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            workerStatus[id] = "Navigating...";
            await page.goto('https://gartic.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });

            // كود الحقن البديل للـ Turnstile
            await page.evaluate(() => {
                const observer = new MutationObserver(() => {
                    // محاولة التقاط التوكن من أي عنصر موجود في الصفحة
                    const token = window.turnstile?.getResponse();
                    if (token) {
                        window.fetch(`http://localhost:${process.env.PORT || 3000}/add-token?token=${token}`);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            });

            workerStatus[id] = "Active & Mining";
            await new Promise(r => setTimeout(r, 3 * 60 * 1000));

        } catch (e) {
            workerStatus[id] = `Error: ${e.message}`;
            console.error(`Worker ${id} Error: ${e.message}`);
        } finally {
            if (browser) await browser.close();
            setTimeout(run, 5000);
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
        console.log(`[${new Date().toLocaleTimeString()}] Token captured!`);
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
    console.log(`🚀 Janus Engine Online on port ${PORT}`);
    [1, 2, 3].forEach(spawnWorker);
});

