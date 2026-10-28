// 每週績效存檔：把 Google 試算表「績效圖表」整份 CSV 存到 history/<週起始日>.csv
// 試算表每週三 15:00 會清空重來，所以要在清空前把本週存下來；
// 檔名用本週第一筆「日期」（週三），新的一週會寫到新檔案，不會蓋掉舊週。
// 由 .github/workflows/archive-week.yml 定時執行（node 20 內建 fetch，不需安裝套件）
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';

const SHEET_ID = '1AsY4_MJipaMp_cNLpyeXTpFGnG0FD4vWJu-SDRdvtME';
const GID = '1823639969';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const DIR = 'history';

function parseCSVLine(text) {
    const res = []; let cur = ''; let inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') { if (inQ && text[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === ',' && !inQ) { res.push(cur.trim()); cur = ''; }
        else cur += c;
    }
    res.push(cur.trim()); return res;
}

const res = await fetch(`${CSV_URL}&t=${Date.now()}`);
if (!res.ok) throw new Error(`試算表下載失敗：${res.status}`);
const text = (await res.text()).replace(/\r\n/g, '\n');

// 本週起始日 = 第一筆「資產」(col 8) 有值的列的「日期」(col 1)
let weekStart = null, rows = 0;
for (const line of text.split('\n').slice(1)) {
    const cols = parseCSVLine(line);
    if (cols.length < 54 || !cols[8]) continue;
    rows++;
    if (!weekStart && cols[1]) weekStart = cols[1];
}
const m = weekStart && weekStart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
if (!m) { console.log('本週尚無資料，略過'); process.exit(0); }
const week = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

await mkdir(DIR, { recursive: true });
const file = `${DIR}/${week}.csv`;
// 同一週只會越存越完整：已存的筆數比較多時不覆蓋（避免試算表異常時蓋掉好資料）
let oldRows = 0;
try {
    oldRows = (await readFile(file, 'utf8')).split('\n').slice(1)
        .filter(l => { const c = parseCSVLine(l); return c.length >= 54 && c[8]; }).length;
} catch {}
if (rows >= oldRows) {
    await writeFile(file, text);
    console.log(`已存檔 ${file}（${rows} 筆，原 ${oldRows} 筆）`);
} else {
    console.log(`略過 ${file}：新資料 ${rows} 筆少於已存 ${oldRows} 筆`);
}

// 週清單（新到舊），網頁的「選擇週次」從這裡讀
const weeks = (await readdir(DIR)).filter(f => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f)).map(f => f.slice(0, 10)).sort().reverse();
await writeFile(`${DIR}/index.json`, JSON.stringify({ weeks }, null, 2) + '\n');
console.log('週清單：', weeks.join(', '));
