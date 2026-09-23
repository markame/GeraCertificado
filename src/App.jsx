import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import Papa from 'papaparse';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { certificateTypes } from './templates';
import { loadTemplate, renderCertificate, generateZip } from './certificates';
import './styles.css';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function todayLocal() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function App() {
    const [typeId, setTypeId] = useState(certificateTypes[0].id);
    const type = certificateTypes.find(item => item.id === typeId);
    const [template, setTemplate] = useState(null);
    const [text, setText] = useState('');
    const [common, setCommon] = useState(() => ({ unidade: '', cidade: '', data: todayLocal(), projeto: '' }));
    const [projects, setProjects] = useState([]);
    const [sameProject, setSameProject] = useState(true);
    const [active, setActive] = useState(0);
    const [loading, setLoading] = useState(true);
    const [retry, setRetry] = useState(0);
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [previewing, setPreviewing] = useState(false);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState('');
    const [previewError, setPreviewError] = useState('');
    const [success, setSuccess] = useState('');
    const csvInput = useRef(); const canvas = useRef(); const generationController = useRef();
    const names = text.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
    const participants = names.map((nome, index) => ({ nome, projeto: sameProject ? common.projeto : projects[index] || '' }));
    const current = Math.min(active, Math.max(0, names.length - 1));
    const name = names[current] || '';
    const project = sameProject ? common.projeto : projects[current] || '';
    const invalidNames = names.length > 200 || names.some(n => n.length > 150 || /\p{C}/u.test(n));
    const incomplete = !common.unidade.trim() || !common.cidade.trim() || !common.data || (type.fields.projeto && participants.some(p => !p.projeto.trim()));
    const update = (key, value) => { setCommon(c => ({ ...c, [key]: value })); setSuccess(''); };

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setTemplate(null); setPreview(null); setError(''); setPreviewError(''); setSuccess('');
        loadTemplate(type, controller.signal).then(result => {
            if (!controller.signal.aborted) setTemplate(result);
        }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [typeId, retry]);

    useEffect(() => {
        if (!template) return;
        let cancelled = false;
        setPreviewing(true); setPreview(null); setPreviewError('');
        const timer = setTimeout(async () => {
            try {
                // Only named form fields are filled; the original artwork is untouched.
                const bytes = await renderCertificate(template, { nome: name, projeto: project }, { ...common, projeto: project });
                if (!cancelled) setPreview(bytes);
            } catch (e) { if (!cancelled) { setPreviewError(e.message); setPreviewing(false); } }
        }, 150);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [template, name, project, common]);

    useEffect(() => {
        if (!preview || !canvas.current) return;
        let disposed = false; let render;
        const task = pdfjs.getDocument({ data: preview.slice(0), isEvalSupported: false });
        (async () => {
            try {
                const doc = await task.promise;
                const page = await doc.getPage(1);
                if (disposed) return;
                const original = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: Math.min(1.6, 1800 / Math.max(original.width, original.height)) });
                canvas.current.width = viewport.width; canvas.current.height = viewport.height;
                render = page.render({ canvasContext: canvas.current.getContext('2d'), viewport });
                await render.promise;
                if (!disposed) setPreviewing(false);
            } catch (e) { if (!disposed) { setPreviewError('Não foi possível exibir a prévia: ' + e.message); setPreviewing(false); } }
        })();
        return () => { disposed = true; render?.cancel(); task.destroy(); };
    }, [preview]);

    async function importCsv(file) {
        if (!file) return;
        setError('');
        try {
            if (file.size > 1024 * 1024) throw new Error('O CSV deve ter no máximo 1 MB.');
            const parsed = Papa.parse(await file.text(), { skipEmptyLines: 'greedy' });
            if (parsed.errors.some(e => e.code !== 'UndetectableDelimiter')) throw new Error('O CSV está mal formatado. Verifique as aspas e separadores.');
            const header = parsed.data[0]?.map(v => v.trim().toLowerCase().replace(/^\uFEFF/, '')) || [];
            const nameColumn = header.findIndex(v => ['nome', 'name', 'nome completo', 'participante', 'aluno', 'orientador'].includes(v));
            const projectColumn = header.findIndex(v => ['projeto', 'nome do projeto'].includes(v));
            const rows = (nameColumn >= 0 ? parsed.data.slice(1) : parsed.data).map(row => ({
                nome: (row[nameColumn >= 0 ? nameColumn : 0] || '').trim(),
                projeto: nameColumn >= 0 && projectColumn >= 0 ? (row[projectColumn] || '').trim() : '',
            })).filter(row => row.nome);
            if (!rows.length) throw new Error('Não encontramos nomes no CSV.');
            if (rows.some(row => /[\r\n]/.test(row.nome))) throw new Error('Cada nome deve ocupar uma única linha.');
            setText(rows.map(p => p.nome).join('\n')); setProjects(rows.map(p => p.projeto));
            setSameProject(projectColumn < 0); setActive(0);
            setSuccess(`${rows.length} participantes importados.`);
        } catch (e) { setError(e.message); }
        finally { if (csvInput.current) csvInput.current.value = ''; }
    }

    async function generate() {
        setError(''); setSuccess(''); setGenerating(true); setProgress(0);
        generationController.current = new AbortController();
        try {
            const result = await generateZip(template, participants, { ...common, projeto: sameProject ? common.projeto : '' }, setProgress, generationController.current.signal);
            saveBlob(result, `${typeId}-certificados.zip`);
            setSuccess(`${names.length} certificados gerados.`);
        } catch (e) { if (e.name === 'AbortError') setSuccess('Geração cancelada.'); else setError(e.message); }
        finally { setGenerating(false); }
    }

    return <main className="certificate-app">
        <h1>Gerar certificados</h1>
        {(error || previewError) && <div className="notice error" role="alert"><span>{error || previewError}</span>{!template && !loading && <button className="text-button" onClick={() => setRetry(n => n + 1)}>Tentar novamente</button>}<button aria-label="Fechar erro" onClick={() => { setError(''); setPreviewError(''); }}><X size={16} /></button></div>}
        {success && <div className="notice success" role="status"><span>{success}</span><button aria-label="Fechar aviso" onClick={() => setSuccess('')}><X size={16} /></button></div>}
        <div className="editor">
            <fieldset className="controls" disabled={generating}>
                <label className="field">Tipo de certificado<select value={typeId} onChange={e => setTypeId(e.target.value)}>{['Feira de Profissões', 'Feira de Ciências'].map(group => <optgroup key={group} label={group}>{certificateTypes.filter(item => item.group === group).map(item => <option key={item.id} value={item.id}>{item.group} — {item.label}</option>)}</optgroup>)}</select></label>
                <label className="field">Nome do IEMA Pleno<input value={common.unidade} maxLength={150} onChange={e => update('unidade', e.target.value)} /></label>
                <div className="common-row"><label className="field">Cidade<input value={common.cidade} maxLength={100} onChange={e => update('cidade', e.target.value)} /></label><label className="field">Data de emissão<input type="date" value={common.data} min="1900-01-01" max="9999-12-31" onChange={e => update('data', e.target.value)} /></label></div>
                <div className="label-row"><label htmlFor="names">{typeId === 'fc-orientador' ? 'Orientadores' : typeId === 'fc-avaliador' ? 'Avaliadores' : 'Participantes'}</label><button className="text-button" onClick={() => csvInput.current.click()}>Importar CSV</button></div>
                <input hidden type="file" ref={csvInput} accept=".csv,text/csv" onChange={e => importCsv(e.target.files[0])} />
                <textarea id="names" aria-label="Um nome por linha" value={text} onChange={e => { setText(e.target.value); setProjects([]); setSameProject(true); setSuccess(''); }} placeholder="Um nome por linha" spellCheck={false} />
                <div className="label-row muted"><span>{names.length} participantes</span><button className="text-button" disabled={!text} onClick={() => { setText(''); setProjects([]); setActive(0); }}>Limpar</button></div>
                {invalidNames && <p className="inline-error">Use até 200 nomes de no máximo 150 caracteres, sem caracteres de controle.</p>}
                {type.fields.projeto && <div className="project-fields"><label className="field">Nome do projeto<input value={project} maxLength={150} onChange={e => { if (sameProject) update('projeto', e.target.value); else setProjects(items => { const next = [...items]; next[current] = e.target.value; return next; }); }} /></label><label className="checkbox"><input type="checkbox" checked={sameProject} onChange={e => { if (e.target.checked) update('projeto', project); else setProjects(names.map(() => common.projeto)); setSameProject(e.target.checked); }} />Mesmo projeto para todos</label>{!sameProject && <div className="project-person"><span>{name || 'Adicione os orientadores'}</span><div className="navigation"><button aria-label="Orientador anterior" disabled={!current} onClick={() => setActive(current - 1)}><ChevronLeft size={17} /></button><span>{names.length ? current + 1 : 0}/{names.length}</span><button aria-label="Próximo orientador" disabled={current >= names.length - 1} onClick={() => setActive(current + 1)}><ChevronRight size={17} /></button></div></div>}</div>}
                <button className="primary" disabled={!template || !names.length || invalidNames || incomplete || loading || generating || previewing || !preview} onClick={generate}><ArrowDownToLine size={17} />{generating ? `Gerando ${progress}/${names.length}…` : 'Gerar certificados'}</button>
            </fieldset>
            <section className="preview-panel" aria-label="Prévia do PDF">
                <div className="preview-header"><h2>Prévia</h2><button className="text-button" disabled={!preview || previewing || loading || generating} onClick={() => saveBlob(new Blob([preview], { type: 'application/pdf' }), `${typeId}-previa.pdf`)}><ArrowDownToLine size={15} /> Baixar prévia</button></div>
                <div className="preview-stage">
                    {template ? <div className="pdf-sheet" style={{ aspectRatio: `${template.width} / ${template.height}` }}><canvas key={template.id} ref={canvas} aria-label={name ? `Certificado de ${name}` : 'Modelo PDF'} />{previewing && <div className="preview-loading"><LoaderCircle className="spin" size={24} /></div>}</div> : <div className="empty-preview">{loading ? <LoaderCircle className="spin" size={28} /> : <span>Modelo indisponível</span>}</div>}
                </div>
                {template && <div className="preview-bottom"><span>{type.group} · {type.label}</span>{names.length > 0 && <div className="navigation"><button aria-label="Participante anterior" disabled={!current || generating} onClick={() => setActive(current - 1)}><ChevronLeft size={18} /></button><span>{current + 1} / {names.length}</span><button aria-label="Próximo participante" disabled={current >= names.length - 1 || generating} onClick={() => setActive(current + 1)}><ChevronRight size={18} /></button></div>}</div>}
            </section>
        </div>
        {generating && <div className="generation-status" role="status"><LoaderCircle className="spin" size={18} /><span>{progress} de {names.length} certificados</span><button className="text-button" onClick={() => generationController.current?.abort()}>Cancelar</button></div>}
    </main>;
}

createRoot(document.getElementById('root')).render(<App />);
