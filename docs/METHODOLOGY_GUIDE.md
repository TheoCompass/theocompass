# TheoCompass: Data Methodology & Mathematics Guide

Welcome! If you are a developer, data scientist, or just a curious contributor, this guide explains *how* TheoCompass calculates theological alignment. 

Unlike a simple "Buzzfeed-style" quiz that assigns points to buckets (e.g., +1 to Catholic, +1 to Baptist), TheoCompass uses a highly nuanced, multi-dimensional geometric model.

## 1. The Core Concept: The 12 Hidden Dimensions
Every question in the quiz does not map directly to a denomination. Instead, every answer option maps to coordinates on a 12-dimensional theological grid. 

These axes include:
1. Theological Conservative vs. Liberal
2. Social Conservative vs. Liberal
3. Counter-Modernity vs. Pro-Modernity
4. Supernatural vs. Natural
5. Cultural Separation vs. Cultural Engagement
6. Clerical vs. Egalitarian
7. Divine Agency vs. Human Agency
8. Communal vs. Individual
9. Liturgical vs. Spontaneous
10. Sacramental vs. Functional
11. Literal vs. Critical (Hermeneutics)
12. Intellectual vs. Experiential

**Example:**
If a user answers "Water baptism is a means of grace that directly causes new birth," that answer has specific, pre-assigned mathematical values across these dimensions (e.g., highly Sacramental, highly Clerical).

## 2. The 3 User Inputs (Per Question)
For every question, the user provides three pieces of data:
1. **The Stance (A):** The actual answer they chose.
2. **Certainty (C):** How confident they are (Scale of 0 to 3).
3. **Tolerance (T):** How strictly they require others to agree (Scale of 0 to 4).

## 3. The "Silence" Mechanics (Edge Cases)
TheoCompass features unique "Silence" buttons to handle questions the user cannot or will not answer. These bypass the standard C and T sliders:
*   **Apathetic Silence ("Not relevant to me"):** The user skips the question. The system assigns a neutral stance (Dimension score = 50) and forces `Certainty: 0` and `Tolerance: 2`. This creates a soft, moderate mismatch.
*   **Hostile Silence ("I reject this framing"):** The user rejects the premise of the question entirely. The system assigns a neutral stance (50) but forces `Certainty: 3` and `Tolerance: 1`. If a denomination strongly affirms this question, the Hostile Silence creates a *massive* mathematical penalty against that denomination.

## 4. The Precomputed Denomination Baselines
In the `/data` folder, we have the "Source of Truth" CSVs. We have manually graded over 230 denominations on how they answer the 120 questions, including their historical levels of Certainty and Tolerance. 

Because calculating 230 denominations against 120 questions across 12 dimensions in real-time is too computationally expensive for the edge, we use an **ETL script (`node build_precomputed.js`)**.

**What the Precompute Script Does:**
It takes the raw CSVs and outputs pre-calculated "Scattermap Coordinates" (averaging out each denomination's exact position on the 12-dimensional grid). These are saved in `denomination_mode_summary.csv` and loaded into the database for the frontend to use in charting.

## 5. The Distance Algorithm (The Calculation Engine)
When a user finishes the quiz, we calculate their "distance" from every denomination in the database. 

1.  **Retrieve Positional Scores:** We convert both the User's answer and the Denomination's answer into their 12-dimension coordinates.
2.  **Raw Distance:** We calculate the absolute distance between the user and the denomination on each relevant dimension.
3.  **Apply Posture Amplifiers:** This is the secret sauce. The distance is mathematically multiplied by the *Certainty* and *Tolerance* of both the User and the Denomination. 
    *   *If both are highly certain and highly intolerant, the penalty for disagreeing is massively multiplied.*
    *   *If both are uncertain and highly tolerant, the penalty for disagreeing is minimized.*
4.  **Schism Drag (Split Views):** If a denomination officially holds multiple acceptable views on a topic (e.g., Anglicans on the Eucharist), the algorithm calculates the distance to *all* accepted views, takes the best match, but applies a slight "Schism Penalty" because the user is entering a divided house.
5.  **Final Blend:** All questions are weighted by a "Priority Score" and summed together to create a final 0-100% similarity match.

## 6. How the API Uses This
When you build the `POST /api/calculate` endpoint, you will:
1. Receive the user's array of answers, Certainty, and Tolerance values.
2. Fetch the denomination baseline data from the D1 database.
3. Run the distance algorithm outlined above.
4. Return the Top 10 matches sorted by highest percentage.
