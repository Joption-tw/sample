// 示範帳戶績效：週三清空前的備份
// 示範帳戶試算表每週三 15:00 清空。GitHub 排程常常晚好幾個小時，可能來不及在清空前存檔，
// 所以週三收盤後由 Apps Script 準時把整份資料複製到投資報表試算表的「示範週備份」分頁（隱藏），
// GitHub Actions（scripts/archive-week.mjs）之後隨時都能從這裡存到 history/<週>.csv，晚幾小時也不會少資料。
// 跟同一個專案裡的其他檔案共用名稱空間，所以名稱都加 weekBak / WEEKBAK_ 前綴，避免撞名。
//
// 安裝（只要做一次）：
//   1. 打開投資報表試算表 → 上方選單「擴充功能」→「Apps Script」
//   2. 左邊「檔案」旁的 ＋ →「指令碼」，取名「示範週備份」，把這整個檔案貼上，按儲存
//   3. 上方函式選單選 weekBakSetup → 按「執行」→ 依畫面授權（用你自己的 Google 帳號）
//   4. 回到試算表不會看到新分頁（已隱藏），這樣就完成了；之後每週三 13:46～14:55 每 10 分鐘自動備份一次
// 停止：在 Apps Script 執行 weekBakStop

const WEEKBAK_SOURCE = 'https://docs.google.com/spreadsheets/d/1AsY4_MJipaMp_cNLpyeXTpFGnG0FD4vWJu-SDRdvtME/export?format=csv&gid=1823639969';
const WEEKBAK_TAB    = '示範週備份';
const WEEKBAK_TZ     = 'Asia/Taipei';

function weekBakSetup() {
  weekBakStop();
  ScriptApp.newTrigger('weekBakRun').timeBased().everyMinutes(10).create();
  weekBakRun(true);
}

function weekBakStop() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'weekBakRun')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function weekBakSheet_(rows, cols) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(WEEKBAK_TAB);
  if (!sh) {
    sh = ss.insertSheet(WEEKBAK_TAB, ss.getNumSheets());   // 放在最後面，不影響其他分頁的順序
    sh.hideSheet();
  }
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  return sh;
}

// 觸發器每 10 分鐘叫一次；只有週三 13:46～14:55（早盤收盤後、清空前）才動作，其他時間馬上結束
function weekBakRun(force) {
  const [dow, hh, mm] = Utilities.formatDate(new Date(), WEEKBAK_TZ, 'u,H,m').split(',').map(Number);
  const m = hh * 60 + mm;
  if (force !== true && !(dow === 3 && m >= 826 && m <= 895)) return;

  const res = UrlFetchApp.fetch(WEEKBAK_SOURCE, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('示範帳戶試算表下載失敗：' + res.getResponseCode());
  const rows = Utilities.parseCsv(res.getContentText('UTF-8'));
  const data = rows.slice(1).filter(r => r.length >= 54 && r[8]);   // 「資產」(第 9 欄) 有值的才算有資料
  if (!data.length || !data[0][1]) { console.log('本週尚無資料，略過'); return; }

  // 同一週只會越存越完整：試算表異常、筆數變少時不蓋掉已備份的資料
  const week = data[0][1];
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('weekBakWeek') === week && data.length < Number(props.getProperty('weekBakRows') || 0)) {
    console.log('略過：' + week + ' 新資料 ' + data.length + ' 筆少於已備份的筆數');
    return;
  }

  const cols = Math.max.apply(null, rows.map(r => r.length));
  const values = rows.map(r => r.concat(Array(cols - r.length).fill('')));
  const sh = weekBakSheet_(values.length, cols);
  sh.clearContents();
  const range = sh.getRange(1, 1, values.length, cols);
  range.setNumberFormat('@');                                       // 全部存成文字，原樣保留試算表顯示的數字
  range.setValues(values);
  props.setProperty('weekBakWeek', week);
  props.setProperty('weekBakRows', String(data.length));
  console.log('已備份 ' + week + '：' + data.length + ' 筆');
}
