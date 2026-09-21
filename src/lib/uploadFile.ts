export async function uploadFileToR2(file: File): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { ok?: boolean; url?: string } | null;
    return json?.ok && json.url ? json.url : null;
  } catch {
    return null;
  }
}