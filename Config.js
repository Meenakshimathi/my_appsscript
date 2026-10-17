/**
 * Kamagere Mart – Google Apps Script backend
 * -------------------------------------------------------------
 * Config.gs : constants, Script Properties helpers, one-time setup
 *
 * Secrets (admin e-mail / password, JWT secret) live in
 * Project Settings -> Script Properties, NEVER in the code.
 * Run the function  setup()  once (see GUIDE.md) and it creates them for you.
 */

var DATABASE_SPREADSHEET_ID = '1aXBAbSz1v1eUZBA7Yf-hU9EygPEQuB6Hq6h3WcfzuaQ';
var DEFAULT_STORE_LOCATION = 'Koramangala, Bengaluru, Karnataka, India';
var DEFAULT_STOCK = 20;
var MAX_STOCK = 1000000;
var TZ = 'Asia/Kolkata';
var APP_TITLE = 'Kamagere Mart — Fresh essentials delivered';

var EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
var PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{8,}$/;
var PHONE_REGEX = /^[6-9]\d{9}$/;

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

/**
 * RUN THIS from the Apps Script editor after granting access to the database sheet.
 *  - connects to the configured Google Sheet and creates its tabs / headers
 *  - seeds the 12 default products when the Products tab is empty
 *  - creates ADMIN_JWT_SECRET, and default ADMIN_EMAIL / ADMIN_PASSWORD if you
 *    have not set them yet (CHANGE the password in Script Properties!)
 */
function setup() {
  setProp_('SPREADSHEET_ID', DATABASE_SPREADSHEET_ID);
  _ss = null;
  _schemaChecked = false;
  _blobCache = null;
  if (!prop_('ADMIN_EMAIL')) setProp_('ADMIN_EMAIL', 'admin@gmail.com');
  if (!prop_('ADMIN_PASSWORD')) setProp_('ADMIN_PASSWORD', 'Admin@12345');
  if (!prop_('ADMIN_JWT_SECRET')) {
    setProp_('ADMIN_JWT_SECRET', randomHex_(16) + randomHex_(16) + randomHex_(16));
  }
  ensureSchema_(true);
  var url = ss_().getUrl();
  Logger.log('Setup complete.');
  Logger.log('Database sheet : ' + url);
  Logger.log('Admin e-mail   : ' + prop_('ADMIN_EMAIL'));
  Logger.log('Admin password : ' + prop_('ADMIN_PASSWORD') + '   <-- change it in Project Settings > Script Properties');
  return url;
}

/** Handy for the editor: logs how many rows each sheet holds. */
function status() {
  var out = {};
  Object.keys(SCHEMAS).forEach(function (name) {
    out[name] = Math.max(0, sheet_(name).getLastRow() - 1);
  });
  Logger.log(JSON.stringify(out));
  return out;
}
