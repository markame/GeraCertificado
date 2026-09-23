import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import { certificateTypes } from '../src/templates.js';

async function fillCommon(page) {
    await page.getByLabel('Nome do IEMA Pleno').fill('IEMA Pleno São Luís');
    await page.getByLabel('Cidade', { exact: true }).fill('São Luís');
    await page.getByLabel('Data de emissão').fill('2026-09-23');
    await page.getByLabel('Um nome por linha').fill('João Gonçalves');
}

for (const type of certificateTypes) {
    test(`campos, data e prévia: ${type.id}`, async ({ page }, testInfo) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('/');
        await expect(page.getByLabel('Data de emissão')).not.toHaveValue('');
        await page.getByLabel('Tipo de certificado').selectOption(type.id);
        await fillCommon(page);
        if (type.fields.projeto) await page.getByLabel('Nome do projeto', { exact: true }).fill('Mulheres na Ciência');
        await expect(page.getByRole('button', { name: 'Gerar certificados', exact: true })).toBeEnabled({ timeout: 30000 });
        await expect(page.locator('[role=alert]')).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath(`${type.id}.png`), fullPage: true });
        const pending = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Baixar prévia' }).click();
        const download = await pending;
        const bytes = await fs.readFile(await download.path());
        await fs.writeFile(testInfo.outputPath(`${type.id}.pdf`), bytes);
        const doc = await PDFDocument.load(bytes);
        const form = doc.getForm();
        expect(form.getFields()).toHaveLength(Object.keys(type.fields).length);
        expect(form.getTextField(type.fields.unidade).getText()).toBe('IEMA Pleno São Luís');
        expect(form.getTextField(type.fields.nome).getText()).toBe('João Gonçalves');
        expect(form.getTextField(type.fields.localData).getText()).toBe('São Luís, 23 de setembro de 2026.');
        if (type.fields.projeto) expect(form.getTextField('projeto').getText()).toBe('Mulheres na Ciência');
        for (const field of form.getFields()) {
            const widgets = field.acroField.getWidgets();
            expect(widgets).toHaveLength(1);
            expect(widgets[0].getAppearances().normal).toBeTruthy();
            // Visible text gets the larger size, while long text can still shrink to fit.
            expect(widgets[0].getDefaultAppearance()).toContain(type.id.startsWith('fp-') ? '24 Tf' : '16 Tf');
        }
        expect(errors).toEqual([]);
    });
}

test('ZIP com nomes repetidos e projetos individuais importados do CSV', async ({ page }) => {
    const posts = [];
    page.on('request', r => { if (r.method() !== 'GET') posts.push(r.url()); });
    await page.goto('/');
    await page.getByLabel('Tipo de certificado').selectOption('fc-orientador');
    await fillCommon(page);
    await page.locator('input[type=file][accept*="csv"]').setInputFiles({ name: 'lista.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFFnome;projeto\nJoão Gonçalves;Ciência e inclusão\nJoão Gonçalves;Energia sustentável\n') });
    await expect(page.getByLabel('Mesmo projeto para todos')).not.toBeChecked();
    await expect(page.getByLabel('Nome do projeto', { exact: true })).toHaveValue('Ciência e inclusão');
    await expect(page.getByRole('button', { name: 'Gerar certificados', exact: true })).toBeEnabled();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Gerar certificados', exact: true }).click();
    const download = await pending;
    const zip = await JSZip.loadAsync(await fs.readFile(await download.path()));
    const files = Object.keys(zip.files);
    expect(files).toHaveLength(2);
    for (const [i, file] of files.entries()) {
        const form = (await PDFDocument.load(await zip.file(file).async('uint8array'))).getForm();
        expect(form.getTextField('text_24a3b').getText()).toBe('João Gonçalves');
        expect(form.getTextField('projeto').getText()).toBe(['Ciência e inclusão', 'Energia sustentável'][i]);
    }
    expect(posts).toEqual([]);
});

test('campos obrigatórios, limites e responsividade', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Baixar prévia' })).toBeEnabled({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Gerar certificados', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(page.locator('input[type=file][accept*="pdf"]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
    await fillCommon(page);
    await page.getByLabel('Data de emissão').fill('');
    await expect(page.getByRole('button', { name: 'Gerar certificados', exact: true })).toBeDisabled();
    await page.getByLabel('Um nome por linha').fill(Array(201).fill('Ana').join('\n'));
    await expect(page.getByText('Use até 200 nomes')).toBeVisible();
});
