import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import fs from 'node:fs/promises';

async function fixture({ pages = 2, rotation = 0 } = {}) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    for (let i = 0; i < pages; i++) {
        const page = doc.addPage([842, 595]);
        page.setRotation(degrees(rotation));
        page.drawRectangle({ x: 18, y: 18, width: 806, height: 559, borderColor: rgb(.4, .55, .4), borderWidth: 2, color: rgb(1, .99, .96) });
        page.drawText(i === 0 ? 'Certificado de Participação' : 'Informações complementares', { x: 175, y: 450, size: 34, font, color: rgb(.15, .32, .25) });
        page.drawText('Concedemos este certificado a', { x: 290, y: 360, size: 18, font });
        page.drawText('Pela dedicação e participação no evento.', { x: 245, y: 220, size: 18, font });
    }
    return Buffer.from(await doc.save());
}

test('gera ZIP com acentos, nomes repetidos e todas as páginas, sem envio de dados', async ({ page }, testInfo) => {
    const errors = []; const posts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if (req.method() !== 'GET') posts.push(req.url()); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Gerar certificados' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('desktop-inicial.png'), fullPage: true });
    const original = await fixture();
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'modelo.pdf', mimeType: 'application/pdf', buffer: original });
    await expect(page.getByRole('button', { name: 'Baixar prévia' })).toBeEnabled();
    await expect(page.getByLabel('Modelo PDF', { exact: true })).toBeVisible();
    const originalDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar prévia' }).click();
    expect(await fs.readFile(await (await originalDownload).path())).toEqual(original);
    await page.getByLabel('Um nome por linha').fill('João Gonçalves\nÉrica Araújo\nJoão Gonçalves');
    await expect(page.getByRole('button', { name: 'Gerar certificados', exact: true })).toBeEnabled({ timeout: 30000 });
    await page.screenshot({ path: testInfo.outputPath('desktop-previa.png'), fullPage: true });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Gerar certificados', exact: true }).click();
    const download = await downloadPromise;
    const zip = await JSZip.loadAsync(await fs.readFile(await download.path()));
    const entries = Object.keys(zip.files);
    expect(entries).toEqual(['001-Joao-Goncalves.pdf', '002-Erica-Araujo.pdf', '003-Joao-Goncalves.pdf']);
    const certificates = [];
    for (const entry of entries) {
        const bytes = await zip.file(entry).async('uint8array');
        expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
        certificates.push(Array.from(bytes));
    }
    const extracted = await page.evaluate(async (documents) => {
        const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
        const texts = [];
        for (const bytes of documents) {
            const loading = pdfjs.getDocument({ data: new Uint8Array(bytes) });
            const doc = await loading.promise;
            const p = await doc.getPage(1);
            texts.push((await p.getTextContent()).items.map(item => item.str).join(' '));
            await loading.destroy();
        }
        return texts;
    }, certificates);
    expect(extracted[0]).toContain('João Gonçalves');
    expect(extracted[1]).toContain('Érica Araújo');
    expect(extracted[2]).toContain('João Gonçalves');
    expect(extracted[0]).toContain('Certificado de Participação');
    expect(posts).toEqual([]);
    expect(errors).toEqual([]);
});

test('importa CSV com aspas e separador, bloqueia limites e PDF inválido', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Importar CSV' }).click();
    await page.locator('input[type=file][accept*="csv"]').setInputFiles({ name: 'lista.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFFnome;email\n"Silva, Ana";ana@example.com\n"José Luiz";jose@example.com\n') });
    await expect(page.getByLabel('Um nome por linha')).toHaveValue('Silva, Ana\nJosé Luiz');
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'invalido.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
    await expect(page.getByRole('alert')).toContainText('Não foi possível abrir');
    await page.getByLabel('Um nome por linha').fill(Array(201).fill('Ana').join('\n'));
    await expect(page.getByText('Use até 200 nomes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gerar certificados', exact: true })).toBeDisabled();
});

test('página simples no celular sem rolagem horizontal', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(page.locator('aside, footer')).toHaveCount(0);
    await expect(page.getByText('Selecione um PDF', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});

test('preserva rotação e posiciona nome na página escolhida', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'rotacionado.pdf', mimeType: 'application/pdf', buffer: await fixture({ rotation: 90 }) });
    await page.getByLabel('Um nome por linha').fill('Maria da Conceição');
    await page.getByRole('combobox', { name: 'Página', exact: true }).selectOption('2');
    await expect(page.getByRole('button', { name: 'Baixar prévia' })).toBeEnabled({ timeout: 30000 });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar prévia' }).click();
    const result = await downloadPromise;
    const bytes = await fs.readFile(await result.path());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPage(1).getRotation().angle).toBe(90);
    const data = await page.evaluate(async (bytes) => {
        const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
        const first = await (await doc.getPage(1)).getTextContent();
        const secondPage = await doc.getPage(2);
        const second = await secondPage.getTextContent();
        const item = second.items.find(i => i.str === 'Maria da Conceição');
        const viewport = secondPage.getViewport({ scale: 1 });
        const position = item ? pdfjs.Util.transform(viewport.transform, item.transform) : null;
        return { first: first.items.map(i => i.str).join(' '), second: second.items.map(i => i.str).join(' '), position, width: viewport.width, height: viewport.height, textWidth: item?.width };
    }, Array.from(bytes));
    expect(data.first).not.toContain('Maria da Conceição');
    expect(data.second).toContain('Maria da Conceição');
    expect(data.position[4] + data.textWidth / 2).toBeCloseTo(data.width / 2, 0);
    expect(data.position[5]).toBeGreaterThan(data.height * .49);
    expect(data.position[5]).toBeLessThan(data.height * .55);
});
