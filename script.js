// ============================================================
//  UnifyData Web — script.js
//  Lógica principal: Banco de Dados, Cruzamento e Exportação
// ============================================================

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ---------- Estado Global ----------
let employeeDB = JSON.parse(localStorage.getItem('unifydata_db')) || {};
let globalReadyData   = [];
let globalOrigens     = [];
let pendingDivergences = [];
let dbPdfFile  = null;
let dbHrFiles  = [];
let linxFiles  = [];

updateDBCount();

function updateDBCount() {
    document.getElementById('db-count').innerText = Object.keys(employeeDB).length;
}

function getTodasEmpresas() {
    const s = new Set();
    Object.values(employeeDB).forEach(e => {
        if (e.empresa && e.empresa !== 'NÃO DEFINIDA') s.add(e.empresa);
    });
    return Array.from(s).sort();
}

// ---------- Drag-and-Drop genérico ----------
function setupDropZone(zoneId, inputId) {
    const zone = document.getElementById(zoneId);
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const input = document.getElementById(inputId);
        // Transfere os arquivos para o input via DataTransfer
        const dt = new DataTransfer();
        Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f));
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
    });
}

setupDropZone('drop-db-pdf', 'upload-db-pdf');
setupDropZone('drop-db-hr',  'upload-db-hr');
setupDropZone('drop-linx',   'upload-linx');

// ---------- Seção 1: Banco de Dados ----------
document.getElementById('upload-db-pdf').addEventListener('change', e => {
    dbPdfFile = e.target.files[0];
    if (dbPdfFile) document.getElementById('db-pdf-list').innerHTML = `• ${dbPdfFile.name}`;
    checkDbReady();
});

document.getElementById('upload-db-hr').addEventListener('change', e => {
    dbHrFiles = Array.from(e.target.files);
    document.getElementById('db-hr-list').innerHTML = dbHrFiles.map(f => `• ${f.name}`).join('<br>');
    checkDbReady();
});

function checkDbReady() {
    document.getElementById('btn-update-db').disabled = !(dbPdfFile || dbHrFiles.length > 0);
}

document.getElementById('btn-update-db').addEventListener('click', async () => {
    const btn    = document.getElementById('btn-update-db');
    const status = document.getElementById('db-status');
    btn.disabled = true;
    status.innerText = 'Lendo e cruzando arquivos, por favor aguarde...';
    status.style.color = '#aaa';

    try {
        // 1. Mapeia CPF → Empresa a partir dos arquivos de RH
        const hrMapping = {};

        for (const file of dbHrFiles) {
            let baseName = file.name.replace(/\.[^/.]+$/, '');
            if (baseName.toLowerCase().startsWith('empregados ')) baseName = baseName.substring(11).trim();

            const ext = file.name.split('.').pop().toLowerCase();

            if (ext === 'csv') {
                // Suporte a arquivos CSV de RH (ex: RESTAURANTE_ROSARIO.csv)
                const text = await file.text();
                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                // Detecta delimitador e coluna de CPF no cabeçalho
                const sep = lines[0].includes(';') ? ';' : ',';
                const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());
                const cpfIdx  = headers.findIndex(h => h === 'cpf');
                if (cpfIdx === -1) continue;
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(sep);
                    if (!cols[cpfIdx]) continue;
                    const cpf = cols[cpfIdx].replace(/[^\d]/g, '');
                    if (cpf.length >= 11) hrMapping[cpf] = baseName;
                }
            } else {
                // XLS / XLSX
                const data     = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });
                workbook.SheetNames.forEach(sheetName => {
                    const empresa = (workbook.SheetNames.length > 1 && !sheetName.toLowerCase().startsWith('plan'))
                        ? `${baseName} - ${sheetName}` : baseName;
                    const sheet = workbook.Sheets[sheetName];
                    const json  = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

                    // Localiza coluna de CPF nas primeiras 20 linhas
                    let cpfCol = -1;
                    for (let i = 0; i < Math.min(20, json.length) && cpfCol === -1; i++) {
                        cpfCol = json[i].findIndex(c => String(c).trim().toLowerCase() === 'cpf');
                    }
                    if (cpfCol === -1) return;

                    json.forEach(row => {
                        const cpf = String(row[cpfCol] || '').replace(/[^\d]/g, '');
                        if (cpf.length >= 11) hrMapping[cpf] = empresa;
                    });
                });
            }
        }

        // 2. Extrai Matrículas + CPFs do PDF do Linx
        let count = 0;
        if (dbPdfFile) {
            const arrayBuffer = await dbPdfFile.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
                const page    = await pdf.getPage(i);
                const content = await page.getTextContent();
                const text    = content.items.map(item => item.str).join(' ');
                // Padrão: "Pessoa: 12345 - NOME DO FUNCIONARIO - 123.456.789-00"
                const regex = /Pessoa:\s*(\d+)\s*-\s*(.*?)\s*-\s*([\d]{3}[\.\d]{0,}[\-\d]{0,})/g;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const mat  = match[1].trim();
                    const nome = match[2].trim().toUpperCase();
                    const cpf  = match[3].replace(/[^\d]/g, '');
                    const existingEmpresa = employeeDB[mat]?.empresa || 'NÃO DEFINIDA';
                    employeeDB[mat] = { nome, cpf, empresa: hrMapping[cpf] || existingEmpresa };
                    count++;
                }
            }
        }

        // 3. Caso RH sem PDF: garante que funcionários do RH existam no banco com matrícula
        //    (via arquivos XLS que tenham coluna Cód. + CPF)
        for (const file of dbHrFiles) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext === 'csv') continue; // CSV de RH não tem matrícula, só CPF
            let baseName = file.name.replace(/\.[^/.]+$/, '');
            if (baseName.toLowerCase().startsWith('empregados ')) baseName = baseName.substring(11).trim();

            const data     = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            workbook.SheetNames.forEach(sheetName => {
                const empresa = (workbook.SheetNames.length > 1 && !sheetName.toLowerCase().startsWith('plan'))
                    ? `${baseName} - ${sheetName}` : baseName;
                const sheet = workbook.Sheets[sheetName];
                const json  = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

                let codCol = -1, nomeCol = -1, cpfCol = -1;
                for (let i = 0; i < Math.min(20, json.length); i++) {
                    json[i].forEach((c, idx) => {
                        const v = String(c).trim().toLowerCase();
                        if (v === 'cód.' || v === 'cod.' || v === 'código' || v === 'codigo') codCol = idx;
                        if (v === 'nome') nomeCol = idx;
                        if (v === 'cpf')  cpfCol  = idx;
                    });
                    if (codCol !== -1 && nomeCol !== -1) break;
                }
                if (codCol === -1 || nomeCol === -1) return;

                json.forEach(row => {
                    const mat  = String(row[codCol] || '').trim();
                    const nome = String(row[nomeCol] || '').trim().toUpperCase();
                    const cpf  = cpfCol !== -1 ? String(row[cpfCol] || '').replace(/[^\d]/g, '') : '';
                    if (!mat || !nome || isNaN(mat)) return;
                    // Só cadastra se ainda não existe no banco (não sobrescreve entradas do PDF)
                    if (!employeeDB[mat]) {
                        employeeDB[mat] = { nome, cpf, empresa };
                    } else if (employeeDB[mat].empresa === 'NÃO DEFINIDA') {
                        employeeDB[mat].empresa = empresa;
                    }
                    count++;
                });
            });
        }

        localStorage.setItem('unifydata_db', JSON.stringify(employeeDB));
        updateDBCount();
        status.innerText = `Sucesso! ${Object.keys(employeeDB).length} funcionários na memória.`;
        status.style.color = 'var(--success)';
        btn.innerHTML = `<span class="material-symbols-outlined">done</span> Atualizado`;

    } catch (err) {
        console.error(err);
        status.innerText = `Erro ao salvar base: ${err.message}`;
        status.style.color = 'var(--danger)';
        btn.disabled = false;
    }
});

// ---------- Seção 2: Upload de Arquivos Mensais ----------
document.getElementById('upload-linx').addEventListener('change', e => {
    linxFiles = Array.from(e.target.files);
    document.getElementById('linx-files-list').innerHTML = linxFiles.map(f => `• ${f.name}`).join('<br>');
    document.getElementById('btn-process').disabled = linxFiles.length === 0;
    // Aviso se o banco estiver vazio
    if (linxFiles.length > 0 && Object.keys(employeeDB).length === 0) {
        const status = document.getElementById('db-status');
        status.innerText = '⚠️ Atenção: o banco de dados está vazio. Configure-o na seção acima antes de processar.';
        status.style.color = 'var(--warning)';
    }
});

// ---------- Seção 3: Processamento Mensal ----------
document.getElementById('btn-process').addEventListener('click', async () => {
    const btn = document.getElementById('btn-process');
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span> Processando...`;

    try {
        const linxData = [];
        globalOrigens  = [];

        for (const file of linxFiles) {
            const origem = file.name.replace(/\.[^/.]+$/, '');
            if (!globalOrigens.includes(origem)) globalOrigens.push(origem);

            // Tenta encoding cp1252 (Windows/Linx); fallback para utf-8
            let text;
            try {
                const buf = await file.arrayBuffer();
                text = new TextDecoder('windows-1252').decode(buf);
            } catch {
                text = await file.text();
            }

            const lines = text.split('\n');
            let currMatricula = null;
            let currNome      = null;

            for (const line of lines) {
                // Padrão: "Conta: 1.3.10 - ... Responsável: 345797 - NOME DO FUNCIONARIO"
                if (line.includes('Respons')) {
                    const match = /Respons[^\s:]*:\s*(\d+)\s*-\s*([^;\r\n]+)/i.exec(line);
                    if (match) {
                        currMatricula = match[1].trim();
                        currNome = match[2].trim().toUpperCase().replace(/\s+/g, ' ');
                    }
                }

                // Linha de Total: captura AMBOS os valores (vencido e total geral)
                if (currMatricula && line.trim().toLowerCase().startsWith('total')) {
                    if (/total\s+geral/i.test(line.trim())) { currMatricula = null; continue; }

                    const parts = line.split(';').map(p => p.trim()).filter(p => p);
                    // parts[0]="Total"  parts[1]=vencido  parts[2]=total geral
                    const parseVal = str => parseFloat(
                        str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
                    );
                    const vencido = parts.length >= 2 ? parseVal(parts[1]) : 0;
                    const total   = parts.length >= 3 ? parseVal(parts[2]) : vencido;

                    if (!isNaN(total) && total > 0) {
                        linxData.push({
                            matricula: currMatricula, nome: currNome,
                            vencido: isNaN(vencido) ? 0 : vencido,
                            total, origem
                        });
                    }
                    currMatricula = null;
                }
            }
        }

        // Agrega por matrícula — guarda vencido e total separados por origem
        const aggMap = {};
        linxData.forEach(item => {
            if (!aggMap[item.matricula]) {
                aggMap[item.matricula] = {
                    matricula: item.matricula,
                    nome: item.nome,
                    origens: new Set(),
                    consumos: {}          // { origem: { vencido, total } }
                };
            }
            aggMap[item.matricula].origens.add(item.origem);
            const c = aggMap[item.matricula].consumos;
            if (!c[item.origem]) c[item.origem] = { vencido: 0, total: 0 };
            c[item.origem].vencido += item.vencido;
            c[item.origem].total   += item.total;
        });

        pendingDivergences = [];
        globalReadyData    = [];

        Object.values(aggMap).forEach(linxItem => {
            const dbInfo   = employeeDB[linxItem.matricula];
            // Valor total para exibição nas pendências (soma dos totais de todas as origens)
            const valorExib = Object.values(linxItem.consumos).reduce((s, v) => s + v.total, 0);

            if (!dbInfo) {
                pendingDivergences.push({
                    id: linxItem.matricula, tipo: 'Sem Cadastro',
                    matricula: linxItem.matricula, nomeLinx: linxItem.nome,
                    valor: valorExib, origem: Array.from(linxItem.origens).join(', '),
                    consumos: linxItem.consumos
                });
            } else if (dbInfo.empresa === 'NÃO DEFINIDA') {
                pendingDivergences.push({
                    id: linxItem.matricula, tipo: 'Sem Empresa',
                    matricula: linxItem.matricula, nomeLinx: dbInfo.nome, cpf: dbInfo.cpf,
                    valor: valorExib, origem: Array.from(linxItem.origens).join(', '),
                    consumos: linxItem.consumos
                });
            } else {
                globalReadyData.push({
                    nome: dbInfo.nome, cpf: dbInfo.cpf,
                    empresa: dbInfo.empresa, consumos: linxItem.consumos
                });
            }
        });

        renderState();

    } catch (err) {
        console.error(err);
        alert('Erro ao processar: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined">bolt</span> Processar e Gerar Planilha`;
    }
});

// ---------- Renderização de Pendências ----------
function renderState() {
    const divSection = document.getElementById('divergence-section');
    const divList    = document.getElementById('divergence-list');
    const sucSection = document.getElementById('success-section');

    // Reabilita botão de processar para novo ciclo
    const btn = document.getElementById('btn-process');
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined">bolt</span> Processar e Gerar Planilha`;

    if (pendingDivergences.length > 0) {
        divSection.classList.remove('hidden');
        sucSection.classList.add('hidden');

        const manualOptions = getTodasEmpresas()
            .map(e => `<option value="${e}">${e}</option>`).join('');

        let html = '';
        pendingDivergences.forEach(div => {
            if (div.tipo === 'Sem Cadastro') {
                html += `
                <div class="div-item" id="div-${div.id}">
                    <div style="font-weight:bold;margin-bottom:.5rem;color:#f44336">
                        [NÃO CADASTRADO] ${div.nomeLinx} — Matrícula: ${div.matricula}
                    </div>
                    <div style="font-size:.9rem;color:#aaa">
                        Consumo: R$ ${div.valor.toFixed(2).replace('.', ',')} | Origem: ${div.origem}
                    </div>
                    <div class="input-group">
                        <input type="text" id="cpf-${div.id}" placeholder="CPF (opcional)">
                        <select id="emp-${div.id}">
                            <option value="" disabled selected>Selecione a empresa</option>
                            ${manualOptions}
                        </select>
                        <input type="text" id="nova-emp-${div.id}" placeholder="Ou digite o nome da unidade">
                        <button class="btn" onclick="resolverSemCadastro('${div.id}')">
                            <span class="material-symbols-outlined">save</span> Salvar
                        </button>
                        <button class="btn-secondary" onclick="ignorarPendencia('${div.id}')">Ignorar</button>
                    </div>
                </div>`;
            } else if (div.tipo === 'Sem Empresa') {
                html += `
                <div class="div-item warning" id="div-${div.id}">
                    <div style="font-weight:bold;margin-bottom:.5rem;color:#ff9800">
                        [SEM VÍNCULO] ${div.nomeLinx} — CPF: ${div.cpf}
                    </div>
                    <div style="font-size:.9rem;color:#aaa">
                        Cadastrado, mas sem unidade definida.<br>
                        Consumo: R$ ${div.valor.toFixed(2).replace('.', ',')} | Origem: ${div.origem}
                    </div>
                    <div class="input-group">
                        <select id="emp-${div.id}">
                            <option value="" disabled selected>Vincular a qual empresa?</option>
                            ${manualOptions}
                        </select>
                        <input type="text" id="nova-emp-${div.id}" placeholder="Ou digite o nome da unidade">
                        <button class="btn" onclick="resolverSemEmpresa('${div.id}')">
                            <span class="material-symbols-outlined">link</span> Vincular
                        </button>
                        <button class="btn-secondary" onclick="ignorarPendencia('${div.id}')">Ignorar</button>
                    </div>
                </div>`;
            }
        });
        divList.innerHTML = html;

    } else {
        divSection.classList.add('hidden');
        sucSection.classList.remove('hidden');
    }
}

// ---------- Resolução de Pendências ----------
window.resolverSemCadastro = function(id) {
    const div    = pendingDivergences.find(d => d.id === id);
    const cpfVal = document.getElementById(`cpf-${id}`).value.replace(/[^\d]/g, '');
    let empVal   = document.getElementById(`emp-${id}`).value;
    const empNew = document.getElementById(`nova-emp-${id}`).value.trim();
    if (empNew) empVal = empNew;
    if (!empVal) { alert('Defina a empresa antes de salvar!'); return; }

    employeeDB[div.matricula] = { nome: div.nomeLinx, cpf: cpfVal || '', empresa: empVal };
    localStorage.setItem('unifydata_db', JSON.stringify(employeeDB));
    updateDBCount();

    globalReadyData.push({ nome: div.nomeLinx, cpf: cpfVal, empresa: empVal, consumos: div.consumos });
    removeDivergence(id);
};

window.resolverSemEmpresa = function(id) {
    const div    = pendingDivergences.find(d => d.id === id);
    let empVal   = document.getElementById(`emp-${id}`).value;
    const empNew = document.getElementById(`nova-emp-${id}`).value.trim();
    if (empNew) empVal = empNew;
    if (!empVal) { alert('Defina a empresa antes de salvar!'); return; }

    employeeDB[div.matricula].empresa = empVal;
    localStorage.setItem('unifydata_db', JSON.stringify(employeeDB));
    updateDBCount();

    globalReadyData.push({ nome: div.nomeLinx, cpf: div.cpf, empresa: empVal, consumos: div.consumos });
    removeDivergence(id);
};

window.ignorarPendencia = function(id) { removeDivergence(id); };

function removeDivergence(id) {
    pendingDivergences = pendingDivergences.filter(d => d.id !== id);
    renderState();
}

// ---------- Seção 4: Exportação Excel ----------
document.getElementById('btn-download').addEventListener('click', async () => {
    const workbook  = new ExcelJS.Workbook();
    const empresas  = [...new Set(globalReadyData.map(e => e.empresa))].sort();

    if (empresas.length === 0) { workbook.addWorksheet('Dados'); }

    const headerFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF58111A' } };
    const headerFont  = { color: { argb: 'FFFFFFFF' }, bold: true };
    const grayFont    = { color: { argb: 'FF808080' } };
    const centerAlign = { vertical: 'middle', horizontal: 'center' };
    const currency    = '"R$" #,##0.00';

    empresas.forEach(emp => {
        const ws = workbook.addWorksheet(String(emp).substring(0, 31));

        // Cabeçalho: Funcionário | CPF | [Vencido X | Total X] por origem | Total Desconto
        const headerRow = ['Funcionário', 'CPF'];
        globalOrigens.forEach(o => { headerRow.push(`Vencido ${o}`); headerRow.push(`Total ${o}`); });
        headerRow.push('Total Desconto');

        ws.addRow(headerRow).eachCell(cell => {
            cell.fill = headerFill; cell.font = headerFont; cell.alignment = centerAlign;
        });

        // Dados
        const empData = globalReadyData.filter(e => e.empresa === emp).sort((a, b) => a.nome.localeCompare(b.nome));
        let grandTotal = 0;

        empData.forEach(row => {
            const rowData = [row.nome, row.cpf];
            let rowTotal = 0;
            globalOrigens.forEach(o => {
                const c = row.consumos[o] || { vencido: 0, total: 0 };
                rowData.push(c.vencido);
                rowData.push(c.total);
                rowTotal += c.total;
            });
            rowData.push(rowTotal);
            grandTotal += rowTotal;

            const excelRow = ws.addRow(rowData);
            excelRow.eachCell((cell, col) => {
                if (col >= 3) cell.numFmt = currency;
                if (rowTotal === 0) cell.font = grayFont;
            });
        });

        // Rodapé
        const footerData = ['TOTAL GERAL', '', ...globalOrigens.flatMap(() => ['', '']), grandTotal];
        const footerRow  = ws.addRow(footerData);
        footerRow.eachCell((cell, col) => {
            cell.font = { bold: true };
            if (col === headerRow.length) cell.numFmt = currency;
        });

        // Auto-largura
        ws.columns.forEach((col, i) => {
            let max = (headerRow[i] || '').length;
            col.eachCell(c => { if (c.value) max = Math.max(max, String(c.value).length); });
            col.width = max + 3;
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url    = URL.createObjectURL(blob);
    const link   = document.createElement('a');
    link.href = url; link.download = 'Relatorio_UnifyData.xlsx';
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
});

document.getElementById('btn-reset').addEventListener('click', () => location.reload());
