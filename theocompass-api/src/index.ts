export interface Env {
  DB: D1Database;
}

// Match the frontend interfaces
export interface UserResponse {
  questionId: string;
  answerId: string;
  certainty: number;
  tolerance: number;
  isSilence: boolean;
  silenceType?: "apathetic" | "hostile";
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Set up CORS headers so your Next.js frontend can fetch this data
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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
            d.founded_year as year 
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
    const payload = await request.json<Record<string, UserResponse>>();
    const userAnswersArray = Object.values(payload);

    if (!userAnswersArray || userAnswersArray.length === 0) {
      return new Response(JSON.stringify({ error: "No answers provided" }), { status: 400, headers: corsHeaders });
    }

    const questionIds = userAnswersArray.map(a => a.questionId);
    const placeholders = questionIds.map(() => '?').join(',');

    // Fetch required data from D1
    // Query B has been massively upgraded to join the selected texts to their actual IDs and fetch the C/T strings
    const [denomsRes, denomAnswersRes, scoringRes, dimensionsRes, questionsRes] = await env.DB.batch([
      env.DB.prepare(`SELECT * FROM denominations`),
      env.DB.prepare(`
        SELECT 
          dso.denomination_id,
          dso.question_id,
          ao.id as answer_id,
          da.certainty,
          da.tolerance
        FROM denomination_selected_options dso
        LEFT JOIN answer_options ao 
          ON dso.question_id = ao.question_id AND dso.answer_text = ao.answer_text
        LEFT JOIN denomination_answers da 
          ON dso.denomination_id = da.denomination_id AND dso.question_id = da.question_id
        WHERE dso.question_id IN (${placeholders})
      `).bind(...questionIds),
      env.DB.prepare(`SELECT * FROM answer_scoring`),
      env.DB.prepare(`SELECT * FROM hidden_dimensions WHERE question_id IN (${placeholders})`).bind(...questionIds),
      env.DB.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).bind(...questionIds)
    ]);

    // --- BULLETPROOF DATA NORMALIZATION ---
    const normalizeRow = (row: any) => {
      const normalized: any = {};
      for (const key in row) {
        normalized[key.toLowerCase().replace(/_/g, "")] = row[key];
      }
      return normalized;
    };

    // 1. Build lookup maps
    const denominations = denomsRes.results.map(normalizeRow);
    const denomAnswers = denomAnswersRes.results.map(normalizeRow);
    const answerScoring = scoringRes.results.map(normalizeRow);
    const hiddenDims = dimensionsRes.results.map(normalizeRow);
    const questionData = questionsRes.results.map(normalizeRow);

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

    // Pre-Demo Filter
    const PREDEMO_IDS = [
      "DENOM_001", "DENOM_031", "DENOM_032", "DENOM_068", "DENOM_064",
      "DENOM_047", "DENOM_052", "DENOM_124", "DENOM_102", "DENOM_087",
      "DENOM_114", "DENOM_109", "DENOM_121", "DENOM_131", "DENOM_144",
      "DENOM_148", "DENOM_153", "DENOM_167", "DENOM_176", "DENOM_195",
      "DENOM_180", "DENOM_184", "DENOM_190", "DENOM_187", "DENOM_120",
      "DENOM_229", "DENOM_157", "DENOM_221", "DENOM_013", "DENOM_230"
    ];

    const activeDenominations = denominations.filter((d: any) => PREDEMO_IDS.includes(d.id || d.denominationid));

    // 2. Loop Denominations
    const results = activeDenominations.map((denom: any) => {
      let weightedSum = 0;
      let totalWeight = 0;
      const denomId = denom.id || denom.denominationid;

      userAnswersArray.forEach((userAns) => {
        const qid = userAns.questionId;
        const qMeta = qMap[qid];
        if (!qMeta) return;

        const priority = Number(qMeta.priorityscore || qMeta.priority_score || 5);
        const bw = baseWeight(priority);
        
        // Find all answers the denom selected for this question
        const dAnsList = denomAnswers.filter((da: any) => da.denominationid === denomId && da.questionid === qid);
        const uPosture = getPosture(userAns.isSilence, userAns.silenceType);
        const dPosture = dAnsList.length > 0 ? 'affirmed' : 'apathetic';

        // FORCE STRICT SILENCE INJECTIONS
        let uC = userAns.certainty;
        let uT = userAns.tolerance;

        if (uPosture === 'apathetic') {
            uC = 0;
            uT = 2;
        } else if (uPosture === 'hostile') {
            uC = 3;
            uT = 1;
        }

        // Parse the database strings back into 0-3 and 0-4 numbers
        const dC = dAnsList.length > 0 ? parseCertainty(dAnsList[0].certainty) : 0;
        const dT = dAnsList.length > 0 ? parseTolerance(dAnsList[0].tolerance) : 2;

        const uImp = importanceSide(uPosture, uC, uT);
        const dImp = importanceSide(dPosture, dC, dT);
        const effW = bw * ((uImp + dImp) / 2); 

        const qDims = dimMap[qid];
        if (!qDims) return; 

        const relevantDims = TC_DIMS.filter(dim => {
          const val = Number(qDims[dim]);
          return !isNaN(val) && val >= 50;
        });
        
        if (relevantDims.length === 0) return;

        let silenceCase = 0;
        if (uPosture !== 'affirmed' && dPosture !== 'affirmed') silenceCase = 3;
        else if (uPosture !== 'affirmed' || dPosture !== 'affirmed') {
          const silentSide = uPosture !== 'affirmed' ? uPosture : dPosture;
          silenceCase = silentSide === 'hostile' ? 2 : 1;
        }

        const subScores: number[] = [];
        const dListToLoop = dAnsList.length > 0 ? dAnsList : [null]; 

        dListToLoop.forEach((dAnsRow) => {
          let dimWeightedSum = 0;
          let dimTotalWeight = 0;

          relevantDims.forEach(dim => {
            const dimW = (Number(qDims[dim]) / 100) * bw;
            let dDim = 0;
            let rejectPenalty = 0;

            if (silenceCase === 3) dDim = 0;
            else if (silenceCase === 1) dDim = 50;
            else if (silenceCase === 2) {
              dDim = 50;
              rejectPenalty = 10 * ((uImp + dImp) / 2); 
            } else {
              const zA = answerMap[userAns.answerId] ? Number(answerMap[userAns.answerId][dim]) : 50;
              const zB = dAnsRow && answerMap[dAnsRow.answerid] ? Number(answerMap[dAnsRow.answerid][dim]) : 50;
              
              const finalZA = isNaN(zA) ? 50 : zA;
              const finalZB = isNaN(zB) ? 50 : zB;
              
              dDim = Math.abs(finalZA - finalZB);
            }

            const cAmp = 1 + (uC + dC) / 6;
            const tAmp = 0.5 + ((4 - uT) + (4 - dT)) / 2.5 + (Math.abs(uT - dT) / 8);
            const dPost = 5 * (Math.abs(uC - dC) + Math.abs(uT - dT));

            const totalDist = (dDim * cAmp * tAmp) + dPost + rejectPenalty;
            const ceiling = Math.max(dDim * 6.0 + 35, 215); 
            
            const sim = Math.max(0, Math.min(100, 100 * (1 - (totalDist / ceiling))));

            dimWeightedSum += (sim * dimW);
            dimTotalWeight += dimW;
          });

          if (dimTotalWeight > 0) subScores.push(dimWeightedSum / dimTotalWeight);
        });

        // Schism Interpolation
        if (subScores.length > 0) {
          const S_best = Math.max(...subScores);
          const S_avg = subScores.reduce((a, b) => a + b, 0) / subScores.length;
          
          const F_B = dAnsList.length > 1 ? ((4 - dT) / 4) * (dC / 3) : 0; 
          const qSim = S_best - ((S_best - S_avg) * F_B);

          weightedSum += (qSim * effW);
          totalWeight += effW;
        }
      });

      const matchPercentage = totalWeight > 0 ? (weightedSum / totalWeight) : 0;

      return {
        id: denomId,
        name: denom.name,
        family: denom.family || "Unknown",
        matchPercentage: Number(matchPercentage.toFixed(2)),
        description: denom.description || "",
        founded_year: denom.foundedyear || "",
        region_origin: denom.regionorigin || ""
      };
    });

    results.sort((a: any, b: any) => b.matchPercentage - a.matchPercentage);
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
    
    // REMOVED: if (uPosture !== 'affirmed') return;

    // Use the exact same forced logic here for the tolerance average
    let cVal = Number(userAns.certainty ?? 2);
    let tVal = Number(userAns.tolerance ?? 2);
    
    if (uPosture === 'apathetic') {
        cVal = 0;
        tVal = 2;
    } else if (uPosture === 'hostile') {
        cVal = 3;
        tVal = 1;
    }

    const severityMultiplier = 1 + Math.pow(Math.abs(tVal - 2), 1.5);
    const wT = (1 + cVal) * severityMultiplier;

    tolWeightedSum += (tVal * wT);
    tolTotalWeight += wT;
});


    let userTolerance = 50;
    if (tolTotalWeight > 0) {
        const averageTValue = tolWeightedSum / tolTotalWeight;
        userTolerance = Number((averageTValue * 25).toFixed(1));
    }
    
    console.log(`FINAL TOLERANCE -> Sum: ${tolWeightedSum.toFixed(2)} | Weight: ${tolTotalWeight.toFixed(2)} | Score: ${userTolerance}`);




    // 3. Return the expanded response
    return new Response(JSON.stringify({ 
      status: "success", 
      matches: topMatches,
      userDimCoords: userDimCoords,
      userTolerance: userTolerance
    }), { status: 200, headers: corsHeaders });


  } catch (error: any) {
    console.error("CALCULATION ERROR:", error);
    return new Response(JSON.stringify({ error: "Failed to process calculate request", details: error.message }), { status: 500, headers: corsHeaders });
  }
}
