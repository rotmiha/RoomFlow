const { RENDER_API_KEY, RENDER_SERVICE_ID, IMAGE_URL, PRODUCTION_URL } = process.env;
for (const [key, value] of Object.entries({ RENDER_API_KEY, RENDER_SERVICE_ID, IMAGE_URL, PRODUCTION_URL })) {
  if (!value) throw new Error(`Missing deployment setting: ${key}`);
}
const headers = { Authorization: `Bearer ${RENDER_API_KEY}`, 'Content-Type': 'application/json' };
const api = `https://api.render.com/v1/services/${encodeURIComponent(RENDER_SERVICE_ID)}/deploys`;
async function renderRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(30_000) });
  // Do not include API response bodies, which might contain credentials, in logs.
  if (!response.ok) throw new Error(`Render request failed: HTTP ${response.status}`);
  return response.json();
}
const deployment = await renderRequest(api, { method: 'POST', body: JSON.stringify({ imageUrl: IMAGE_URL }) });
if (!deployment.id) throw new Error('Render did not return a deployment ID');
console.log(`Waiting for Render deployment ${deployment.id}`);
const deadline = Date.now() + 20 * 60_000;
let live = false;
while (Date.now() < deadline) {
  const current = await renderRequest(`${api}/${encodeURIComponent(deployment.id)}`);
  console.log(`Deployment status: ${current.status}`);
  if (current.status === 'live') { live = true; break; }
  if (['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'].includes(current.status)) {
    throw new Error(`Render deployment failed: ${current.status}`);
  }
  await new Promise(resolve => setTimeout(resolve, 10_000));
}
if (!live) throw new Error('Timed out waiting for Render deployment');
const base = PRODUCTION_URL.replace(/\/$/, '');
const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(60_000) });
if (!health.ok || (await health.json()).database !== 'connected') throw new Error('Public database health check failed');
const frontend = await fetch(base, { signal: AbortSignal.timeout(60_000) });
if (!frontend.ok || !(await frontend.text()).includes('<div id="root">')) throw new Error('Public frontend check failed');
console.log(`Application is live: ${base}`);
