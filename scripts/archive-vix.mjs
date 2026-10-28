// 每日 VIX 存檔：把臺指選擇權波動率指數（期交所）存到 history/vix/<YYYYMMDD>.json
// 期交所歷史資料只保留約一個月，所以每天存下來，舊週的圖表與表格才會一直有 VIX。
//   1. 即時行情（/api/vix）：當日 15 秒走勢 + 開高低收、昨收（ref）；日盤 13:45 收盤後即為完整一天
//   2. 補抓：近 35 天內還沒存的交易日，用 /api/vix?date= 向期交所歷史資料補齊
// 由 .github/workflows/archive-week.yml 定時執行（node 20 內建 fetch）
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const API = 'https://demo-performance.vercel.app/api/vix';
const DIR = 'history/vix';

const ymd = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
}
async function savedTicks(date) {
    try { return (JSON.parse(await readFile(`${DIR}/${date}.json`, 'utf8')).ticks || []).length; } catch { return -1; }
}
async function save(date, data) {
    const old = await savedTicks(date);
    if (!data.ticks || !data.ticks.length || data.ticks.length < old) return false;
    // 已存的昨收（ref）保留，避免被只有走勢的歷史資料覆蓋掉
    if (!data.quote && old >= 0) {
        try { const prev = JSON.parse(await readFile(`${DIR}/${date}.json`, 'utf8')); if (prev.quote) data.quote = prev.quote; } catch {}
    }
    await writeFile(`${DIR}/${date}.json`, JSON.stringify({ tradeDay: date, quote: data.quote || null, ticks: data.ticks }) + '\n');
    console.log(`已存 ${date}（${data.ticks.length} 筆${data.quote ? '，含昨收' : ''}）`);
    return true;
}

await mkdir(DIR, { recursive: true });

// 1. 今日（或最近一個交易日）即時行情
try {
    const live = await getJSON(`${API}?t=${Date.now()}`);
    if (live.tradeDay) await save(live.tradeDay, live);
} catch (e) { console.log('即時 VIX 取得失敗：', e.message); }

// 2. 補抓近 35 天（台灣時間）還沒存的平日
const twToday = new Date(Date.now() + 8 * 3600e3);
for (let k = 1; k <= 35; k++) {
    const d = new Date(twToday); d.setUTCDate(d.getUTCDate() - k);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const date = ymd(d);
    if (await savedTicks(date) > 0) continue;
    try {
        const h = await getJSON(`${API}?date=${date}&t=${Date.now()}`);
        if (!(await save(date, h))) console.log(`${date} 無資料（休市或已超過期交所保留期間）`);
    } catch (e) { console.log(`${date} 補抓失敗：`, e.message); }
}
