#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync'); 

// Since the script is in /scripts, __dirname is the scripts folder. 
// We use path.join(__dirname, '..') to get back to the root folder.
const ROOT = path.join(__dirname, '..'); 
const DATA_DIR = path.join(ROOT, 'data'); // Look for CSVs here
const OUT_DIR = path.join(ROOT, 'precomputed'); // Save results here

// Helper to easily read and parse a CSV file
function readCSV(filename) {
  const filePath = path.join(DATA_DIR, filename); // Updated to use DATA_DIR
  if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Warning: Could not find ${filename} at ${filePath}`);
      return [];
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return parse(fileContent, {
    columns: true, 
    skip_empty_lines: true,
    trim: true 
  });
}

// Rebuild the theoData object in memory from the CSVs
function buildTheoDataFromCSVs() {
  console.log("Loading raw CSVs...");
  
  // Note: Using the exact filenames from your upload
  const rawQuestions = readCSV('TheoCompass (v2.0) - QUESTION_MASTER.csv');
  const rawDimensions = readCSV('TheoCompass (v2.0) - Hidden Dimensions.csv');
  const rawAnswerScoring = readCSV('TheoCompass (v2.0) - Unified Answer Scoring Matrix.csv');
  const rawDoctrines = readCSV('TheoCompass (v2.0) - Denominations & Doctrines_EXPORT.csv');
  const rawSequences = readCSV('TheoCompass (v2.0) - QUIZ_SEQUENCE.csv');
  const rawFamilies = readCSV('TheoCompass (v2.0) - FAMILIES.csv');

  const questionsMap = {};
  const denominationsMap = {};
  
  const theoData = {
    hiddenDimensions: {},
    answerKey: {},
    quizSequences: { quick: [], standard: [], deep: [] },
    families: rawFamilies
  };

  // 1. Map Questions
  rawQuestions.forEach(q => {
    questionsMap[q.Question_ID] = q;
  });

// 2. Build the map directly from the doctrines export (around Line 44)
rawDoctrines.forEach(row => {
  const denomId = row.Denomination_ID || row.Name;
  if (!denominationsMap[denomId]) {
    denominationsMap[denomId] = {
      Denomination_ID: denomId,
      Denomination_Name: row.Denomination_Name || row.Name,
      Denomination_Family: row.Denomination_Family,
      Founded_Year: row.Founded_Year,
      Region_Origin: row.Region_Origin,
      Description: row.Description,
      doctrines: {}
    };
  }
});

  // 3. Map Hidden Dimensions (Translating verbose headers to short names)
  const dimMap = {
      'Theol_Cons_Lib': 'Theol_Cons_Lib',
      'Social_Cons_Lib': 'Social_Cons_Lib',
      'Counter_Pro_Modernity': 'Counter_Pro_Modern',
      'Supernatural_Natural': 'Super_Nat',
      'Cultural_Sep_Eng': 'Cult_Sep_Eng',
      'Clerical_Egal': 'Cleric_Egal',
      'Divine_Human_Agency': 'Div_Hum_Agency',
      'Communal_Individual': 'Commun_Indiv',
      'Liturgical_Spontaneous': 'Liturg_Spont',
      'Sacramental_Functional': 'Sacram_Funct',
      'Literal_Critical': 'Literal_Crit',
      'Intellectual_Experiential': 'Intellect_Exper'
  };

  rawDimensions.forEach(row => {
    const qid = row.Question_ID;
    theoData.hiddenDimensions[qid] = {};
    for (const [csvKey, value] of Object.entries(row)) {
      if (dimMap[csvKey]) {
        theoData.hiddenDimensions[qid][dimMap[csvKey]] = Number(value) || 0;
      }
    }
  });

  // 4. Map Answer Scoring Matrix (Keyed by EXACT Answer Text!)
  rawAnswerScoring.forEach(row => {
    const qid = row.Question_ID;
    const answerText = row.Answer ? row.Answer.trim() : null;
    if (!answerText) return;

    if (!theoData.answerKey[qid]) theoData.answerKey[qid] = {};
    if (!theoData.answerKey[qid][answerText]) theoData.answerKey[qid][answerText] = {};

    for (const [key, value] of Object.entries(row)) {
      if (!['Question_ID', 'Answer_ID', 'Answer_Letter', 'Answer'].includes(key)) {
         const num = Number(value);
         // Ensure N/A strings are skipped or kept as null, valid numbers parsed
         theoData.answerKey[qid][answerText][key] = isNaN(num) ? null : num;
      }
    }
  });

  // 5. Map Doctrines (Wide Format parsing & Text-to-Number conversion)
  const certMap = { "Certain": 3, "Pretty Sure": 2, "Leaning": 1, "Not Sure": 0 };
  const tolMap = { "Salvation issue": 0, "Opposed": 1, "Discerning": 2, "Charitable": 3, "Extremely Accepting": 4 };

  rawDoctrines.forEach(row => {
    const denomId = row.Denomination_ID;
    if (!denomId) return;

    rawQuestions.forEach(q => {
      const qid = q.Question_ID;
      const ansString = row[`${qid}_Answer`];
      
      if (ansString && ansString.trim() !== '') {
        const answersList = [];
        
        // We look for exact answer phrases within the comma-separated string
        if (theoData.answerKey[qid]) {
           const possibleAnswers = Object.keys(theoData.answerKey[qid]);
           // Sort by length so we match longer phrases first (avoids partial matches)
           possibleAnswers.sort((a, b) => b.length - a.length);
           
           let remainingString = ansString;
           for (const possibleAns of possibleAnswers) {
              if (remainingString.includes(possibleAns)) {
                 answersList.push(possibleAns);
                 remainingString = remainingString.replace(possibleAns, '');
              }
           }
        }

        if (answersList.length > 0) {
            const cStr = row[`${qid}_Certainty`];
            const tStr = row[`${qid}_Tolerance`];
            
            denominationsMap[denomId].doctrines[qid] = {
                answers: answersList,
                C: certMap[cStr] !== undefined ? certMap[cStr] : 1, // Default Leaning
                T: tolMap[tStr] !== undefined ? tolMap[tStr] : 2  // Default Discerning
            };
        }
      }
    });
  });

  // 6. Map Quiz Sequences (Now checks for "TRUE" strings)
  rawSequences.forEach(row => {
      const qid = row.Question_ID;
      if (row.Include_Quick === 'TRUE') theoData.quizSequences.quick.push(qid);
      if (row.Include_Standard === 'TRUE') theoData.quizSequences.standard.push(qid);
      if (row.Include_Deep === 'TRUE') theoData.quizSequences.deep.push(qid);
  });

  theoData.questions = Object.values(questionsMap);
  theoData.denominations = Object.values(denominationsMap);

  console.log("Successfully rebuilt theoData from CSVs!");
  return theoData;
}

// --- BOOTSTRAP DATA ---
const theoData = buildTheoDataFromCSVs();
fs.mkdirSync(OUT_DIR, { recursive: true });

// --- THE MATH ENGINE ---
const TC = {
  DIMS: [
    'Theol_Cons_Lib', 'Social_Cons_Lib', 'Counter_Pro_Modern', 'Super_Nat',
    'Cult_Sep_Eng', 'Cleric_Egal', 'Div_Hum_Agency', 'Commun_Indiv',
    'Liturg_Spont', 'Sacram_Funct', 'Literal_Crit', 'Intellect_Exper'
  ],
  P_EXP: 3,
  DIM_THRESHOLD: 50,
  K_REJECT: 10,
  NORM_FLOOR: 215,
  POSTURE: { AFFIRMED: 'affirmed', APATHETIC: 'apathetic', HOSTILE: 'hostile' }
};

function getAnswerDimScores(qid, answerText) {
  return theoData.answerKey?.[qid]?.[answerText] ?? {};
}

function getTheologicalLabel(qid, answerText) {
  return theoData.answerKey?.[qid]?.[answerText]?.Theological_Label ?? null;
}

function getRelevantDims(qid) {
  const hd = theoData.hiddenDimensions ?? {};
  const weights = hd[qid] ?? {};
  return Object.entries(weights)
    .filter(([, w]) => w > TC.DIM_THRESHOLD)
    .map(([dim, weight]) => ({ dim, weight }));
}

function postureFactor(posture) {
  if (posture === TC.POSTURE.AFFIRMED) return 1.0;
  if (posture === TC.POSTURE.HOSTILE) return 0.75;
  return 0.20;
}

function certAmp(C) { return 1 + (C / 3); }
function tolAmp(T) { return 0.5 + (4 - T) * (2.5 / 4); }
function importanceSide(posture, C, T) { return postureFactor(posture) * tolAmp(T) * certAmp(C); }
function baseWeight(priorityScore) { return Math.pow((priorityScore ?? 5) / 10, TC.P_EXP); }

function getSilenceCase(postureA, postureB) {
  const aOk = postureA === TC.POSTURE.AFFIRMED;
  const bOk = postureB === TC.POSTURE.AFFIRMED;
  if (aOk && bOk) return 0;
  if (!aOk && !bOk) return 3;
  const silentSide = aOk ? postureB : postureA;
  return silentSide === TC.POSTURE.HOSTILE ? 2 : 1;
}

function computeDimSim(zA, zB, C_A, T_A, C_B, T_B, postureA, postureB, silenceCase) {
  let d_dim = 0;
  let rejectionPenalty = 0;
  switch (silenceCase) {
    case 3: d_dim = 0; break;
    case 1: d_dim = 50; break;
    case 2:
      d_dim = 50;
      rejectionPenalty = TC.K_REJECT * ((importanceSide(postureA, C_A, T_A) + importanceSide(postureB, C_B, T_B)) / 2);
      break;
    default: d_dim = Math.abs(zA - zB);
  }
  const c_amp = 1 + ((C_A + C_B) / 6);
  const t_amp = (0.5 + (((4 - T_A) + (4 - T_B)) * 2.5 / 8)) + (Math.abs(T_A - T_B) / 8);
  const d_post = 5 * (Math.abs(C_A - C_B) + Math.abs(T_A - T_B));
  const totalDist = (d_dim * c_amp * t_amp) + d_post + rejectionPenalty;
  const ceiling = Math.max(d_dim * 6.0 + 35, TC.NORM_FLOOR);
  return Math.max(0, Math.min(100, (1 - totalDist / ceiling) * 100));
}

function computeSubScore(ansA, ansB, C_A, T_A, C_B, T_B, postureA, postureB, qid, priority) {
  const relevantDims = getRelevantDims(qid);
  if (relevantDims.length === 0) return null;

  const bw = baseWeight(priority);
  const silenceCase = getSilenceCase(postureA, postureB);
  const scoresA = silenceCase === 0 ? getAnswerDimScores(qid, ansA) : {};
  const scoresB = silenceCase === 0 ? getAnswerDimScores(qid, ansB) : {};

  let weightedSum = 0, totalWeight = 0;

  for (const { dim, weight } of relevantDims) {
    if (silenceCase === 0 && (scoresA[dim] == null || scoresB[dim] == null)) continue;
    const zA = scoresA[dim] ?? 50;
    const zB = scoresB[dim] ?? 50;
    const dimW = (weight / 100) * bw;
    const sim = computeDimSim(zA, zB, C_A, T_A, C_B, T_B, postureA, postureB, silenceCase);
    weightedSum += sim * dimW;
    totalWeight += dimW;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function computeQuestionSimilarity(entryA, entryB, question) {
  const qid = question.Question_ID;
  const priority = question.Priority_Score ?? 5;
  const aAnswers = entryA?.answers ?? [];
  const bAnswers = entryB?.answers ?? [];
  const aPosture = entryA?.posture ?? TC.POSTURE.APATHETIC;
  const bPosture = entryB?.posture ?? TC.POSTURE.APATHETIC;
  const C_A = entryA?.C ?? 0, T_A = entryA?.T ?? 2;
  const C_B = entryB?.C ?? 0, T_B = entryB?.T ?? 2;
  const aList = aAnswers.length > 0 ? aAnswers : [null];
  const bList = bAnswers.length > 0 ? bAnswers : [null];
  const nA = aList.length, nB = bList.length;

  const subScores = [];
  for (const ansA of aList) {
    for (const ansB of bList) {
      const pA = ansA ? aPosture : TC.POSTURE.APATHETIC;
      const pB = ansB ? bPosture : TC.POSTURE.APATHETIC;
      const score = computeSubScore(ansA, ansB, C_A, T_A, C_B, T_B, pA, pB, qid, priority);
      if (score !== null) subScores.push(score);
    }
  }

  if (subScores.length === 0) return null;
  const S_best = Math.max(...subScores);
  const S_avg = subScores.reduce((a, s) => a + s, 0) / subScores.length;
  const F_A = nA > 1 ? ((4 - T_A) / 4) * (C_A / 3) : 0;
  const F_B = nB > 1 ? ((4 - T_B) / 4) * (C_B / 3) : 0;
  const F_schism = Math.max(F_A, F_B);
  return S_best - ((S_best - S_avg) * F_schism);
}

function normalizeDoctrineEntry(doc) {
  if (!doc || !doc.answers || doc.answers.length === 0) {
    return { answers: [], C: doc?.C ?? 0, T: doc?.T ?? 2, posture: TC.POSTURE.APATHETIC };
  }
  return { answers: doc.answers, C: doc.C ?? 0, T: doc.T ?? 2, posture: TC.POSTURE.AFFIRMED };
}

function getDenomProfile(denomination) {
  const profile = {};
  for (const [qid, doc] of Object.entries(denomination.doctrines ?? {})) {
    profile[qid] = normalizeDoctrineEntry(doc);
  }
  return profile;
}

function computePairTotalSimilarity(profileA, profileB, activeQids = null) {
  let weightedSum = 0, totalWeight = 0;
  for (const question of theoData.questions) {
    if (activeQids && !activeQids.has(question.Question_ID)) continue;
    const qid = question.Question_ID;
    const bw = baseWeight(question.Priority_Score ?? 5);
    const entryA = profileA[qid] ?? { answers: [], C: 0, T: 2, posture: TC.POSTURE.APATHETIC };
    const entryB = profileB[qid] ?? { answers: [], C: 0, T: 2, posture: TC.POSTURE.APATHETIC };
    const qSim = computeQuestionSimilarity(entryA, entryB, question);
    if (qSim === null) continue;
    const impA = importanceSide(entryA.posture, entryA.C, entryA.T);
    const impB = importanceSide(entryB.posture, entryB.C, entryB.T);
    const effW = bw * ((impA + impB) / 2);
    weightedSum += qSim * effW;
    totalWeight += effW;
  }
  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 1000) / 1000 : null;
}

function computeDimCoords(profileAnswers, activeQids = null) {
  const coords = {};
  for (const dim of TC.DIMS) {
    let weightedSum = 0, totalWeight = 0;
    for (const question of theoData.questions) {
      if (activeQids && !activeQids.has(question.Question_ID)) continue;
      const qid = question.Question_ID;
      const dimWRaw = theoData.hiddenDimensions?.[qid]?.[dim];
      if (!dimWRaw || dimWRaw <= TC.DIM_THRESHOLD) continue;
      const entry = profileAnswers[qid];
      const answers = entry?.answers ?? [];
      if (!answers.length) continue;
      const bw = baseWeight(question.Priority_Score ?? 5);
      const dimWLin = (dimWRaw / 100) * bw;
      const postureW = postureFactor(entry.posture ?? TC.POSTURE.AFFIRMED) * tolAmp(entry.T ?? 2) * certAmp(entry.C ?? 0);
      for (const ans of answers) {
        const dimScore = getAnswerDimScores(qid, ans)[dim];
        if (dimScore == null) continue;
        const w = (dimWLin * postureW) / answers.length;
        weightedSum += dimScore * w;
        totalWeight += w;
      }
    }
    coords[dim] = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 1000) / 1000 : null;
  }
  return coords;
}

function computeToleranceScore(profileAnswers, activeQids = null) {
  let weightedSum = 0, totalWeight = 0;
  for (const question of theoData.questions) {
    if (activeQids && !activeQids.has(question.Question_ID)) continue;
    const entry = profileAnswers[question.Question_ID];
    if (!entry || entry.posture !== TC.POSTURE.AFFIRMED) continue;
    
    const cVal = entry.C ?? 0;
    const tVal = entry.T ?? 2;
    
    // NEW LOGIC: Weight scales up exponentially as T moves away from neutral (2)
    const severityMultiplier = 1 + Math.pow(Math.abs(tVal - 2), 1.5);
    const wT = (1 + cVal) * severityMultiplier;
    
    weightedSum += tVal * wT;
    totalWeight += wT;
  }
  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 25 * 1000) / 1000 : 50;
}


function buildLabelProfile(profileAnswers, activeQids = null) {
  const labels = [];
  for (const question of theoData.questions) {
    if (activeQids && !activeQids.has(question.Question_ID)) continue;
    const qid = question.Question_ID;
    const entry = profileAnswers[qid];
    if (!entry || entry.posture !== TC.POSTURE.AFFIRMED) continue;
    for (const ans of (entry.answers ?? [])) {
      const label = getTheologicalLabel(qid, ans);
      if (label) labels.push({ label, C: entry.C ?? 0, T: entry.T ?? 2, qid, answer: ans });
    }
  }
  return labels.sort((a, b) => b.C - a.C || a.T - b.T || a.label.localeCompare(b.label));
}

function computeQuestionDimStats(profileAnswers, qid) {
  const relevantDims = getRelevantDims(qid);
  const entry = profileAnswers[qid] ?? { answers: [], C: 0, T: 2, posture: TC.POSTURE.APATHETIC };
  const out = {
    qid,
    answered: entry.answers.length > 0,
    C: entry.C,
    T: entry.T,
    posture: entry.posture,
    splitCount: entry.answers.length,
    labels: (entry.answers ?? []).map(ans => getTheologicalLabel(qid, ans)).filter(Boolean),
    dimensions: {}
  };

  for (const { dim, weight } of relevantDims) {
    const vals = (entry.answers ?? []).map(ans => getAnswerDimScores(qid, ans)[dim]).filter(v => v != null).map(Number);
    out.dimensions[dim] = {
      weight,
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
      avg: vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3)) : null,
      values: vals
    };
  }
  return out;
}

function aggregateDimensionStats(profileAnswers, activeQids = null) {
  const result = {};
  for (const dim of TC.DIMS) {
    let weightedSum = 0, totalWeight = 0;
    const seen = [];
    for (const question of theoData.questions) {
      if (activeQids && !activeQids.has(question.Question_ID)) continue;
      const qid = question.Question_ID;
      const dimWRaw = theoData.hiddenDimensions?.[qid]?.[dim];
      if (!dimWRaw || dimWRaw <= TC.DIM_THRESHOLD) continue;
      const entry = profileAnswers[qid];
      const answers = entry?.answers ?? [];
      if (!answers.length) continue;
      const bw = baseWeight(question.Priority_Score ?? 5);
      const dimWLin = (dimWRaw / 100) * bw;
      const postureW = postureFactor(entry.posture ?? TC.POSTURE.AFFIRMED) * tolAmp(entry.T ?? 2) * certAmp(entry.C ?? 0);
      for (const ans of answers) {
        const v = getAnswerDimScores(qid, ans)[dim];
        if (v == null) continue;
        seen.push(Number(v));
        const w = (dimWLin * postureW) / answers.length;
        weightedSum += v * w;
        totalWeight += w;
      }
    }
    result[dim] = {
      avg: totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(3)) : null,
      min: seen.length ? Math.min(...seen) : null,
      max: seen.length ? Math.max(...seen) : null,
      count: seen.length
    };
  }
  return result;
}

function modeQuestionSet(mode) { return new Set(theoData.quizSequences?.[mode] ?? []); }
function csvEscape(value) { const s = value == null ? '' : String(value); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function makeMatrixHeader(denoms) { return ['Denomination_ID', ...denoms.map(d => d.Denomination_ID)].join(','); }

function buildProfiles() {
  const profiles = {};
  for (const denom of theoData.denominations) {
    const profile = getDenomProfile(denom);
    const perQuestion = {};
    for (const q of theoData.questions) perQuestion[q.Question_ID] = computeQuestionDimStats(profile, q.Question_ID);
    const modes = {};
    for (const mode of Object.keys(theoData.quizSequences)) {
      const activeQids = modeQuestionSet(mode);
      modes[mode] = {
        dimCoords: computeDimCoords(profile, activeQids),
        toleranceScore: computeToleranceScore(profile, activeQids),
        dimensionStats: aggregateDimensionStats(profile, activeQids),
        labels: buildLabelProfile(profile, activeQids)
      };
    }
    profiles[denom.Denomination_ID] = {
      denomination: {
        id: denom.Denomination_ID,
        name: denom.Denomination_Name || denom.Name,
        family: denom.Denomination_Family,
        founded: denom.Founded_Year,
        region: denom.Region_Origin,
        description: denom.Description
      },
      perQuestion,
      modes
    };
  }
  return profiles;
}

function buildPairwise() {
  const denoms = theoData.denominations;
  const profiles = Object.fromEntries(denoms.map(d => [d.Denomination_ID || d.Name, getDenomProfile(d)]));
  const denomMeta = denoms.map(d => ({ id: d.Denomination_ID || d.Name, name: d.Denomination_Name || d.Name }));
  const pairwise = {};

  for (const mode of Object.keys(theoData.quizSequences)) {
    const activeQids = modeQuestionSet(mode);
    const overall = [];
    const byQuestion = {};
    for (const qid of activeQids) byQuestion[qid] = [];

    for (let i = 0; i < denoms.length; i++) {
      for (let j = i; j < denoms.length; j++) {
        const a = denoms[i], b = denoms[j];
        const aId = a.Denomination_ID || a.Name;
        const bId = b.Denomination_ID || b.Name;
        const profileA = profiles[aId], profileB = profiles[bId];
        
        overall.push({ a: aId, b: bId, similarity: computePairTotalSimilarity(profileA, profileB, activeQids) });
        for (const q of theoData.questions) {
          if (!activeQids.has(q.Question_ID)) continue;
          const qa = profileA[q.Question_ID] ?? { answers: [], C: 0, T: 2, posture: TC.POSTURE.APATHETIC };
          const qb = profileB[q.Question_ID] ?? { answers: [], C: 0, T: 2, posture: TC.POSTURE.APATHETIC };
          byQuestion[q.Question_ID].push({ a: aId, b: bId, similarity: computeQuestionSimilarity(qa, qb, q) });
        }
      }
    }
    pairwise[mode] = { denominations: denomMeta, overall, byQuestion };
  }
  return pairwise;
}

function writeOverallMatrixCsv(pairwiseMode, denoms, outPath) {
  const ids = denoms.map(d => d.Denomination_ID || d.Name);
  const lookup = new Map();
  for (const row of pairwiseMode.overall) {
    lookup.set(`${row.a}__${row.b}`, row.similarity);
    lookup.set(`${row.b}__${row.a}`, row.similarity);
  }
  const lines = [makeMatrixHeader(denoms)];
  for (const idA of ids) {
    const row = [csvEscape(idA)];
    for (const idB of ids) row.push(csvEscape(lookup.get(`${idA}__${idB}`)));
    lines.push(row.join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'));
}

function writeSummaryCsv(profiles, outPath) {
  const lines = [[ 'Denomination_ID','Denomination_Name','Mode','ToleranceScore', ...TC.DIMS.map(d => `${d}_avg`) ].join(',')];
  for (const [denomId, obj] of Object.entries(profiles)) {
    for (const [mode, modeData] of Object.entries(obj.modes)) {
      const row = [csvEscape(denomId), csvEscape(obj.denomination.name), csvEscape(mode), csvEscape(modeData.toleranceScore), ...TC.DIMS.map(d => csvEscape(modeData.dimensionStats[d]?.avg))];
      lines.push(row.join(','));
    }
  }
  fs.writeFileSync(outPath, lines.join('\n'));
}

// Notice we still accept rawFamilies as the second argument
function buildFamilyProfiles(profiles, rawFamilies) {
  const families = {};
  
  // Create a quick lookup map for the family metadata
  const familyMetaMap = {};
  if (rawFamilies) {
    rawFamilies.forEach(row => {
      // Use EXACT CSV column names (with underscores)
      if (row.Family_Name) {
        familyMetaMap[row.Family_Name.trim()] = {
          founded: row.Founded_Century,
          region: row.Region_Origin,
          members: row.Est_Members_Global,
          description: row.Description
        };
      }
    });
  }
  
  // Group denominations by family
  for (const [denomId, obj] of Object.entries(profiles)) {
    const family = obj.denomination.family;
    if (!family || family === "Unknown") continue;
    
    if (!families[family]) {
      families[family] = { 
        family, 
        metadata: familyMetaMap[family] || null, // Attach metadata here!
        modes: {} 
      };
    }

    // --- We also need to map the dimensions into modes ---
    // (This was missing in your latest snippet!)
    for (const [mode, modeData] of Object.entries(obj.modes)) {
      if (!families[family].modes[mode]) {
        families[family].modes[mode] = { dimensions: {} };
      }
      for (const [dim, stats] of Object.entries(modeData.dimensionStats)) {
        if (!families[family].modes[mode].dimensions[dim]) {
          families[family].modes[mode].dimensions[dim] = [];
        }
        if (stats && stats.avg !== null) {
          families[family].modes[mode].dimensions[dim].push(stats.avg);
        }
      }
    }
  }

  // Calculate Min, Max, Avg for the error bars
  const result = {};
  for (const [family, data] of Object.entries(families)) {
    // Preserve the metadata in the final result!
    result[family] = { 
      family: data.family, 
      metadata: data.metadata, 
      coordinates: {} 
    };
    
    for (const [mode, modeData] of Object.entries(data.modes)) {
      result[family].coordinates[mode] = {};
      for (const [dim, values] of Object.entries(modeData.dimensions)) {
        if (values.length > 0) {
          result[family].coordinates[mode][dim] = {
            min: Number(Math.min(...values).toFixed(1)),
            max: Number(Math.max(...values).toFixed(1)),
            avg: Number((values.reduce((a,b) => a+b, 0) / values.length).toFixed(1))
          };
        } else {
          result[family].coordinates[mode][dim] = { min: 50, max: 50, avg: 50 }; // Fallback
        }
      }
    }
  }
  return result;
}

function main() {
  const profiles = buildProfiles();
  const pairwise = buildPairwise();

  // 1. Write denomination AND family profiles to a single KV file
  // Pass theoData.families into the function
  const familyProfiles = buildFamilyProfiles(profiles, theoData.families);
  
  const exportData = {
    denominations: profiles,
    families: familyProfiles
  };
  
  fs.writeFileSync(path.join(OUT_DIR, 'denomination_profiles.json'), JSON.stringify(exportData, null, 2));
  
  // 2. We skip writing pairwise_alignment.json as one massive string.
  // We will stream it out instead, or you can just rely on the CSVs.
  console.log("Writing pairwise JSON in chunks to avoid memory limits...");
  const pairwisePath = path.join(OUT_DIR, 'pairwise_alignment.json');
  const ws = fs.createWriteStream(pairwisePath);
  
  // Start the JSON object
  ws.write('{\n');
  const modes = Object.keys(pairwise);
  
  modes.forEach((mode, index) => {
    ws.write(`  "${mode}": {\n`);
    ws.write(`    "denominations": ${JSON.stringify(pairwise[mode].denominations)},\n`);
    ws.write(`    "overall": ${JSON.stringify(pairwise[mode].overall)},\n`);
    ws.write(`    "byQuestion": {\n`);
    
    const qKeys = Object.keys(pairwise[mode].byQuestion);
    qKeys.forEach((qid, qIndex) => {
      ws.write(`      "${qid}": ${JSON.stringify(pairwise[mode].byQuestion[qid])}`);
      if (qIndex < qKeys.length - 1) ws.write(',');
      ws.write('\n');
    });
    
    ws.write('    }\n  }');
    if (index < modes.length - 1) ws.write(',\n');
    else ws.write('\n');
  });
  
  ws.write('}\n');
  ws.end();

  // 3. Write Summary and Matrix CSVs
  writeSummaryCsv(profiles, path.join(OUT_DIR, 'denomination_mode_summary.csv'));
  for (const mode of Object.keys(pairwise)) {
    writeOverallMatrixCsv(pairwise[mode], theoData.denominations, path.join(OUT_DIR, `pairwise_overall_${mode}.csv`));
  }

  // 4. Build manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    denominations: theoData.denominations.length,
    questions: theoData.questions.length,
    modes: Object.fromEntries(Object.entries(theoData.quizSequences).map(([k, v]) => [k, v.length])),
    files: ['denomination_profiles.json','pairwise_alignment.json','denomination_mode_summary.csv',...Object.keys(pairwise).map(mode => `pairwise_overall_${mode}.csv`)]
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  
  console.log('✅ Precomputed files written successfully to:', OUT_DIR);
  console.log(JSON.stringify(manifest, null, 2));
}


main();
