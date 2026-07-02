const express = require("express");
const cors = require("cors");
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
let tokens = new Map();
let workerStatus = { 1: "Starting", 2: "Starting", 3: "Starting" };

app.use(cors());

// --- 1. الوظائف الأساسية (التنظيف والتخزين) ---
const cleanup = () => {
    const limit = Date.now() - 5 * 60 * 1000; // 5 دقائق
    for (let [token, time] of tokens) if (time < limit) tokens.delete(token);
};
setInterval(cleanup, 60 * 1000); // تنظيف كل دقيقة

// --- 2. محرك الإنتاج الذكي ---
async function spawnWorker(id) {
    const run = async () => {
        let browser;
        try {
            workerStatus[id] = "Launching...";
            
            // بحث ذكي عن مسار الكروم في Render أو أي سيرفر Linux
            // التحقق من المسارات المتاحة لمنع خطأ "executable not found"
            const browser = await puppeteer.launch({
    executablePath: "/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome",
    headless: "new",
    args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote"
    ]
});

            const page = await browser.newPage();
            // ضبط وقت انتظار محدد للـ Navigation لضمان عدم تعليق العامل
            await page.setDefaultNavigationTimeout(60000); 
            
            workerStatus[id] = "Navigating...";
            await page.goto('https://gartic.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });

            // حقن وظيفة التخزين المباشر من المتصفح إلى السيرفر
            await page.exposeFunction('reportToken', (token) => {
                tokens.set(token, Date.now());
                console.log(`[${new Date().toLocaleTimeString()}] Worker ${id} captured token`);
            });

            // مراقبة التغيرات في الصفحة لالتقاط التوكن بمجرد ظهوره
            await page.evaluate(() => {
                const observer = new MutationObserver(() => {
                    const token = window.turnstile?.getResponse();
                    if (token) window.reportToken(token);
                });
                observer.observe(document.body, { childList: true, subtree: true });
            });

            workerStatus[id] = "Active & Mining";
            
            // دورة عمل محددة (3 دقائق) ثم إجبار المتصفح على الإغلاق للتنظيف
            await new Promise(r => setTimeout(r, 3 * 60 * 1000)); 

        } catch (e) {
            workerStatus[id] = `Error: ${e.message}`;
            console.error(`Worker ${id} Error: ${e.message}`);
        } finally {
            // إغلاق المتصفح لضمان عدم وجود عمليات معلقة (Zombie Processes)
            if (browser) await browser.close();
            workerStatus[id] = "Restarting...";
            // استراتيجية إعادة المحاولة (Backoff) بعد 5 ثواني
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

app.get("/status", (req, res) => {
    res.json({ serverTime: new Date().toISOString(), workers: workerStatus, totalTokens: tokens.size });
});

app.listen(PORT, () => {
    console.log(`🚀 Janus Production Engine running on port ${PORT}`);
    [1, 2, 3].forEach(spawnWorker);
});
