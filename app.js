import { createAuth0Client } from '@auth0/auth0-spa-js';
import { getOrders, placeOrder } from './api.js';

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
  }

  const pendingPage = sessionStorage.getItem('pendingPage') || 'order';
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

  if (name === 'history') {
    loadOrderHistory();
  }
}

// Load order history from API
async function loadOrderHistory() {
  const container = document.getElementById('orders-content');
  container.innerHTML = '<p class="loading-orders">Loading orders...</p>';

  if (!currentUser?.email) {
    container.innerHTML = '<p class="orders-empty">No user email available.</p>';
    return;
  }

  try {
    const token = await getToken();
    const orders = await getOrders(currentUser.email, token);

    if (!orders || orders.length === 0) {
      container.innerHTML = '<p class="orders-empty">No orders found.</p>';
      return;
    }

    const excludeKeys = new Set(['email']);
    const allKeys = Object.keys(orders[0]).filter(k => !excludeKeys.has(k));

    const rows = orders.map(order => {
      const cells = allKeys.map(k => {
        const v = order[k];
        if (Array.isArray(v)) {
          const pizzaEmoji = { Margherita: '🍕', Pepperoni: '🥩', Veggie: '🌿' };
          const lines = v.map(item => {
            const name = item?.name ?? JSON.stringify(item);
            const emoji = pizzaEmoji[name] ?? '🍕';
            return `<div class="pizza-row">${emoji} ${name}</div>`;
          }).join('');
          return `<td>${lines}</td>`;
        }
        return `<td>${v ?? ''}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    });

    const headers = allKeys.map(k => `<th>${k}</th>`).join('');

    container.innerHTML = `
      <table class="orders-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p class="orders-error">Could not load orders: ${err.message}</p>`;
  }
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

// Menu item navigation
document.querySelectorAll('.menu-item[data-page]').forEach(item => {
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

  const feedback = document.getElementById('order-feedback');

  if (!currentUser.email_verified) {
    feedback.className = 'order-feedback error';
    feedback.textContent = `Please verify your email address (${currentUser.email}) before placing an order. Check your inbox for a verification link.`;
    feedback.style.display = 'block';
    return;
  }

  if (pizzas.length === 0) {
    feedback.className = 'order-feedback error';
    feedback.textContent = 'Please select at least one pizza before placing an order.';
    feedback.style.display = 'block';
    return;
  }

  try {
    const token = await getToken();
    const result = await placeOrder(currentUser.email, pizzas, token);
    document.querySelectorAll('.pizza-order-card .qty-value').forEach(el => el.textContent = '0');
    updateTotals();
    feedback.className = 'order-feedback success';
    feedback.innerHTML = `Your order has been placed! Order <strong>#${result.orderId ?? result.id ?? result.order_id}</strong> is confirmed and will be ready in 15 minutes.`;
  } catch {
    feedback.className = 'order-feedback error';
    feedback.textContent = 'Our system is down at the moment. Please try again later.';
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
    alert(`A password reset email has been sent to ${currentUser.email}.`);
  } catch {
    alert('Could not send password reset email. Please try again later.');
  }
});

loginBtn.addEventListener('click', login);
logoutBtn.addEventListener('click', logout);

initAuth0();
