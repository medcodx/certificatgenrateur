const SPREADSHEET_ID = "1GHOm1vMhKJpUyr7LryTcpV1den0KMSVCZ6LsmV55Lyc";
const SHEET_NAME = ""; // Laisser vide pour utiliser la premiere feuille.
const SCRIPT_VERSION = "2026-06-07-cancel-reinscription";

function doGet(e) {
  const callback = String(e.parameter.callback || "callback");

  try {
    const action = e.parameter.action;
    if (action === "version") {
      return jsonp(callback, { ok: true, version: SCRIPT_VERSION });
    }

    if (!["acceptReinscription", "cancelReinscription", "annulerReinscription"].includes(action)) {
      return jsonp(callback, {
        ok: false,
        message: `Action inconnue: ${action || "vide"}. Redeployez le Web App Apps Script avec la derniere version.`,
      });
    }

    const codeApogee = clean(e.parameter.code_apogee);
    const cne = clean(e.parameter.cne);
    if (!codeApogee && !cne) {
      return jsonp(callback, { ok: false, message: "Code Apogee ou CNE obligatoire." });
    }

    const sheet = getTargetSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    if (values.length < 2) {
      return jsonp(callback, { ok: false, message: "Le Google Sheet ne contient aucune donnee." });
    }

    const headers = values[0].map(normalizeHeader);
    const codeIndex = headers.indexOf("code_apogee");
    const cneIndex = headers.indexOf("cne");
    const reinscriptionIndex = ensureColumn(sheet, headers, "reinscription", "Reinscription");
    ensureColumn(sheet, headers, "motif", "Motif");

    if (codeIndex === -1 && cneIndex === -1) {
      return jsonp(callback, { ok: false, message: "Colonnes Code Apogee ou CNE introuvables." });
    }

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      const rowCode = codeIndex >= 0 ? clean(values[rowIndex][codeIndex]) : "";
      const rowCne = cneIndex >= 0 ? clean(values[rowIndex][cneIndex]) : "";
      const codeMatches = codeApogee && normalizeText(rowCode) === normalizeText(codeApogee);
      const cneMatches = cne && normalizeText(rowCne) === normalizeText(cne);

      if (codeMatches || cneMatches) {
        const value = action === "acceptReinscription" ? "V" : "";
        sheet.getRange(rowIndex + 1, reinscriptionIndex + 1).setValue(value);
        return jsonp(callback, {
          ok: true,
          message: action === "acceptReinscription"
            ? "Le doctorant a ete accepte comme reinscrit avec succes."
            : "La reinscription du doctorant a ete annulee avec succes.",
        });
      }
    }

    return jsonp(callback, { ok: false, message: "Doctorant introuvable dans Google Sheet." });
  } catch (error) {
    return jsonp(callback, { ok: false, message: error.message });
  }
}

function getTargetSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = SHEET_NAME
    ? spreadsheet.getSheetByName(SHEET_NAME)
    : spreadsheet.getSheets()[0];
  if (!sheet) {
    throw new Error("Feuille Google Sheet introuvable.");
  }
  return sheet;
}

function ensureColumn(sheet, headers, normalizedName, displayName) {
  let index = headers.indexOf(normalizedName);
  if (index !== -1) return index;

  index = headers.length;
  sheet.getRange(1, index + 1).setValue(displayName);
  headers.push(normalizedName);
  return index;
}

function jsonp(callback, payload) {
  const safeCallback = callback.replace(/[^\w.$]/g, "");
  return ContentService
    .createTextOutput(`${safeCallback}(${JSON.stringify(payload)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeader(value) {
  const raw = normalizeText(value);
  const compact = raw.replace(/[^a-z0-9]/g, "");

  if (["codeapogee", "apogee", "napogee", "numeroapogee"].includes(compact)) return "code_apogee";
  if (["cne", "codecne", "cnecodemassar", "cnecodeemassar", "cneoucodemassar"].includes(compact)) return "cne";
  if (["reinscription", "reinscrit", "estreinscrit"].includes(compact)) return "reinscription";
  if (["motif", "motifs", "raison", "raisons", "observation", "observations", "cause", "motifnonreinscription", "motifdenonreinscription"].includes(compact)) return "motif";

  return raw;
}
