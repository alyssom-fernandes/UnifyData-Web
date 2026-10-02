/* ============================================================
   UnifyData Web — boot.js
   Roda antes da página aparecer: aplica o tema (sem piscar) e começa
   a registrar falhas, que ficam disponíveis em errosRegistrados().
   ============================================================ */
(function () {
    let tema = null;
    try { tema = localStorage.getItem('unifydata_tema'); } catch (e) {}
    if (tema !== 'claro' && tema !== 'escuro') {
        tema = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro';
    }
    document.documentElement.dataset.tema = tema;

    const erros = [];
    window.addEventListener('error', e => {
        erros.push({ tipo: 'erro', mensagem: e.message, origem: `${e.filename || ''}:${e.lineno || ''}` });
    });
    window.addEventListener('unhandledrejection', e => {
        erros.push({ tipo: 'promessa', mensagem: String((e.reason && e.reason.message) || e.reason) });
    });
    // Bloqueios da política de segurança (CSP) também contam como falha
    document.addEventListener('securitypolicyviolation', e => {
        erros.push({ tipo: 'csp', mensagem: `${e.violatedDirective}: ${e.blockedURI}` });
    });
    const original = console.error;
    console.error = function (...args) {
        erros.push({ tipo: 'console', mensagem: args.map(String).join(' ') });
        return original.apply(console, args);
    };
    window.errosRegistrados = () => erros.slice();
})();
