export async function post(URL: string, requestBody: object) {
  const response = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch orders: ${response.status} ${response.statusText}. ${errorText}`,
    );
  }

  const data = await response.json();

  if (data?.error) {
    throw new Error(`DLN API error: ${data.error}`);
  }

  return data;
}

export async function get(URL: string) {
  const response = await fetch(URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch orders: ${response.status} ${response.statusText}. ${errorText}`,
    );
  }

  const data = await response.json();

  if (data?.error) {
    throw new Error(`DLN API error: ${data.error}`);
  }

  return data;
}