// =============================================
// THEOCOMPASS v2.0 — app.js
// Scoring engine + quiz flow
// Requires: data.js  (const theoData = ...)
// UI hooks implemented separately in ui.js
// =============================================

"use strict";

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const TC = {
    DIMS: [
        'Theol_Cons_Lib', 'Social_Cons_Lib', 'Counter_Pro_Modern', 'Super_Nat',
        'Cult_Sep_Eng',   'Cleric_Egal',      'Div_Hum_Agency',     'Commun_Indiv',
        'Liturg_Spont',   'Sacram_Funct',     'Literal_Crit',       'Intellect_Exper'
    ],
    P_EXP:         3,      // priority exponent
    DIM_THRESHOLD: 50,     // minimum dimension relevance weight to include
    K_REJECT:      10,     // rejection penalty multiplier
    NORM_FLOOR:    215,    // minimum normalization ceiling
    POSTURE: {
        AFFIRMED:  'affirmed',
        APATHETIC: 'apathetic',
        HOSTILE:   'hostile'
    }
};

// ── QUIZ STATE ─────────────────────────────────────────────────────────────
const state = {
    userAnswers: {},    // { [qid]: { answers: string[], C: 0–3, T: 0–4, posture: string } }
    currentIdx:  0,
    questions:   [],    // ordered list of question objects for the active mode
    mode:        'quick',
    results:     null
};

// =============================================
// I. DATA LOOKUP HELPERS
// =============================================

/**
 * Returns { dimName: score (0–100) } for one answer on one question.
 * Only includes dimensions that are not N/A in the matrix.
 */
function getAnswerDimScores(qid, answerText) {
    return theoData.answerKey?.[qid]?.[answerText]?.dimensions ?? {};
}

/** Returns the theological label string for a given answer, or null. */
function getTheologicalLabel(qid, answerText) {
    return theoData.answerKey?.[qid]?.[answerText]?.theological_label ?? null;
}

/**
 * Returns [ { dim, weight } ] for all dimensions where
 * Dimension_Question_Weight > DIM_THRESHOLD on this question.
 */
function getRelevantDims(qid) {
    const weights = theoData.hiddenDimensions?.[qid] ?? {};
    return Object.entries(weights)
        .filter(([, w]) => w > TC.DIM_THRESHOLD)
        .map(([dim, weight]) => ({ dim, weight }));
}

// =============================================
// II. POSTURE & AMPLIFIER HELPERS
// =============================================

function postureFactor(posture) {
    if (posture === TC.POSTURE.AFFIRMED) return 1.00;
    if (posture === TC.POSTURE.HOSTILE)  return 0.75;
    return 0.20; // apathetic
}

/** Certainty amplifier: scales 1.0 (C=0) → 1.33 (C=1) → 1.67 (C=2) → 2.0 (C=3) */
function certAmp(C) { return 1 + (C / 3); }

/** Tolerance amplifier: scales higher (low T = intolerant = higher amplification) */
function tolAmp(T)  { return 0.5 + (4 - T) * (2.5 / 4); }

function importanceSide(posture, C, T) {
    return postureFactor(posture) * tolAmp(T) * certAmp(C);
}

/** Priority-based base weight: (score/10)^3 */
function baseWeight(priorityScore) {
    return Math.pow((priorityScore ?? 5) / 10, TC.P_EXP);
}

// =============================================
// III. SILENCE RESOLUTION
// =============================================

/**
 * Determine the silence case for a sub-comparison pair.
 * Returns:
 *   0 — both affirmed (normal distance calculation)
 *   1 — apathetic silence (one side has no view)
 *   2 — hostile silence (one side rejects the premise)
 *   3 — shared silence (both sides skip/reject)
 */
function getSilenceCase(postureA, postureB) {
    const aOk = postureA === TC.POSTURE.AFFIRMED;
    const bOk = postureB === TC.POSTURE.AFFIRMED;
    if (aOk  && bOk)  return 0;
    if (!aOk && !bOk) return 3;
    const silentSide = aOk ? postureB : postureA;
    return silentSide === TC.POSTURE.HOSTILE ? 2 : 1;
}

// =============================================
// IV. CORE SCORING ENGINE
// =============================================

/**
 * Compute similarity(q, d) for one sub-comparison on one dimension.
 * zA, zB: Answer_Dimension_Score values (0–100).
 * Returns similarity 0–100.
 */
function computeDimSim(zA, zB, C_A, T_A, C_B, T_B, postureA, postureB, silenceCase) {
    let d_dim = 0;
    let rejectionPenalty = 0;

    switch (silenceCase) {
        case 3:                      // shared silence → perfect agreement
            d_dim = 0;
            break;
        case 1:                      // apathetic → soft landing
            d_dim = 50;
            break;
        case 2:                      // hostile → base distance + rejection penalty
            d_dim = 50;
            const impA = importanceSide(postureA, C_A, T_A);
            const impB = importanceSide(postureB, C_B, T_B);
            rejectionPenalty = TC.K_REJECT * ((impA + impB) / 2);
            break;
        default:                     // 0 = both affirmed
            d_dim = Math.abs(zA - zB);
    }

    const c_amp     = 1 + ((C_A + C_B) / 6);
    const t_amp     = (0.5 + (((4 - T_A) + (4 - T_B)) * 2.5 / 8))
                    + (Math.abs(T_A - T_B) / 8);
    const d_post    = 5 * (Math.abs(C_A - C_B) + Math.abs(T_A - T_B));
    const totalDist = (d_dim * c_amp * t_amp) + d_post + rejectionPenalty;
    const ceiling   = Math.max(d_dim * 6.0 + 35, TC.NORM_FLOOR);

    return Math.max(0, Math.min(100, (1 - totalDist / ceiling) * 100));
}

/**
 * Blend all relevant dimensions into a single sub-comparison score for one answer pair.
 * Returns null if this question has no relevant dimensions (not in any dimension).
 */
function computeSubScore(ansA, ansB, C_A, T_A, C_B, T_B, postureA, postureB, qid, priority) {
    const relevantDims = getRelevantDims(qid);
    if (relevantDims.length === 0) return null;

    const bw          = baseWeight(priority);
    const silenceCase = getSilenceCase(postureA, postureB);
    const scoresA     = silenceCase === 0 ? getAnswerDimScores(qid, ansA) : {};
    const scoresB     = silenceCase === 0 ? getAnswerDimScores(qid, ansB) : {};

    let weightedSum = 0, totalWeight = 0;

    for (const { dim, weight } of relevantDims) {
        // When both affirmed, skip dimensions where either answer returns N/A
        if (silenceCase === 0 && (scoresA[dim] == null || scoresB[dim] == null)) continue;

        const zA   = scoresA[dim] ?? 50;  // fallback to midpoint for silence cases
        const zB   = scoresB[dim] ?? 50;
        const dimW = (weight / 100) * bw;
        const sim  = computeDimSim(
            zA, zB, C_A, T_A, C_B, T_B, postureA, postureB, silenceCase
        );

        weightedSum += sim * dimW;
        totalWeight += dimW;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Full question-level similarity including split-view schism interpolation.
 * Returns a 0–100 score, or null if the question has no relevant dimensions.
 */
function computeQuestionSimilarity(userEntry, denomEntry, question) {
    const qid      = question.Question_ID;
    const priority = question.Priority_Score ?? 5;

    const uAnswers = userEntry?.answers  ?? [];
    const dAnswers = denomEntry?.answers ?? [];
    const uPosture = userEntry?.posture  ?? TC.POSTURE.APATHETIC;
    const dPosture = (dAnswers.length > 0)
        ? TC.POSTURE.AFFIRMED
        : TC.POSTURE.APATHETIC;

    const C_A = userEntry?.C  ?? 0,  T_A = userEntry?.T  ?? 2;
    const C_B = denomEntry?.C ?? 0,  T_B = denomEntry?.T ?? 2;

    // Expand splits; treat empty as [null] so silence logic still fires
    const uList = uAnswers.length > 0 ? uAnswers : [null];
    const dList = dAnswers.length > 0 ? dAnswers : [null];
    const nA = uList.length, nB = dList.length;

    // Collect all sub-comparison scores
    const subScores = [];
    for (const ansA of uList) {
        for (const ansB of dList) {
            const pA    = ansA ? uPosture : TC.POSTURE.APATHETIC;
            const pB    = ansB ? dPosture : TC.POSTURE.APATHETIC;
            const score = computeSubScore(
                ansA, ansB, C_A, T_A, C_B, T_B, pA, pB, qid, priority
            );
            if (score !== null) subScores.push(score);
        }
    }

    if (subScores.length === 0) return null;

    // ── Schism Interpolation Model ──────────────────────────────────────────
    const S_best = Math.max(...subScores);
    const S_avg  = subScores.reduce((a, s) => a + s, 0) / subScores.length;

    // Schism factor: only fires if a side holds multiple (split) positions
    const F_A      = nA > 1 ? ((4 - T_A) / 4) * (C_A / 3) : 0;
    const F_B      = nB > 1 ? ((4 - T_B) / 4) * (C_B / 3) : 0;
    const F_schism = Math.max(F_A, F_B);

    return S_best - ((S_best - S_avg) * F_schism);
}

// =============================================
// V. DENOMINATION ANSWER ACCESSOR
// =============================================

/**
 * Extract a normalised answer entry from a denomination's doctrines object.
 * Returns { answers, C, T, posture }.
 */
function getDenomEntry(denomination, qid) {
    const doc = denomination.doctrines?.[qid];
    if (!doc || !doc.answers || doc.answers.length === 0) {
        return {
            answers: [],
            C:       doc?.C ?? 0,
            T:       doc?.T ?? 2,
            posture: TC.POSTURE.APATHETIC
        };
    }
    return {
        answers: doc.answers,
        C:       doc.C ?? 0,
        T:       doc.T ?? 2,
        posture: TC.POSTURE.AFFIRMED
    };
}

// =============================================
// VI. TOTAL SIMILARITY (User vs. Denomination)
// =============================================

/**
 * Compute the weighted total similarity between the current user answers
 * and one denomination, restricted to the active quiz mode's question set.
 */
function computeTotalSimilarity(denomination, activeQids = null) {
    let weightedSum = 0, totalWeight = 0;

    for (const question of theoData.questions) {
        if (activeQids && !activeQids.has(question.Question_ID)) continue;

        const qid      = question.Question_ID;
        const priority = question.Priority_Score ?? 5;
        const bw       = baseWeight(priority);

        const userEntry  = state.userAnswers[qid] ?? {
            answers: [], C: 0, T: 2, posture: TC.POSTURE.APATHETIC
        };
        const denomEntry = getDenomEntry(denomination, qid);

        const qSim = computeQuestionSimilarity(userEntry, denomEntry, question);
        if (qSim === null) continue;

        const impA = importanceSide(userEntry.posture,  userEntry.C,  userEntry.T);
        const impB = importanceSide(denomEntry.posture, denomEntry.C, denomEntry.T);
        const effW = bw * ((impA + impB) / 2);

        weightedSum += qSim * effW;
        totalWeight += effW;
    }

    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
}

// =============================================
// VII. DIMENSION COORDINATES (Per Profile)
// =============================================

/**
 * Compute the 12 hidden-dimension coordinates (0–100) for a profile.
 * profileAnswers: object keyed by qid, same shape as state.userAnswers
 *                 OR denomination.doctrines.
 * activeQids: optional Set to restrict to the active quiz mode.
 */
function computeDimCoords(profileAnswers, activeQids = null) {
    const coords = {};

    for (const dim of TC.DIMS) {
        let weightedSum = 0, totalWeight = 0;

        for (const question of theoData.questions) {
            if (activeQids && !activeQids.has(question.Question_ID)) continue;

            const qid     = question.Question_ID;
            const dimWRaw = theoData.hiddenDimensions?.[qid]?.[dim];
            if (!dimWRaw || dimWRaw <= TC.DIM_THRESHOLD) continue;

            const bw      = baseWeight(question.Priority_Score ?? 5);
            const dimWLin = (dimWRaw / 100) * bw;
            const entry   = profileAnswers[qid];
            const answers = entry?.answers ?? [];

            if (answers.length === 0) continue;

            const posture  = entry?.posture ?? TC.POSTURE.AFFIRMED;
            const C        = entry?.C ?? 0;
            const T        = entry?.T ?? 2;
            const postureW = postureFactor(posture) * tolAmp(T) * certAmp(C);

            for (const ans of answers) {
                const dimScore = getAnswerDimScores(qid, ans)[dim];
                if (dimScore == null) continue;
                // Average across split answers
                const w = (dimWLin * postureW) / answers.length;
                weightedSum += dimScore * w;
                totalWeight += w;
            }
        }

        coords[dim] = totalWeight > 0
            ? Math.round((weightedSum / totalWeight) * 10) / 10
            : null;
    }

    return coords;
}

/**
 * Compute the 13th axis: Tolerance dimension score (0–100).
 * Uses C-weighted average of T values across all affirmed answers.
 */
function computeToleranceScore(profileAnswers) {
    let weightedSum = 0, totalWeight = 0;

    for (const question of theoData.questions) {
        const entry = profileAnswers[question.Question_ID];
        if (!entry || entry.posture !== TC.POSTURE.AFFIRMED) continue;
        const wT = 1 + (entry.C ?? 0);
        weightedSum += (entry.T ?? 2) * wT;
        totalWeight += wT;
    }

    return totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 25 * 10) / 10
        : 50;
}

// =============================================
// VIII. RESULTS COMPUTATION
// =============================================

/**
 * Build the theological label profile for the tag cloud.
 * Returns [ { label, C, T, qid } ] sorted by Certainty descending.
 */
function buildLabelProfile(userAnswers) {
    const labels = [];
    for (const question of theoData.questions) {
        const qid   = question.Question_ID;
        const entry = userAnswers[qid];
        if (!entry || entry.posture !== TC.POSTURE.AFFIRMED) continue;
        for (const ans of (entry.answers ?? [])) {
            const label = getTheologicalLabel(qid, ans);
            if (label) labels.push({ label, C: entry.C ?? 0, T: entry.T ?? 2, qid });
        }
    }
    return labels.sort((a, b) => b.C - a.C);
}

/**
 * Main entry point: compute all denomination rankings + user profile data.
 * Stores results in state.results and returns the results object.
 */
function computeAllResults() {
    // Only score questions the user was actually asked
    const activeQids = new Set(state.questions.map(q => q.Question_ID));

    const rankings = theoData.denominations.map(denom => ({
        denomination: denom,
        similarity:   computeTotalSimilarity(denom, activeQids)
    }));
    rankings.sort((a, b) => b.similarity - a.similarity);

    const userDimCoords = computeDimCoords(state.userAnswers, activeQids);
    const userTolerance = computeToleranceScore(state.userAnswers);
    const userLabels    = buildLabelProfile(state.userAnswers);

    state.results = {
        rankings,
        userDimCoords,
        userTolerance,
        userLabels,
        mode: state.mode
    };
    return state.results;
}

/**
 * Compute dimension coordinates for one denomination (for the compass plot).
 * Pass denomination.doctrines as profileAnswers, restricted to active qids.
 */
function computeDenomDimCoords(denomination, activeQids = null) {
    // Reformat doctrines into the same shape as userAnswers for reuse
    const profile = {};
    for (const [qid, doc] of Object.entries(denomination.doctrines ?? {})) {
        if (!doc?.answers?.length) continue;
        profile[qid] = {
            answers: doc.answers,
            C:       doc.C ?? 0,
            T:       doc.T ?? 2,
            posture: TC.POSTURE.AFFIRMED
        };
    }
    return computeDimCoords(profile, activeQids);
}

// =============================================
// IX. QUIZ FLOW
// =============================================

/**
 * Initialise the quiz for a given mode.
 * mode: 'quick' (30q pre-demo) | 'standard' | 'deep'
 */
function initQuiz(mode = 'quick') {
    state.userAnswers = {};
    state.currentIdx  = 0;
    state.results     = null;
    state.mode        = mode;

    const sequence    = theoData.quizSequences[mode] ?? theoData.quizSequences['quick'];
    const questionMap = Object.fromEntries(
        theoData.questions.map(q => [q.Question_ID, q])
    );
    state.questions = sequence.map(qid => questionMap[qid]).filter(Boolean);

    console.log(`TheoCompass initialised — mode: ${mode} | questions: ${state.questions.length}`);
    renderLanding();
}

/** Record an affirmed answer from the user. */
function submitAnswer(qid, answers, C, T) {
    state.userAnswers[qid] = {
        answers: Array.isArray(answers) ? answers : [answers],
        C:       Number(C),
        T:       Number(T),
        posture: TC.POSTURE.AFFIRMED
    };
}

/**
 * Record a silence response.
 * posture: 'apathetic' or 'hostile'
 * C and T are auto-set per methodology spec.
 */
function submitSilence(qid, posture) {
    const C = posture === TC.POSTURE.HOSTILE ? 3 : 0;
    const T = posture === TC.POSTURE.HOSTILE ? 1 : 2;
    state.userAnswers[qid] = { answers: [], C, T, posture };
}

/** Returns the current question object, or null if quiz is complete. */
function getCurrentQuestion() {
    return state.questions[state.currentIdx] ?? null;
}

/** Returns progress info for the progress bar. */
function getProgress() {
    const total   = state.questions.length;
    const current = state.currentIdx + 1;
    return {
        current,
        total,
        percent: Math.round((current / total) * 100)
    };
}

/** Advance to the next question, or finalise if at the end. */
function advanceQuestion() {
    if (state.currentIdx < state.questions.length - 1) {
        state.currentIdx++;
        renderQuestion(getCurrentQuestion());
    } else {
        finalizeQuiz();
    }
}

/** Go back to the previous question. */
function goBackQuestion() {
    if (state.currentIdx > 0) {
        state.currentIdx--;
        renderQuestion(getCurrentQuestion());
    }
}

/** Compute all results and trigger the results view. */
function finalizeQuiz() {
    const results = computeAllResults();
    renderResults(results);
}

// =============================================
// X. UI HOOKS  (override in ui.js — do not edit here)
// =============================================
function renderLanding()          { console.warn('[TheoCompass] renderLanding() not implemented'); }
function renderQuestion(question) { console.warn('[TheoCompass] renderQuestion() not implemented', question?.Question_ID); }
function renderResults(results)   { console.warn('[TheoCompass] renderResults() not implemented —', results?.rankings?.length, 'denominations ranked'); }

// =============================================
// XI. ENTRY POINT
// =============================================
document.addEventListener('DOMContentLoaded', () => initQuiz('quick'));
