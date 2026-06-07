const state = {
  rows: [],
  loaded: false,
  selectedDoctorant: null,
  selectedAnneeUniversitaire: "",
  currentDoctorant: null,
  currentAnneeUniversitaire: "",
};

const GOOGLE_SHEET_ID = "1GHOm1vMhKJpUyr7LryTcpV1den0KMSVCZ6LsmV55Lyc";
const GOOGLE_SHEET_GID = "0";
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyfRfFZkRXrmAqI3IFcmNesdI3LvrzSFlNJj73BeLgJl7SCanZdTyu9ShtESY4xnJRH/exec";
const REQUIRED_COLUMNS = ["nom", "prenom", "code_apogee", "cin", "cne", "reinscription"];
const OPTIONAL_COLUMNS = ["motif"];
const FILIERE_NAMES = {
  SO: "Science odontologique",
  BMPHEE: "Biologie medicale, pathologie humaine et environnement",
  ECSM: "Epidemiologie clinique et sciences medicales chirurgicales",
  SM: "Sciences du Medicament",
};

function clean(value) {
  return String(value ?? "").trim();
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

  if (["cne", "codecne", "cnecodemassar", "cnecodeemassar", "cneoucodemassar"].includes(compact)) return "cne";
  if (["massar", "codemassar", "massarcode", "cnemassar"].includes(compact)) return "code_massar";
  if (["cin", "codecin", "carteidentite", "cinpassport", "cinpasseport"].includes(compact)) return "cin";
  if (["codeapogee", "apogee", "napogee", "numeroapogee"].includes(compact)) return "code_apogee";
  if (["motif", "motifs", "raison", "raisons", "observation", "observations", "cause", "motifnonreinscription", "motifdenonreinscription"].includes(compact)) return "motif";

  const map = {
    prenom: "prenom",
    "code apogee": "code_apogee",
    apogee: "code_apogee",
    filiere: "filiere",
    reinscription: "reinscription",
    reinscrit: "reinscription",
    "est reinscrit": "reinscription",
    motif: "motif",
    motifs: "motif",
    raison: "motif",
    raisons: "motif",
    observation: "motif",
    observations: "motif",
    cause: "motif",
    "motif non reinscription": "motif",
    "motif de non reinscription": "motif",
    code_cin: "cin",
    carte_identite: "cin",
    "carte identite": "cin",
    code_cne: "cne",
    code_massar: "code_massar",
  };
  return map[raw] || raw;
}

function getField(row, names) {
  for (const name of names) {
    const normalizedName = normalizeHeader(name);
    if (clean(row[normalizedName])) return row[normalizedName];
  }

  const wantedKeys = names.map((name) => normalizeHeader(name));
  const matchingKey = Object.keys(row).find((key) => wantedKeys.includes(normalizeHeader(key)));
  return matchingKey ? row[matchingKey] : "";
}

function normalizeRow(row) {
  const normalized = {};
  Object.keys(row).forEach((key) => {
    normalized[normalizeHeader(key)] = row[key];
  });
  return normalized;
}

function getAcademicStartYear(anneeUniversitaire) {
  const match = clean(anneeUniversitaire).match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (!match) return null;

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (endYear !== startYear + 1) return null;

  return startYear;
}

function getPromotionYear(promotion) {
  const match = clean(promotion).match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function formatNiveau(number) {
  if (number <= 1) return "1ere annee";
  if (number === 2) return "2eme annee";
  if (number === 3) return "3eme annee";
  if (number === 4) return "4eme annee";
  return `${number}eme annee`;
}

function inferNiveau(promotion, anneeUniversitaire) {
  const academicStartYear = getAcademicStartYear(anneeUniversitaire);
  if (!academicStartYear) return null;

  const promotionYear = getPromotionYear(promotion);
  if (!promotionYear) return "1ere annee";

  return formatNiveau(academicStartYear - promotionYear + 1);
}

function getFiliereName(value) {
  const filiere = clean(value);
  const code = filiere.toUpperCase();
  return FILIERE_NAMES[code] || filiere || "Non renseignee";
}

function setMessage(text, kind = "info") {
  const msg = document.getElementById("message");
  const styles = {
    info: "mt-4 min-h-6 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 transition duration-200",
    success: "mt-4 min-h-6 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 transition duration-200",
    error: "mt-4 min-h-6 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 transition duration-200",
  };
  msg.textContent = text;
  msg.className = styles[kind] || styles.info;
}

function setSheetStatus(text, kind = "info") {
  const status = document.getElementById("sheetStatus");
  const styles = {
    info: "min-h-6 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 transition duration-200",
    success: "min-h-6 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 transition duration-200",
    error: "min-h-6 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 transition duration-200",
  };
  status.textContent = text;
  status.className = styles[kind] || styles.info;
}

function isReinscrit(row) {
  return clean(row.reinscription).toUpperCase() === "V";
}

function hideNotReinscritPanel() {
  state.selectedDoctorant = null;
  state.selectedAnneeUniversitaire = "";
  document.getElementById("notReinscritPanel").classList.add("hidden");
  document.getElementById("notReinscritMessage").textContent = "";
}

function hideAttestation() {
  state.currentDoctorant = null;
  state.currentAnneeUniversitaire = "";
  document.getElementById("attestation").classList.add("hidden");
}

function getDoctorantIdentity(row) {
  return {
    nom: clean(getField(row, ["nom"])),
    prenom: clean(getField(row, ["prenom"])),
    codeApogee: clean(getField(row, ["code_apogee", "code apogee", "apogee"])),
    cin: clean(getField(row, ["cin", "code cin", "carte identite"])),
    cne: clean(getField(row, ["cne", "code cne", "code_cne", "code_massar", "code massar", "massar", "cne massar", "cne/code massar", "cne / code massar"])),
    promotion: clean(getField(row, ["promotion"])),
    motif: clean(getField(row, ["motif", "motifs", "raison", "raisons", "observation", "observations", "cause", "motif non reinscription", "motif de non reinscription"])),
  };
}

function showNotReinscritPanel(row, anneeUniversitaire) {
  const identity = getDoctorantIdentity(row);
  const motif = identity.motif || "Non renseigne";

  state.selectedDoctorant = row;
  state.selectedAnneeUniversitaire = anneeUniversitaire;

  document.getElementById("notReinscritMessage").textContent =
    `Le doctorant ${identity.nom} ${identity.prenom}, Code Apogee : ${identity.codeApogee || "Non renseigne"}, CIN : ${identity.cin || "Non renseigne"}, CNE : ${identity.cne || "Non renseigne"}, Promotion : ${identity.promotion || "Non renseignee"}, n'est pas reinscrit. Motif : ${motif}`;
  document.getElementById("notReinscritPanel").classList.remove("hidden");
}

function updateReinscriptionInSheet(row, shouldBeReinscrit) {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL.includes("A_REMPLACER")) {
      reject(new Error("Configurez GOOGLE_APPS_SCRIPT_URL dans app.js avec l'URL du Web App Google Apps Script."));
      return;
    }

    const identity = getDoctorantIdentity(row);
    if (!identity.codeApogee && !identity.cne) {
      reject(new Error("Code Apogee ou CNE obligatoire pour identifier le doctorant."));
      return;
    }

    const callbackName = `handleReinscriptionUpdate_${Date.now()}`;
    const script = document.createElement("script");
    // JSONP evite les problemes CORS quand l'application est ouverte comme fichier HTML local.
    const params = new URLSearchParams({
      action: shouldBeReinscrit ? "acceptReinscription" : "cancelReinscription",
      callback: callbackName,
      code_apogee: identity.codeApogee,
      cne: identity.cne,
    });
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Delai depasse pendant l'enregistrement dans Google Sheet."));
    }, 15000);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (response) => {
      cleanup();

      if (!response?.ok) {
        const message = response?.message || "La mise a jour Google Sheet a echoue.";
        const hint = message.includes("Action inconnue")
          ? " Le Web App Apps Script utilise probablement une ancienne version. Redeployez une nouvelle version dans Google Apps Script."
          : "";
        reject(new Error(`${message}${hint}`));
        return;
      }

      resolve(response);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Impossible de contacter Google Apps Script. Verifiez que le Web App est deploye avec l'acces: Toute personne."));
    };

    script.src = `${GOOGLE_APPS_SCRIPT_URL}?${params.toString()}`;
    document.head.appendChild(script);
  });
}

function readGoogleSheet() {
  return new Promise((resolve, reject) => {
    const callbackName = `handleGoogleSheet_${Date.now()}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Delai depasse pendant le chargement du Google Sheet."));
    }, 15000);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (response) => {
      cleanup();

      if (response.status === "error") {
        reject(new Error(response.errors?.[0]?.detailed_message || "Erreur Google Sheet."));
        return;
      }

      const table = response.table;
      const headers = table.cols.map((col) => normalizeHeader(col.label || col.id));
      const rows = table.rows.map((row) => {
        const item = {};
        headers.forEach((header, index) => {
          const cell = row.c[index];
          item[header] = cell ? cell.f ?? cell.v ?? "" : "";
        });
        return normalizeRow(item);
      });

      resolve(rows);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Impossible de charger le Google Sheet."));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?gid=${GOOGLE_SHEET_GID}&tqx=responseHandler:${callbackName}&cacheBust=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function validateColumns(rows) {
  if (!rows.length) return "Le Google Sheet est vide.";
  const headers = Object.keys(rows[0]);
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length) {
    return `Colonnes manquantes: ${missing.join(", ")}`;
  }
  return null;
}

function getOptionalColumnsWarning(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const missing = OPTIONAL_COLUMNS.filter((col) => !headers.includes(col));
  return missing.length ? ` Colonnes optionnelles manquantes: ${missing.join(", ")}.` : "";
}

function renderAttestation(row, niveau, anneeUniversitaire) {
  const section = document.getElementById("attestation");
  const infos = document.getElementById("infos");
  state.currentDoctorant = row;
  state.currentAnneeUniversitaire = anneeUniversitaire;

  infos.innerHTML = "";
  const items = [
    ["Nom", clean(getField(row, ["nom"]))],
    ["Prenom", clean(getField(row, ["prenom", "prenom"]))],
    ["Code Apogee", clean(getField(row, ["code_apogee", "code apogee", "apogee"]))],
    ["CIN", clean(getField(row, ["cin", "code cin", "carte identite"])) || "Non renseigne"],
    ["CNE / Code Massar", clean(getField(row, ["cne", "code cne", "code_cne", "code_massar", "code massar", "massar", "cne massar", "cne/code massar", "cne / code massar"])) || "Non renseigne"],
    ["Promotion", clean(getField(row, ["promotion"])) || "Non renseignee"],
    ["Filiere", getFiliereName(getField(row, ["filiere", "filiere"]))],
    ["Annee universitaire", anneeUniversitaire],
    ["Niveau", niveau],
  ];

  items.forEach(([label, value]) => {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${label}:`;
    li.appendChild(strong);
    li.append(` ${value}`);
    infos.appendChild(li);
  });

  document.getElementById("attestationText").textContent =
    `est regulierement inscrit(e) en cycle doctoral pour l'annee universitaire ${anneeUniversitaire}.`;

  const today = new Date();
  const dateText = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
  document.getElementById("attestationDate").textContent = `Fait a Rabat le ${dateText}`;

  section.classList.remove("hidden");
}

async function loadSheetData() {
  state.loaded = false;
  state.rows = [];
  setSheetStatus("Chargement des donnees...", "info");

  try {
    const rows = await readGoogleSheet();
    const error = validateColumns(rows);
    if (error) {
      setSheetStatus(error, "error");
      return;
    }

    state.rows = rows;
    state.loaded = true;
    setSheetStatus(`Google Sheet charge avec succes (${rows.length} lignes).${getOptionalColumnsWarning(rows)}`, "success");
  } catch {
    setSheetStatus("Impossible de charger le Google Sheet. Verifiez que le partage est public en lecture.", "error");
  }
}

document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  hideNotReinscritPanel();
  hideAttestation();

  if (!state.loaded) {
    setMessage("Attendez le chargement du Google Sheet.", "error");
    return;
  }

  if (!state.rows.length) {
    setMessage("Aucune donnee disponible dans le Google Sheet.", "error");
    return;
  }

  const nom = normalizeText(document.getElementById("nom").value);
  const prenom = normalizeText(document.getElementById("prenom").value);
  const code = normalizeText(document.getElementById("codeApogee").value);
  const cne = normalizeText(document.getElementById("cne").value);
  const anneeUniversitaire = clean(document.getElementById("anneeUniversitaire").value);

  if (!getAcademicStartYear(anneeUniversitaire)) {
    setMessage("Saisissez une annee universitaire valide, par exemple 2025/2026.", "error");
    hideAttestation();
    return;
  }

  let result = [];
  if (code) {
    result = state.rows.filter((row) => normalizeText(row.code_apogee) === code);
  } else if (cne) {
    result = state.rows.filter((row) => normalizeText(getField(row, ["cne", "code_cne", "code_massar", "code massar", "massar"])) === cne);
  } else {
    result = state.rows.filter((row) => {
      const okNom = nom ? normalizeText(row.nom) === nom : true;
      const okPrenom = prenom ? normalizeText(row.prenom) === prenom : true;
      return okNom && okPrenom;
    });
  }

  if (!result.length) {
    setMessage("Aucun doctorant trouve.", "error");
    hideAttestation();
    return;
  }

  const doctorant = result[0];

  if (!isReinscrit(doctorant)) {
    hideAttestation();
    showNotReinscritPanel(doctorant, anneeUniversitaire);
    setMessage("Ce doctorant n'est pas reinscrit pour l'annee universitaire en cours.", "error");
    return;
  }

  const niveauFinal = inferNiveau(doctorant.promotion, anneeUniversitaire);
  renderAttestation(doctorant, niveauFinal, anneeUniversitaire);
  setMessage("Doctorant trouve. Vous pouvez imprimer l'attestation.", "success");
});

document.getElementById("printBtn").addEventListener("click", () => {
  window.print();
});

document.getElementById("acceptReinscritBtn").addEventListener("click", async () => {
  const doctorant = state.selectedDoctorant;
  const anneeUniversitaire = state.selectedAnneeUniversitaire;
  if (!doctorant) return;

  const button = document.getElementById("acceptReinscritBtn");
  button.disabled = true;
  button.textContent = "Enregistrement...";
  setMessage("Enregistrement dans Google Sheet...", "info");

  try {
    await updateReinscriptionInSheet(doctorant, true);
    doctorant.reinscription = "V";
    hideNotReinscritPanel();

    const niveauFinal = inferNiveau(doctorant.promotion, anneeUniversitaire);
    renderAttestation(doctorant, niveauFinal, anneeUniversitaire);
    setMessage("Le doctorant a ete accepte comme reinscrit avec succes.", "success");
    await loadSheetData();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Accepter comme reinscrit";
  }
});

document.getElementById("cancelReinscritBtn").addEventListener("click", async () => {
  const doctorant = state.currentDoctorant;
  const anneeUniversitaire = state.currentAnneeUniversitaire;
  if (!doctorant) return;

  const button = document.getElementById("cancelReinscritBtn");
  button.disabled = true;
  button.textContent = "Annulation...";
  setMessage("Annulation de la reinscription dans Google Sheet...", "info");

  try {
    await updateReinscriptionInSheet(doctorant, false);
    doctorant.reinscription = "";
    hideAttestation();
    showNotReinscritPanel(doctorant, anneeUniversitaire);
    setMessage("La reinscription du doctorant a ete annulee avec succes.", "success");
    await loadSheetData();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Annuler reinscription";
  }
});

loadSheetData();
