// Google Picker integration for importing a roster file directly from the
// admin's Google Drive instead of downloading it locally first. Picker is a
// client-side widget from Google (not part of this app's bundle) — this
// module lazy-loads it on first use and wraps its callback-based API in a
// Promise.
//
// Requires NEXT_PUBLIC_GOOGLE_PICKER_API_KEY (a Google Cloud "API key" — not
// the OAuth client id/secret — restricted to the Picker API in Cloud Console).
// Without it the feature stays hidden (see isDrivePickerConfigured), same
// "missing config disables the feature" pattern as the email/LINE integrations.

const PICKER_MIME_TYPES = [
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
].join(",");

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
    google?: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new (viewId?: string) => GoogleDocsView;
        Action: { PICKED: string; CANCEL: string };
        ViewId: { DOCS: string };
      };
    };
  }
}

interface GoogleDocsView {
  setMimeTypes(mimeTypes: string): GoogleDocsView;
  setIncludeFolders(include: boolean): GoogleDocsView;
}

interface PickerResponse {
  action: string;
  docs?: Array<{ id: string; name: string }>;
}

interface GooglePickerBuilder {
  addView(view: GoogleDocsView): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  setCallback(cb: (data: PickerResponse) => void): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

export function isDrivePickerConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
}

let scriptLoadPromise: Promise<void> | null = null;

function loadGoogleApiScript(): Promise<void> {
  if (window.gapi) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("โหลด Google API ไม่สำเร็จ"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

function loadPickerLibrary(): Promise<void> {
  return new Promise((resolve) => {
    window.gapi!.load("picker", () => resolve());
  });
}

/**
 * Opens the Google Picker restricted to spreadsheet-like files, resolving
 * with the selected file's raw bytes + filename once the admin picks one
 * (or null if they cancel).
 */
export async function openDrivePicker(): Promise<{ buffer: ArrayBuffer; filename: string } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า Google Picker");

  const tokenRes = await fetch("/api/google/picker-token");
  if (!tokenRes.ok) throw new Error("ไม่สามารถขอสิทธิ์เข้าถึง Google Drive ได้ — กรุณาเข้าสู่ระบบใหม่");
  const { access_token: accessToken } = await tokenRes.json();

  await loadGoogleApiScript();
  await loadPickerLibrary();

  const picked = await new Promise<PickerResponse>((resolve) => {
    const view = new window.google!.picker.DocsView(window.google!.picker.ViewId.DOCS)
      .setMimeTypes(PICKER_MIME_TYPES)
      .setIncludeFolders(true);

    const picker = new window.google!.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data: PickerResponse) => {
        if (data.action === window.google!.picker.Action.PICKED || data.action === window.google!.picker.Action.CANCEL) {
          resolve(data);
        }
      })
      .build();
    picker.setVisible(true);
  });

  if (picked.action !== window.google!.picker.Action.PICKED || !picked.docs?.[0]) {
    return null;
  }

  const file = picked.docs[0];
  const fileRes = await fetch("/api/sheets/import/drive-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: file.id }),
  });
  if (!fileRes.ok) throw new Error("ดาวน์โหลดไฟล์จาก Drive ไม่สำเร็จ");

  const buffer = await fileRes.arrayBuffer();
  const encodedName = fileRes.headers.get("X-File-Name");
  const filename = encodedName ? decodeURIComponent(encodedName) : file.name;
  return { buffer, filename };
}
