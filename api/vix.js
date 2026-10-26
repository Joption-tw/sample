// 臺指選擇權波動率指數（VIX）資料 Proxy
// 期交所 API 不允許跨網域，由此代理抓取並精簡欄位
//   /api/vix               → 當日即時（期交所行情 API）
//   /api/vix?date=YYYYMMDD → 指定日期歷史資料（期交所每日 15 秒 txt，僅近一個月）
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const date = String((req.query && req.query.date) || '');
  try {
    if (/^\d{8}$/.test(date)) return res.status(200).send(await history(date, res));
    return res.status(200).send(await realtime(res));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function realtime(res) {
  const response = await fetch('https://mis.taifex.com.tw/futures/api/getChartDataTick', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://mis.taifex.com.tw/futures/VolatilityQuotes/',
    },
    body: JSON.stringify({ SymbolID: 'TAIWANVIX' }),
  });
  if (!response.ok) throw new Error(`TAIFEX ${response.status}`);

  const data = await response.json();
  if (data.RtCode !== '0' || !data.RtData) throw new Error(data.RtMsg || 'Bad VIX response');

  const { Info = {}, Quote = {}, Ticks = [] } = data.RtData;
  const num = v => (v === '' || v == null ? null : Number(v));

  // Ticks 欄位：[時間 HHMMSS, ..., ..., ..., 指數, ...]
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');
  return JSON.stringify({
    tradeDay: Info.TradeDay || '',
    quote: {
      open: num(Quote.COpenPrice),
      high: num(Quote.CHighPrice),
      low: num(Quote.CLowPrice),
      last: num(Quote.CLastPrice),
      ref: num(Quote.CRefPrice),
      time: Quote.CDate || '',
    },
    ticks: Ticks.filter(t => t[4] !== '').map(t => [t[0], Number(t[4])]),
  });
}

async function history(date, res) {
  const response = await fetch(`https://www.taifex.com.tw/cht/7/getVixData?filesname=${date}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!response.ok) throw new Error(`TAIFEX ${response.status}`);

  // 每行：交易日期 \t 時間(HHMMSScc) \t\t\t 指數；查無資料時期交所回傳 HTML 頁面 → ticks 為空
  const text = Buffer.from(await response.arrayBuffer()).toString('latin1');
  const ticks = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d{8})\s+(\d{7,8})\s+([\d.]+)\s*$/);
    if (m && m[1] === date) ticks.push([m[2].padStart(8, '0').slice(0, 6), Number(m[3])]);
  }

  res.setHeader('Cache-Control', ticks.length ? 's-maxage=86400' : 's-maxage=300');
  return JSON.stringify({ tradeDay: ticks.length ? date : '', ticks });
}
