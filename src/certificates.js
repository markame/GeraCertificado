import { PDFDocument, TextAlignment } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import sansUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';

let fontPromise;
function fontBytes() {
    if (!fontPromise) fontPromise = fetch(sansUrl).then(r => {
        if (!r.ok) throw new Error('Não foi possível carregar a fonte.');
        return r.arrayBuffer();
    }).catch(e => { fontPromise = null; throw e; });
    return fontPromise;
}

export async function loadTemplate(type, signal) {
    const response = await fetch(`${import.meta.env.BASE_URL}templates/${type.file}`, { signal });
    if (!response.ok) throw new Error('Não foi possível carregar este modelo. Tente novamente.');
    const bytes = await response.arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    for (const field of Object.values(type.fields)) doc.getForm().getTextField(field);
    const box = doc.getPage(0).getCropBox();
    return { ...type, bytes, width: box.width, height: box.height };
}

export function formatLocalDate(city, date) {
    if (!date) return city.trim();
    const [year, month, day] = date.split('-').map(Number);
    const value = new Date(year, month - 1, day);
    if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) throw new Error('Informe uma data válida.');
    const formatted = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(value);
    return `${city.trim() ? city.trim() + ', ' : ''}${formatted}.`;
}

export function validateValue(value, label) {
    if (value.length > 150 || /\p{C}/u.test(value)) throw new Error(`${label}: use até 150 caracteres, sem caracteres de controle.`);
}

export async function renderCertificate(template, person, common) {
    const doc = await PDFDocument.load(template.bytes);
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(await fontBytes(), { subset: true });
    const supported = new Set(font.getCharacterSet());
    const form = doc.getForm();
    const values = {
        unidade: common.unidade.trim(),
        nome: person.nome.trim(),
        localData: formatLocalDate(common.cidade, common.data),
        projeto: (person.projeto || common.projeto || '').trim(),
    };
    for (const [key, id] of Object.entries(template.fields)) {
        const text = values[key].normalize('NFC');
        validateValue(text, key === 'localData' ? 'Cidade e data' : key);
        if ([...text].some(char => !supported.has(char.codePointAt(0)))) throw new Error('Use letras latinas, números e pontuação nos campos. Há um símbolo não suportado.');
        const field = form.getTextField(id);
        field.setText(text);
        field.disableMultiline();
        field.setAlignment(TextAlignment.Center);
        let size = template.id.startsWith('fp-') ? 18 : 12;
        for (const widget of field.acroField.getWidgets()) {
            const rect = widget.getRectangle();
            widget.getBorderStyle()?.setWidth(0);
            const maxSize = Math.min(size, (rect.height - 2) / font.heightAtSize(1), (rect.width - 6) / Math.max(1, font.widthOfTextAtSize(text, 1)));
            size = Math.min(size, maxSize);
            widget.setDefaultAppearance(`/Helv ${size} Tf 0.129 0.129 0.129 rg`);
        }
        if (text && size < 5) throw new Error(`O conteúdo de ${key} é longo demais para o espaço do modelo. Abrevie o texto.`);
        field.acroField.setDefaultAppearance(`/Helv ${size} Tf 0.129 0.129 0.129 rg`);
        field.setFontSize(size);
        field.updateAppearances(font);
    }
    // Keep the real form fields and their appearances in agreement, including in downloaded PDFs.
    doc.setTitle(`${template.group} — ${template.label} — ${person.nome || 'Prévia'}`);
    doc.setProducer('Certifica');
    return doc.save({ updateFieldAppearances: false });
}

export async function generateZip(template, participants, common, onProgress, signal) {
    if (!participants.length || participants.length > 200) throw new Error('Informe de 1 a 200 participantes.');
    if (!common.unidade.trim() || !common.cidade.trim() || !common.data) throw new Error('Preencha a unidade, a cidade e a data de emissão.');
    if (template.fields.projeto && participants.some(p => !(p.projeto || common.projeto || '').trim())) throw new Error('Preencha o projeto de todos os orientadores.');
    const zip = new JSZip();
    for (let index = 0; index < participants.length; index++) {
        if (signal?.aborted) throw new DOMException('Geração cancelada.', 'AbortError');
        const person = participants[index];
        if (!person.nome.trim()) throw new Error('Preencha o nome de todos os participantes.');
        const slug = person.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'participante';
        zip.file(`${String(index + 1).padStart(3, '0')}-${slug}.pdf`, await renderCertificate(template, person, common));
        onProgress(index + 1);
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    return zip.generateAsync({ type: 'blob', compression: 'STORE' }, () => {
        if (signal?.aborted) throw new DOMException('Geração cancelada.', 'AbortError');
    });
}
