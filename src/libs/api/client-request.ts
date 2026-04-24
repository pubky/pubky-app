import { HttpMethod, JSON_HEADERS } from '../http/http.types';

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload?.error) return payload.error;
  } catch {
    // Fall through to fallback message.
  }

  return `Request failed with status ${response.status}`;
}

export async function postJson<TResponse = void>(url: string, body: unknown): Promise<TResponse | undefined> {
  const response = await fetch(url, {
    method: HttpMethod.POST,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined;
  }

  try {
    return (await response.json()) as TResponse;
  } catch {
    return undefined;
  }
}
