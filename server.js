const express = require("express");
const cors = require("cors");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// تفعيل ميزة التمويه
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// مصفوفة التخزين والعمال
let tokens = new Map();
let workerStatus = { 1: "Starting", 2: "Starting", 3: "Starting" };

app.use(cors());

// --- 1. الوظائف الأساسية (التنظيف والتخزين) ---
const cleanup = () => {
    const limit = Date.now() - 5 * 60 * 1000; // 5 دقائق
    for (let [token, time] of tokens) {
        if (time < limit) tokens.delete(token);
    }
};
setInterval(cleanup, 60 * 1000); // تنظيف كل دقيقة

// --- 2. محرك الإنتاج المحاكي لسكربت التيمبرمونكي ---
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
                    "--single-process",
                    "--no-zygote",
                    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ]
            });

            const page = await browser.newPage();
            
            // دالة استلام التوكن من الـ iframe وإرساله للسيرفر
            await page.exposeFunction("reportToken", (token) => {
                if (!tokens.has(token)) {
                    tokens.set(token, Date.now());
                    console.log(`[Worker ${id}] SUCCESS! Token Captured via Iframe. Total: ${tokens.size}`);
                }
            });

            await page.goto('https://gartic.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });

            // دمج منطق الـ iframe المطور داخل السيرفر
            await page.evaluate(() => {
                function createTurnstileFrame() {
                    console.log("[Browser] Creating Turnstile Iframe...");
                    const iframe = document.createElement("iframe");
                    iframe.style.display = "none";
                    iframe.sandbox = "allow-scripts allow-same-origin";
                    document.body.appendChild(iframe);

                    const html = `
                        <!DOCTYPE html>
                        <html>
                        <head><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></head>
                        <body>
                            <div id="cf-turnstile"></div>
                            <script>
                                window.onload = function() {
                                    turnstile.render("#cf-turnstile", {
                                        sitekey: "0x4AAAAAABBPKaIbNwnPEfSo",
                                        callback: function(token) {
                                            // إرسال التوكن مباشرة للسيرفر عبر الدالة المكشوفة
                                            window.parent.reportToken(token);
                                        }
                                    });
                                }
                            </script>
                        </body>
                        </html>
                    `;
                    iframe.srcdoc = html;
                }

                // التكرار وإعادة التحميل كما في سكربت التيمبرمونكي
                setInterval(createTurnstileFrame, 5000);
                createTurnstileFrame();
                
                setTimeout(() => {
                    console.log("[Browser] Refreshing page...");
                    location.reload();
                }, 2 * 60 * 1000);
            });

            workerStatus[id] = "Active & Mining";
            await new Promise(r => setTimeout(r, 3 * 60 * 1000)); 

        } catch (e) {
            workerStatus[id] = `Error: ${e.message}`;
            console.error(`[Worker ${id}] ERROR: ${e.message}`);
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
    if (token) {
        tokens.set(token, Date.now());
        res.sendStatus(200);
    } else {
        res.status(400).send("No token provided");
    }
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

// تشغيل السيرفر و العمال الثلاثة
app.listen(PORT, () => {
    console.log(`🚀 Janus Production Engine running on port ${PORT}`);
    spawnWorker(1);
   
});
