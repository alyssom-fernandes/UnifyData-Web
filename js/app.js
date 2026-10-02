/* ============================================================
   UnifyData Web — app.js
   Tela do fechamento: envio de arquivos, base no navegador,
   pendências, resultado e exportações. As regras ficam em nucleo.js.
   ============================================================ */
'use strict';

const N = window.Nucleo;

// ---------- Bibliotecas (carregadas só quando necessárias, com SRI) ----------
const BIBLIOTECAS = {
    xlsx: {
        nome: 'SheetJS', global: 'XLSX',
        url: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
        sri: 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT'
    },
    exceljs: {
        nome: 'ExcelJS', global: 'ExcelJS',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
        sri: 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz'
    },
    pdfjs: {
        nome: 'PDF.js', global: 'pdfjsLib',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
        sri: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e'
    }
};
const PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Erro esperado, com mensagem pronta para mostrar (pode conter HTML montado aqui mesmo)
class ErroUsuario extends Error {}

const carregamentos = {};
function carregarBiblioteca(chave) {
    const lib = BIBLIOTECAS[chave];
    if (window[lib.global]) return Promise.resolve(window[lib.global]);
    if (!carregamentos[chave]) {
        carregamentos[chave] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = lib.url;
            s.integrity = lib.sri;
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve(window[lib.global]);
            s.onerror = () => {
                delete carregamentos[chave];
                s.remove();
                reject(new ErroUsuario(`Não foi possível carregar o ${lib.nome}. Confira a conexão com a internet e tente de novo.`));
            };
            document.head.appendChild(s);
        });
    }
    return carregamentos[chave];
}

// ---------- Utilitários de tela ----------
const $ = id => document.getElementById(id);
const esc = N.escaparHtml;
const rolagem = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
const semExtensao = nome => nome.replace(/\.[^/.]+$/, '');
const dataCurta = (data = new Date()) => data.toLocaleDateString('pt-BR');
function dataArquivo(data = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
}
function tamanhoArquivo(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// Relatórios do Linx vêm em Windows-1252; arquivos salvos depois podem estar em UTF-8
async function lerTexto(arquivo) {
    const bytes = await arquivo.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('windows-1252').decode(bytes); }
}

function baixarArquivo(conteudo, nome, tipo) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function lerArmazenado(chave, padrao) {
    try { return JSON.parse(localStorage.getItem(chave)) || padrao; }
    catch { return padrao; }
}

// ---------- Estado ----------
// Na demonstração (?demo=1) a base fica só na memória: a base real deste navegador não é tocada
const modoDemo = new URLSearchParams(location.search).has('demo');
let employeeDB = modoDemo ? {} : lerArmazenado('unifydata_db', {});
let baseMeta   = modoDemo ? {} : lerArmazenado('unifydata_db_meta', {});
let origens    = [];     // nomes dos relatórios do Linx, na ordem enviada
let prontos    = [];     // { nome, cpf, empresa, consumos: { origem: { vencido, total } } }
let pendencias = [];     // { id, tipo, matricula, nomeLinx, cpf, valor, origem, consumos }
let ignoradas  = [];
let periodoFechamento = ''; // "01/09/2026 a 30/09/2026", lido dos relatórios do Linx

function salvarBase() {
    if (modoDemo) return;
    try {
        localStorage.setItem('unifydata_db', JSON.stringify(employeeDB));
        localStorage.setItem('unifydata_db_meta', JSON.stringify(baseMeta));
    } catch {
        throw new ErroUsuario('O navegador não deixou salvar a base (armazenamento cheio ou bloqueado). Os dados valem só até fechar a página.');
    }
}

// Reaproveita a grafia de uma empresa já cadastrada ("posto serra azul" → "Posto Serra Azul")
function empresaCanonica(digitada) {
    const limpa = digitada.trim().replace(/\s+/g, ' ');
    return N.empresasDaBase(employeeDB).find(e => N.normalizar(e) === N.normalizar(limpa)) || limpa;
}

// ---------- Tema ----------
const raiz = document.documentElement;

function aplicarTema(tema, salvar) {
    raiz.dataset.tema = tema;
    if (salvar) { try { localStorage.setItem('unifydata_tema', tema); } catch {} }
    document.querySelectorAll('.tema__opcao').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.opcao === tema)));
    $('btn-tema').setAttribute('aria-label', tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro');
    document.querySelector('meta[name="theme-color"]').content = tema === 'escuro' ? '#141416' : '#f6f6f7';
}
document.querySelectorAll('.tema__opcao').forEach(b => b.addEventListener('click', () => aplicarTema(b.dataset.opcao, true)));
$('btn-tema').addEventListener('click', () => aplicarTema(raiz.dataset.tema === 'escuro' ? 'claro' : 'escuro', true));
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    let salvo = null;
    try { salvo = localStorage.getItem('unifydata_tema'); } catch {}
    if (salvo !== 'claro' && salvo !== 'escuro') aplicarTema(e.matches ? 'claro' : 'escuro', false);
});
aplicarTema(raiz.dataset.tema, false);

// ---------- Avisos e toast ----------
const ICONES_AVISO = { ok: 'i-check', atencao: 'i-alerta', erro: 'i-alerta', info: 'i-info' };

function mostrarAviso(el, tipo, html) {
    el.className = `aviso aviso--${tipo}`;
    el.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#${ICONES_AVISO[tipo]}"/></svg><div>${html}</div>`;
    el.hidden = false;
}
function esconderAviso(el) { el.hidden = true; el.innerHTML = ''; }

let toastTimer;
function toast(mensagem) {
    const el = $('toast');
    el.textContent = mensagem;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('visivel'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.remove('visivel');
        toastTimer = setTimeout(() => { el.hidden = true; }, 250);
    }, 3200);
}

function ocupado(btn, ativo, rotulo) {
    if (ativo) {
        btn.dataset.rotulo = btn.innerHTML;
        btn.setAttribute('aria-busy', 'true');
        btn.disabled = true;
        btn.textContent = rotulo;
    } else {
        btn.removeAttribute('aria-busy');
        if (btn.dataset.rotulo) btn.innerHTML = btn.dataset.rotulo;
        btn.disabled = false;
    }
}

function mensagemDeErro(err) {
    if (err instanceof ErroUsuario) return err.message;
    console.error(err);
    return `Algo deu errado ao ler os arquivos: ${esc(err.message)}. Confira se são os relatórios certos e tente de novo.`;
}

// ---------- Andamento das etapas (lateral) ----------
document.querySelectorAll('.passo__num').forEach(n => { n.dataset.numero = n.textContent; });

function definirPasso(id, { estado, resumo, ativo }) {
    const passo = $(`passo-${id}`);
    const num = passo.querySelector('.passo__num');
    passo.classList.toggle('passo--feito', estado === 'feito');
    passo.classList.toggle('passo--atencao', estado === 'atencao');
    if (estado === 'feito') num.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>';
    else num.textContent = num.dataset.numero;
    passo.querySelector('small').textContent = resumo;
    passo.setAttribute('aria-disabled', String(estado === 'bloqueado'));
    if (ativo) passo.setAttribute('aria-current', 'step'); else passo.removeAttribute('aria-current');
}

function atualizarPassos() {
    const total = Object.keys(employeeDB).length;
    const empresas = N.empresasDaBase(employeeDB).length;
    const arquivos = envioLinx.arquivos.length;
    const processado = origens.length > 0;
    const resultadoVisivel = !$('etapa-resultado').hidden;
    const atual = resultadoVisivel ? 'resultado' : !total ? 'base' : !processado ? 'consumos' : pendencias.length ? 'pendencias' : 'resultado';
    const relatorios = processado ? origens.length : arquivos;

    definirPasso('base', {
        estado: total ? 'feito' : 'aberto', ativo: atual === 'base',
        resumo: total ? `${total} ${total === 1 ? 'pessoa' : 'pessoas'} · ${empresas} ${empresas === 1 ? 'empresa' : 'empresas'}` : 'Nenhum cadastro'
    });
    definirPasso('consumos', {
        estado: processado ? 'feito' : 'aberto', ativo: atual === 'consumos',
        resumo: relatorios ? `${relatorios} ${relatorios === 1 ? 'relatório' : 'relatórios'}` : 'Nenhum relatório'
    });
    definirPasso('pendencias', {
        estado: !processado ? 'bloqueado' : pendencias.length ? 'atencao' : 'feito', ativo: atual === 'pendencias',
        resumo: !processado ? 'Depois de processar' : pendencias.length ? `${pendencias.length} a resolver` : 'Nenhuma pendente'
    });
    const total$ = resultadoVisivel ? N.agruparPorEmpresa(prontos, origens).reduce((s, g) => s + g.total, 0) : 0;
    definirPasso('resultado', {
        estado: resultadoVisivel && prontos.length ? 'feito' : resultadoVisivel ? 'atencao' : 'bloqueado', ativo: atual === 'resultado',
        resumo: !resultadoVisivel ? 'Depois de processar' : prontos.length ? N.formatarMoeda(total$) : 'Nada para exportar'
    });

    const chip = $('chip-periodo');
    chip.hidden = !periodoFechamento;
    chip.textContent = periodoFechamento ? `Vencimentos ${periodoFechamento}` : '';
}

// ---------- Envio de arquivos (clique, teclado ou arrastar) ----------
function criarEnvio({ zona, input, lista, multiplo, aceitar, tipoEsperado, aoMudar }) {
    let arquivos = [];

    const renderizar = () => {
        lista.innerHTML = arquivos.map((f, i) => `
            <li class="arquivo">
                <svg class="ic" aria-hidden="true"><use href="#i-arquivo"/></svg>
                <span class="arquivo__nome" title="${esc(f.name)}">${esc(f.name)}</span>
                <span class="arquivo__tamanho">${tamanhoArquivo(f.size)}</span>
                <button class="arquivo__remover" type="button" data-indice="${i}" aria-label="Remover ${esc(f.name)}">
                    <svg class="ic" aria-hidden="true"><use href="#i-fechar"/></svg>
                </button>
            </li>`).join('');
        aoMudar(arquivos);
    };

    const adicionar = novos => {
        const validos = novos.filter(aceitar);
        const recusados = novos.length - validos.length;
        if (recusados) toast(recusados === 1 ? `Arquivo ignorado: aqui só entra ${tipoEsperado}.` : `${recusados} arquivos ignorados: aqui só entra ${tipoEsperado}.`);
        if (!validos.length) return;
        if (multiplo) {
            // Arquivo com o mesmo nome substitui o anterior (evita somar dois LOJA.csv na mesma coluna)
            let substituidos = 0;
            arquivos = arquivos.slice();
            validos.forEach(f => {
                const i = arquivos.findIndex(a => a.name.toLowerCase() === f.name.toLowerCase());
                if (i === -1) { arquivos.push(f); return; }
                if (arquivos[i].size !== f.size || arquivos[i].lastModified !== f.lastModified) substituidos++;
                arquivos[i] = f;
            });
            if (substituidos) toast(substituidos === 1 ? 'Um arquivo com o mesmo nome foi substituído pelo novo.' : `${substituidos} arquivos com o mesmo nome foram substituídos pelos novos.`);
        } else {
            arquivos = [validos[0]];
        }
        renderizar();
    };

    input.addEventListener('change', () => { adicionar(Array.from(input.files)); input.value = ''; });
    zona.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', e => { if (!zona.contains(e.relatedTarget)) zona.classList.remove('arrastando'); });
    zona.addEventListener('drop', e => {
        e.preventDefault();
        zona.classList.remove('arrastando');
        adicionar(Array.from(e.dataTransfer.files));
    });
    lista.addEventListener('click', e => {
        const btn = e.target.closest('.arquivo__remover');
        if (!btn) return;
        arquivos.splice(Number(btn.dataset.indice), 1);
        renderizar();
        input.focus();
    });

    return {
        get arquivos() { return arquivos; },
        definir(lista_) { arquivos = lista_.slice(); renderizar(); },
        limpar() { arquivos = []; renderizar(); }
    };
}

// Evita que o navegador abra o arquivo quando ele é solto fora das zonas
['dragover', 'drop'].forEach(tipo => window.addEventListener(tipo, e => {
    if (!e.target.closest || !e.target.closest('.zona')) {
        e.preventDefault();
        if (tipo === 'dragover') e.dataTransfer.dropEffect = 'none';
    }
}));

// ---------- Etapa 1: Base de funcionários ----------
const btnAbrirBase = $('btn-abrir-base');
const baseConteudo = $('base-conteudo');
const btnAtualizarBase = $('btn-update-db');
const baseStatus = $('base-status');

const envioPdf = criarEnvio({
    zona: $('zona-pdf'), input: $('upload-db-pdf'), lista: $('lista-pdf'),
    multiplo: false, tipoEsperado: 'PDF', aceitar: f => /\.pdf$/i.test(f.name),
    aoMudar: () => atualizarBotaoBase()
});
const envioRh = criarEnvio({
    zona: $('zona-rh'), input: $('upload-db-hr'), lista: $('lista-rh'),
    multiplo: true, tipoEsperado: '.xls, .xlsx ou .csv', aceitar: f => /\.(xlsx?|csv)$/i.test(f.name),
    aoMudar: () => atualizarBotaoBase()
});

function atualizarBotaoBase() {
    btnAtualizarBase.disabled = !(envioPdf.arquivos.length || envioRh.arquivos.length);
}

function abrirBase(aberta) {
    baseConteudo.hidden = !aberta;
    btnAbrirBase.setAttribute('aria-expanded', String(aberta));
    btnAbrirBase.textContent = aberta ? 'Fechar' : 'Atualizar base';
}

function renderizarBase() {
    const total = Object.keys(employeeDB).length;
    const empresas = N.empresasDaBase(employeeDB);
    const semEmpresa = Object.values(employeeDB).filter(e => e.empresa === N.SEM_EMPRESA).length;
    const resumo = $('base-resumo');

    if (!total) {
        resumo.textContent = 'Nenhum funcionário cadastrado ainda.';
        btnAbrirBase.hidden = true;
        abrirBase(true);
    } else {
        const partes = [`<b>${total}</b> ${total === 1 ? 'funcionário' : 'funcionários'} em <b>${empresas.length}</b> ${empresas.length === 1 ? 'empresa' : 'empresas'}`];
        if (semEmpresa) partes.push(`${semEmpresa} sem empresa`);
        if (baseMeta.atualizadaEm) partes.push(`atualizada em ${dataCurta(new Date(baseMeta.atualizadaEm))}`);
        resumo.innerHTML = partes.join('&nbsp;· '); // o ponto fica colado ao trecho anterior ao quebrar a linha
        btnAbrirBase.hidden = false;
    }
    $('lista-empresas').innerHTML = empresas.map(e => `<option value="${esc(e)}"></option>`).join('');
    // O convite para os exemplos é para quem chega sem base; no uso de todo mês ele sai do caminho
    $('abertura-acoes').hidden = modoDemo || total > 0;
    atualizarPassos();
}

btnAbrirBase.addEventListener('click', () => {
    const abrir = baseConteudo.hidden;
    abrirBase(abrir);
    if (!abrir) esconderAviso(baseStatus);
});

async function lerArquivoRH(arquivo) {
    const base = N.empresaDoArquivo(arquivo.name);
    if (/\.csv$/i.test(arquivo.name)) return N.extrairRH(N.lerCSV(await lerTexto(arquivo)), base);

    const XLSX = await carregarBiblioteca('xlsx');
    const workbook = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
    let registros = null;
    workbook.SheetNames.forEach(nomeAba => {
        const empresa = (workbook.SheetNames.length > 1 && !N.normalizar(nomeAba).startsWith('plan')) ? `${base} - ${nomeAba}` : base;
        const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], { header: 1, raw: false, defval: '' });
        const daAba = N.extrairRH(linhas, empresa);
        if (daAba) registros = (registros || []).concat(daAba);
    });
    return registros;
}

async function lerPdfContas(arquivo) {
    const pdfjsLib = await carregarBiblioteca('pdfjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    const pdf = await pdfjsLib.getDocument({ data: await arquivo.arrayBuffer(), isEvalSupported: false }).promise;
    const pessoas = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const conteudo = await (await pdf.getPage(i)).getTextContent();
        pessoas.push(...N.extrairPessoasPdf(conteudo.items.map(item => item.str).join(' ')));
    }
    return pessoas;
}

async function salvarArquivosNaBase({ silencioso = false } = {}) {
    esconderAviso(baseStatus);
    ocupado(btnAtualizarBase, true, 'Lendo arquivos…');
    const antes = Object.keys(employeeDB).length;
    const avisos = [];

    try {
        const registrosRH = [];
        for (const arquivo of envioRh.arquivos) {
            const registros = await lerArquivoRH(arquivo);
            if (!registros) { avisos.push(`<b>${esc(arquivo.name)}</b>: a coluna CPF não foi encontrada.`); continue; }
            if (!registros.length) { avisos.push(`<b>${esc(arquivo.name)}</b>: nenhum funcionário encontrado.`); continue; }
            registrosRH.push(...registros);
        }

        let pessoas = [];
        let avisoPdf = '';
        if (envioPdf.arquivos.length) {
            const arquivo = envioPdf.arquivos[0];
            pessoas = await lerPdfContas(arquivo);
            if (!pessoas.length) {
                avisoPdf = `<b>${esc(arquivo.name)}</b>: nenhuma linha “Pessoa: matrícula - nome - CPF” encontrada.`;
                avisos.push(avisoPdf);
            }
        }

        const nova = N.atualizarBase(employeeDB, registrosRH, pessoas);
        const depois = Object.keys(nova).length;
        const listaAvisos = avisos.length ? `<ul>${avisos.map(a => `<li>${a}</li>`).join('')}</ul>` : '';
        if (depois === 0) {
            // Com PDF enviado, o problema é o PDF (e o aviso dele vira a mensagem); sem PDF, falta justamente ele
            const outros = avisos.filter(av => av !== avisoPdf);
            throw new ErroUsuario((avisoPdf
                ? 'Nenhum funcionário foi cadastrado: o PDF não tem nenhuma linha “Pessoa: matrícula - nome - CPF”. '
                  + 'Confira se é o relatório de contas a receber do Linx.'
                : 'Nenhum funcionário foi cadastrado. As planilhas do RH só definem a empresa de quem já está na base; '
                  + 'envie também o PDF de contas a receber do Linx, que traz a matrícula de cada um.')
                + (outros.length ? `<ul>${outros.map(av => `<li>${av}</li>`).join('')}</ul>` : ''));
        }
        if (depois === antes && !registrosRH.length && avisos.length) throw new ErroUsuario(`Nada foi salvo.${listaAvisos}`);

        employeeDB = nova;
        baseMeta.atualizadaEm = new Date().toISOString();
        salvarBase();
        envioPdf.limpar();
        envioRh.limpar();
        renderizarBase();
        atualizarAvisoConsumos();

        // Fechamento já na tela foi calculado com a base antiga
        if (origens.length) {
            limparFechamento();
            mostrarAviso(consumosAviso, 'atencao', 'A base mudou. Clique em <b>Processar fechamento</b> de novo para usar os dados atualizados.');
        }

        const novos = depois - antes;
        const resumo = `Base salva: ${depois} ${depois === 1 ? 'funcionário' : 'funcionários'}${novos > 0 ? ` (${novos} ${novos === 1 ? 'novo' : 'novos'})` : ''}.`;
        if (avisos.length) {
            mostrarAviso(baseStatus, 'atencao', `${resumo} Alguns arquivos não foram aproveitados:${listaAvisos}`);
        } else {
            abrirBase(false);
            if (!silencioso) toast(resumo);
        }
        return true;
    } catch (err) {
        mostrarAviso(baseStatus, 'erro', mensagemDeErro(err));
        return false;
    } finally {
        ocupado(btnAtualizarBase, false);
        atualizarBotaoBase();
    }
}
btnAtualizarBase.addEventListener('click', () => salvarArquivosNaBase());

// ---------- Etapa 2: Consumos do mês ----------
const btnProcessar = $('btn-process');
const consumosAviso = $('consumos-aviso');

const envioLinx = criarEnvio({
    zona: $('zona-linx'), input: $('upload-linx'), lista: $('lista-linx'),
    multiplo: true, tipoEsperado: '.csv', aceitar: f => /\.csv$/i.test(f.name),
    aoMudar: arquivos => {
        // Arquivos mudaram: o fechamento mostrado deixou de valer
        if (origens.length) limparFechamento();
        btnProcessar.disabled = arquivos.length === 0;
        atualizarAvisoConsumos();
        atualizarPassos();
    }
});

function atualizarAvisoConsumos() {
    if (envioLinx.arquivos.length && Object.keys(employeeDB).length === 0) {
        mostrarAviso(consumosAviso, 'atencao', 'A base de funcionários está vazia, então todos os consumos vão aparecer como pendência. Se puder, cadastre a base na etapa 1 antes.');
    } else {
        esconderAviso(consumosAviso);
    }
}

function marcarProcessado(feito) {
    btnProcessar.classList.toggle('btn--primario', !feito);
    btnProcessar.classList.toggle('btn--secundario', feito);
    btnProcessar.textContent = feito ? 'Processar de novo' : 'Processar fechamento';
}

function limparFechamento() {
    pendencias = [];
    prontos = [];
    ignoradas = [];
    origens = [];
    periodoFechamento = '';
    listaPendencias.innerHTML = '';
    $('relatorio').innerHTML = '';
    etapaPendencias.hidden = true;
    $('etapa-resultado').hidden = true;
    marcarProcessado(false);
    atualizarPassos();
}

btnProcessar.addEventListener('click', async () => {
    esconderAviso(consumosAviso);
    limparFechamento();
    ocupado(btnProcessar, true, 'Processando…');
    let processou = false;

    try {
        const consumos = [];
        const vazios = [];
        const periodos = new Set();

        for (const arquivo of envioLinx.arquivos) {
            const origem = semExtensao(arquivo.name);
            const { registros, periodo } = N.lerRelatorioLinx(await lerTexto(arquivo), origem);
            if (!registros.length) { vazios.push(arquivo.name); continue; }
            if (!origens.includes(origem)) origens.push(origem);
            if (periodo) periodos.add(periodo);
            consumos.push(...registros);
        }
        if (!consumos.length) {
            throw new ErroUsuario('Nenhum consumo encontrado. Confira se os arquivos são o relatório <i>Pendências por responsável</i> do Linx, exportado em .csv.');
        }
        periodoFechamento = Array.from(periodos).join('; ');
        ({ pendencias, prontos } = N.cruzar(consumos, employeeDB));

        if (vazios.length) {
            mostrarAviso(consumosAviso, 'atencao', `Sem consumos em ${vazios.map(n => `<b>${esc(n)}</b>`).join(', ')}. ${vazios.length === 1 ? 'Ele ficou' : 'Eles ficaram'} de fora.`);
        }
        processou = true;
        renderizarPendencias();
    } catch (err) {
        origens = [];
        mostrarAviso(consumosAviso, 'erro', mensagemDeErro(err));
    } finally {
        ocupado(btnProcessar, false);
        marcarProcessado(processou);
        btnProcessar.disabled = envioLinx.arquivos.length === 0;
        atualizarPassos();
    }
});

// ---------- Etapa 3: Pendências ----------
const etapaPendencias = $('etapa-pendencias');
const listaPendencias = $('lista-pendencias');

function htmlPendencia(p) {
    const semCadastro = p.tipo === 'Sem Cadastro';
    const meta = [`<span>Matrícula <span class="mono">${esc(p.matricula)}</span></span>`];
    if (!semCadastro && p.cpf) meta.push(`<span>CPF <span class="mono">${esc(N.formatarCPF(p.cpf))}</span></span>`);
    meta.push(`<span>${esc(p.origem)}</span>`);

    return `
    <article class="pendencia" data-id="${esc(p.id)}">
        <div class="pendencia__topo">
            <div>
                <span class="selo ${semCadastro ? 'selo--erro' : 'selo--atencao'}">${semCadastro ? 'Sem cadastro' : 'Sem empresa'}</span>
                <h3 class="pendencia__nome">${esc(N.nomeExibicao(p.nomeLinx))}</h3>
                <p class="pendencia__meta">${meta.join('')}</p>
            </div>
            <div class="pendencia__valor">${N.formatarMoeda(p.valor)}</div>
        </div>
        <div class="pendencia__form${semCadastro ? '' : ' pendencia__form--sem-cpf'}">
            ${semCadastro ? `
            <label class="campo">
                <span>CPF <i>(opcional)</i></span>
                <input name="cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14">
            </label>` : ''}
            <label class="campo">
                <span>Empresa</span>
                <input name="empresa" list="lista-empresas" autocomplete="off" placeholder="Escolha ou digite uma nova">
            </label>
            <div class="pendencia__botoes">
                <button class="btn btn--primario" type="button" data-acao="salvar">${semCadastro ? 'Salvar' : 'Vincular'}</button>
                <button class="btn btn--fantasma" type="button" data-acao="ignorar">Ignorar</button>
            </div>
            <p class="pendencia__erro" role="alert" hidden></p>
        </div>
    </article>`;
}

function renderizarPendencias() {
    $('etapa-resultado').hidden = true;
    if (!pendencias.length) { mostrarResultado(); return; }
    etapaPendencias.hidden = false;
    listaPendencias.innerHTML = pendencias.map(htmlPendencia).join('');
    $('pendencias-contador').textContent = pendencias.length;
    atualizarPassos();
    etapaPendencias.scrollIntoView({ behavior: rolagem(), block: 'start' });
}

function retirarPendencia(id, artigo) {
    pendencias = pendencias.filter(d => d.id !== id);
    const proximo = artigo.nextElementSibling || artigo.previousElementSibling;
    artigo.remove();
    $('pendencias-contador').textContent = pendencias.length;
    if (!pendencias.length) {
        etapaPendencias.hidden = true;
        mostrarResultado();
    } else {
        atualizarPassos();
        proximo?.querySelector('input')?.focus({ preventScroll: true });
    }
}

function erroPendencia(artigo, campo, mensagem) {
    const erro = artigo.querySelector('.pendencia__erro');
    erro.textContent = mensagem;
    erro.hidden = false;
    campo.setAttribute('aria-invalid', 'true');
    campo.focus();
}

function resolverPendencia(artigo) {
    const p = pendencias.find(d => d.id === artigo.dataset.id);
    const campoEmpresa = artigo.querySelector('[name=empresa]');
    const campoCpf = artigo.querySelector('[name=cpf]');
    const empresa = empresaCanonica(campoEmpresa.value);

    artigo.querySelectorAll('[aria-invalid]').forEach(c => c.removeAttribute('aria-invalid'));
    if (!empresa) { erroPendencia(artigo, campoEmpresa, 'Escolha a empresa da lista ou digite o nome de uma nova.'); return; }

    let cpf = p.cpf || '';
    if (p.tipo === 'Sem Cadastro') {
        cpf = N.somenteDigitos(campoCpf.value);
        if (cpf && cpf.length !== 11) { erroPendencia(artigo, campoCpf, 'O CPF precisa ter 11 dígitos (ou deixe em branco).'); return; }
        // Se a matrícula entrou na base nesse meio-tempo, não apaga o CPF que veio de lá
        const atual = employeeDB[p.matricula];
        cpf = cpf || atual?.cpf || '';
        employeeDB[p.matricula] = { nome: atual?.nome || p.nomeLinx, cpf, empresa };
    } else {
        employeeDB[p.matricula].empresa = empresa;
    }

    try { salvarBase(); } catch (err) { toast(err.message); }
    renderizarBase();
    prontos.push({ nome: p.nomeLinx, cpf, empresa, consumos: p.consumos });
    retirarPendencia(p.id, artigo);
    toast(`${N.nomeExibicao(p.nomeLinx)} → ${empresa}`);
}

listaPendencias.addEventListener('click', e => {
    const btn = e.target.closest('[data-acao]');
    if (!btn) return;
    const artigo = btn.closest('.pendencia');
    if (btn.dataset.acao === 'salvar') {
        resolverPendencia(artigo);
    } else {
        const p = pendencias.find(d => d.id === artigo.dataset.id);
        ignoradas.push(p);
        retirarPendencia(p.id, artigo);
        toast(`${N.nomeExibicao(p.nomeLinx)} ficou fora da planilha.`);
    }
});

listaPendencias.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input')) {
        e.preventDefault();
        resolverPendencia(e.target.closest('.pendencia'));
    }
});

// Máscara de CPF enquanto digita
listaPendencias.addEventListener('input', e => {
    if (e.target.name === 'empresa' || e.target.name === 'cpf') {
        e.target.removeAttribute('aria-invalid');
        e.target.closest('.pendencia').querySelector('.pendencia__erro').hidden = true;
    }
    if (e.target.name !== 'cpf') return;
    const d = N.somenteDigitos(e.target.value).slice(0, 11);
    e.target.value = d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
});

// ---------- Etapa 4: Resultado ----------
function mostrarResultado() {
    const etapa = $('etapa-resultado');
    const grupos = N.agruparPorEmpresa(prontos, origens);
    const total = grupos.reduce((s, g) => s + g.total, 0);
    const vazio = prontos.length === 0;

    $('resultado-titulo').textContent = vazio ? 'Nada para exportar' : 'Fechamento pronto';
    $('resultado-subtitulo').textContent = vazio
        ? 'Todas as pendências foram ignoradas, então nenhum funcionário entrou na planilha. Clique em Novo fechamento para recomeçar.'
        : `Consumos de ${N.listaPorExtenso(origens)}${periodoFechamento ? `, vencimentos de ${periodoFechamento}` : ''}, cruzados com a base de funcionários.`;

    $('resultado-numeros').hidden = vazio;
    ['btn-download', 'btn-csv', 'btn-imprimir'].forEach(id => { $(id).hidden = vazio; });
    // Sem nada para exportar, recomeçar é a única ação: vira o botão principal
    $('btn-reset').className = vazio ? 'btn btn--primario' : 'btn btn--fantasma';
    esconderAviso($('resultado-aviso'));

    $('resultado-numeros').innerHTML = `
        <div class="numero"><dt>Funcionários</dt><dd>${prontos.length}</dd></div>
        <div class="numero"><dt>Empresas</dt><dd>${grupos.length}</dd></div>
        <div class="numero numero--destaque"><dt>Total a descontar</dt><dd>${N.formatarMoeda(total)}</dd></div>`;

    $('resultado-tabela').innerHTML = vazio ? '' : `
        <table class="tabela${origens.length >= 3 ? ' tabela--varias' : ''}">
            <thead><tr>
                <th scope="col">Empresa</th><th scope="col" class="num">Pessoas</th>
                ${origens.map(o => `<th scope="col" class="num col-origem">${esc(o)}</th>`).join('')}
                <th scope="col" class="num">Total</th>
            </tr></thead>
            <tbody>${grupos.map(g => `<tr>
                <td>${esc(g.empresa)}</td><td class="num">${g.linhas.length}</td>
                ${origens.map(o => `<td class="num col-origem">${N.formatarMoeda(N.consumoDe(g.porOrigem, o).total)}</td>`).join('')}
                <td class="num">${N.formatarMoeda(g.total)}</td></tr>`).join('')}
            </tbody>
            <tfoot><tr>
                <td>Total</td><td class="num">${prontos.length}</td>
                ${origens.map(o => `<td class="num col-origem">${N.formatarMoeda(grupos.reduce((s, g) => s + N.consumoDe(g.porOrigem, o).total, 0))}</td>`).join('')}
                <td class="num">${N.formatarMoeda(total)}</td></tr>
            </tfoot>
        </table>`;

    const nota = $('resultado-ignorados');
    if (ignoradas.length) {
        const valor = ignoradas.reduce((s, p) => s + p.valor, 0);
        nota.textContent = `${ignoradas.length === 1 ? '1 pendência ignorada ficou' : `${ignoradas.length} pendências ignoradas ficaram`} fora da planilha (${N.formatarMoeda(valor)}): ${ignoradas.map(p => N.nomeExibicao(p.nomeLinx)).join(', ')}.`;
        nota.hidden = false;
    } else {
        nota.hidden = true;
    }

    montarRelatorio(grupos, total);
    etapa.hidden = false;
    atualizarPassos();
    etapa.scrollIntoView({ behavior: rolagem(), block: 'start' });
    $('resultado-titulo').focus({ preventScroll: true });
}

// ---------- Exportação: Excel ----------
async function gerarExcel() {
    const ExcelJS = await carregarBiblioteca('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'UnifyData · AFN Systems';
    workbook.created = new Date();

    const headerFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF58111A' } };
    const headerFont  = { color: { argb: 'FFFFFFFF' }, bold: true };
    const grayFont    = { color: { argb: 'FF808080' } };
    const centerAlign = { vertical: 'middle', horizontal: 'center' };
    const currency    = '"R$" #,##0.00';
    const usados = new Set();

    N.agruparPorEmpresa(prontos, origens).forEach(grupo => {
        const ws = workbook.addWorksheet(N.nomeDeAba(grupo.empresa, usados), {
            views: [{ state: 'frozen', ySplit: 1 }],
            // Impressão: A4, na largura da página, cabeçalho repetido; paisagem com 3 lojas ou mais, como o relatório
            pageSetup: { paperSize: 9, orientation: origens.length >= 3 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' }
        });

        // Cabeçalho: Funcionário | CPF | [Vencido X | Total X] por origem | Total Desconto
        const headerRow = N.cabecalhoPlanilha(origens);
        const cab = ws.addRow(headerRow);
        cab.height = 20;
        cab.eachCell(cell => { cell.fill = headerFill; cell.font = headerFont; cell.alignment = centerAlign; });

        const somas = new Array(headerRow.length).fill(0);
        grupo.linhas.forEach(row => {
            const dados = [row.nome, N.formatarCPF(row.cpf)];
            origens.forEach(o => {
                const c = N.consumoDe(row.consumos, o);
                dados.push(c.vencido, c.total);
            });
            dados.push(row.total);
            dados.forEach((v, i) => { if (i >= 2) somas[i] += v; });
            const linha = ws.addRow(dados);
            linha.eachCell((cell, col) => {
                if (col >= 3) cell.numFmt = currency;
                if (row.total === 0) cell.font = grayFont;
            });
        });

        // Rodapé com somas (fórmulas com o valor já calculado, para continuar certo se alguém editar)
        const ultima = grupo.linhas.length + 1;
        const rodape = ws.addRow(['TOTAL GERAL', '']);
        for (let col = 3; col <= headerRow.length; col++) {
            const letra = N.letraColuna(col);
            rodape.getCell(col).value = { formula: `SUM(${letra}2:${letra}${ultima})`, result: Math.round(somas[col - 1] * 100) / 100 };
            rodape.getCell(col).numFmt = currency;
        }
        rodape.eachCell(cell => { cell.font = { bold: true }; cell.border = { top: { style: 'thin' } }; });

        // Largura pelas maiores entradas, com teto para nomes muito longos.
        // Texto em maiúsculas ocupa mais que a unidade de largura do Excel (o "0"), daí a folga de 20%.
        ws.columns.forEach((col, i) => {
            let max = (headerRow[i] || '').length;
            col.eachCell(c => {
                const tamanho = typeof c.value === 'number' ? N.formatarMoeda(c.value).length
                    : typeof c.value === 'string' ? Math.ceil(c.value.length * 1.2) : 0;
                max = Math.max(max, tamanho);
            });
            col.width = Math.min(max + 3, 48);
        });
    });

    if (!workbook.worksheets.length) workbook.addWorksheet('Dados');
    return workbook.xlsx.writeBuffer();
}

$('btn-download').addEventListener('click', async e => {
    const btn = e.currentTarget;
    ocupado(btn, true, 'Gerando…');
    try {
        const buffer = await gerarExcel();
        baixarArquivo(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Fechamento_UnifyData_${dataArquivo()}.xlsx`);
        toast('Planilha baixada.');
    } catch (err) {
        mostrarAviso($('resultado-aviso'), 'erro', err instanceof ErroUsuario ? err.message : 'Não foi possível gerar a planilha. Tente de novo ou use o CSV.');
        if (!(err instanceof ErroUsuario)) console.error(err);
    } finally {
        ocupado(btn, false);
    }
});

// ---------- Exportação: CSV ----------
$('btn-csv').addEventListener('click', () => {
    baixarArquivo(N.gerarCSV(N.agruparPorEmpresa(prontos, origens), origens), `Fechamento_UnifyData_${dataArquivo()}.csv`, 'text/csv;charset=utf-8');
    toast('CSV baixado.');
});

// ---------- Exportação: impressão / PDF ----------
function montarRelatorio(grupos, total) {
    const rel = $('relatorio');
    if (!prontos.length) { rel.innerHTML = ''; return; }

    // Cabeçalho em dois níveis: a loja em cima, Vencido | Total embaixo (cabe mesmo com lojas de nome longo)
    const cabecalhoTabela = `<tr><th rowspan="2" class="pessoa">Funcionário</th><th rowspan="2" class="cpf">CPF</th>${origens.map(o => `<th colspan="2" class="loja">${esc(o)}</th>`).join('')}<th rowspan="2" class="num ini">Total desconto</th></tr>`
        + `<tr>${origens.map(() => '<th class="num sub ini">Vencido</th><th class="num sub">Total</th>').join('')}</tr>`;
    const notaIgnoradas = ignoradas.length === 0 ? 'Sem pendências ignoradas.'
        : ignoradas.length === 1 ? `1 pendência ignorada não consta neste relatório: ${esc(ignoradas[0].nomeLinx)} (${N.formatarMoeda(ignoradas[0].valor)}).`
        : `${ignoradas.length} pendências ignoradas não constam neste relatório: ${ignoradas.map(p => esc(p.nomeLinx)).join(', ')} (${N.formatarMoeda(ignoradas.reduce((s, p) => s + p.valor, 0))}).`;

    rel.innerHTML = `
        <div class="relatorio__cabecalho">
            <div><h1>Fechamento de consumo</h1><p>${esc(origens.join(' · '))}${periodoFechamento ? ` · Vencimentos de ${esc(periodoFechamento)}` : ''}</p></div>
            <div class="relatorio__meta">UnifyData<br>${dataCurta()}</div>
        </div>
        <div class="relatorio__resumo">
            <div><span>Funcionários</span><b>${prontos.length}</b></div>
            <div><span>Empresas</span><b>${grupos.length}</b></div>
            <div><span>Total a descontar</span><b>${N.formatarMoeda(total)}</b></div>
        </div>
        ${grupos.map(g => `
        <section class="relatorio__empresa">
            <h2>${esc(g.empresa)}</h2>
            <table>
                <thead>${cabecalhoTabela}</thead>
                <tbody>${g.linhas.map(r => `<tr${r.total === 0 ? ' class="zerado"' : ''}>
                    <td>${esc(r.nome)}</td><td>${r.cpf ? esc(N.formatarCPF(r.cpf)) : '—'}</td>
                    ${origens.map(o => { const c = N.consumoDe(r.consumos, o); return `<td class="num ini">${N.formatarMoeda(c.vencido)}</td><td class="num">${N.formatarMoeda(c.total)}</td>`; }).join('')}
                    <td class="num ini">${N.formatarMoeda(r.total)}</td></tr>`).join('')}
                </tbody>
                <tfoot><tr><td colspan="2">Total da empresa</td>
                    ${origens.map(o => `<td class="num ini">${N.formatarMoeda(N.consumoDe(g.porOrigem, o).vencido)}</td><td class="num">${N.formatarMoeda(N.consumoDe(g.porOrigem, o).total)}</td>`).join('')}
                    <td class="num ini">${N.formatarMoeda(g.total)}</td></tr>
                </tfoot>
            </table>
        </section>`).join('')}
        <div class="relatorio__rodape"><span>Gerado pelo UnifyData em ${dataCurta()} · ${notaIgnoradas}</span><span class="relatorio__assinatura"><b>AFN</b> SYSTEMS</span></div>`;

    // Com muitas lojas a tabela não cabe em retrato: a página nomeada "paisagem" vira A4 deitado
    rel.classList.toggle('relatorio--paisagem', origens.length >= 3);
}

$('btn-imprimir').addEventListener('click', () => window.print());

// ---------- Novo fechamento ----------
$('btn-reset').addEventListener('click', () => {
    limparFechamento();
    envioLinx.limpar();
    esconderAviso(consumosAviso);
    $('etapa-consumos').scrollIntoView({ behavior: rolagem(), block: 'start' });
    $('upload-linx').focus({ preventScroll: true });
});

// ---------- Demonstração com os arquivos de exemplo ----------
const EXEMPLOS = {
    pdf: ['Contas a Receber.pdf'],
    rh: ['Empregados Auto Peças Horizonte.xlsx', 'Empregados Hotel Primavera.xlsx', 'Empregados Posto Serra Azul.xlsx'],
    linx: ['LOJA.csv', 'RESTAURANTE.csv']
};

async function buscarExemplo(nome) {
    const resposta = await fetch(`exemplos/${encodeURIComponent(nome)}`);
    if (!resposta.ok) throw new Error(`${nome}: ${resposta.status}`);
    return new File([await resposta.blob()], nome, { lastModified: Date.now() });
}

async function iniciarDemonstracao() {
    $('faixa-demo').hidden = false;
    try {
        const [pdf, rh, linx] = await Promise.all(['pdf', 'rh', 'linx'].map(k => Promise.all(EXEMPLOS[k].map(buscarExemplo))));
        envioPdf.definir(pdf);
        envioRh.definir(rh);
        if (!await salvarArquivosNaBase({ silencioso: true })) return;
        envioLinx.definir(linx);
        toast('Base de exemplo carregada. Agora é só processar o fechamento.');
        $('etapa-consumos').scrollIntoView({ behavior: rolagem(), block: 'start' });
        btnProcessar.focus({ preventScroll: true });
    } catch (err) {
        console.warn('Exemplos indisponíveis:', err);
        mostrarAviso($('exemplos-aviso'), 'atencao', 'Os arquivos de exemplo não abrem por aqui. Eles funcionam na versão publicada; '
            + 'neste computador, envie os arquivos da pasta <b>exemplos/</b> nas etapas 1 e 2.');
    }
}

$('btn-exemplos').addEventListener('click', () => {
    if (location.protocol === 'file:') {
        mostrarAviso($('exemplos-aviso'), 'info', 'Aberto direto do disco, o navegador não deixa a página buscar os exemplos sozinha. '
            + 'Envie os arquivos da pasta <b>exemplos/</b> nas etapas 1 e 2, ou abra a versão publicada.');
        return;
    }
    // A demonstração começa limpa e numa base só de memória
    location.search = '?demo=1';
});

renderizarBase();
// Com a base já salva (uso de todo mês), a etapa 1 começa recolhida
if (Object.keys(employeeDB).length) abrirBase(false);
if (modoDemo) iniciarDemonstracao();
