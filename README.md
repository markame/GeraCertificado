# Certifica

Aplicação React + Vite para preencher os modelos de certificados do IEMA. Funciona no GitHub Pages, sem PHP, banco de dados ou API. Dados dos participantes ficam no navegador.

## Executar

Requer Node.js 22.13+.

```sh
npm ci
npm run dev
```

No Windows, `iniciar.cmd` inicia na porta 5174 e abre o navegador. Acesse por HTTP, não abra `index.html` diretamente.

```sh
npm run build
npm run preview
```

## Usar

1. Escolha o tipo de certificado. O modelo aparece automaticamente.
2. Preencha o nome do IEMA Pleno, cidade e data de emissão. A data inicia com o dia atual e pode ser alterada.
3. Digite um participante por linha ou importe CSV UTF-8 com coluna `nome` (sem cabeçalho, a primeira coluna é utilizada).
4. Para orientadores, preencha o projeto. Desmarque “Mesmo projeto para todos” para editar o projeto de cada orientador usando as setas. CSVs com colunas `nome;projeto` também são aceitos.
5. Confira ou baixe a prévia e gere o ZIP.

Os campos dos PDFs são preenchidos em suas posições originais, com fontes de até 24 pt nos modelos de Profissões e 16 pt nos de Ciências. Textos longos diminuem para caber; textos sem espaço suficiente são rejeitados. O campo de cidade/data foi ampliado para comportar a data por extenso. Os PDFs mantêm os campos editáveis e suas aparências atualizadas.

## Modelos incluídos

- Feira de Profissões: aluno participante e comissão organizadora.
- Feira de Ciências: aluno participante, orientador(a), comissão organizadora, avaliador(a), 1º lugar, 2º lugar e 3º lugar.

Os onze arquivos fornecidos correspondem a nove modelos únicos. As duas cópias idênticas não são repetidas na seleção. Datas de realização dos eventos e cargas horárias permanecem as do layout original; a data no formulário é a de emissão.

`public/templates/` contém os modelos usados no site. O orientador recebeu um campo de formulário para o projeto, substituindo somente o marcador impresso `[NOME DO PROJETO]`. `scripts/prepare_templates.py` documenta essa preparação; Python não é necessário para executar ou publicar o site.

## GitHub Pages

1. Envie o projeto para a branch `main` do seu repositório.
2. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
3. Execute o workflow **Publicar no GitHub Pages**, ou envie um commit à `main`.

O workflow publica `dist`, incluindo os modelos PDF e as fontes. `base: './'` permite hospedar no subdiretório do repositório. Não é necessário configurar servidor.

## Testes

```sh
npm test
npm run build
node scripts/check-production.mjs
```

Os testes utilizam Google Chrome via Playwright. Conferem os nove modelos, valores dos campos, aparências, fontes maiores, data, importação de projetos individuais, ZIP e responsividade. O teste de produção verifica os arquivos em `/certifica/`, simulando GitHub Pages.

## Limites

Até 200 participantes por lote, 150 caracteres por campo e CSV de 1 MB. Fontes com suporte a português e caracteres latinos. Dados não são persistidos ao recarregar a página. Os modelos são arquivos públicos do site; nomes e dados preenchidos não são enviados ao servidor.

`_laravel-backup/` é somente um backup local ignorado pelo Git e excluído do build.
