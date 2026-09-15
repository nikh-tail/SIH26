// ============================================================
// INSPECTION REPORT & EVIDENCE DOSSIER CONTROLLER
// ============================================================

import { RULE_META, getRuleMeta } from "./ruleColors.js";
import { renderPieChart } from "./charts.js";

let currentScan = null;

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Get scan ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    let scanId = urlParams.get("scan") || urlParams.get("id");

    if (!scanId || scanId === "demo" || scanId === "demo-002") {
        scanId = "scan-demo-002";
    } else if (scanId === "demo-001") {
        scanId = "scan-demo-001";
    }

    // 2. Fetch scan dossier
    try {
        currentScan = (typeof DB !== "undefined" && DB.getScanDetails)
            ? await DB.getScanDetails(scanId)
            : null;
    } catch (err) {
        console.warn("DB scan lookup note:", err.message);
    }

    if (!currentScan && typeof DB !== "undefined" && DB.getDemoScans) {
        const demos = DB.getDemoScans();
        currentScan = demos.find(s => s.id === scanId) || demos[1] || demos[0];
    }

    if (!currentScan) {
        alert("Scan record not found. Redirecting to Dashboard.");
        window.location.href = "dashboard.html";
        return;
    }

    // 3. Render report components
    renderReportHeader(currentScan);
    renderAuthenticityMatrix(currentScan);
    renderDeclarationsTable(currentScan.declarations || []);
    renderComplianceBreakdown(currentScan);
    renderViolationsList(currentScan.violations || []);
    renderEvidencePhoto(currentScan);

    // 4. Attach PDF / CSV Export & Print handlers
    const attachAction = (id, handler) => document.getElementById(id)?.addEventListener("click", handler);

    attachAction("btnPrintReport", generatePdfReport);
    attachAction("btnPrintReportMobile", generatePdfReport);
    attachAction("btnDownloadPdf", generatePdfReport);
    attachAction("btnExportDossierCsv", exportDossierCsv);
    attachAction("btnExportDossierCsvMobile", exportDossierCsv);
    attachAction("btnGenerateNotice", showLegalNoticeModal);
    attachAction("btnGenerateNoticeMobile", showLegalNoticeModal);
});

function renderReportHeader(scan) {
    const reportRef = "DOCA/LM/" + new Date(scan.created_at || Date.now()).getFullYear() + "/" + (scan.id ? scan.id.slice(-6).toUpperCase() : "DEMO");
    document.getElementById("reportRefNumber").textContent = reportRef;
    document.getElementById("reportDate").textContent = new Date(scan.created_at || Date.now()).toLocaleString("en-IN");
    document.getElementById("reportStore").textContent = scan.store_name || "Market Store Inspection";
    document.getElementById("reportLocation").textContent = scan.location || "New Delhi";

    // Officer Info
    document.getElementById("reportOfficer").textContent = scan.officer_name || "Enforcement Officer";
    document.getElementById("reportBadge").textContent = scan.badge_number || "LM-IND-01";

    // Compliance Verdict
    const verdictEl = document.getElementById("reportVerdictBadge");
    if (scan.overall_status === "compliant") {
        verdictEl.className = "badge badge-success badge-lg";
        verdictEl.textContent = "✓ COMPLIANT (LEGAL METROLOGY ACT, 2009)";
    } else if (scan.overall_status === "warning") {
        verdictEl.className = "badge badge-warning badge-lg";
        verdictEl.textContent = "⚠️ MINOR IRREGULARITIES";
    } else {
        verdictEl.className = "badge badge-danger badge-lg";
        verdictEl.textContent = "✗ NON-COMPLIANT / VIOLATIONS FLAGGED";
    }

    document.getElementById("reportScoreDisplay").textContent = (scan.compliance_score || 0) + "%";
}

function renderAuthenticityMatrix(scan) {
    document.getElementById("authBarcodeVal").textContent = scan.barcode || "N/A";
    document.getElementById("authBarcodeType").textContent = scan.barcode_type || "GTIN / EAN";
    
    document.getElementById("authDbProduct").textContent = scan.db_product_name || "Not Listed in Registry";
    document.getElementById("authDbMfg").textContent = scan.db_manufacturer || "N/A";
    document.getElementById("authDbMrp").textContent = scan.db_mrp || "N/A";
    document.getElementById("authDbSource").textContent = scan.db_source || "Public Registries";

    document.getElementById("authLabelProduct").textContent = scan.extracted_product_name || "N/A";
    document.getElementById("authLabelMfg").textContent = scan.extracted_manufacturer || "N/A";
    document.getElementById("authLabelMrp").textContent = scan.extracted_mrp || "N/A";

    const authVerdictEl = document.getElementById("authVerdictBadge");
    if (scan.authenticity_status === "verified") {
        authVerdictEl.className = "badge badge-success";
        authVerdictEl.textContent = "✓ Authenticity Verified";
    } else if (scan.authenticity_status === "mismatch") {
        authVerdictEl.className = "badge badge-danger";
        authVerdictEl.textContent = "🚨 Counterfeit / Mismatch Alert";
    } else {
        authVerdictEl.className = "badge badge-secondary";
        authVerdictEl.textContent = "ℹ️ Registry Unverified";
    }

    document.getElementById("authVerdictNotes").textContent = scan.authenticity_notes || "Label declarations validated independently.";
}

/**
 * Parses numeric fine/penalty amount from a statutory provision description.
 * Reads real amounts attached by the compliance engine.
 */
function parsePenaltyAmount(text) {
    if (!text || typeof text !== "string") return 0;
    const inrMatch = text.match(/₹\s*([0-9,]+)/) || text.match(/Rs\.?\s*([0-9,]+)/i);
    if (inrMatch) {
        return parseInt(inrMatch[1].replace(/,/g, ""), 10);
    }
    if (/Section 36\(1\)/i.test(text)) {
        return 25000;
    }
    return 0;
}

/**
 * Computes Passed, Failed, and Not Applicable rule breakdowns from scan data.
 * Supports both explicit scan.results array and scan.declarations/violations.
 */
export function computeRuleBreakdown(scan) {
    if (!scan) {
        return { passed: [], failed: [], notApplicableCount: 0, totalPenalty: 0, items: [] };
    }

    // A. Explicit results array format
    if (Array.isArray(scan.results) && scan.results.length > 0) {
        const passed = [];
        const failed = [];
        let notApplicableCount = 0;
        let totalPenalty = 0;
        const items = [];

        scan.results.forEach(r => {
            const meta = getRuleMeta(r.id || r.rule_ref || r.rule);
            const statusUpper = String(r.status || "").toUpperCase();
            if (statusUpper === "PASS" || statusUpper === "COMPLIANT") {
                passed.push({
                    id: meta.id,
                    label: meta.label,
                    shortLabel: meta.shortLabel,
                    value: meta.weight,
                    color: meta.color,
                    rule_status: "PASS",
                    rule_weight: meta.weight
                });
                items.push({ id: meta.id, rule_ref: meta.rule_ref, label: meta.label, rule_status: "PASS", rule_weight: meta.weight });
            } else if (statusUpper === "FAIL" || statusUpper === "VIOLATION" || statusUpper === "NON_COMPLIANT") {
                failed.push({
                    id: meta.id,
                    label: meta.label,
                    shortLabel: meta.shortLabel,
                    value: meta.weight,
                    color: meta.color,
                    rule_status: "FAIL",
                    rule_weight: meta.weight
                });
                const pen = parsePenaltyAmount(r.penalty || r.penalty_section || r.penalty_provision);
                totalPenalty += pen;
                items.push({ id: meta.id, rule_ref: meta.rule_ref, label: meta.label, rule_status: "FAIL", rule_weight: meta.weight, penalty: pen });
            } else {
                notApplicableCount++;
                items.push({ id: meta.id, rule_ref: meta.rule_ref, label: meta.label, rule_status: "NOT_APPLICABLE", rule_weight: meta.weight });
            }
        });

        return { passed, failed, notApplicableCount, totalPenalty, items };
    }

    // B. Default engine structure: declarations + violations + authenticity
    const declarations = Array.isArray(scan.declarations) ? scan.declarations : [];
    const violations = Array.isArray(scan.violations) ? scan.violations : [];

    const ruleMap = new Map(); // id -> { meta, status, penalty, declaration, violation }

    // 1. Process violations (Definite FAIL)
    let totalPenalty = 0;
    violations.forEach(v => {
        const meta = getRuleMeta(v.rule_reference || v.rule_ref || v.title);
        const penaltyVal = parsePenaltyAmount(v.penalty_section || v.penalty_provision || v.description);
        totalPenalty += penaltyVal;
        ruleMap.set(meta.id, {
            id: meta.id,
            meta,
            status: "FAIL",
            penalty: penaltyVal,
            violation: v
        });
    });

    // 2. Process declarations
    let notApplicableCount = 0;
    declarations.forEach(d => {
        const meta = getRuleMeta(d.rule_reference || d.rule_ref || d.label || d.declaration_type);
        if (ruleMap.has(meta.id)) {
            // Already flagged as FAIL by a violation
            const entry = ruleMap.get(meta.id);
            entry.declaration = d;
            return;
        }

        const st = String(d.status || "").toLowerCase();
        const isNotApplicable = st === "not_applicable" || st === "skipped" || st === "not_determinable" ||
            (d.notes && d.notes.toLowerCase().includes("cannot be determined")) ||
            (d.value_extracted && String(d.value_extracted).toLowerCase().includes("cannot be determined"));

        if (isNotApplicable) {
            notApplicableCount++;
            ruleMap.set(meta.id, {
                id: meta.id,
                meta,
                status: "NOT_APPLICABLE",
                declaration: d
            });
        } else if (d.compliant === true || st === "compliant") {
            ruleMap.set(meta.id, {
                id: meta.id,
                meta,
                status: "PASS",
                declaration: d
            });
        } else if (st === "violation" || d.compliant === false) {
            ruleMap.set(meta.id, {
                id: meta.id,
                meta,
                status: "FAIL",
                declaration: d,
                penalty: 25000
            });
            totalPenalty += 25000;
        } else {
            // Warnings or advisories default to compliant
            ruleMap.set(meta.id, {
                id: meta.id,
                meta,
                status: "PASS",
                declaration: d
            });
        }
    });

    // 3. Process Authenticity Check
    if (!ruleMap.has("auth")) {
        const authMeta = getRuleMeta("auth");
        if (scan.authenticity_status === "verified") {
            ruleMap.set("auth", {
                id: "auth",
                meta: authMeta,
                status: "PASS"
            });
        } else if (scan.authenticity_status === "mismatch" || scan.authenticity_status === "counterfeit") {
            ruleMap.set("auth", {
                id: "auth",
                meta: authMeta,
                status: "FAIL",
                penalty: 0
            });
        } else {
            notApplicableCount++;
            ruleMap.set("auth", {
                id: "auth",
                meta: authMeta,
                status: "NOT_APPLICABLE"
            });
        }
    }

    const passed = [];
    const failed = [];
    const items = [];

    ruleMap.forEach(r => {
        const seg = {
            id: r.meta.id,
            label: r.meta.label,
            shortLabel: r.meta.shortLabel,
            value: r.meta.weight,
            color: r.meta.color,
            rule_status: r.status,
            rule_weight: r.meta.weight
        };
        items.push({
            id: r.meta.id,
            rule_ref: r.meta.rule_ref,
            label: r.meta.label,
            rule_status: r.status,
            rule_weight: r.meta.weight,
            penalty: r.penalty || 0,
            declaration: r.declaration,
            violation: r.violation
        });

        if (r.status === "PASS") {
            passed.push(seg);
        } else if (r.status === "FAIL") {
            failed.push(seg);
        }
    });

    return { passed, failed, notApplicableCount, totalPenalty, items };
}

/**
 * Renders the two synchronized compliance donut charts and notices.
 */
function renderComplianceBreakdown(scan) {
    const compliantContainer = document.getElementById("compliantChartCard");
    const violationsContainer = document.getElementById("violationsChartCard");
    const notAppEl = document.getElementById("notApplicableRulesNote");
    const penaltyEl = document.getElementById("cumulativePenaltyNote");

    if (!compliantContainer || !violationsContainer) return;

    const { passed, failed, notApplicableCount, totalPenalty } = computeRuleBreakdown(scan);

    // Chart A: Compliant Declarations (PASSED)
    renderPieChart(compliantContainer, {
        title: "Compliant Declarations",
        caption: "Weighted by score contribution",
        segments: passed,
        emptyMessage: "No rules passed",
        totalLabel: "Passed"
    });

    // Chart B: Statutory Violations (FAILED)
    renderPieChart(violationsContainer, {
        title: "Statutory Violations",
        caption: "Weighted by points deducted",
        segments: failed,
        emptyMessage: "Zero violations detected",
        totalLabel: "Failed"
    });

    // Not Applicable count notice
    if (notAppEl) {
        if (notApplicableCount > 0) {
            notAppEl.textContent = `ℹ️ ${notApplicableCount} rule${notApplicableCount === 1 ? "" : "s"} not applicable to this commodity.`;
            notAppEl.style.display = "block";
        } else {
            notAppEl.style.display = "none";
        }
    }

    // Cumulative maximum penalty exposure line
    if (penaltyEl) {
        penaltyEl.innerHTML = `<span>⚖️ Cumulative maximum penalty exposure: <strong>₹${totalPenalty.toLocaleString("en-IN")}</strong></span>`;
        penaltyEl.style.display = "flex";
    }

    // Interaction: Slice / Legend Selection
    const handleSelect = (e) => {
        const ruleId = e.detail?.id;
        if (ruleId) {
            highlightRuleItem(ruleId);
        }
    };

    compliantContainer.addEventListener("slice:select", handleSelect);
    violationsContainer.addEventListener("slice:select", handleSelect);
}

/**
 * Scrolls matching violation card or declaration row into view and flashes its border for 1.2s.
 */
function highlightRuleItem(ruleId) {
    if (!ruleId) return;

    // Search violation cards first, then declaration table rows
    const target = document.querySelector(`.violation-item-card[data-rule-id="${ruleId}"]`) ||
                   document.querySelector(`tr[data-rule-id="${ruleId}"]`);

    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const meta = getRuleMeta(ruleId);
        target.style.setProperty("--flash-color", meta.color || "#2563EB");
        target.classList.remove("rule-highlight-flash");
        // Trigger reflow to restart animation
        void target.offsetWidth;
        target.classList.add("rule-highlight-flash");
        setTimeout(() => {
            target.classList.remove("rule-highlight-flash");
        }, 1200);
    }
}

function renderDeclarationsTable(declarations) {
    const tbody = document.getElementById("declarationsTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (declarations.length === 0) {
        tbody.innerHTML = "<tr><td colspan=\"5\" class=\"text-center text-muted\">No declarations extracted</td></tr>";
        return;
    }

    declarations.forEach(d => {
        const meta = getRuleMeta(d.rule_reference || d.rule_ref || d.label || d.declaration_type);
        const tr = document.createElement("tr");
        tr.setAttribute("data-rule-id", meta.id);

        const statusBadge = d.compliant ? 
            "<span class=\"badge badge-success\">✓ Pass</span>" : 
            "<span class=\"badge badge-danger\">✗ Fail</span>";

        const fontDisplay = d.measured_font_size_mm ? 
            `${d.measured_font_size_mm}mm (Min: ${d.min_required_font_size_mm || 1.0}mm)` : 
            "Standard";

        tr.innerHTML = `
            <td><strong>${d.label || d.declaration_type}</strong></td>
            <td><code style="border-left: 3px solid ${meta.color}; padding-left: 4px;">${d.rule_reference || "Unclassified Check"}</code></td>
            <td>${d.value_extracted ? `<strong>"${d.value_extracted}"</strong>` : "<em class=\"text-danger\">Missing / Not Found</em>"}</td>
            <td>${fontDisplay}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderViolationsList(violations) {
    const container = document.getElementById("violationsDossierList");
    const noViolations = document.getElementById("noViolationsReportCard");
    if (!container) return;
    container.innerHTML = "";

    if (violations.length === 0) {
        if (noViolations) noViolations.style.display = "block";
        return;
    }

    if (noViolations) noViolations.style.display = "none";

    violations.forEach((v, idx) => {
        const meta = getRuleMeta(v.rule_reference || v.rule_ref || v.title);
        const card = document.createElement("div");
        card.className = "violation-item-card " + (v.severity === "critical" ? "vio-border-danger" : "vio-border-warning");
        card.setAttribute("data-rule-id", meta.id);
        // Consistent 4px left border in exact rule color
        card.style.borderLeft = `4px solid ${meta.color}`;

        card.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h5 class="mb-0 text-danger font-weight-bold">
                    Item #${idx + 1}: ${v.rule_reference || meta.rule_ref} — ${v.title || meta.label}
                </h5>
                <span class="badge ${v.severity === "critical" ? "badge-danger" : "badge-warning"}">
                    ${(v.severity || "critical").toUpperCase()}
                </span>
            </div>
            <p class="text-dark mb-2">${v.description}</p>
            <div class="statutory-box">
                <div><strong>Statutory Legal Reference:</strong> ${v.penalty_section || v.penalty_provision || "Section 36(1) of Legal Metrology Act, 2009"}</div>
                ${v.suggestion ? `<div><strong>Prescribed Remedial Action:</strong> ${v.suggestion}</div>` : ""}
            </div>
        `;
        container.appendChild(card);
    });
}

function renderEvidencePhoto(scan) {
    const imgEl = document.getElementById("evidenceLabelImage");
    const placeholder = document.getElementById("evidencePlaceholder");
    
    if (scan.image_base64 || scan.image_url) {
        if (imgEl) {
            imgEl.src = scan.image_base64 || scan.image_url;
            imgEl.style.display = "block";
        }
        if (placeholder) placeholder.style.display = "none";
    } else {
        if (imgEl) imgEl.style.display = "none";
        if (placeholder) placeholder.style.display = "block";
    }
}

/**
 * Serializes an inline SVG element into an SVG data URI for PDF/Canvas rasterization.
 */
export function serializeSvgToDataUri(svgEl) {
    if (!svgEl) return "";
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, "<svg xmlns=\"http://www.w3.org/2000/svg\"");
    }
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
}

function generatePdfReport() {
    // Ensure both SVG charts are serialized and ready before printing/exporting
    const svgs = document.querySelectorAll(".compliance-pie-chart");
    svgs.forEach(svg => {
        try {
            const dataUri = serializeSvgToDataUri(svg);
            svg.dataset.serializedUri = dataUri;
        } catch (e) {
            console.warn("SVG chart serialization note:", e.message);
        }
    });

    window.print();
}

/**
 * Generates and downloads a CSV export of the statutory compliance audit.
 * Appends the two required columns: rule_status and rule_weight.
 */
function exportDossierCsv() {
    if (!currentScan) {
        alert("No inspection record loaded to export.");
        return;
    }

    const { items } = computeRuleBreakdown(currentScan);
    const headers = [
        "Rule ID",
        "Statutory Reference",
        "Rule Description",
        "Extracted Label Value",
        "Measured Font (mm)",
        "rule_status",
        "rule_weight",
        "Statutory Penalty Section"
    ];

    const rows = items.map(item => {
        const d = item.declaration || {};
        const v = item.violation || {};
        const val = d.value_extracted || d.value || (item.rule_status === "FAIL" ? (v.description || "Violation") : "Compliant");
        const font = d.measured_font_size_mm || "N/A";
        const penaltyText = v.penalty_section || v.penalty_provision || (item.penalty ? `₹${item.penalty}` : "N/A");

        return [
            `"${item.id}"`,
            `"${item.rule_ref}"`,
            `"${(item.label || "").replace(/"/g, '""')}"`,
            `"${String(val).replace(/"/g, '""')}"`,
            `"${font}"`,
            `"${item.rule_status}"`,
            item.rule_weight,
            `"${penaltyText.replace(/"/g, '""')}"`
        ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `doca_inspection_dossier_${(currentScan.id || "scan").slice(-8)}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showLegalNoticeModal() {
    if (!currentScan) return;
    const violations = currentScan.violations || [];
    if (violations.length === 0) {
        alert("This product is fully compliant. No show-cause notice is necessary.");
        return;
    }

    const modal = document.getElementById("noticeModal");
    const content = document.getElementById("noticeModalContent");
    const ref = document.getElementById("reportRefNumber").textContent;
    const store = currentScan.store_name || "The Retailer / Manufacturer";

    const vioText = violations.map((v, i) => `${i + 1}. Violation of ${v.rule_reference}: ${v.title} (${v.description})`).join("\n\n");

    content.textContent = `
GOVERNMENT OF INDIA
DEPARTMENT OF CONSUMER AFFAIRS
LEGAL METROLOGY ENFORCEMENT WING

FORM OF NOTICE UNDER RULE 27 / SECTION 36
Inspection Ref No: ${ref}
Date: ${new Date().toLocaleDateString("en-IN")}

To,
M/s ${store}
Location: ${currentScan.location || "Inspection Site"}

SUBJECT: NOTICE FOR NON-COMPLIANCE UNDER LEGAL METROLOGY (PACKAGED COMMODITIES) RULES, 2011

Whereas during an inspection on ${new Date().toLocaleDateString("en-IN")}, the undersigned Legal Metrology Inspector inspected the packaged commodity "${currentScan.extracted_product_name || currentScan.db_product_name || "Packaged Goods"}" (Barcode: ${currentScan.barcode || "N/A"}) and observed the following statutory violations:

${vioText}

You are hereby required to show cause within 15 days of receipt of this notice why compounding proceedings or prosecution under Section 36(1) of the Legal Metrology Act, 2009 should not be initiated against you.

Issued by:
Inspector Rajesh Sharma (Badge: LM-DEL-8942)
Legal Metrology Enforcement Officer
Department of Consumer Affairs, Government of India
    `.trim();

    if (modal) modal.style.display = "flex";
}
