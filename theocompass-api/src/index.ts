// Add KV to your Env interface
export interface Env {
  DB: D1Database;
  THEOCOMPASS_CACHE: KVNamespace; // <-- ADD THIS
}

export interface UserResponse {
  questionId: string;
  answerId: string;
  certainty: number;
  tolerance: number;
  isSilence: boolean;
  silenceType?: "apathetic" | "hostile";
}

// <-- ADD THIS GLOBAL CACHE VARIABLE
let cachedProfiles: any = null;
let cachedScoringData: any = null; // We can cache the scoring/dimensions too!

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Set up CORS headers so your Next.js frontend can fetch this data
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Compute-Time-ms, X-D1-Rows-Read, X-D1-Query-Time-ms",
      "Access-Control-Expose-Headers": "X-Compute-Time-ms, X-D1-Rows-Read, X-D1-Query-Time-ms",
      "Content-Type": "application/json",
    };


    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // -----------------------------------------------------------------
      // ENDPOINT 1: Scattermap Coordinates
      // -----------------------------------------------------------------
      if (url.pathname === "/api/coordinates") {
        // JOIN the coordinates with the master denominations table to get names and metadata
        const { results } = await env.DB.prepare(`
          SELECT 
            c.*, 
            d.name, 
            d.family, 
            d.region_origin as origin, 
            d.founded_year as year, 
            d.description
          FROM denomination_compass_coordinates c
          LEFT JOIN denominations d ON c.denomination_id = d.id
        `).all();
        
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }


      // -----------------------------------------------------------------
      // ENDPOINT 2: Question Catalogue
      // -----------------------------------------------------------------
      if (url.pathname === "/api/questions") {
        try {
          // 1. Get the mode parameter from the URL (default to quick)
          const mode = url.searchParams.get('mode') || 'quick';

          // 2. Build dynamic SQL based on mode
          let filterClause = "";
          let orderClause = "";

          if (mode === 'quick') {
            filterClause = "WHERE q.include_quick = 1";
            orderClause = "ORDER BY q.display_order_quick ASC";
          } else if (mode === 'standard') {
            filterClause = "WHERE q.include_standard = 1";
            orderClause = "ORDER BY q.display_order_standard ASC";
          } else if (mode === 'deep') {
            filterClause = "WHERE q.include_deep = 1";
            orderClause = "ORDER BY q.display_order_deep ASC";
          } else {
            return new Response(JSON.stringify({ error: "Invalid mode parameter." }), { status: 400, headers: corsHeaders });
          }

          // 3. Execute the JOIN query with the dynamic clauses
          const stmt = env.DB.prepare(`
            SELECT 
              q.id as question_id, 
              q.category_code as category_code, 
              q.full_text as full_text,
              a.id as answer_record_id,
              a.answer_text as answer_text,
              a.description as answer_description
            FROM questions q
            LEFT JOIN answer_options a ON q.id = a.question_id
            ${filterClause}
            ${orderClause}
          `);

          const { results } = await stmt.all();

          // 4. Map the flat SQL results into nested JSON
          const questionsMap = new Map();

          // Because we order by display_order in SQL, the first time we see a question_id, 
          // it is in the correct sequence. A Map preserves insertion order in JavaScript!
          results.forEach((row: any) => {
            if (!questionsMap.has(row.question_id)) {
              questionsMap.set(row.question_id, {
                id: row.question_id,           
                category: row.category_code,   
                question: row.full_text,       
                answers: []
              });
            }

            if (row.answer_record_id) {
              questionsMap.get(row.question_id).answers.push({
                id: row.answer_record_id.toString(),
                text: row.answer_text,
                desc: row.answer_description || "",
                isSilence: false
              });
            }
          });

          const formattedQuestions = Array.from(questionsMap.values());
          return new Response(JSON.stringify(formattedQuestions), { headers: corsHeaders });
          
        } catch (dbError: any) {
          console.error("SQL ERROR IN /api/questions:", dbError.message);
          return new Response(JSON.stringify({ error: "SQL Error", details: dbError.message }), { 
            status: 500, 
            headers: corsHeaders 
          });
        }
      }

      // -----------------------------------------------------------------
      // ENDPOINT 3: Pairwise Alignment Matrix
      // Replaces: pairwise_alignment.json
      // -----------------------------------------------------------------
      if (url.pathname === "/api/alignment") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM pairwise_alignments"
        ).all();
        
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // -----------------------------------------------------------------
      // ENDPOINT 4: Get Scoring Math (GET)
      // For frontend client-side calculation (Option B)
      // -----------------------------------------------------------------
      if (url.pathname === "/api/scoring" && request.method === "GET") {
        const dimensions = await env.DB.prepare("SELECT * FROM hidden_dimensions").all();
        const answers = await env.DB.prepare("SELECT * FROM answer_scoring").all();
        
        return new Response(JSON.stringify({
          hidden_dimensions: dimensions.results,
          answer_scoring: answers.results
        }), { headers: corsHeaders });
      }


    // -----------------------------------------------------------------
    // DEV ENDPOINT: Fetch a Denomination's Profile
    // -----------------------------------------------------------------
    if (url.pathname === '/api/dev/profile' && request.method === 'GET') {
      const denomId = url.searchParams.get('id');
      if (!denomId) return new Response(JSON.stringify({ error: "Missing id parameter" }), { status: 400, headers: corsHeaders });

      try {
        // Find all selected options for a specific denomination and get their AnswerIDs
        const stmt = env.DB.prepare(`
          SELECT 
              dso.question_id as questionId,
              ao.id as answerId,
              da.certainty, 
              da.tolerance
          FROM denomination_selected_options dso
          LEFT JOIN denomination_answers da 
              ON dso.denomination_id = da.denomination_id AND dso.question_id = da.question_id
          LEFT JOIN answer_options ao 
              ON dso.question_id = ao.question_id AND dso.answer_text = ao.answer_text
          WHERE dso.denomination_id = ?
        `);
        
        const res = await stmt.bind(denomId).all();
        
        if (!res.results || res.results.length === 0) {
           return new Response(JSON.stringify({ error: `No data found for ID: ${denomId}` }), { status: 404, headers: corsHeaders });
        }

        const parseCert = (c: any) => {
          const s = String(c).toLowerCase();
          if (s.includes('certain')) return 3;
          if (s.includes('pretty')) return 2;
          if (s.includes('leaning')) return 1;
          return 0;
        };
        
        const parseTol = (t: any) => {
          const s = String(t).toLowerCase();
          if (s.includes('accept')) return 4;
          if (s.includes('charitable')) return 3;
          if (s.includes('discern')) return 2;
          if (s.includes('opposed')) return 1;
          return 0;
        };

        const profile: Record<string, any> = {};
        
        res.results.forEach((row: any) => {
          // If a denomination selected multiple options, grab the first one
          if (!profile[row.questionId] && row.answerId) {
            profile[row.questionId] = {
              questionId: row.questionId,
              answerId: row.answerId,
              certainty: parseCert(row.certainty),
              tolerance: parseTol(row.tolerance),
              isSilence: false
            };
          }
        });
        
        return new Response(JSON.stringify(profile), { status: 200, headers: corsHeaders });
      } catch (e: any) {
        console.error("DEV API SQL Error:", e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }




      // -----------------------------------------------------------------
      // ENDPOINT 5: Calculate Matches (POST)
      // The core engine for TheoCompass
      // -----------------------------------------------------------------
      if (request.method === "POST" && url.pathname === "/api/calculate") {
        return await handleCalculate(request, env, corsHeaders);
      }

      // -----------------------------------------------------------------
      // DEFAULT: Health Check
      // -----------------------------------------------------------------
      return new Response(
        JSON.stringify({ status: "TheoCompass API Active", version: "2.0" }),
        { headers: corsHeaders, status: 200 }
      );

    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: "Database query failed", details: error.message }),
        { headers: corsHeaders, status: 500 }
      );
    }
  },
};

// =====================================================================
// HELPER: Calculate Endpoint Logic (Aligned with app.js)
// =====================================================================
async function handleCalculate(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const startTime = performance.now(); // <-- ADD THIS LINE
    const payload = await request.json<Record<string, UserResponse>>();
    const userAnswersArray = Object.values(payload);

    if (!userAnswersArray || userAnswersArray.length === 0) {
      return new Response(JSON.stringify({ error: "No answers provided" }), { status: 400, headers: corsHeaders });
    }

    const questionIds = userAnswersArray.map(a => a.questionId);
    const placeholders = questionIds.map(() => '?').join(',');

    // ==========================================
    // 1. FETCH BASELINES FROM MEMORY OR KV
    // ==========================================
    let totalD1RowsRead = 0;
    let totalD1QueryTimeMs = 0;
    
    // Check if the precomputed profiles are already warm in V8 memory
    if (!cachedProfiles) {
      console.log("Cold start: Fetching denomination_profiles from KV...");
      const kvData = await env.THEOCOMPASS_CACHE.get("denomination_profiles", "json");
      if (!kvData) {
        return new Response(JSON.stringify({ error: "Baseline data not found in KV. Run npm run kv:update-remote" }), { status: 500, headers: corsHeaders });
      }
      cachedProfiles = kvData;
    } else {
      console.log("Warm start: Using in-memory denomination_profiles.");
    }

    // We still need the scoring math/dimensions for the user's side of the calculation.
    // We will cache this in RAM too, but fetch it from D1 on cold starts.
    if (!cachedScoringData) {
      console.log("Cold start: Fetching scoring data from D1...");
      const dbStartTime = performance.now();
      
      const placeholders = questionIds.map(() => '?').join(',');
      const [scoringRes, dimensionsRes, questionsRes] = await env.DB.batch([
        env.DB.prepare(`
          SELECT s.*, a.answer_text as answertext, a.question_id as questionid 
          FROM answer_scoring s 
          LEFT JOIN answer_options a ON s.answer_id = a.id
        `),
        env.DB.prepare(`SELECT * FROM hidden_dimensions WHERE question_id IN (${placeholders})`).bind(...questionIds),
        env.DB.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).bind(...questionIds)
      ]);
      
      totalD1RowsRead = (scoringRes.meta?.rows_read || 0) + (dimensionsRes.meta?.rows_read || 0) + (questionsRes.meta?.rows_read || 0);
      totalD1QueryTimeMs = performance.now() - dbStartTime;

      const normalizeRow = (row: any) => {
        const normalized: any = {};
        for (const key in row) normalized[key.toLowerCase().replace(/_/g, "")] = row[key];
        return normalized;
      };

      cachedScoringData = {
        answerScoring: scoringRes.results.map(normalizeRow),
        hiddenDims: dimensionsRes.results.map(normalizeRow),
        questionData: questionsRes.results.map(normalizeRow)
      };
    }

    // Destructure our data for the calculation loop
    const { answerScoring, hiddenDims, questionData } = cachedScoringData;

    const answerMap: Record<string, any> = {};
    answerScoring.forEach((score: any) => answerMap[score.answerid] = score);

    const dimMap: Record<string, any> = {};
    hiddenDims.forEach((dim: any) => dimMap[dim.questionid] = dim);

    const qMap: Record<string, any> = {};
    questionData.forEach((q: any) => qMap[q.id] = q);

    const TC_DIMS = [
      "theolconslib", "socialconslib", "counterpromodern", "supernat", 
      "cultsepeng", "clericegal", "divhumagency", "communindiv", 
      "liturgspont", "sacramfunct", "literalcrit", "intellectexper"
    ];

    // Helpers
    const getPosture = (isSilence: boolean, sType?: string) => isSilence ? (sType === 'hostile' ? 'hostile' : 'apathetic') : 'affirmed';
    const postureFactor = (posture: string) => posture === 'affirmed' ? 1.00 : (posture === 'hostile' ? 0.75 : 0.20);
    const certAmp = (C: number) => 1 + (C / 3);
    const tolAmp = (T: number) => 0.5 + ((4 - T) / 2.5);
    const importanceSide = (p: string, C: number, T: number) => postureFactor(p) * tolAmp(T) * certAmp(C);
    const baseWeight = (priority: number) => Math.pow((priority || 5) / 10, 3);

    // FIX: String to Number Converters
    const parseCertainty = (c: any) => {
      const str = String(c || "").toLowerCase();
      if (str.includes('certain')) return 3;
      if (str.includes('pretty')) return 2;
      if (str.includes('leaning')) return 1;
      return 0; // 'not sure'
    };

    const parseTolerance = (t: any) => {
      const str = String(t || "").toLowerCase();
      if (str.includes('accept')) return 4; 
      if (str.includes('charitable')) return 3;
      if (str.includes('discern')) return 2;
      if (str.includes('opposed')) return 1;
      return 0; // 'salvation issue'
    };

// USE ALL DENOMINATIONS FROM THE KV CACHE
const activeDenominations = Object.values(cachedProfiles.denominations);
const familyProfiles = cachedProfiles.families;

const dimToCacheMap: Record<string, string> = {
    "theolconslib": "Theol_Cons_Lib",
    "socialconslib": "Social_Cons_Lib",
    "counterpromodern": "Counter_Pro_Modern",
    "supernat": "Super_Nat",
    "cultsepeng": "Cult_Sep_Eng",
    "clericegal": "Cleric_Egal",
    "divhumagency": "Div_Hum_Agency",
    "communindiv": "Commun_Indiv",
    "liturgspont": "Liturg_Spont",
    "sacramfunct": "Sacram_Funct",
    "literalcrit": "Literal_Crit",
    "intellectexper": "Intellect_Exper"
};

// 1. PRE-CALCULATE USER PROFILE (OUTSIDE THE LOOP)
const userProfile = new Map();

userAnswersArray.forEach((userAns) => {
    const qid = userAns.questionId;
    const qMeta = qMap[qid];
    const qDims = dimMap[qid];
    if (!qMeta || !qDims) return;

    const priority = Number(qMeta.priorityscore || qMeta.priority_score || 5);
    const bw = baseWeight(priority);
    const uPosture = getPosture(userAns.isSilence, userAns.silenceType);
    
    // Force strict silence injections
    let uC = userAns.certainty;
    let uT = userAns.tolerance;
    if (uPosture === 'apathetic') { uC = 0; uT = 2; }
    else if (uPosture === 'hostile') { uC = 3; uT = 1; }

    const uImp = importanceSide(uPosture, uC, uT);

    const relevantDims = TC_DIMS.filter(dim => {
        const val = Number(qDims[dim]);
        return !isNaN(val) && val >= 50;
    });
    if (relevantDims.length === 0) return;

    // Pre-calculate user Z-values and dimension weights
    const processedDims = relevantDims.map((dim) => {
        const dimW = (Number(qDims[dim]) / 100) * bw;
        const zA = (answerMap[userAns.answerId] && answerMap[userAns.answerId][dim] != null) 
            ? Number(answerMap[userAns.answerId][dim]) 
            : 50;
        return { dim, dimW, cacheDimKey: dimToCacheMap[dim], zA: isNaN(zA) ? 50 : zA };
    });

    userProfile.set(qid, { bw, uPosture, uC, uT, uImp, processedDims });
});

// 2. LOOP DENOMINATIONS (NOW LIGHTWEIGHT)
const results = activeDenominations.map((denom: any) => {
    let weightedSum = 0;
    let totalWeight = 0;
    
    const denomId = denom.denomination.id;
    const denomStats = denom.perQuestion || {};

    // Loop directly over the pre-calculated user profile
    for (const [qid, uData] of userProfile.entries()) {
        const dStats = denomStats[qid] || {};
        const dAnswered = dStats.answered || false;
        const dPosture = dAnswered ? (dStats.posture || 'affirmed') : 'apathetic';

        const dC = dAnswered ? (dStats.C || 0) : 0;
        const dT = dAnswered ? (dStats.T || 2) : 2;
        const dImp = importanceSide(dPosture, dC, dT);
        const effW = uData.bw * ((uData.uImp + dImp) / 2);

        let silenceCase = 0;
        if (uData.uPosture !== 'affirmed' && dPosture !== 'affirmed') silenceCase = 3;
        else if (uData.uPosture !== 'affirmed' || dPosture !== 'affirmed') {
            const silentSide = uData.uPosture !== 'affirmed' ? uData.uPosture : dPosture;
            silenceCase = silentSide === 'hostile' ? 2 : 1;
        }

        const splitCount = dAnswered ? (dStats.splitCount || 1) : 1;
        const subScores = [];

        for (let i = 0; i < splitCount; i++) {
            let dimWeightedSum = 0;
            let dimTotalWeight = 0;
            let dDim = 0;
            let rejectPenalty = 0;

            if (silenceCase === 3) dDim = 0;
            else if (silenceCase === 1) dDim = 50;
            else if (silenceCase === 2) {
                dDim = 50;
                rejectPenalty = 10 * ((uData.uImp + dImp) / 2);
            }

            for (const pd of uData.processedDims) {
                let zB = 50;
                if (dAnswered && dStats.dimensions && dStats.dimensions[pd.cacheDimKey]) {
                    zB = dStats.dimensions[pd.cacheDimKey].values[i];
                }
                const finalZB = (isNaN(zB) || zB === null || zB === undefined) ? 50 : zB;
                
                if (silenceCase === 0) dDim = Math.abs(pd.zA - finalZB);

                const cAmp = 1 + ((uData.uC + dC) / 6);
                
                // FIX: Corrected tAmp formula according to Methodology Math
                const tAmp = 0.5 + (((4 - uData.uT) + (4 - dT)) * 2.5 / 8) + (Math.abs(uData.uT - dT) / 8);
                
                const dPost = 5 * (Math.abs(uData.uC - dC) + Math.abs(uData.uT - dT));
                
                const totalDist = (dDim * cAmp * tAmp) + dPost + rejectPenalty;
                const ceiling = Math.max(dDim * 6.0 + 35, 215);
                const sim = Math.max(0, Math.min(100, 100 * (1 - (totalDist / ceiling))));

                dimWeightedSum += sim * pd.dimW;
                dimTotalWeight += pd.dimW;
            }

            if (dimTotalWeight > 0) subScores.push(dimWeightedSum / dimTotalWeight);
        }

        if (subScores.length > 0) {
            const Sbest = Math.max(...subScores);
            const Savg = subScores.reduce((a, b) => a + b, 0) / subScores.length;
            
            // FIX: Proper Schism Architecture
            const F_A = 0; // The user provides 1 answer, so their internal schism is 0
            const F_B = splitCount > 1 ? ((4 - dT) / 4) * (dC / 3) : 0;
            const F_schism = Math.max(F_A, F_B);
            
            const qSim = Sbest - ((Sbest - Savg) * F_schism);
            
            weightedSum += qSim * effW;
            totalWeight += effW;
        }
    }

    const meta = denom.denomination;
    return {
        id: denomId,
        name: meta.name || meta.denominationname || "Unknown Denomination",
        family: meta.family || "Unknown",
        matchPercentage: totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : 0,
        description: meta.description || meta.shortdescription || "No description available for this tradition.",
        foundedyear: meta.founded || meta.foundedyear || "",
        regionorigin: meta.region || meta.regionorigin || ""
    };
});

results.sort((a: any, b: any) => b.matchPercentage - a.matchPercentage);

    // --- 2.5 CALCULATE FAMILY MATCHES ---
    const familyMap = new Map<string, any>();

    results.forEach((denom: any) => {
      const familyName = denom.family;
      if (!familyName || familyName === "Unknown") return;
      
      if (!familyMap.has(familyName)) {
        familyMap.set(familyName, {
          family: familyName,
          denominations: [],
          totalScore: 0,
          count: 0
        });
      }
      const fData = familyMap.get(familyName);
      fData.denominations.push(denom);
      fData.totalScore += denom.matchPercentage;
      fData.count += 1;
    });

    const familyMatches = Array.from(familyMap.values()).map(f => {
      const avgMatch = f.totalScore / f.count;
      f.denominations.sort((a: any, b: any) => b.matchPercentage - a.matchPercentage);
      
      const fProfile = familyProfiles[f.family] || {};
      const fCoords = fProfile.coordinates?.quick || {};
      const fMeta = fProfile.metadata || {}; // Extract the metadata

      return {
        family: f.family,
        matchPercentage: Number(avgMatch.toFixed(2)),
        topDenomination: f.denominations[0],
        allDenominations: f.denominations,
        coordinates: fCoords,
        // Pass metadata to frontend
        description: fMeta.description || "No description available for this family.",
        founded: fMeta.founded || "",
        origin: fMeta.region || "",
        members: fMeta.members || ""
      };
    });

    // Sort families by highest average match
    familyMatches.sort((a, b) => b.matchPercentage - a.matchPercentage);

    const topMatches = results.slice(0, 10);

    // ==========================================
    // CALCULATE USER'S THEOLOGICAL FINGERPRINT
    // ==========================================
    const userDimCoords: Record<string, number> = {};
    
    // 1. Calculate the 12 Primary Dimensions
    TC_DIMS.forEach(dim => {
      let dimWeightedSum = 0;
      let dimTotalWeight = 0;

      userAnswersArray.forEach(userAns => {
        const qid = userAns.questionId;
        const qMeta = qMap[qid];
        const qDims = dimMap[qid];
        
        // Skip if missing data or dimension isn't relevant to this question
        if (!qMeta || !qDims || Number(qDims[dim]) < 50) return;

        const priority = Number(qMeta.priorityscore || qMeta.priority_score || 5);
        const bw = baseWeight(priority);
        const dimWLin = (Number(qDims[dim]) / 100) * bw;

        const uPosture = getPosture(userAns.isSilence, userAns.silenceType);
        
        // Skip dimensions if the user was silent/apathetic/hostile 
        // (we only plot affirmed stances for coordinates)
        if (uPosture !== 'affirmed') return;

        const ansData = answerMap[userAns.answerId];
        if (!ansData || isNaN(Number(ansData[dim]))) return;
        
        const dimScore = Number(ansData[dim]);
        const postureW = postureFactor(uPosture) * tolAmp(userAns.tolerance) * certAmp(userAns.certainty);
        const w = dimWLin * postureW;

        dimWeightedSum += (dimScore * w);
        dimTotalWeight += w;
      });

      userDimCoords[dim] = dimTotalWeight > 0 ? Number((dimWeightedSum / dimTotalWeight).toFixed(1)) : 50;
    });

// 2. Calculate the 13th Axis: Tolerance Score
let tolWeightedSum = 0;
let tolTotalWeight = 0;

console.log("--- STARTING TOLERANCE CALC ---");

userAnswersArray.forEach(userAns => {
  const uPosture = getPosture(userAns.isSilence, userAns.silenceType);
  if (uPosture !== 'affirmed') return;

  const cVal = Number(userAns.certainty ?? 2);
  const tVal = Number(userAns.tolerance ?? 2);

  const severityMultiplier = 1 + Math.pow(Math.abs(tVal - 2), 1.5);
  const wT = (1 + cVal) * severityMultiplier;

  console.log(`QID: ${userAns.questionId} | C: ${cVal} | T: ${tVal} | wT: ${wT.toFixed(2)}`);

  tolWeightedSum += (tVal * wT);
  tolTotalWeight += wT;
});

let userTolerance = 50;
if (tolTotalWeight > 0) {
  const averageTValue = tolWeightedSum / tolTotalWeight;
  userTolerance = Number((averageTValue * 25).toFixed(1));
  console.log(`FINAL TOLERANCE -> Sum: ${tolWeightedSum.toFixed(2)} | Weight: ${tolTotalWeight.toFixed(2)} | Score: ${userTolerance}`);
}

// ==========================================
// 3. GENERATE USER THEOLOGICAL LABELS
// ==========================================
console.log("=== GENERATING USER LABELS ===");
const theologicalLabels: any[] = [];

const affirmedAnswers = userAnswersArray.filter(ans => !ans.isSilence);
console.log("Affirmed answers count:", affirmedAnswers.length);

if (affirmedAnswers.length === 0) {
  console.log("No affirmed answers - no labels generated");
} else {
  const userAnswerIds = affirmedAnswers.map(ans => ans.answerId);
  console.log("Fetching labels for first 3 answer IDs:", userAnswerIds.slice(0, 3));

  // Query answer_options for labels and descriptions
  const labelRes = await env.DB.prepare(`
    SELECT id, theological_label, description 
    FROM answer_options 
    WHERE id IN (${userAnswerIds.map(() => '?').join(',')})
  `).bind(...userAnswerIds).all();

  console.log("Label query returned:", labelRes.results.length, "rows");

  const labelMap: Record<string, { label: string, desc: string }> = {};
  labelRes.results.forEach((row: any) => {
    const label = row.theological_label?.trim();
    if (label && label !== "N/A") {
      labelMap[row.id] = { label, desc: row.description || "" };
    }
  });

  // Build final labels array
  affirmedAnswers.forEach(userAns => {
    const data = labelMap[userAns.answerId];
    if (data) {
      theologicalLabels.push({
        label: data.label,
        desc: data.desc,
        category: qMap[userAns.questionId]?.categorycode || "GEN",
        certainty: Number(userAns.certainty ?? 2),
        tolerance: Number(userAns.tolerance ?? 2),
        questionId: userAns.questionId
      });
    }
  });


  console.log("Valid labels found:", Object.keys(labelMap).length);
}

    // 4. Return the response
    const endTime = performance.now();
    const computeTimeMs = (endTime - startTime).toFixed(2);

    console.log(`[Metrics] Math CPU Time: ${computeTimeMs}ms | D1 Rows Read: ${totalD1RowsRead} | D1 Query Time: ${totalD1QueryTimeMs}ms`);

    // Merge the custom metrics into your existing corsHeaders for this specific response
    const responseHeaders = {
    ...corsHeaders,
    "X-Compute-Time-ms": computeTimeMs.toString(),
    "X-D1-Rows-Read": totalD1RowsRead.toString(),
    "X-D1-Query-Time-ms": totalD1QueryTimeMs.toString()
    };


    return new Response(JSON.stringify({
      status: "success",
      matches: topMatches,
      familyMatches: familyMatches.slice(0, 10),
      userDimCoords: userDimCoords,
      userTolerance: userTolerance,
      userLabels: theologicalLabels
    }), {
      status: 200,
      headers: responseHeaders // Use the new merged headers here
    });

  } catch (error: any) {

    console.error("CALCULATION ERROR:", error);
    return new Response(JSON.stringify({ error: "Failed to process calculate request", details: error.message }), { status: 500, headers: corsHeaders });
  }
}
