'use client';

/**
 * Upload an image through the server-side /api/uploads route.
 * The server validates auth, role, origin, size and type before storing the
 * object with the service-role client, so no storage keys ever reach the client.
 */
export async function uploadImageViaServer(blob: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, filename);

  const response = await fetch('/api/uploads', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let message = 'Failed to upload image';
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string') {
        message = data.error;
      }
    } catch {
      // Ignore non-JSON error bodies
    }
    throw new Error(message);
  }

  const data = await response.json();
  return data.url as string;
}
