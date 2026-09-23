import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/certifica\//, '');
    const target = path.resolve('dist', relative || 'index.html');
    if (!target.startsWith(path.resolve('dist') + path.sep)) { res.writeHead(404).end(); return; }
    try { res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); res.end(await fs.readFile(target)); }
    catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/certifica/`);
    const pdf = await PDFDocument.create(); pdf.addPage([842, 595]);
    await page.locator('input[accept*="pdf"]').setInputFiles({ name: 'modelo.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
    await page.getByLabel('Um nome por linha').fill('João da Conceição');
    await page.getByRole('button', { name: 'Baixar prévia' }).waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Baixar prévia') && !b.disabled), { timeout: 30000 });
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Gerar certificados', exact: true }).click();
    assert.equal((await pending).suggestedFilename(), 'certificados.zip');
    assert.deepEqual(errors, []);
    console.log('Produção em /certifica/: fontes, worker, prévia e download ZIP OK.');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
