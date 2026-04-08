const BASE_URL = 'http://localhost:3001/pizza42/be';

export async function getOrders(email) {
  const apiURL = `${BASE_URL}/orders?email=${encodeURIComponent(email)}`;
  // alert(apiURL);
  const response = await fetch(apiURL);
//   setTimeout(() => {
//     console.log("5 seconds later");
// }, 2000);
  // alert(response);
  // alert(response.ok);
  // alert(response.json);
  if (!response.ok) {
    throw new Error(`Failed to fetch orders: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
