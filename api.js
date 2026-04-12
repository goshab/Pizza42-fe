const BASE_URL = 'http://localhost:3001/pizza42/be';

export async function getOrders(email, token) {
  const response = await fetch(`${BASE_URL}/orders?email=${encodeURIComponent(email)}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch orders: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function placeOrder(email, pizzas, token) {
  const response = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ email, pizzas })
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}
