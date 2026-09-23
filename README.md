# Certifica

Aplicação React + Vite para gerar certificados a partir de um layout PDF. Funciona como site estático no GitHub Pages: não utiliza PHP, Laravel, banco de dados ou API.

## Executar localmente

Requer Node.js 22.13+ (ou uma versão LTS mais recente).

```sh
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite. Para testar o resultado de produção:

No Windows, você também pode dar dois cliques em `iniciar.cmd`: ele inicia o servidor na porta 5174 e abre o navegador. Não abra o `index.html` diretamente por `file://`; módulos JavaScript e o processamento de PDF precisam de HTTP/HTTPS.

```sh
npm run build
npm run preview
```

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie este projeto para a branch `main`.
2. Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
3. Em **Actions**, execute **Publicar no GitHub Pages**, ou envie um novo commit à `main`.
4. Ao terminar, o endereço aparecerá no ambiente `github-pages` e em Settings → Pages.

O workflow `.github/workflows/deploy.yml` instala as dependências, gera `dist` e publica somente essa pasta. `base: './'` permite hospedar também em `https://usuario.github.io/nome-do-repositorio/`, sem alterar o código. Se sua branch principal tiver outro nome, atualize o workflow.

Documentação: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Usar

1. Selecione ou arraste um PDF com até 10 MB e 10 páginas. Reserve uma área em branco para o nome.
2. Digite um participante por linha ou importe um CSV em UTF-8. Pode usar vírgula, ponto e vírgula ou tabulação. A coluna `nome`, `nome completo`, `participante` ou `name` é reconhecida; sem esse cabeçalho, utiliza-se a primeira coluna.
3. Clique no certificado para posicionar o centro do nome ou ajuste os controles horizontal e vertical. Escolha fonte, cor, tamanho e página.
4. Navegue pelos participantes e baixe uma prévia PDF para conferir.
5. Gere o lote e receba um ZIP com um PDF por pessoa. Nomes repetidos recebem prefixos numéricos distintos.

## Privacidade e limites

- PDFs, CSVs e nomes ficam somente na memória do navegador; não são enviados a servidores nem salvos em localStorage.
- Fontes e biblioteca de visualização são servidas junto com o site, sem CDN externa.
- Recarregar ou fechar a página descarta os dados. Guarde os arquivos originais e os downloads.
- Até 200 participantes por lote, 150 caracteres por nome e CSV de até 1 MB.
- Fontes latinas com suporte aos acentos do português. Símbolos sem glifos disponíveis são rejeitados com uma mensagem, para evitar certificados incompletos.
- PDFs protegidos por senha não são aceitos. Use um layout estático; a aplicação não substitui texto que já existe no modelo nem valida assinaturas digitais.
- Todas as páginas são preservadas. O nome é adicionado somente à página escolhida, respeitando rotação e área visível. Nomes longos são reduzidos para caber na largura disponível.
- A geração utiliza memória do navegador. Para modelos grandes, prefira lotes menores.

## Testes

```sh
npm test
```

Os testes Playwright utilizam o Google Chrome instalado (`channel: 'chrome'`). Em outro ambiente, instale-o com `npx playwright install chrome` ou ajuste o canal em `playwright.config.js`.

Cobertura: upload, geração de ZIP, acentos, nomes duplicados, páginas e rotação, importação CSV, limites, PDF inválido, responsividade e ausência de envio de dados por POST.

## Estrutura

- `src/App.jsx`: interface e fluxo do estúdio.
- `src/certificates.js`: leitura, personalização dos PDFs e geração do ZIP.
- `src/styles.css`: estilos responsivos.
- `.github/workflows/deploy.yml`: publicação no GitHub Pages.
- `_laravel-backup/`: backup local da implementação inicial, ignorado pelo Git e excluído do build. Não é necessário para executar a aplicação.
