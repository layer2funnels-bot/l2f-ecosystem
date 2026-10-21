const rawUrl = process.env.PREVIEW_URL;

if (!rawUrl) {
  throw new Error("PREVIEW_URL was not supplied by the deployment event.");
}

const previewUrl = new URL(rawUrl);
if (
  previewUrl.protocol !== "https:" ||
  !previewUrl.hostname.endsWith(".vercel.app")
) {
  throw new Error("Refusing to check a non-Vercel Preview URL.");
}

async function request(path) {
  const response = await fetch(new URL(path, previewUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  return response;
}

const login = await request("/login");
if (login.status !== 200) {
  throw new Error(`/login returned HTTP ${login.status}; expected 200.`);
}
const loginBody = await login.text();
if (!loginBody.toLowerCase().includes("sign in")) {
  throw new Error("/login returned 200 but did not contain the sign-in UI.");
}
console.log("PASS /login serves the sign-in page (HTTP 200)");

const clients = await request("/clients");
const location = clients.headers.get("location") ?? "";
if (![301, 302, 303, 307, 308].includes(clients.status) || !location.includes("/login")) {
  throw new Error(`/clients returned HTTP ${clients.status} without a login redirect.`);
}
console.log("PASS /clients redirects unauthenticated visitors to login");

const missingShare = await request("/s/preview-smoke-nonexistent-token");
if (missingShare.status !== 200) {
  throw new Error(`/s missing-token route returned HTTP ${missingShare.status}; expected 200.`);
}
const shareBody = await missingShare.text();
if (!shareBody.toLowerCase().includes("isn’t available")) {
  throw new Error("Missing share-token page did not show its expected unavailable state.");
}
console.log("PASS missing share link shows its unavailable state");

const version = await request("/api/version");
if (version.status !== 200) {
  throw new Error(`/api/version returned HTTP ${version.status}; expected 200.`);
}
const { commit } = await version.json();
const expected = process.env.EXPECTED_SHA;
if (expected && commit !== expected) {
  throw new Error(`Deployment serves commit ${commit ?? "unknown"}, expected ${expected}.`);
}
console.log(`PASS /api/version reports commit ${commit ?? "unknown"}`);
