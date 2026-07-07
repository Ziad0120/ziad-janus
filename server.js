const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");

const app = express();
const PORT = 3000;

// إصلاح: تعريف CORS مرة واحدة فقط
const corsOptions = {
    origin: ['https://gartic.io', 'https://www.croxyproxy.com'],
    methods: ['GET', 'POST'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

let tokens = []; 

// وظيفة حذف التوكنات القديمة
const removeExpiredTokens = () => {
    const currentTime = Date.now();
    tokens = tokens.filter(token => currentTime - token.timestamp < 5 * 60 * 1000); 
};

// --- المصنع (Puppeteer) ---
async function startFactory() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto("https://gartic.io");

    await page.evaluate(() => {
        const TOKEN_INTERVAL = 5000;
        const PAGE_REFRESH_INTERVAL = 2 * 60 * 1000; // منع التجمد بإعادة التحميل

        function requestToken() {
            try {
                window.turnstile.render("#cf-turnstile", {
                    sitekey: "0x4AAAAAABBPKaIbNwnPEfSo",
                    callback: function (token) {
                        console.log("Token received, sending to server...");
                        fetch("http://localhost:3000/add-token", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ token: token })
                        })
                        .then(res => res.json())
                        .then(data => console.log("Server Response:", data)) // التغذية الراجعة
                        .catch(err => console.error("Error sending token:", err));
                    }
                });
            } catch (e) { console.error("Turnstile error:", e); }
        }
        
        setInterval(requestToken, TOKEN_INTERVAL);
        requestToken();

        // منطق صيانة المتصفح
        setTimeout(() => {
            console.log("Refreshing page to prevent freeze...");
            location.reload();
        }, PAGE_REFRESH_INTERVAL);
    });
}

// API لإضافة توكن جديد
app.post("/add-token", (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });
    tokens.push({ token, timestamp: Date.now() });
    console.log("Token received and stored:", token);
    res.json({ message: "Token added successfully", token });
});

// API لاسترجاع التوكنات
app.get("/get-tokens", (req, res) => {
    removeExpiredTokens(); 
    res.json({ tokens: tokens.map(t => t.token), count: tokens.length });
});

// API لنسخ التوكنات
app.get("/copy-tokens", (req, res) => {
    removeExpiredTokens(); 
    res.json({ tokens: tokens.map(t => t.token) });
});

// API لتشغيل المصنع
app.get("/start-factory", async (req, res) => {
    await startFactory();
    res.send("Factory engine started with maintenance protocols active.");
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// تشغيل الصيانة التلقائية (كل دقيقة)
setInterval(removeExpiredTokens, 60 * 1000); 