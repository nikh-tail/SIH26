// ============================================================
// LEGAL METROLOGY STATUTORY RULE METADATA & COLOR TOKENS
// Tuned for dark/warehouse UI and color-vision deficiency (no red/green adjacency)
// ============================================================

const RAW_META = {
    rule6a: {
        id: "rule6a",
        rule_ref: "Rule 6(1)(a)",
        label: "Manufacturer Name & Address",
        shortLabel: "Mfr Info",
        color: "#3B82F6",
        weight: 20
    },
    rule6c: {
        id: "rule6c",
        rule_ref: "Rule 6(1)(c)",
        label: "Generic Commodity Name",
        shortLabel: "Generic Name",
        color: "#6366F1",
        weight: 15
    },
    rule6d: {
        id: "rule6d",
        rule_ref: "Rule 6(1)(d)",
        label: "Net Quantity (SI units)",
        shortLabel: "Net Qty",
        color: "#06B6D4",
        weight: 20
    },
    rule6e: {
        id: "rule6e",
        rule_ref: "Rule 6(1)(e)",
        label: "Mfg / Packing Date",
        shortLabel: "Mfg Date",
        color: "#10B981",
        weight: 15
    },
    rule6f: {
        id: "rule6f",
        rule_ref: "Rule 6(1)(f)",
        label: "MRP incl. all taxes",
        shortLabel: "MRP",
        color: "#F59E0B",
        weight: 20
    },
    rule6g: {
        id: "rule6g",
        rule_ref: "Rule 6(1)(g)",
        label: "Consumer Care Details",
        shortLabel: "Consumer Care",
        color: "#A855F7",
        weight: 15
    },
    rule5: {
        id: "rule5",
        rule_ref: "Rule 5",
        label: "Standard Pack Size",
        shortLabel: "Pack Size",
        color: "#EC4899",
        weight: 15
    },
    rule7: {
        id: "rule7",
        rule_ref: "Rule 7",
        label: "Minimum Font Height",
        shortLabel: "Font Size",
        color: "#F97316",
        weight: 10
    },
    rule8: {
        id: "rule8",
        rule_ref: "Rule 8",
        label: "PDP Free Space",
        shortLabel: "PDP Space",
        color: "#84CC16",
        weight: 10
    },
    rule9: {
        id: "rule9",
        rule_ref: "Rule 9",
        label: "Legibility / Contrast / Language",
        shortLabel: "Legibility",
        color: "#22D3EE",
        weight: 10
    },
    rule10: {
        id: "rule10",
        rule_ref: "Rule 10",
        label: "Postal Address & PIN Code",
        shortLabel: "PIN Code",
        color: "#8B5CF6",
        weight: 10
    },
    rule12: {
        id: "rule12",
        rule_ref: "Rule 12",
        label: "Prohibited Exaggerating Words",
        shortLabel: "Prohibited Words",
        color: "#F43F5E",
        weight: 20
    },
    rule13: {
        id: "rule13",
        rule_ref: "Rule 13",
        label: "Non-Metric / Obsolete Units",
        shortLabel: "Non-Metric Units",
        color: "#EF4444",
        weight: 15
    },
    auth: {
        id: "auth",
        rule_ref: "Authenticity Check",
        label: "Barcode vs Label Authenticity",
        shortLabel: "Authenticity",
        color: "#FB7185",
        weight: 30
    }
};

// Aliases for matching exact compliance.js string references
const ALIAS_MAP = {
    "rule 6(1)(a)": "rule6a",
    "rule 6(1)(c)": "rule6c",
    "rule 6(1)(d)": "rule6d",
    "rule 6(1)(e)": "rule6e",
    "rule 6(1)(f)": "rule6f",
    "rule 6(1)(g)": "rule6g",
    "rule 5": "rule5",
    "rule 7": "rule7",
    "rule 8": "rule8",
    "rule 9": "rule9",
    "rule 10": "rule10",
    "rule 12": "rule12",
    "rule 13": "rule13",
    "authenticity check": "auth",
    "authenticity": "auth",
    "barcode identity mismatch (suspected counterfeit)": "auth",
    "barcode authenticity": "auth"
};

// Also attach aliases directly to RULE_META for direct keyed access
const COMBINED_META = { ...RAW_META };
Object.keys(ALIAS_MAP).forEach(alias => {
    const canonicalKey = ALIAS_MAP[alias];
    if (RAW_META[canonicalKey]) {
        COMBINED_META[alias] = RAW_META[canonicalKey];
    }
});

// Frozen map as requested in STEP 1
export const RULE_META = Object.freeze(COMBINED_META);

/**
 * Safely resolves metadata for any rule identifier or statutory reference string.
 * @param {string} id - Rule ID or reference string (e.g. "rule6a", "Rule 6(1)(a)")
 * @returns {{ id: string, label: string, shortLabel: string, color: string, weight: number }}
 */
export function getRuleMeta(id) {
    if (!id || typeof id !== "string") {
        return { id: "unknown", label: String(id || "Unknown Rule"), shortLabel: "Unknown", color: "#64748B", weight: 1 };
    }

    const trimmed = id.trim();
    if (RULE_META[trimmed]) {
        return RULE_META[trimmed];
    }

    const lower = trimmed.toLowerCase();
    if (RULE_META[lower]) {
        return RULE_META[lower];
    }

    // Try stripping out "Rule " or finding known key pattern
    const stripped = lower.replace(/[^a-z0-9]/g, "");
    if (RULE_META[stripped]) {
        return RULE_META[stripped];
    }

    // Fallback checks
    if (lower.includes("6(1)(a)") || lower.includes("manufacturer")) return RAW_META.rule6a;
    if (lower.includes("6(1)(c)") || lower.includes("generic")) return RAW_META.rule6c;
    if (lower.includes("6(1)(d)") || lower.includes("net quant")) return RAW_META.rule6d;
    if (lower.includes("6(1)(e)") || lower.includes("date") || lower.includes("mfg")) return RAW_META.rule6e;
    if (lower.includes("6(1)(f)") || lower.includes("mrp") || lower.includes("retail price")) return RAW_META.rule6f;
    if (lower.includes("6(1)(g)") || lower.includes("consumer care")) return RAW_META.rule6g;
    if (lower.includes("rule 5") || lower.includes("standard pack")) return RAW_META.rule5;
    if (lower.includes("rule 7") || lower.includes("font")) return RAW_META.rule7;
    if (lower.includes("rule 8") || lower.includes("pdp") || lower.includes("free space")) return RAW_META.rule8;
    if (lower.includes("rule 9") || lower.includes("legibility") || lower.includes("contrast")) return RAW_META.rule9;
    if (lower.includes("rule 10") || lower.includes("postal") || lower.includes("pin")) return RAW_META.rule10;
    if (lower.includes("rule 12") || lower.includes("vague") || lower.includes("exaggerat")) return RAW_META.rule12;
    if (lower.includes("rule 13") || lower.includes("unit")) return RAW_META.rule13;
    if (lower.includes("auth") || lower.includes("barcode")) return RAW_META.auth;

    // Safe fallback for unknown IDs
    return {
        id: trimmed,
        label: trimmed,
        shortLabel: trimmed,
        color: "#64748B",
        weight: 1
    };
}

// ============================================================
// TONAL GRADIENT PALETTES (Dark -> Light by Descending Points)
// ============================================================

export const FAIL_PALETTE = Object.freeze([
    "#7F1D1D",
    "#991B1B",
    "#B91C1C",
    "#DC2626",
    "#EF4444",
    "#F87171",
    "#FCA5A5",
    "#FECACA"
]);

export const PASS_PALETTE = Object.freeze([
    "#064E3B",
    "#065F46",
    "#047857",
    "#059669",
    "#10B981",
    "#34D399",
    "#6EE7B7",
    "#A7F3D0"
]);

/**
 * Sorts segments descending by point value and assigns gradient colors from dark to light.
 * @param {Array<{id: string, value: number, color?: string}>} segments
 * @param {readonly string[]} palette
 * @returns {Array}
 */
export function assignPaletteColors(segments, palette) {
    if (!Array.isArray(segments) || segments.length === 0) return segments;

    // Sort descending by point value (weight), then stably by id
    segments.sort((a, b) => {
        const valDiff = (Number(b.value) || 0) - (Number(a.value) || 0);
        if (valDiff !== 0) return valDiff;
        return (a.id || "").localeCompare(b.id || "");
    });

    const total = segments.length;
    segments.forEach((seg, idx) => {
        if (total <= palette.length) {
            seg.color = palette[idx];
        } else {
            const ratio = idx / (total - 1);
            const palIdx = Math.round(ratio * (palette.length - 1));
            seg.color = palette[palIdx];
        }
    });

    return segments;
}

if (typeof window !== "undefined") {
    window.RULE_META = RULE_META;
    window.getRuleMeta = getRuleMeta;
    window.FAIL_PALETTE = FAIL_PALETTE;
    window.PASS_PALETTE = PASS_PALETTE;
    window.assignPaletteColors = assignPaletteColors;
}

