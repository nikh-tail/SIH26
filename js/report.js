// ============================================================
// INSPECTION REPORT & EVIDENCE DOSSIER CONTROLLER
// ============================================================

let currentScan = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Get scan ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const scanId = urlParams.get('scan') || urlParams.get('id');

    if (!scanId) {
        alert('No scan ID provided. Redirecting to Dashboard.');
        window.location.href = 'dashboard.html';
        return;
    }

    // 2. Fetch scan dossier
    currentScan = await DB.getScanDetails(scanId);

    if (!currentScan) {
        alert('Scan record not found.');
        window.location.href = 'dashboard.html';
        return;
    }

    // 3. Render report components
    renderReportHeader(currentScan);
    renderAuthenticityMatrix(currentScan);
    renderDeclarationsTable(currentScan.declarations || []);
    renderViolationsList(currentScan.violations || []);
    renderEvidencePhoto(currentScan);

    // 4. Attach PDF Export & Print handlers
    document.getElementById('btnPrintReport')?.addEventListener('click', () => {
        window.print();
    });

    document.getElementById('btnDownloadPdf')?.addEventListener('click', generatePdfReport);
    document.getElementById('btnGenerateNotice')?.addEventListener('click', showLegalNoticeModal);
});

function renderReportHeader(scan) {
    const reportRef = 'DOCA/LM/' + new Date(scan.created_at || Date.now()).getFullYear() + '/' + (scan.id.slice(-6).toUpperCase());
    document.getElementById('reportRefNumber').textContent = reportRef;
    document.getElementById('reportDate').textContent = new Date(scan.created_at || Date.now()).toLocaleString('en-IN');
    document.getElementById('reportStore').textContent = scan.store_name || 'Market Store Inspection';
    document.getElementById('reportLocation').textContent = scan.location || 'New Delhi';

    // Officer Info
    document.getElementById('reportOfficer').textContent = scan.officer_name || 'Enforcement Officer';
    document.getElementById('reportBadge').textContent = scan.badge_number || 'LM-IND-01';

    // Compliance Verdict
    const verdictEl = document.getElementById('reportVerdictBadge');
    if (scan.overall_status === 'compliant') {
        verdictEl.className = 'badge badge-success badge-lg';
        verdictEl.textContent = '✓ COMPLIANT (LEGAL METROLOGY ACT, 2009)';
    } else if (scan.overall_status === 'warning') {
        verdictEl.className = 'badge badge-warning badge-lg';
        verdictEl.textContent = '⚠️ MINOR IRREGULARITIES';
    } else {
        verdictEl.className = 'badge badge-danger badge-lg';
        verdictEl.textContent = '✗ NON-COMPLIANT / VIOLATIONS FLAGGED';
    }

    document.getElementById('reportScoreDisplay').textContent = (scan.compliance_score || 0) + '%';
}

function renderAuthenticityMatrix(scan) {
    document.getElementById('authBarcodeVal').textContent = scan.barcode || 'N/A';
    document.getElementById('authBarcodeType').textContent = scan.barcode_type || 'GTIN / EAN';
    
    document.getElementById('authDbProduct').textContent = scan.db_product_name || 'Not Listed in Registry';
    document.getElementById('authDbMfg').textContent = scan.db_manufacturer || 'N/A';
    document.getElementById('authDbMrp').textContent = scan.db_mrp || 'N/A';
    document.getElementById('authDbSource').textContent = scan.db_source || 'Public Registries';

    document.getElementById('authLabelProduct').textContent = scan.extracted_product_name || 'N/A';
    document.getElementById('authLabelMfg').textContent = scan.extracted_manufacturer || 'N/A';
    document.getElementById('authLabelMrp').textContent = scan.extracted_mrp || 'N/A';

    const authVerdictEl = document.getElementById('authVerdictBadge');
    if (scan.authenticity_status === 'verified') {
        authVerdictEl.className = 'badge badge-success';
        authVerdictEl.textContent = '✓ Authenticity Verified';
    } else if (scan.authenticity_status === 'mismatch') {
        authVerdictEl.className = 'badge badge-danger';
        authVerdictEl.textContent = '🚨 Counterfeit / Mismatch Alert';
    } else {
        authVerdictEl.className = 'badge badge-secondary';
        authVerdictEl.textContent = 'ℹ️ Registry Unverified';
    }

    document.getElementById('authVerdictNotes').textContent = scan.authenticity_notes || 'Label declarations validated independently.';
}

function renderDeclarationsTable(declarations) {
    const tbody = document.getElementById('declarationsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (declarations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No declarations extracted</td></tr>';
        return;
    }

    declarations.forEach(d => {
        const tr = document.createElement('tr');
        const statusBadge = d.compliant ? 
            '<span class="badge badge-success">✓ Pass</span>' : 
            '<span class="badge badge-danger">✗ Fail</span>';

        const fontDisplay = d.measured_font_size_mm ? 
            `${d.measured_font_size_mm}mm (Min: ${d.min_required_font_size_mm || 1.0}mm)` : 
            'Standard';

        tr.innerHTML = `
            <td><strong>${d.label || d.declaration_type}</strong></td>
            <td><code>${d.rule_reference || 'Unclassified Check'}</code></td>
            <td>${d.value_extracted ? `<strong>"${d.value_extracted}"</strong>` : '<em class="text-danger">Missing / Not Found</em>'}</td>
            <td>${fontDisplay}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderViolationsList(violations) {
    const container = document.getElementById('violationsDossierList');
    const noViolations = document.getElementById('noViolationsReportCard');
    if (!container) return;
    container.innerHTML = '';

    if (violations.length === 0) {
        if (noViolations) noViolations.style.display = 'block';
        return;
    }

    if (noViolations) noViolations.style.display = 'none';

    violations.forEach((v, idx) => {
        const card = document.createElement('div');
        card.className = 'violation-item-card ' + (v.severity === 'critical' ? 'vio-border-danger' : 'vio-border-warning');
        card.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h5 class="mb-0 text-danger font-weight-bold">
                    Item #${idx + 1}: ${v.rule_reference} — ${v.title}
                </h5>
                <span class="badge ${v.severity === 'critical' ? 'badge-danger' : 'badge-warning'}">
                    ${v.severity.toUpperCase()}
                </span>
            </div>
            <p class="text-dark mb-2">${v.description}</p>
            <div class="statutory-box">
                <div><strong>Statutory Legal Reference:</strong> ${v.penalty_section || 'Section 36(1) of Legal Metrology Act, 2009'}</div>
                ${v.suggestion ? `<div><strong>Prescribed Remedial Action:</strong> ${v.suggestion}</div>` : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

function renderEvidencePhoto(scan) {
    const imgEl = document.getElementById('evidenceLabelImage');
    const placeholder = document.getElementById('evidencePlaceholder');
    
    if (scan.image_base64 || scan.image_url) {
        if (imgEl) {
            imgEl.src = scan.image_base64 || scan.image_url;
            imgEl.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
    } else {
        if (imgEl) imgEl.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
    }
}

function generatePdfReport() {
    window.print();
}

function showLegalNoticeModal() {
    if (!currentScan) return;
    const violations = currentScan.violations || [];
    if (violations.length === 0) {
        alert('This product is fully compliant. No show-cause notice is necessary.');
        return;
    }

    const modal = document.getElementById('noticeModal');
    const content = document.getElementById('noticeModalContent');
    const ref = document.getElementById('reportRefNumber').textContent;
    const store = currentScan.store_name || 'The Retailer / Manufacturer';

    const vioText = violations.map((v, i) => `${i + 1}. Violation of ${v.rule_reference}: ${v.title} (${v.description})`).join('\n\n');

    content.textContent = `
GOVERNMENT OF INDIA
DEPARTMENT OF CONSUMER AFFAIRS
LEGAL METROLOGY ENFORCEMENT WING

FORM OF NOTICE UNDER RULE 27 / SECTION 36
Inspection Ref No: ${ref}
Date: ${new Date().toLocaleDateString('en-IN')}

To,
M/s ${store}
Location: ${currentScan.location || 'Inspection Site'}

SUBJECT: NOTICE FOR NON-COMPLIANCE UNDER LEGAL METROLOGY (PACKAGED COMMODITIES) RULES, 2011

Whereas during an inspection on ${new Date().toLocaleDateString('en-IN')}, the undersigned Legal Metrology Inspector inspected the packaged commodity "${currentScan.extracted_product_name || currentScan.db_product_name || 'Packaged Goods'}" (Barcode: ${currentScan.barcode || 'N/A'}) and observed the following statutory violations:

${vioText}

You are hereby required to show cause within 15 days of receipt of this notice why compounding proceedings or prosecution under Section 36(1) of the Legal Metrology Act, 2009 should not be initiated against you.

Issued by:
Inspector Rajesh Sharma (Badge: LM-DEL-8942)
Legal Metrology Enforcement Officer
Department of Consumer Affairs, Government of India
    `.trim();

    if (modal) modal.style.display = 'flex';
}
