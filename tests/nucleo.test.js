// Testes das regras do fechamento (js/nucleo.js). Rodam com `node --test`, sem dependências.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const N = require('../js/nucleo.js');

const exemplo = nome => new TextDecoder('windows-1252').decode(readFileSync(join(__dirname, '..', 'exemplos', nome)));

test('relatório do Linx de exemplo: responsáveis, valores e período', () => {
    const { registros, periodo } = N.lerRelatorioLinx(exemplo('LOJA.csv'), 'LOJA');
    assert.equal(registros.length, 18);
    assert.equal(periodo, '01/09/2026 a 30/09/2026');
    assert.deepEqual(registros[0], { matricula: '310037', nome: 'ANA CAROLINA MENDES', vencido: 11.1, total: 18.5, origem: 'LOJA' });
    assert.ok(registros.every(r => r.total > 0 && r.origem === 'LOJA'));
    assert.equal(N.lerRelatorioLinx(exemplo('RESTAURANTE.csv'), 'RESTAURANTE').registros.length, 16);
});

test('linha de Total: milhar, vencido vazio, Total geral e valor zerado', () => {
    const texto = [
        'Conta: 1 Responsável: 1 - ANA;;;',
        'Total;1.234,56;2.000,10;;;',
        'Conta: 1 Responsável: 2 - BRUNO;;;',
        'Total;;18,50;;;',
        'Conta: 1 Responsável: 3 - CARLA;;;',
        'Total;0;0;;;',
        'Total geral;1.234,56;2.018,60;;;',
    ].join('\r\n');
    const { registros } = N.lerRelatorioLinx(texto, 'X');
    assert.deepEqual(registros.map(r => [r.matricula, r.vencido, r.total]), [['1', 1234.56, 2000.1], ['2', 0, 18.5]]);
});

test('planilha do RH com cabeçalho quebrado em duas linhas e repetido mais abaixo', () => {
    const linhas = [
        ['EMPREGADOS ATIVOS'],
        ['', '', '', '', '', '', '', '', 'CPF'],
        ['Cód.', '', 'Nome'],
        ['12', '', 'MARIA DA SILVA', '', '', '', '', '', '123.456.789-01'],
        ['Cód.', '', 'Nome', '', '', '', '', '', 'CPF'],
        ['13', '', 'JOÃO SOUZA', '', '', '', '', '', 1234567800],
        ['', '', '', 'Total de empregados:', '', '', '', '', '2'],
    ];
    const r = N.extrairRH(linhas, 'Posto');
    assert.deepEqual(r, [
        { cpf: '12345678901', mat: '12', nome: 'MARIA DA SILVA', empresa: 'Posto' },
        { cpf: '01234567800', mat: '13', nome: 'JOÃO SOUZA', empresa: 'Posto' },
    ]);
    assert.equal(N.extrairRH([['Nome'], ['MARIA']], 'X'), null, 'sem coluna CPF não há como ligar à base');
});

test('CSV com aspas, vírgulas dentro dos campos e separador ;', () => {
    const linhas = N.lerCSV('Código;Nome;CPF;Endereço\r\n10;"SILVA, JOÃO";123.456.789-01;"Rua A, 1; fundos"\r\n');
    assert.deepEqual(linhas[1], ['10', 'SILVA, JOÃO', '123.456.789-01', 'Rua A, 1; fundos']);
    assert.deepEqual(N.extrairRH(linhas, 'R'), [{ cpf: '12345678901', mat: '10', nome: 'SILVA, JOÃO', empresa: 'R' }]);
    assert.deepEqual(N.lerCSV('nome,cpf\nANA,1')[1], ['ANA', '1']);
});

test('PDF de contas a receber: quem vem sem CPF não puxa o CPF do próximo', () => {
    const texto = 'Pessoa: 101 - ANA LIMA - 111.222.333-44 Doc Pessoa: 102 - SEM CPF Doc Pessoa: 103 - BRUNO - 555.666.777-88';
    assert.deepEqual(N.extrairPessoasPdf(texto), [
        { mat: '101', nome: 'ANA LIMA', cpf: '11122233344' },
        { mat: '103', nome: 'BRUNO', cpf: '55566677788' },
    ]);
});

test('base: PDF dá a matrícula, RH dá a empresa, código do RH não duplica CPF', () => {
    const antiga = Object.freeze({ '900': Object.freeze({ nome: 'ANTIGO', cpf: '99999999999', empresa: 'Hotel' }) });
    const rh = [
        { cpf: '11122233344', mat: '1', nome: 'ANA LIMA', empresa: 'Posto' },
        { cpf: '', mat: '2', nome: 'SEM CPF', empresa: 'Posto' },
        { cpf: '99999999999', mat: '3', nome: 'ANTIGO', empresa: 'Loja' },
    ];
    const pdf = [{ mat: '101', nome: 'ANA LIMA', cpf: '11122233344' }, { mat: '102', nome: 'BRUNO', cpf: '55566677788' }];
    const base = N.atualizarBase(antiga, rh, pdf);
    assert.deepEqual(base['101'], { nome: 'ANA LIMA', cpf: '11122233344', empresa: 'Posto' });
    assert.equal(base['102'].empresa, N.SEM_EMPRESA);
    assert.equal(base['1'], undefined, 'o código 1 do RH é da Ana, que já está na base pelo PDF');
    assert.deepEqual(base['2'], { nome: 'SEM CPF', cpf: '', empresa: 'Posto' });
    assert.equal(base['900'].empresa, 'Loja', 'o RH manda na empresa de quem mudou de unidade');
    assert.equal(antiga['900'].empresa, 'Hotel', 'a base recebida não é alterada');
});

test('cruzamento: pronto, sem cadastro e sem empresa, somando as lojas', () => {
    const base = {
        '1': { nome: 'ANA', cpf: '1', empresa: 'Posto' },
        '2': { nome: 'BRUNO', cpf: '2', empresa: N.SEM_EMPRESA },
    };
    const consumos = [
        { matricula: '1', nome: 'ANA', vencido: 5, total: 10, origem: 'LOJA' },
        { matricula: '1', nome: 'ANA', vencido: 0, total: 7, origem: 'RESTAURANTE' },
        { matricula: '2', nome: 'BRUNO', vencido: 3, total: 3, origem: 'LOJA' },
        { matricula: '3', nome: 'CARLA', vencido: 4, total: 4, origem: 'LOJA' },
    ];
    const { prontos, pendencias } = N.cruzar(consumos, base);
    assert.equal(prontos.length, 1);
    assert.equal(N.consumoDe(prontos[0].consumos, 'RESTAURANTE').total, 7);
    assert.deepEqual(pendencias.map(p => [p.tipo, p.matricula, p.valor]), [['Sem Cadastro', '3', 4], ['Sem Empresa', '2', 3]]);

    const [grupo] = N.agruparPorEmpresa(prontos, ['LOJA', 'RESTAURANTE']);
    assert.equal(grupo.total, 17);
    assert.equal(N.consumoDe(grupo.porOrigem, 'LOJA').vencido, 5);
});

test('conferência: consumo de cada loja no Linx, menos o ignorado, é o que vai para a folha', () => {
    const consumos = [...N.lerRelatorioLinx(exemplo('LOJA.csv'), 'LOJA').registros, ...N.lerRelatorioLinx(exemplo('RESTAURANTE.csv'), 'RESTAURANTE').registros];
    const { prontos, pendencias } = N.cruzar(consumos, {});
    // Sem base, todo mundo é pendência: metade vai para a folha e metade é ignorada
    const prontas = pendencias.slice(0, 10).map(p => ({ nome: p.nomeLinx, cpf: '', empresa: 'Posto', consumos: p.consumos }));
    const ignoradas = pendencias.slice(10);
    const c = N.conferencia([...prontos, ...prontas], ignoradas, ['LOJA', 'RESTAURANTE']);
    const totalLinx = o => N.lerRelatorioLinx(exemplo(`${o}.csv`), o).registros.reduce((s, r) => s + r.total, 0);
    assert.deepEqual(c.porOrigem.map(o => o.origem), ['LOJA', 'RESTAURANTE']);
    assert.equal(c.porOrigem[0].total, Math.round(totalLinx('LOJA') * 100) / 100);
    assert.equal(c.consumo, Math.round((totalLinx('LOJA') + totalLinx('RESTAURANTE')) * 100) / 100);
    assert.equal(c.ignorado, Math.round(ignoradas.reduce((s, p) => s + p.valor, 0) * 100) / 100);
    const folha = N.agruparPorEmpresa(prontas, ['LOJA', 'RESTAURANTE']).reduce((s, g) => s + g.total, 0);
    assert.equal(c.aDescontar, Math.round(folha * 100) / 100, 'consumo − ignorado = total da planilha');
    assert.equal(N.mesDoPeriodo('01/09/2026 a 30/09/2026'), 'setembro de 2026');
    assert.equal(N.mesDoPeriodo('16/09/2026 a 15/10/2026'), '16/09/2026 a 15/10/2026');
});

test('origem com nome de propriedade interna ("constructor.csv") não quebra a soma', () => {
    const { prontos } = N.cruzar([{ matricula: '1', nome: 'ANA', vencido: 1, total: 2, origem: 'constructor' }], { '1': { nome: 'ANA', cpf: '', empresa: 'toString' } });
    const grupos = N.agruparPorEmpresa(prontos, ['constructor', 'valueOf']);
    assert.equal(grupos[0].total, 2);
    assert.equal(N.consumoDe(grupos[0].porOrigem, 'valueOf').total, 0);
});

test('nome de aba válido no Excel: caracteres proibidos, History, 31 letras e repetição', () => {
    const usados = new Set();
    assert.equal(N.nomeDeAba('Obras: Nova Sede / "Bloco A"', usados), 'Obras - Nova Sede - "Bloco A"');
    assert.equal(N.nomeDeAba('history', usados), 'History (empresa)');
    assert.equal(N.nomeDeAba('[Matriz]?*', usados), '(Matriz)');
    const longo = 'Empresa com um nome comprido demais para uma aba';
    assert.equal(N.nomeDeAba(longo, usados), 'Empresa com um nome comprido');
    assert.equal(N.nomeDeAba(longo, usados), 'Empresa com um nome (2)');
    // Corte em palavra inteira, sem espaço nem hífen no fim
    assert.equal(N.nomeDeAba('Cooperativa Agroindustrial dos Produtores Rurais', usados), 'Cooperativa Agroindustrial dos');
    assert.equal(N.nomeDeAba('Transportes Rodoviários - Filial Norte', usados), 'Transportes Rodoviários');
    assert.equal(N.letraColuna(28), 'AB');
});

test('CSV para o Excel brasileiro: BOM, ponto e vírgula, vírgula decimal e sem fórmula', () => {
    const prontos = [{ nome: '=HYPERLINK("x")', cpf: '12345678901', empresa: 'Posto; Centro', consumos: { LOJA: { vencido: 1.5, total: 2 } } }];
    const csv = N.gerarCSV(N.agruparPorEmpresa(prontos, ['LOJA']), ['LOJA']);
    assert.equal(csv.charCodeAt(0), 0xFEFF);
    const linhas = csv.slice(1).split('\r\n');
    assert.equal(linhas[0], 'Empresa;Funcionário;CPF;Vencido LOJA;Total LOJA;Total Desconto');
    assert.equal(linhas[1], `"Posto; Centro";"'=HYPERLINK(""x"")";123.456.789-01;1,50;2,00;2,00`);
});

test('nome do arquivo pelo mês dos vencimentos, com _DEMO na demonstração', () => {
    const hoje = new Date(2026, 9, 13);
    assert.equal(N.nomeDoArquivo('01/09/2026 a 30/09/2026', { hoje }), 'Fechamento_UnifyData_2026-09');
    assert.equal(N.nomeDoArquivo('01/09/2026 a 30/09/2026; 01/09/2026 a 30/09/2026', { hoje }), 'Fechamento_UnifyData_2026-09');
    assert.equal(N.nomeDoArquivo('16/09/2026 a 15/10/2026', { hoje }), 'Fechamento_UnifyData_2026-09_a_2026-10');
    assert.equal(N.nomeDoArquivo('', { hoje }), 'Fechamento_UnifyData_2026-10-13', 'sem período, vale a data de hoje');
    assert.equal(N.nomeDoArquivo('01/09/2026 a 30/09/2026', { demo: true, hoje }), 'Fechamento_UnifyData_2026-09_DEMO');
    const { periodo } = N.lerRelatorioLinx(exemplo('RESTAURANTE.csv'), 'RESTAURANTE');
    assert.equal(N.nomeDoArquivo(periodo, { hoje }), 'Fechamento_UnifyData_2026-09');
});

test('textos de exibição', () => {
    assert.equal(N.formatarCPF('12345678901'), '123.456.789-01');
    assert.equal(N.formatarCPF('123'), '123');
    assert.equal(N.nomeExibicao('MARIA DAS DORES DE SOUZA'), 'Maria das Dores de Souza');
    assert.equal(N.nomeExibicao("JOÃO D'ÁVILA"), "João D'Ávila");
    assert.equal(N.normalizar('  Cód. '), 'cod.');
    assert.equal(N.empresaDoArquivo('Empregados Posto Central.xls'), 'Posto Central');
    assert.equal(N.escaparHtml('<b a="1">'), '&lt;b a=&quot;1&quot;&gt;');
});
