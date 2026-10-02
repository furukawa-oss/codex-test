/** Sales Compass backend. Deploy as a Workspace-domain-only web app. */
const CONFIG = Object.freeze({
  DOMAIN: 'zenken.co.jp',
  LEDGER_ID_PROPERTY: 'CUSTOMER_LEDGER_SPREADSHEET_ID',
  DATASTORE_ID_PROPERTY: 'DATASTORE_SPREADSHEET_ID',
  CUSTOMER_SHEET_NAME: '顧客台帳',
  CUSTOMER_FILE_COLUMN: 16, // P列
});

function doGet() {
  const user = requireAuthorizedUser_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sales Compass')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** UIからの顧客取得。返却前に必ずサーバー側で閲覧範囲を絞り込む。 */
function getCustomers() {
  const user = requireAuthorizedUser_();
  const records = readDatastore_('Customers');
  return records.filter((customer) => canViewCustomer_(user, customer));
}

/** 更新系API。上層部は常に拒否し、担当範囲も再検証する。 */
function updateCustomer(customerId, patch) {
  const user = requireAuthorizedUser_();
  if (user.role === 'EXECUTIVE') throw new Error('閲覧専用の権限です。');
  const customer = findCustomer_(customerId);
  if (!customer || !canViewCustomer_(user, customer)) throw new Error('権限がありません。');
  const allowedKeys = ['nextAction', 'status', 'note'];
  const safePatch = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowedKeys.includes(key)));
  writeCustomerPatch_(customerId, safePatch, user.email);
  return { ok: true };
}

/** 1時間ごとの時間主導トリガーに登録する同期処理。 */
function syncAllCustomers() {
  requireTriggerOwner_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('別の同期処理が実行中です。');
  try {
    const ledgerId = requiredProperty_(CONFIG.LEDGER_ID_PROPERTY);
    const sourceSheet = SpreadsheetApp.openById(ledgerId).getSheetByName(CONFIG.CUSTOMER_SHEET_NAME);
    const values = sourceSheet.getDataRange().getDisplayValues();
    values.slice(1).forEach((row) => syncOneCustomer_(row));
    recordSyncState_('SUCCESS', '', new Date());
  } catch (error) {
    recordSyncState_('ERROR', String(error && error.message || error), new Date());
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function syncOneCustomer_(ledgerRow) {
  const url = ledgerRow[CONFIG.CUSTOMER_FILE_COLUMN - 1];
  if (!url) return;
  const sourceId = extractSpreadsheetId_(url);
  const source = SpreadsheetApp.openById(sourceId); // 読み取りのみ。元ファイルへは書き込まない。
  const summary = source.getSheetByName('サマリー');
  if (!summary) throw new Error(`サマリーシートがありません: ${sourceId}`);
  const snapshot = summary.getDataRange().getDisplayValues();
  upsertSnapshot_(sourceId, ledgerRow, snapshot);
}

function requireAuthorizedUser_() {
  const email = Session.getActiveUser().getEmail().toLowerCase();
  if (!email || !email.endsWith(`@${CONFIG.DOMAIN}`)) throw new Error('Zenken Workspaceでログインしてください。');
  const accessRows = readDatastore_('AccessControl');
  const entry = accessRows.find((row) => String(row.email).toLowerCase() === email && String(row.enabled).toLowerCase() === 'true');
  if (!entry) throw new Error('このアカウントは利用を許可されていません。');
  return { email, role: entry.role, team: entry.team };
}

function canViewCustomer_(user, customer) {
  if (user.role === 'EXECUTIVE') return true;
  if (user.role === 'MANAGER') return customer.team === user.team;
  return customer.ownerEmail === user.email;
}

function requireTriggerOwner_() {
  const effective = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!effective.endsWith(`@${CONFIG.DOMAIN}`)) throw new Error('不正なトリガー実行者です。');
}

function extractSpreadsheetId_(url) {
  const match = String(url).match(/[-\w]{25,}/);
  if (!match) throw new Error(`スプレッドシートURLが不正です: ${url}`);
  return match[0];
}

function requiredProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error(`スクリプトプロパティ ${key} が未設定です。`);
  return value;
}

function datastoreSheet_(name) {
  const id = requiredProperty_(CONFIG.DATASTORE_ID_PROPERTY);
  const sheet = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sheet) throw new Error(`データストアに ${name} シートがありません。`);
  return sheet;
}

function readDatastore_(name) {
  const values = datastoreSheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function findCustomer_(customerId) {
  return readDatastore_('Customers').find((row) => String(row.customerId) === String(customerId));
}

function writeCustomerPatch_(customerId, patch, editor) {
  const sheet = datastoreSheet_('Customers');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const rowIndex = values.findIndex((row, index) => index > 0 && String(row[headers.indexOf('customerId')]) === String(customerId));
  if (rowIndex < 0) throw new Error('顧客が見つかりません。');
  Object.entries(patch).forEach(([key, value]) => sheet.getRange(rowIndex + 1, headers.indexOf(key) + 1).setValue(value));
  appendAuditLog_('UPDATE_CUSTOMER', customerId, editor);
}

function upsertSnapshot_(sourceId, ledgerRow, snapshot) {
  const sheet = datastoreSheet_('RawSnapshots');
  sheet.appendRow([sourceId, new Date(), JSON.stringify(ledgerRow), JSON.stringify(snapshot)]);
}

function recordSyncState_(status, message, date) {
  datastoreSheet_('SyncLog').appendRow([date, status, message]);
}

function appendAuditLog_(action, target, actor) {
  datastoreSheet_('AuditLog').appendRow([new Date(), actor, action, target]);
}
