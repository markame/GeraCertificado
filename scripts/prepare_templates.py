from pathlib import Path
from shutil import copyfile
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject, NumberObject, FloatObject, DictionaryObject, ArrayObject

sources = {
 'fp-aluno.pdf': 'FP_PARTICIPOU_ALUNO (1).pdf',
 'fp-comissao.pdf': 'FP_COMIS_ORGANIZADORA.pdf',
 'fc-participante.pdf': 'FC_PARTICIPOU.pdf',
 'fc-orientador.pdf': 'FC_ORIENTADOR_2.pdf',
 'fc-comissao.pdf': 'FC_COM_ORGANIZADORA_3.pdf',
 'fc-avaliador.pdf': 'FC_AVALIADOR_1.pdf',
 'fc-terceiro.pdf': 'FC_3_LUGAR.pdf',
 'fc-segundo.pdf': 'FC_2_LUGAR.pdf',
}
for output, source in sources.items():
 target = Path('public/templates') / output
 origin = Path.home() / 'Downloads' / source
 if output != 'fc-orientador.pdf':
  copyfile(origin, target)
  continue
 reader = PdfReader(origin)
 writer = PdfWriter()
 writer.clone_document_from_reader(reader)
 page = writer.pages[0]
 content = page.get_contents()
 # This source positions each glyph with Td. Remove only the placeholder
 # glyphs; leave every positioning operator and the surrounding quotes intact.
 indexes = list(range(407, 440, 2))
 expected = '>120(\x03\'2\x03352-(72@'
 actual = ''.join(str(content.operations[i][0][0]) for i in indexes)
 assert actual == expected, repr(actual)
 for i in indexes:
  content.operations[i] = ([TextStringObject('')], b'Tj')
 page.replace_contents(content)
 field = DictionaryObject({
  NameObject('/Type'):NameObject('/Annot'), NameObject('/Subtype'):NameObject('/Widget'),
  NameObject('/FT'):NameObject('/Tx'), NameObject('/T'):TextStringObject('projeto'),
  NameObject('/V'):TextStringObject(''), NameObject('/F'):NumberObject(4),
  NameObject('/Ff'):NumberObject(0), NameObject('/Q'):NumberObject(1),
  NameObject('/DA'):TextStringObject('/Helv 12 Tf 0 g'),
  NameObject('/Rect'):ArrayObject([FloatObject(n) for n in [416.55,154.93,598.09,172.48]]),
  NameObject('/P'):page.indirect_reference,
  NameObject('/BS'):DictionaryObject({NameObject('/W'):NumberObject(0)}),
 })
 ref=writer._add_object(field)
 page['/Annots'].append(ref)
 writer.root_object['/AcroForm']['/Fields'].append(ref)
 with target.open('wb') as stream: writer.write(stream)
 check=PdfReader(target)
 assert 'projeto' in check.get_fields()
 assert '[NOME DO PROJETO]' not in check.pages[0].extract_text()
 print('Prepared orientador with project field; other originals copied unchanged.')
