/* ============================================================
   UnifyData Web — nucleo.js
   Regras do fechamento em funções puras: leitura dos relatórios,
   base de funcionários, cruzamento e exportação em CSV.
   Sem DOM: o navegador usa window.Nucleo e os testes usam require().
   ============================================================ */
(function (raiz, fabrica) {
    const api = fabrica();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else raiz.Nucleo = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SEM_EMPRESA = 'NÃO DEFINIDA';
    const BOM = String.fromCharCode(0xFEFF);

    // ---------- Texto ----------
    function normalizar(texto) {
        return String(texto ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
    }

    function somenteDigitos(texto) { return String(texto ?? '').replace(/\D/g, ''); }

    function formatarCPF(cpf) {
        const d = somenteDigitos(cpf);
        return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (cpf || '');
    }

    function escaparHtml(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Nome em caixa alta do Linx/RH → "Maria da Silva" (só para exibição)
    const PARTICULAS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
    function nomeExibicao(nome) {
        return String(nome || '').toLowerCase().split(' ').map((p, i) =>
            i > 0 && PARTICULAS.has(p) ? p : p.replace(/(^|['’"(-])(\p{L})/gu, (m, s, l) => s + l.toUpperCase())
        ).join(' ');
    }

    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatarMoeda = v => moeda.format(v || 0);

    function listaPorExtenso(itens) {
        return new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(itens);
    }

    // ---------- CSV (aspas e separador ; ou , detectado na linha do cabeçalho) ----------
    function lerCSV(texto) {
        const primeiras = texto.split('\n', 30).map(l => l.replace(/\r$/, ''));
        const cabecalho = (primeiras.find(l => /cpf/i.test(l)) || primeiras[0] || '').replace(/"[^"]*"/g, '');
        const sep = (cabecalho.match(/;/g) || []).length >= (cabecalho.match(/,/g) || []).length ? ';' : ',';
        const linhas = [];
        let linha = [], campo = '', aspas = false;
        for (let i = 0; i < texto.length; i++) {
            const c = texto[i];
            if (aspas) {
                if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
                else if (c === '"') aspas = false;
                else campo += c;
            } else if (c === '"') aspas = true;
            else if (c === sep) { linha.push(campo); campo = ''; }
            else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
            else if (c !== '\r') campo += c;
        }
        if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
        return linhas;
    }

    // ---------- Planilhas do RH ----------
    // "Empregados Posto Central.xls" → "Posto Central"
    function empresaDoArquivo(nomeArquivo) {
        let base = String(nomeArquivo).replace(/\.[^/.]+$/, '');
        if (normalizar(base).startsWith('empregados ')) base = base.substring(11).trim();
        return base;
    }

    // Lê uma planilha (linhas × colunas) e devolve os funcionários encontrados, ou null sem coluna CPF.
    // O cabeçalho pode estar quebrado em mais de uma linha, como no relatório "Empregados".
    function extrairRH(linhas, empresa) {
        let colCpf = -1, colNome = -1, colCod = -1;
        for (let i = 0; i < Math.min(20, linhas.length); i++) {
            (linhas[i] || []).forEach((celula, idx) => {
                const v = normalizar(celula);
                if (v === 'cpf' && colCpf === -1) colCpf = idx;
                if (['nome', 'nome completo', 'funcionario'].includes(v) && colNome === -1) colNome = idx;
                if (['cod.', 'cod', 'codigo', 'matricula'].includes(v) && colCod === -1) colCod = idx;
            });
        }
        if (colCpf === -1) return null;

        // Percorre tudo: linhas de título, cabeçalho repetido e totais não passam na validação
        const registros = [];
        for (const linha of linhas) {
            if (!linha) continue;
            let cpf = somenteDigitos(linha[colCpf]);
            if (cpf.length >= 9 && cpf.length < 11) cpf = cpf.padStart(11, '0'); // CPF salvo como número perde zeros
            const mat = colCod !== -1 ? String(linha[colCod] ?? '').trim() : '';
            const nome = colNome !== -1 ? String(linha[colNome] ?? '').trim().toUpperCase().replace(/\s+/g, ' ') : '';
            const cpfValido = cpf.length >= 11;
            const matValida = /^\d+$/.test(mat) && nome.length >= 3;
            if (cpfValido || matValida) registros.push({ cpf: cpfValido ? cpf : '', mat: matValida ? mat : '', nome, empresa });
        }
        return registros;
    }

    // ---------- PDF de contas a receber: "Pessoa: 12345 - NOME - 123.456.789-00" ----------
    function extrairPessoasPdf(texto) {
        const pessoas = [];
        // O nome não atravessa para a próxima "Pessoa:" (quando alguém vem sem CPF)
        const regex = /Pessoa:\s*(\d+)\s*-\s*((?:(?!Pessoa:).)*?)\s*-\s*(\d{3}[.\d]*[-\d]*)/g;
        let m;
        while ((m = regex.exec(texto)) !== null) {
            pessoas.push({ mat: m[1].trim(), nome: m[2].trim().toUpperCase().replace(/\s+/g, ' '), cpf: somenteDigitos(m[3]) });
        }
        return pessoas;
    }

    // ---------- Base de funcionários ----------
    // Junta o PDF e as planilhas do RH numa base { matricula: { nome, cpf, empresa } }.
    // Não altera a base recebida: devolve uma cópia.
    function atualizarBase(baseAtual, registrosRH, pessoasPdf) {
        const base = {};
        for (const [mat, e] of Object.entries(baseAtual || {})) base[mat] = { ...e };

        const cpfParaEmpresa = new Map();
        registrosRH.forEach(r => { if (r.cpf) cpfParaEmpresa.set(r.cpf, r.empresa); });

        // 1. PDF: matrícula + nome + CPF (empresa vem do RH ou continua a de antes)
        pessoasPdf.forEach(p => {
            const empresaAtual = base[p.mat]?.empresa || SEM_EMPRESA;
            base[p.mat] = { nome: p.nome, cpf: p.cpf, empresa: cpfParaEmpresa.get(p.cpf) || empresaAtual };
        });

        // 2. RH com código: cadastra quem ainda não está na base, sem duplicar CPF já cadastrado
        const cpfsNaBase = new Set(Object.values(base).map(e => e.cpf).filter(Boolean));
        registrosRH.forEach(r => {
            if (!r.mat || (r.cpf && cpfsNaBase.has(r.cpf))) return;
            if (!base[r.mat]) {
                base[r.mat] = { nome: r.nome, cpf: r.cpf, empresa: r.empresa };
                if (r.cpf) cpfsNaBase.add(r.cpf);
            } else if (base[r.mat].empresa === SEM_EMPRESA) {
                base[r.mat].empresa = r.empresa;
            }
        });

        // 3. O RH manda na empresa: atualiza quem mudou de unidade ou estava sem empresa
        Object.values(base).forEach(e => { if (e.cpf && cpfParaEmpresa.has(e.cpf)) e.empresa = cpfParaEmpresa.get(e.cpf); });
        return base;
    }

    function empresasDaBase(base) {
        const s = new Set();
        Object.values(base).forEach(e => { if (e.empresa && e.empresa !== SEM_EMPRESA) s.add(e.empresa); });
        return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    // ---------- Relatório do Linx "Pendências por responsável" ----------
    // Bloco por responsável, fechado por uma linha "Total;vencido;total"
    function lerRelatorioLinx(texto, origem) {
        const registros = [];
        const paraNumero = s => parseFloat(String(s).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
        let matricula = null, nome = null;

        for (const linha of texto.split('\n')) {
            if (linha.includes('Respons')) {
                const m = /Respons[^\s:]*:\s*(\d+)\s*-\s*([^;\r\n]+)/i.exec(linha);
                if (m) { matricula = m[1].trim(); nome = m[2].trim().toUpperCase().replace(/\s+/g, ' '); }
            }
            const t = linha.trim();
            if (matricula && t.toLowerCase().startsWith('total')) {
                if (/^total\s+geral/i.test(t)) { matricula = null; continue; }
                const campos = linha.split(';').map(p => p.trim());
                // "Total;;18,50": sem vencido. Nos demais casos, campos vazios são ignorados.
                const partes = !campos[1] && campos[2] ? ['Total', '0', campos[2]] : campos.filter(Boolean);
                const vencido = partes.length >= 2 ? paraNumero(partes[1]) : 0;
                const total   = partes.length >= 3 ? paraNumero(partes[2]) : vencido;
                if (!isNaN(total) && total > 0) {
                    registros.push({ matricula, nome, vencido: isNaN(vencido) ? 0 : vencido, total, origem });
                }
                matricula = null;
            }
        }
        // Período do relatório, para identificar o fechamento: "Vencimento: 01/09/2026 a 30/09/2026"
        const periodo = /Vencimento:\s*(\d{2}\/\d{2}\/\d{4}\s*a\s*\d{2}\/\d{2}\/\d{4})/i.exec(texto)?.[1] || '';
        return { registros, periodo: periodo.replace(/\s+/g, ' ') };
    }

    // ---------- Cruzamento ----------
    // Consumo de uma origem sem cair em propriedades herdadas ("constructor.csv" é um nome de arquivo válido)
    const ZERO = Object.freeze({ vencido: 0, total: 0 });
    const consumoDe = (consumos, origem) => (Object.hasOwn(consumos, origem) ? consumos[origem] : ZERO);

    // Agrega os consumos por matrícula e separa quem está pronto de quem precisa de revisão.
    function cruzar(consumos, base) {
        const porMatricula = new Map();
        consumos.forEach(item => {
            let a = porMatricula.get(item.matricula);
            if (!a) porMatricula.set(item.matricula, a = { matricula: item.matricula, nome: item.nome, origens: new Set(), consumos: new Map() });
            a.origens.add(item.origem);
            const c = a.consumos.get(item.origem) || { vencido: 0, total: 0 };
            c.vencido += item.vencido;
            c.total += item.total;
            a.consumos.set(item.origem, c);
        });

        const pendencias = [], prontos = [];
        porMatricula.forEach(item => {
            const cadastro = base[item.matricula];
            const consumosObj = Object.assign(Object.create(null), Object.fromEntries(item.consumos));
            const valor = Array.from(item.consumos.values()).reduce((s, v) => s + v.total, 0);
            const origem = Array.from(item.origens).join(', ');
            if (!cadastro) {
                pendencias.push({ id: item.matricula, tipo: 'Sem Cadastro', matricula: item.matricula, nomeLinx: item.nome, valor, origem, consumos: consumosObj });
            } else if (cadastro.empresa === SEM_EMPRESA) {
                pendencias.push({ id: item.matricula, tipo: 'Sem Empresa', matricula: item.matricula, nomeLinx: cadastro.nome, cpf: cadastro.cpf, valor, origem, consumos: consumosObj });
            } else {
                prontos.push({ nome: cadastro.nome, cpf: cadastro.cpf, empresa: cadastro.empresa, consumos: consumosObj });
            }
        });
        pendencias.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nomeLinx.localeCompare(b.nomeLinx, 'pt-BR'));
        return { pendencias, prontos };
    }

    // Uma linha por empresa, com totais por origem; funcionários em ordem alfabética
    function agruparPorEmpresa(prontos, origens) {
        const grupos = new Map();
        prontos.forEach(r => {
            let g = grupos.get(r.empresa);
            if (!g) grupos.set(r.empresa, g = { empresa: r.empresa, linhas: [], porOrigem: Object.create(null), total: 0 });
            let totalLinha = 0;
            origens.forEach(o => {
                const c = consumoDe(r.consumos, o);
                const acc = Object.hasOwn(g.porOrigem, o) ? g.porOrigem[o] : (g.porOrigem[o] = { vencido: 0, total: 0 });
                acc.vencido += c.vencido;
                acc.total += c.total;
                totalLinha += c.total;
            });
            g.linhas.push({ ...r, total: totalLinha });
            g.total += totalLinha;
        });
        return Array.from(grupos.values())
            .sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'))
            .map(g => ({ ...g, linhas: g.linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }));
    }

    // ---------- Exportação ----------
    // Excel não aceita \ / ? * [ ] : em nome de aba, nem apóstrofo nas pontas, nem "History"
    // Corta no limite sem deixar palavra pela metade nem espaço, hífen ou apóstrofo no fim
    function cortarNome(texto, limite) {
        if (texto.length <= limite) return texto;
        let corte = texto.substring(0, limite);
        const espaco = corte.lastIndexOf(' ');
        if (texto[limite] !== ' ' && espaco >= limite / 2) corte = corte.substring(0, espaco);
        return corte.replace(/[\s'-]+$/, '');
    }

    function nomeDeAba(nome, usados) {
        let base = String(nome)
            .replace(/\s*[:/\\]\s*/g, ' - ').replace(/[?*]/g, '').replace(/\[/g, '(').replace(/]/g, ')')
            .replace(/\s+/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Empresa';
        if (base.toLowerCase() === 'history') base = 'History (empresa)';
        base = cortarNome(base, 31);
        let candidato = base, n = 2;
        while (usados.has(candidato.toLowerCase())) {
            const sufixo = ` (${n++})`;
            candidato = cortarNome(base, 31 - sufixo.length) + sufixo;
        }
        usados.add(candidato.toLowerCase());
        return candidato;
    }

    function letraColuna(n) {
        let s = '';
        for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
        return s;
    }

    function cabecalhoPlanilha(origens) {
        const cab = ['Funcionário', 'CPF'];
        origens.forEach(o => cab.push(`Vencido ${o}`, `Total ${o}`));
        cab.push('Total Desconto');
        return cab;
    }

    // CSV separado por ; e com vírgula decimal, como o Excel brasileiro espera
    function gerarCSV(grupos, origens) {
        // Texto que começa com = + - @ viraria fórmula ao abrir no Excel: o apóstrofo neutraliza
        const campo = v => {
            let t = String(v ?? '');
            if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
            return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        };
        const numero = v => (v || 0).toFixed(2).replace('.', ',');
        const linhas = [['Empresa', ...cabecalhoPlanilha(origens)].map(campo).join(';')];
        grupos.forEach(g => g.linhas.forEach(r => {
            const dados = [g.empresa, r.nome, formatarCPF(r.cpf)].map(campo);
            origens.forEach(o => {
                const c = consumoDe(r.consumos, o);
                dados.push(numero(c.vencido), numero(c.total));
            });
            dados.push(numero(r.total));
            linhas.push(dados.join(';'));
        }));
        return BOM + linhas.join('\r\n') + '\r\n';
    }

    return {
        SEM_EMPRESA, normalizar, somenteDigitos, formatarCPF, escaparHtml, nomeExibicao, formatarMoeda, listaPorExtenso,
        lerCSV, empresaDoArquivo, extrairRH, extrairPessoasPdf, atualizarBase, empresasDaBase,
        lerRelatorioLinx, cruzar, consumoDe, agruparPorEmpresa, nomeDeAba, letraColuna, cabecalhoPlanilha, gerarCSV
    };
});
