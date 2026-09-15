# AI-Powered Legal Metrology Compliance Checker — Frontend
### Smart India Hackathon 2026 | Problem Statement: SIH26034
**Department of Consumer Affairs (DoCA), Ministry of Consumer Affairs, Food & Public Distribution**

Dedicated, mobile-first frontend application for statutory verification of packaged commodities under the Legal Metrology Act, 2009 and Packaged Commodities Rules, 2011.

---

## 📱 Features

- **Mobile-First Design System**: Optimized and tested for 320px to 430px viewports with zero horizontal overflow.
- **56px Compact Sticky Header**: Bilingual title stack (Hindi / English), Ashok Chakra emblem, and quick navigation.
- **5-Step Inspection Workflow**:
  1. Live Camera Barcode Capture & GTIN Check-Digit Validation
  2. Barcode Registry Data Verification
  3. Multimodal PDP Capture & Rule 7 Font Calibration
  4. Real-time Gemini Vision OCR & Compliance Audit
  5. Official Statutory Inspection Report Generation & Export
- **Modern Standards**: Accessible 48px touch targets, SVG icons, and clean state cards.

---

## 🛠️ Local Development

### Prerequisites
- Node.js (v18+)
- npm

### Installation & Run
```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 🚀 Deployment

### Vercel (Static Site)
This branch is structured for direct root deployment to Vercel:
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

