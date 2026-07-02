const express = require("express");
const cors = require("cors");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// تفعيل التمويه لتجاوز الحظر
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// مصفوفة التخزين والعمال
let tokens = new Map();
let workerStatus = { 1: "Starting", 2: "Starting", 3: "Starting" };

app.use(cors());

// --- 1. الوظائف الأساسية ---
const cleanup = () => {
    const limit = Date.now() - 5 * 60 * 1000;
    for (let [token, time] of tokens) if (time < limit) tokens.delete(token);
};
setInterval(cleanup, 60 * 1000);

// --- 2. محرك الإنتاج الذكي (3 عمال) ---
async function spawnWorker(id) {
    const run = async () => {
        let browser;
        try {
            workerStatus[id] = "Launching...";
            browser = await puppeteer.launch({
                headless: "new",
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--no-zygote",
                    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ]
            });

            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(60000);
            
            workerStatus[id] = "Navigating...";
            await page.goto('https://gartic.io/', { waitUntil: 'domcontentloaded' });

            // دالة التقرير
            await page.exposeFunction("reportToken", (token) => {
                if (!tokens.has(token)) {
                    tokens.set(token, Date.now());
                    console.log(`[Worker ${id}] Token captured! Total: ${tokens.size}`);
                }
            });

            // حقن السكربت الذكي داخل الصفحة
            await page.evaluate(() => {
                const requestToken = () => {
                    try {
                        const container = document.querySelector("#cf-turnstile");
                        if (window.turnstile && container) {
                            window.turnstile.render(container, {
                                sitekey: "0x4AAAAAABBPKaIbNwnPEfSo",
                                callback: (token) => window.reportToken(token)
                            });
                        }
                    } catch (e) { console.error(e); }
                };
                
                requestToken();
                setInterval(requestToken, 5000);
                setTimeout(() => location.reload(), 2 * 60 * 1000);
            });

            workerStatus[id] = "Active & Mining";
            await new Promise(r => setTimeout(r, 3 * 60 * 1000)); 

        } catch (e) {
            workerStatus[id] = `Error: ${e.message}`;
        } finally {
            if (browser) await browser.close();
            workerStatus[id] = "Restarting...";
            setTimeout(run, 5000);
        }
    };
    run();
}

// --- 3. نقاط التوزيع (API) ---
app.get("/add-token", (req, res) => {
    const { token } = req.query;
    if (token) tokens.set(token, Date.now());
    res.sendStatus(200);
});

app.get("/copy-tokens", (req, res) => {
    cleanup();
    res.json({ tokens: Array.from(tokens.keys()), count: tokens.size });
});

app.get("/get-tokens", (req, res) => {
    cleanup();
    res.json({ tokens: Array.from(tokens.keys()), count: tokens.size });
});

app.get("/status", (req, res) => {
    res.json({ serverTime: new Date().toISOString(), workers: workerStatus, totalTokens: tokens.size });
});

app.listen(PORT, () => {
    console.log(`🚀 Janus Production Engine running on port ${PORT}`);
    spawnWorker(1);
    
});
