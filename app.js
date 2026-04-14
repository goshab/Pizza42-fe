import { createAuth0Client } from '@auth0/auth0-spa-js';
import { placeOrder, resendVerificationEmail, updateProfile } from './api.js';

// DOM elements
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const errorDetails = document.getElementById('error-details');
const loginPage = document.getElementById('login-page');
const workingPage = document.getElementById('working-page');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const accountBtn = document.getElementById('account-btn');
const accountMenu = document.getElementById('account-menu');
const accountName = document.getElementById('account-name');
const accountAvatar = document.getElementById('account-avatar');

let auth0Client;
let currentUser = null;
let ordersCache = null; // populated from ID token on login, updated on new orders

// Initialize Auth0 client
async function initAuth0() {
  try {
    auth0Client = await createAuth0Client({
      domain: import.meta.env.VITE_AUTH0_DOMAIN,
      clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: 'openid profile email read:orders write:order'
      }
    });

    if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    }


    await updateUI();
  } catch (err) {
    showError(err.message);
  }
}

// Update UI based on authentication state
async function updateUI() {
  try {
    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated) {
      currentUser = await auth0Client.getUser();
      const claims = await auth0Client.getIdTokenClaims();
      // console.log('ID token:', claims.__raw);
      ordersCache = claims['https://pizza42.com/orders'] ?? [];
      showWorkingPage();
    } else {
      showLoginPage();
    }

    hideLoading();
  } catch (err) {
    showError(err.message);
  }
}

// Show working page and populate account info
function showWorkingPage() {
  loginPage.style.display = 'none';
  workingPage.style.display = 'block';

  if (currentUser) {
    accountName.textContent = currentUser.name || currentUser.email || 'Account';
    if (currentUser.picture) {
      accountAvatar.innerHTML = `<img src="${currentUser.picture}" alt="${currentUser.name}" onerror="this.parentElement.textContent='👤'" />`;
    } else {
      accountAvatar.textContent = '👤';
    }

    const isPasswordUser = currentUser.sub?.startsWith('auth0|');
    const display = isPasswordUser ? 'block' : 'none';
    document.getElementById('change-password-btn').style.display = display;
    document.getElementById('change-password-divider').style.display = display;
    document.querySelectorAll('[data-page="profile"]').forEach(el => el.style.display = display);
  }

  const pendingPage = sessionStorage.getItem('pendingPage') || 'home';
  sessionStorage.removeItem('pendingPage');
  showPage(pendingPage);
}

function showLoginPage() {
  workingPage.style.display = 'none';
  loginPage.style.display = 'flex';
}

// Page navigation
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const target = document.getElementById(`page-${name}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === name);
  });

  if (name === 'history') {
    loadOrderHistory();
  }

  if (name === 'order') {
    checkEmailVerification();
  }

  if (name === 'profile') {
    document.getElementById('profile-name').value = currentUser?.name ?? '';
    document.getElementById('profile-feedback').style.display = 'none';
  }
}

function checkEmailVerification() {
  if (currentUser?.email_verified) return;

  document.getElementById('modal-email').textContent = currentUser.email;
  const modal = document.getElementById('verify-modal');
  modal.style.display = 'flex';

  document.getElementById('modal-close-btn').onclick = () => {
    modal.style.display = 'none';
    showPage('home');
  };

  const resendBtn = document.getElementById('modal-resend-btn');
  resendBtn.disabled = false;
  resendBtn.textContent = 'Resend Verification Email';
  resendBtn.onclick = async () => {
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending...';
    try {
      const token = await getToken();
      await resendVerificationEmail(currentUser.email, token);
      resendBtn.textContent = 'Email sent!';
    } catch {
      resendBtn.textContent = 'Failed — try again later';
    }
  };
}

// Render order history from in-memory cache (populated from ID token on login)
function loadOrderHistory() {
  const container = document.getElementById('orders-content');

  if (!ordersCache || ordersCache.length === 0) {
    container.innerHTML = '<p class="orders-empty">No orders found.</p>';
    return;
  }

  const excludeKeys = new Set(['email']);
  const orderKeys = new Set(ordersCache.flatMap(o => Object.keys(o)));
  const allKeys = [...orderKeys].filter(k => !excludeKeys.has(k) && k !== 'total');
  allKeys.push('total');
  const pizzaEmoji = { Margherita: '🍕', Pepperoni: '🥩', Veggie: '🌿' };

  const rowsWithTotal = ordersCache.map(order => {
    const cells = allKeys.map(k => {
      const v = order[k];
      if (Array.isArray(v)) {
        const lines = v.map(item => {
          const name = item?.name ?? JSON.stringify(item);
          const emoji = pizzaEmoji[name] ?? '🍕';
          return `<div class="pizza-row">${emoji} ${name}</div>`;
        }).join('');
        return `<td>${lines}</td>`;
      }
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v)) {
        return `<td>${new Date(v).toLocaleString()}</td>`;
      }
      if (k === 'total') {
        return `<td>${typeof v === 'number' ? '$' + v.toFixed(2) : ''}</td>`;
      }
      return `<td>${v ?? ''}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  });

  const headers = allKeys.map(k => `<th>${k}</th>`).join('');

  container.innerHTML = `
    <table class="orders-table">
      <thead><tr>${headers}</tr></thead>
      <tbody>${rowsWithTotal.join('')}</tbody>
    </table>
  `;
}

// Auth actions
async function login() {
  try {
    await auth0Client.loginWithRedirect();
  } catch (err) {
    console.error('Login error:', err);
    showError(err.message);
  }
}
// async function login() {
//   try {
//     await auth0Client.loginWithPopup();
//     await updateUI();
//   } catch (err) {
//     if (err.error !== 'popup_closed_by_user') {
//       showError(err.message);
//     }
//   }
// }

async function logout() {
  try {
    await auth0Client.logout({ logoutParams: { returnTo: window.location.origin } });
  } catch (err) {
    showError(err.message);
  }
}

// Get an access token. All scopes are requested at login time, so this
// should always succeed silently after the user has consented once.
// Falls back to a redirect if the session has expired or consent was revoked.
async function getToken() {
  try {
    return await auth0Client.getTokenSilently();
  } catch (err) {
    if (err.error === 'consent_required' || err.error === 'login_required' || err.error === 'interaction_required') {
      const currentPage = document.querySelector('.page:not([style*="display: none"])')?.id?.replace('page-', '') || 'order';
      sessionStorage.setItem('pendingPage', currentPage);
      await auth0Client.loginWithRedirect();
      // loginWithRedirect navigates away — execution stops here
    }
    throw err;
  }
}

// UI helpers
function hideLoading() {
  loading.style.display = 'none';
}

function showInfoModal(icon, title, body) {
  document.getElementById('info-modal-icon').textContent = icon;
  document.getElementById('info-modal-title').textContent = title;
  document.getElementById('info-modal-body').textContent = body;
  const modal = document.getElementById('info-modal');
  modal.style.display = 'flex';
  document.getElementById('info-modal-close-btn').onclick = () => {
    modal.style.display = 'none';
  };
}

function showError(message) {
  loading.style.display = 'none';
  loginPage.style.display = 'none';
  workingPage.style.display = 'none';
  error.style.display = 'block';
  errorDetails.textContent = message;
}

// Account dropdown toggle
accountBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = accountMenu.style.display !== 'none';
  accountMenu.style.display = isOpen ? 'none' : 'block';
});

document.addEventListener('click', () => {
  accountMenu.style.display = 'none';
});

// Menu item navigation (dropdown + sidebar share the same handler)
document.querySelectorAll('.menu-item[data-page], .nav-item[data-page]').forEach(item => {
  item.addEventListener('click', () => {
    showPage(item.dataset.page);
    accountMenu.style.display = 'none';
  });
});

// Quantity buttons + totals
function updateTotals() {
  let grand = 0;
  document.querySelectorAll('.pizza-order-card').forEach(card => {
    const qty = parseInt(card.querySelector('.qty-value').textContent);
    const price = parseFloat(card.dataset.price);
    const line = qty * price;
    card.querySelector('.line-total').textContent = `$${line.toFixed(2)}`;
    grand += line;
  });
  document.getElementById('order-total-value').textContent = `$${grand.toFixed(2)}`;
}

document.querySelectorAll('.pizza-order-card').forEach(card => {
  const display = card.querySelector('.qty-value');
  card.querySelector('[data-action="inc"]').addEventListener('click', () => {
    display.textContent = parseInt(display.textContent) + 1;
    updateTotals();
  });
  card.querySelector('[data-action="dec"]').addEventListener('click', () => {
    const current = parseInt(display.textContent);
    if (current > 0) { display.textContent = current - 1; updateTotals(); }
  });
});

document.getElementById('place-order-btn').addEventListener('click', async () => {
  const pizzas = [];
  document.querySelectorAll('.pizza-order-card').forEach(card => {
    const qty = parseInt(card.querySelector('.qty-value').textContent);
    const name = card.querySelector('.pizza-name').textContent;
    const price = parseFloat(card.dataset.price);
    for (let i = 0; i < qty; i++) {
      pizzas.push({ name, price });
    }
  });

  if (!currentUser.email_verified) return;

  if (pizzas.length === 0) {
    showInfoModal('⚠️', 'No Pizzas Selected', 'Please select at least one pizza before placing an order.');
    return;
  }

  try {
    const total = parseFloat(pizzas.reduce((sum, p) => sum + p.price, 0).toFixed(2));
    const token = await getToken();
console.log("token\n"+token);
    const result = await placeOrder(currentUser.email, pizzas, total, token);
console.log("result\n"+JSON.stringify(result));
    ordersCache.push({ ...result, total: result.total ?? total });
    document.querySelectorAll('.pizza-order-card .qty-value').forEach(el => el.textContent = '0');
    updateTotals();
    const orderId = result.orderId ?? result.id ?? result.order_id;
    showInfoModal('🍕', 'Order Placed!', `Order #${orderId} is confirmed and will be ready in 15 minutes.`);
  } catch {
    showInfoModal('⚠️', 'Something Went Wrong', 'Our system is down at the moment. Please try again later.');
  }
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
  const name = document.getElementById('profile-name').value.trim();
  const feedback = document.getElementById('profile-feedback');
  feedback.style.display = 'none';

  if (!name) {
    feedback.className = 'order-feedback error';
    feedback.textContent = 'Name cannot be empty.';
    feedback.style.display = 'block';
    return;
  }

  try {
    const token = await getToken();
    await updateProfile(name, token);
    currentUser = { ...currentUser, name };
    accountName.textContent = name;
    feedback.className = 'order-feedback success';
    feedback.textContent = 'Profile updated successfully.';
  } catch {
    feedback.className = 'order-feedback error';
    feedback.textContent = 'Could not update profile. Please try again later.';
  }
  feedback.style.display = 'block';
});

document.getElementById('change-password-btn').addEventListener('click', async () => {
  accountMenu.style.display = 'none';
  try {
    await fetch(`https://${import.meta.env.VITE_AUTH0_DOMAIN}/dbconnections/change_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: import.meta.env.VITE_AUTH0_CLIENT_ID,
        email: currentUser.email,
        connection: 'Username-Password-Authentication'
      })
    });
    showInfoModal('✉️', 'Password Reset Email Sent', `A password reset email has been sent to ${currentUser.email}. Please check your inbox.`);
  } catch {
    showInfoModal('⚠️', 'Something Went Wrong', 'Could not send password reset email. Please try again later.');
  }
});

document.getElementById('logo-btn').addEventListener('click', () => showPage('home'));

loginBtn.addEventListener('click', login);
logoutBtn.addEventListener('click', logout);

initAuth0();
