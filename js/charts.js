// ============================================================
// VANILLA SVG PIE & DONUT CHART ENGINE
// Pure vanilla, zero dependencies, crisp on retina & exportable to PDF
// ============================================================

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Renders an accessible, interactive inline SVG donut chart with sibling legend.
 * @param {HTMLElement} container - DOM element to render into
 * @param {Object} options
 * @param {string} [options.title] - Section heading / chart title
 * @param {Array<{id: string, label: string, shortLabel?: string, value: number, color: string}>} options.segments
 * @param {string} [options.emptyMessage] - Message when segments is empty
 * @param {string} [options.totalLabel] - Text below total number (e.g. "PASSED" / "FAILED")
 */
export function renderPieChart(container, options = {}) {
    if (!container) return;

    // Clear previous contents
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const {
        title = "",
        segments = [],
        emptyMessage = "No data available",
        totalLabel = "RULES"
    } = options;

    const safeSegments = Array.isArray(segments) ? segments : [];

    // 1. Chart Heading (if title provided)
    if (title) {
        const heading = document.createElement("h4");
        heading.className = "chart-title";
        heading.textContent = title;
        container.appendChild(heading);
    }

    // 2. SVG Donut Element
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 220 220");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "auto");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.classList.add("compliance-pie-chart");
    svg.setAttribute("role", "region");
    svg.setAttribute("aria-label", title || "Compliance Donut Chart");

    const cx = 110;
    const cy = 110;
    const outerR = 100;
    const innerR = 58;
    const midR = (outerR + innerR) / 2; // 79

    const prefersReducedMotion = typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Check edge case: EMPTY
    if (safeSegments.length === 0) {
        // Grey dashed ring
        const dashedRing = document.createElementNS(SVG_NS, "circle");
        dashedRing.setAttribute("cx", String(cx));
        dashedRing.setAttribute("cy", String(cy));
        dashedRing.setAttribute("r", String(midR));
        dashedRing.setAttribute("fill", "none");
        dashedRing.setAttribute("stroke", "#94A3B8");
        dashedRing.setAttribute("stroke-width", "3");
        dashedRing.setAttribute("stroke-dasharray", "6 6");
        dashedRing.setAttribute("opacity", "0.7");
        svg.appendChild(dashedRing);

        // Center Count 0
        const zeroText = document.createElementNS(SVG_NS, "text");
        zeroText.setAttribute("x", String(cx));
        zeroText.setAttribute("y", "104");
        zeroText.setAttribute("text-anchor", "middle");
        zeroText.setAttribute("font-size", "26");
        zeroText.setAttribute("font-weight", "800");
        zeroText.setAttribute("fill", "#64748B");
        zeroText.textContent = "0";
        svg.appendChild(zeroText);

        // Center Label
        const subLabel = document.createElementNS(SVG_NS, "text");
        subLabel.setAttribute("x", String(cx));
        subLabel.setAttribute("y", "120");
        subLabel.setAttribute("text-anchor", "middle");
        subLabel.setAttribute("font-size", "10");
        subLabel.setAttribute("font-weight", "700");
        subLabel.setAttribute("letter-spacing", "0.08em");
        subLabel.setAttribute("fill", "#94A3B8");
        subLabel.textContent = totalLabel.toUpperCase();
        svg.appendChild(subLabel);

        container.appendChild(svg);

        // Empty message beneath chart
        const emptyMsgEl = document.createElement("div");
        emptyMsgEl.className = "chart-empty-message";
        emptyMsgEl.textContent = emptyMessage;
        container.appendChild(emptyMsgEl);
        return;
    }

    let activeSliceEl = null;
    let activeBtnEl = null;

    function selectRule(ruleId) {
        if (!ruleId) return;
        const isAlreadyActive = activeSliceEl && activeSliceEl.dataset.ruleId === ruleId;

        // Deselect current
        if (activeSliceEl) {
            activeSliceEl.style.transform = "";
            activeSliceEl.classList.remove("is-active");
            activeSliceEl = null;
        }
        if (activeBtnEl) {
            activeBtnEl.classList.remove("is-active");
            activeBtnEl = null;
        }

        if (!isAlreadyActive) {
            const targetSlice = svg.querySelector(`[data-rule-id="${ruleId}"]`);
            const targetBtn = container.querySelector(`button.chart-legend-btn[data-rule-id="${ruleId}"]`);

            if (targetSlice) {
                const dx = targetSlice.dataset.dx || "0";
                const dy = targetSlice.dataset.dy || "0";
                targetSlice.style.transform = `translate(${dx}px, ${dy}px)`;
                targetSlice.classList.add("is-active");
                activeSliceEl = targetSlice;
            }
            if (targetBtn) {
                targetBtn.classList.add("is-active");
                activeBtnEl = targetBtn;
            }
        }

        // Fire CustomEvent on container
        container.dispatchEvent(new CustomEvent("slice:select", {
            bubbles: true,
            detail: { id: ruleId, active: !isAlreadyActive }
        }));
    }

    const slicesGroup = document.createElementNS(SVG_NS, "g");
    slicesGroup.classList.add("chart-slices-group");

    // SINGLE SLICE EDGE CASE
    if (safeSegments.length === 1) {
        const seg = safeSegments[0];
        const circle = document.createElementNS(SVG_NS, "circle");
        circle.setAttribute("cx", String(cx));
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", String(midR));
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", seg.color || "#2563EB");
        circle.setAttribute("stroke-width", "42");
        circle.setAttribute("role", "img");
        circle.classList.add("chart-slice");
        circle.dataset.ruleId = seg.id;
        circle.dataset.dx = "0";
        circle.dataset.dy = "-3";

        const titleTag = document.createElementNS(SVG_NS, "title");
        titleTag.textContent = `${seg.label}: ${seg.value} points (100%)`;
        circle.appendChild(titleTag);

        circle.addEventListener("click", () => selectRule(seg.id));
        circle.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectRule(seg.id);
            }
        });
        circle.setAttribute("tabindex", "0");

        if (!prefersReducedMotion) {
            circle.classList.add("chart-slice-mount");
        }

        slicesGroup.appendChild(circle);
    } else {
        // MULTIPLE SLICES: calculate standard arc geometry
        const totalValue = safeSegments.reduce((sum, s) => sum + Math.max(0.1, Number(s.value) || 1), 0);
        let startAngle = -Math.PI / 2; // 12 o clock (-90 deg)

        safeSegments.forEach((seg, idx) => {
            const val = Math.max(0.1, Number(seg.value) || 1);
            const fraction = val / totalValue;
            const percent = Math.round(fraction * 100);
            const angleDelta = fraction * 2 * Math.PI;
            const endAngle = startAngle + angleDelta;

            // Arc coordinates
            const x1Outer = cx + outerR * Math.cos(startAngle);
            const y1Outer = cy + outerR * Math.sin(startAngle);
            const x2Outer = cx + outerR * Math.cos(endAngle);
            const y2Outer = cy + outerR * Math.sin(endAngle);

            const x2Inner = cx + innerR * Math.cos(endAngle);
            const y2Inner = cy + innerR * Math.sin(endAngle);
            const x1Inner = cx + innerR * Math.cos(startAngle);
            const y1Inner = cy + innerR * Math.sin(startAngle);

            const largeArc = angleDelta > Math.PI ? 1 : 0;

            const pathD = [
                `M ${x1Outer.toFixed(2)} ${y1Outer.toFixed(2)}`,
                `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer.toFixed(2)} ${y2Outer.toFixed(2)}`,
                `L ${x2Inner.toFixed(2)} ${y2Inner.toFixed(2)}`,
                `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1Inner.toFixed(2)} ${y1Inner.toFixed(2)}`,
                "Z"
            ].join(" ");

            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", pathD);
            path.setAttribute("fill", seg.color || "#2563EB");
            path.setAttribute("stroke", "var(--card-bg, #FFFFFF)");
            path.setAttribute("stroke-width", "1.5");
            path.setAttribute("role", "img");
            path.classList.add("chart-slice");
            path.dataset.ruleId = seg.id;

            // Compute bisector angle for 4px scale out
            const bisectorAngle = (startAngle + endAngle) / 2;
            const dx = 4 * Math.cos(bisectorAngle);
            const dy = 4 * Math.sin(bisectorAngle);
            path.dataset.dx = dx.toFixed(2);
            path.dataset.dy = dy.toFixed(2);

            const titleTag = document.createElementNS(SVG_NS, "title");
            titleTag.textContent = `${seg.label}: ${seg.value} points (${percent}%)`;
            path.appendChild(titleTag);

            path.setAttribute("tabindex", "0");
            path.addEventListener("click", () => selectRule(seg.id));
            path.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectRule(seg.id);
                }
            });

            if (!prefersReducedMotion) {
                path.classList.add("chart-slice-mount");
                path.style.animationDelay = `${idx * 60}ms`;
            }

            slicesGroup.appendChild(path);
            startAngle = endAngle;
        });
    }

    svg.appendChild(slicesGroup);

    // 3. Center Donut Display
    const centerGroup = document.createElementNS(SVG_NS, "g");
    centerGroup.classList.add("chart-center-group");

    const countText = document.createElementNS(SVG_NS, "text");
    countText.setAttribute("x", String(cx));
    countText.setAttribute("y", "106");
    countText.setAttribute("text-anchor", "middle");
    countText.setAttribute("font-size", "28");
    countText.setAttribute("font-weight", "800");
    countText.setAttribute("fill", "var(--primary-navy, #0B2545)");
    countText.classList.add("chart-center-count");
    countText.textContent = String(safeSegments.length);
    centerGroup.appendChild(countText);

    const labelText = document.createElementNS(SVG_NS, "text");
    labelText.setAttribute("x", String(cx));
    labelText.setAttribute("y", "122");
    labelText.setAttribute("text-anchor", "middle");
    labelText.setAttribute("font-size", "10");
    labelText.setAttribute("font-weight", "700");
    labelText.setAttribute("letter-spacing", "0.08em");
    labelText.setAttribute("fill", "#64748B");
    labelText.classList.add("chart-center-label");
    labelText.textContent = totalLabel.toUpperCase();
    centerGroup.appendChild(labelText);

    svg.appendChild(centerGroup);
    container.appendChild(svg);

    // 4. Sibling Legend (<ul>)
    const legendUl = document.createElement("ul");
    legendUl.className = "chart-legend";
    legendUl.setAttribute("role", "list");

    safeSegments.forEach(seg => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chart-legend-btn";
        btn.dataset.ruleId = seg.id;
        btn.setAttribute("aria-label", `${seg.label}: ${seg.value} points`);

        const swatch = document.createElement("span");
        swatch.className = "chart-legend-swatch";
        swatch.style.backgroundColor = seg.color || "#2563EB";

        const nameSpan = document.createElement("span");
        nameSpan.className = "chart-legend-label";
        nameSpan.textContent = seg.shortLabel || seg.label;

        const valSpan = document.createElement("span");
        valSpan.className = "chart-legend-value";
        valSpan.textContent = `${seg.value} pts`;

        btn.appendChild(swatch);
        btn.appendChild(nameSpan);
        btn.appendChild(valSpan);

        btn.addEventListener("click", () => selectRule(seg.id));
        li.appendChild(btn);
        legendUl.appendChild(li);
    });

    container.appendChild(legendUl);
}

if (typeof window !== "undefined") {
    window.renderPieChart = renderPieChart;
}
