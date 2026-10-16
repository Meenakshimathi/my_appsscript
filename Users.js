/**
 * Users.gs : register, login (admin + customer on one form), profile, Google sign-in.
 */

function publicUser_(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    address: row.address || '',
    profileImage: row.profileImage || ''
  };
}

function findUserBy_(table, fn) {
  for (var i = 0; i < table.rows.length; i++) if (fn(table.rows[i])) return table.rows[i];
  return null;
}

function register_(ctx) {
  var b = ctx.body;
  var name = String(b.name || '').trim();
  var email = String(b.email || '').trim().toLowerCase();
  var phone = String(b.phone || '').trim();
  var password = b.password;

  if (!name || !email || !phone || !password) return fail_(400, 'Please fill all required fields');
  if (!EMAIL_REGEX.test(email)) return fail_(400, 'Please enter a valid email address.');
  if (!PHONE_REGEX.test(phone)) return fail_(400, 'Please enter a valid 10-digit Indian mobile number.');
  if (!PASSWORD_REGEX.test(String(password))) {
    return fail_(400, 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special symbol.');
  }

  var users = readTable_('Users');
  var emailTaken = findUserBy_(users, function (u) { return String(u.email).toLowerCase() === email; });
  var phoneTaken = findUserBy_(users, function (u) { return u.phone === phone; });
  if (emailTaken || phoneTaken) {
    return fail_(409, emailTaken && phoneTaken
      ? 'This email address and phone number are already registered.'
      : emailTaken ? 'Email is already registered.' : 'Phone number is already registered.');
  }

  var id = nextId_('Users');
  insertRow_('Users', {
    id: id, name: name, email: email, phone: phone, password: hashPassword_(String(password)),
    address: String(b.address || ''), profileImage: ''
  });
  var row = findUserBy_(readTable_('Users'), function (u) { return u.id === id; });
  return ok_({ message: 'Registration successful', user: publicUser_(row) }, 201);
}

function login_(ctx) {
  var email = ctx.body.email;
  var password = ctx.body.password;
  if (!email || !password) return fail_(400, 'Email and password are required.');
  if (!EMAIL_REGEX.test(String(email).trim())) return fail_(400, 'Please enter a valid email address.');

  // One login form for everyone: admin credentials first, then customers.
  var admin = checkAdminCredentials_(email, password);
  if (admin.ok) {
    return ok_({ message: 'Admin login successful', role: 'admin', token: admin.token, admin: { email: admin.email, role: 'admin' } });
  }

  if (!PASSWORD_REGEX.test(String(password))) {
    return fail_(400, 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special symbol.');
  }
  var wanted = String(email).trim().toLowerCase();
  var user = findUserBy_(readTable_('Users'), function (u) { return String(u.email).toLowerCase() === wanted; });
  if (!user || !user.password || !verifyPassword_(String(password), user.password)) {
    return fail_(401, 'Invalid email or password.');
  }
  return ok_({ message: 'Login successful', role: 'customer', user: publicUser_(user), token: createCustomerToken_(user) });
}

function adminLogin_(ctx) {
  var email = ctx.body.email;
  var password = ctx.body.password;
  if (!email || !password || typeof password !== 'string') return fail_(400, 'Admin email and password are required.');
  if (!EMAIL_REGEX.test(String(email).trim())) return fail_(400, 'Please enter a valid admin email address.');
  var check = checkAdminCredentials_(email, password);
  if (!check.configured) return fail_(503, 'Admin login is not configured.');
  if (!check.ok) return fail_(401, 'Invalid admin email or password.');
  return ok_({ message: 'Admin login successful', token: check.token, admin: { email: check.email, role: 'admin' } });
}

function adminSession_(ctx, m, auth) {
  return ok_({ admin: { email: auth.session.email, role: 'admin' }, expiresAt: auth.session.exp ? auth.session.exp * 1000 : null });
}

function updateProfile_(ctx, m, auth) {
  var b = ctx.body;
  var name = String(b.name || '').trim();
  var email = String(b.email || '').trim();
  var phone = String(b.phone || '').trim();
  var address = String(b.address || '').trim();
  var photo = String(b.profileImage || '');

  if (!name || name.length > 255) return fail_(400, 'Enter a name up to 255 characters.');
  if (!EMAIL_REGEX.test(email)) return fail_(400, 'Please enter a valid email address.');
  if (!PHONE_REGEX.test(phone)) return fail_(400, 'Please enter a valid 10-digit Indian mobile number.');
  if (address.length > 2000) return fail_(400, 'Address must be 2,000 characters or fewer.');
  if (photo.length > 100000 || (photo && !/^data:image\/jpeg;base64,[A-Za-z0-9+\/]+={0,2}$/.test(photo))) {
    return fail_(400, 'Profile photos must be JPEG images smaller than 75 KB.');
  }

  var users = readTable_('Users');
  var dup = findUserBy_(users, function (u) {
    return u.id !== auth.customerId && (String(u.email).toLowerCase() === email.toLowerCase() || u.phone === phone);
  });
  if (dup) return fail_(409, 'That email address or phone number is already in use.');

  var existing = findUserBy_(users, function (u) { return u.id === auth.customerId; });
  if (!existing) return fail_(404, 'Customer account not found.');

  existing.name = name;
  existing.email = email;
  existing.phone = phone;
  existing.address = address;
  existing.profileImage = photo || existing.profileImage || '';
  updateRow_('Users', existing._row, existing);
  return ok_({ message: 'Profile updated successfully.', user: publicUser_(existing) });
}

// ---------------------------------------------------------------- Google login

function googleConfig_() {
  return ok_({ clientId: prop_('GOOGLE_CLIENT_ID') || null });
}

/** Verifies a Google ID token through Google's tokeninfo endpoint. */
function googleSignIn_(ctx) {
  var clientId = prop_('GOOGLE_CLIENT_ID');
  if (!clientId) return fail_(503, 'Google sign-in is not configured. Add GOOGLE_CLIENT_ID in Script Properties.');
  var credential = String(ctx.body.credential || '');
  if (!credential || credential.length > 12000) return fail_(400, 'A valid Google credential is required.');

  var info;
  try {
    var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return fail_(401, 'Unable to verify your Google account.');
    info = JSON.parse(resp.getContentText());
  } catch (e) {
    return fail_(401, 'Unable to verify your Google account.');
  }
  if (info.aud !== clientId) return fail_(401, 'Unable to verify your Google account.');
  if (!info.sub || !info.email || String(info.email_verified) !== 'true') {
    return fail_(401, 'Google did not provide a verified email address.');
  }

  var users = readTable_('Users');
  var wanted = String(info.email).toLowerCase();
  var user = findUserBy_(users, function (u) { return String(u.email).toLowerCase() === wanted; });
  if (!user) {
    var id = nextId_('Users');
    insertRow_('Users', {
      id: id, name: String(info.name || wanted.split('@')[0]).slice(0, 255), email: info.email, phone: '',
      password: '', address: '', profileImage: ''
    });
    user = findUserBy_(readTable_('Users'), function (u) { return u.id === id; });
  }
  return ok_({ message: 'Google sign-in successful', user: publicUser_(user), token: createCustomerToken_(user) });
}
