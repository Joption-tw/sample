// 臺指選擇權波動率指數（VIX）即時資料 Proxy
// 期交所行情 API 不允許跨網域呼叫，由此代理抓取並精簡欄位
export default async function handler(req, res) {
  const url = 'https://mis.taifex.com.tw/futures/api/getChartDataTick';

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://mis.taifex.com.tw/futures/VolatilityQuotes/',
      },
      body: JSON.stringify({ SymbolID: 'TAIWANVIX' }),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch VIX' });
    }

    const data = await response.json();
    if (data.RtCode !== '0' || !data.RtData) {
      return res.status(502).json({ error: data.RtMsg || 'Bad VIX response' });
    }

    const { Info = {}, Quote = {}, Ticks = [] } = data.RtData;
    const num = v => (v === '' || v == null ? null : Number(v));

    // Ticks 欄位：[時間 HHMMSS, ..., ..., ..., 指數, ...]
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');
    res.status(200).json({
      tradeDay: Info.TradeDay || '',
      sessions: Info.Sessions || [],
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
