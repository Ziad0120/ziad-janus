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
            console.log(`[Worker ${id}] Launching browser...`);
            
            browser = await puppeteer.launch({
                headless: "new",
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--single-process", // تقليل استهلاك الرام
                    "--no-zygote",
                    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ]
            });

            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(60000);
            
            workerStatus[id] = "Navigating...";
            await page.goto('https://gartic.io/', { waitUntil: 'domcontentloaded' });

            // دالة الإبلاغ من المتصفح إلى السيرفر
            await page.exposeFunction("reportToken", (token) => {
                if (!tokens.has(token)) {
                    tokens.set(token, Date.now());
                    console.log(`[Worker ${id}] SUCCESS! Token Captured. Total: ${tokens.size}`);
                }
            });

            // محاكاة سكربت التيمبرمونكي داخل الصفحة
            // ... (باقي الكود كما هو)

            // محاكاة سكربت التيمبرمونكي مع سجلات فحص مفصلة
            await page.evaluate(() => {
                const TOKEN_INTERVAL = 5000;
                
                function requestToken() {
                    try {
                        console.log("[Browser] Attempting to find Turnstile container...");
                        const container = document.querySelector("#cf-turnstile");
                        
                        if (!container) {
                            console.log("[Browser] Error: #cf-turnstile container NOT FOUND in DOM!");
                            return;
                        }
                        
                        if (!window.turnstile) {
                            console.log("[Browser] Error: window.turnstile object NOT FOUND! Cloudflare script might be blocked.");
                            return;
                        }

                        console.log("[Browser] Turnstile found, rendering...");
                        container.innerHTML = "";
                        window.turnstile.render(container, {
                            sitekey: "0x4AAAAAABBPKaIbNwnPEfSo",
                            callback: (token) => {
                                console.log("[Browser] SUCCESS: Turnstile callback fired!");
                                window.reportToken(token);
                            },
                            "error-callback": (err) => {
                                console.log("[Browser] FAILURE: Turnstile reported error:", err);
                            }
                        });
                    } catch (e) { 
                        console.error("[Browser] Critical JS Error:", e); 
                    }
                }

                // إضافة فحص أولي للتحقق من أن الموقع هو نفسه الذي نتوقعه
                console.log("[Browser] Current URL:", window.location.href);
                requestToken();
                setInterval(requestToken, TOKEN_INTERVAL);
            });

// ... (باقي الكود كما هو)


            workerStatus[id] = "Active & Mining";
            
            // انتظر 3 دقائق ثم أعد التشغيل لتفريغ الرام
            await new Promise(r => setTimeout(r, 3 * 60 * 1000)); 

        } catch (e) {
            workerStatus[id] = `Error: ${e.message}`;
            console.error(`[Worker ${id}] CRITICAL ERROR: ${e.message}`);
        } finally {
            if (browser) await browser.close();
            workerStatus[id] = "Restarting...";
            setTimeout(run, 5000); // إعادة المحاولة بعد 5 ثواني
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
