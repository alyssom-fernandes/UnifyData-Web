# UnifyData Web

> **Ferramenta de conciliação de folha de pagamento sem instalação — roda 100% no navegador.**

O UnifyData Web automatiza o cruzamento mensal de consumos de convênios de funcionários (extraídos do Linx AutoSystem) com as listas de RH, gerando um relatório Excel formatado e separado por unidade — sem servidor, sem Python, sem dependências.

---

## 🌐 Como Abrir

> Dê um duplo clique no arquivo `index.html` diretamente no Chrome ou Edge. Não precisa instalar nada.

---

## ✨ Funcionalidades

- **Zero Instalação** — um único arquivo `.html`, funciona offline em qualquer navegador moderno
- **Banco de Dados Persistente** — os dados dos funcionários (Matrícula, CPF, Empresa) ficam salvos no `localStorage` e sobrevivem entre sessões
- **Cruzamento por Matrícula** — a conciliação usa o código de matrícula, não aproximação de nomes, garantindo precisão matemática absoluta
- **Captura de Dois Valores** — extrai tanto o valor *vencido* quanto o *total da dívida* de cada linha do relatório Linx
- **Drag & Drop** — todas as zonas de upload aceitam arrastar e soltar arquivos
- **Central de Pendências** — funcionários desconhecidos ou sem vínculo de empresa surgem em um painel interativo para resolução manual antes da exportação
- **Exportação Excel** — gera um `.xlsx` com uma aba por empresa, cabeçalhos coloridos, formatação de moeda e largura automática de colunas

---

## 🗂️ Estrutura do Projeto

```
unifydata-web/
├── index.html       # Aplicação principal (ponto de entrada único)
├── script.js        # Toda a lógica: banco de dados, parsing, cruzamento, exportação
├── style.css        # Estilos da interface em dark mode
└── README.md
```

---

## 🚀 Como Usar

### Passo 1 — Configurar o Banco de Dados Local *(apenas uma vez)*

1. Dê um duplo clique em `index.html` para abrir no navegador.
2. Na seção **Banco de Dados Local**, faça o upload:
   - Do **PDF de Contas a Receber do Linx** (contém matrículas e CPFs)
   - Das **planilhas de RH** (`.xls` ou `.xlsx`) com nomes, CPFs e unidades de cada funcionário
3. Clique em **Atualizar Memória do Sistema**. Os dados ficam salvos permanentemente no navegador.

> Se novos funcionários forem admitidos, repita este passo ou resolva-os manualmente durante o fechamento mensal.

### Passo 2 — Fechamento Mensal

1. Abra o `index.html`.
2. Vá até a seção **Fechamento Mensal**.
3. Suba os **relatórios de consumo do Linx** (arquivos `.csv`).
4. Clique em **Processar e Gerar Planilha**.
5. Resolva as pendências sinalizadas (funcionários desconhecidos ou sem vínculo de empresa).
6. Baixe o relatório consolidado em `.xlsx`.

---

## 📊 Formato do Relatório

Cada unidade ganha sua própria aba. Colunas por aba:

| Funcionário | CPF | Vencido [Origem] | Total [Origem] | ... | Total Desconto |
|---|---|---|---|---|---|
| FULANO DE TAL | 000.000.000-00 | R$ 0,00 | R$ 150,00 | ... | R$ 150,00 |

- Cabeçalho: fundo vinho escuro, texto branco em negrito
- Funcionários com consumo zero: exibidos em cinza
- Rodapé: total geral em negrito

---

## 🛠️ Tecnologias Utilizadas

| Tecnologia | Função |
|---|---|
| JavaScript Vanilla (ES2020+) | Toda a lógica de negócio |
| [SheetJS (xlsx)](https://sheetjs.com/) | Leitura dos arquivos `.xls` / `.xlsx` do RH |
| [ExcelJS](https://github.com/exceljs/exceljs) | Geração do relatório `.xlsx` de saída |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Extração de dados dos PDFs do Linx |
| `localStorage` | Banco de dados persistente no navegador |
| CSS Variables | Sistema de design em dark mode |

Todas as bibliotecas são carregadas via CDN — sem `npm`, sem etapa de build.

---

## 📋 Requisitos

- Google Chrome ou Microsoft Edge (baseado em Chromium)
- Conexão com a internet não é necessária após o primeiro carregamento (bibliotecas CDN ficam em cache)

---

## ⚠️ Observações

- O banco de dados local está vinculado ao navegador e ao dispositivo. Limpar os dados do navegador apagará as matrículas salvas.
- O parser de PDF espera o formato do relatório "Contas a Receber" do Linx (`Pessoa: [Matrícula] - [Nome] - [CPF]`).
- Os CSVs de consumo devem seguir o layout "Pendências por Responsável" do Linx AutoSystem.

---

## 🤝 Contribuições

Sinta-se à vontade para abrir issues ou pull requests. Este projeto foi construído para um caso de uso real de folha de pagamento — contribuições que ampliem a compatibilidade com outros formatos de CSV são especialmente bem-vindas.

---

## 📄 Licença

Licença MIT — livre para usar, modificar e distribuir.

---

*Desenvolvido por AFN Systems · 2026*
