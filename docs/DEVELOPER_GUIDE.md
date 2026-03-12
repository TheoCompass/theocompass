# TheoCompass: Developer Onboarding Guide

Welcome to the TheoCompass project! This document outlines the backend architecture, data flow, and current state of the application. 

## 1. High-Level Overview
TheoCompass is a highly nuanced theological alignment tool. Unlike standard "personality quizzes," it calculates a user's alignment with over 230 Christian denominations based on 3 dimensions for every question:
1. **The Stance:** What they believe.
2. **Certainty (C):** How confident they are (0 to 3).
3. **Tolerance (T):** How they view Christians who disagree (0 to 4).

Because the math to calculate Euclidean distances across 120 questions for 230 denominations is highly complex, our backend is designed to pre-compute as much as possible to keep the user experience lightning fast.

## 2. Tech Stack
We are using a modern, serverless edge stack:
*   **Frontend:** Next.js (React, Tailwind CSS, TypeScript).
*   **Backend API:** Cloudflare Workers (TypeScript) running on V8 Isolates at the edge.
*   **Database:** Cloudflare D1 (Serverless SQLite built on standard SQLite).
*   **Data Pipeline (ETL):** Node.js and Python scripts.

## 3. The Data Pipeline (How Data gets to the DB)
The "source of truth" for this project is a series of master CSV files managed by the domain expert (Oroq). The developer does not need to manage the theological data, but needs to understand how it flows into the app.

**Step 1: Raw Data (`/data`)**
Raw CSVs containing questions, answers, denomination scoring matrices, and quiz sequencing.

**Step 2: Precomputation Engine (`node build_precomputed.js`)**
A Node script reads the CSVs and runs the heavy mathematical models (multi-dimensional alignment averages, pairwise denomination distances). It caches these results into a `/precomputed` folder to save the Cloudflare Worker from doing heavy calculus in real-time.

**Step 3: SQL Seed Generation (`python generate_sql_seed.py`)**
A Python script (using Pandas) merges the raw CSVs and the precomputed CSVs. It handles data cleaning, boolean mapping (converting 'TRUE' to SQLite `1`), and generates a massive `seed.sql` file. It uses `DROP TABLE IF EXISTS` and `CREATE TABLE` to ensure schema consistency.

**Step 4: Database Push**
The `seed.sql` file is executed against the Cloudflare D1 database via Wrangler:
`npx wrangler d1 execute theocompass-db --local --file=./seed.sql`

## 4. Database Schema Summary
The D1 SQLite database contains several key tables:
*   `questions`: Holds the question text and sequencing flags (`include_quick`, `display_order_quick`, etc.).
*   `answer_options`: Holds the answers linked to `question_id`.
*   `denominations`: Holds denomination metadata.
*   `denomination_answers` & `denomination_selected_options`: Holds how every denomination effectively "answered" the quiz.
*   `denomination_compass_coordinates`: The precomputed dimensions for the results dashboard (Scattermap).
*   `answer_scoring` & `hidden_dimensions`: The mathematical weights for the backend calculation engine.

## 5. The API (Cloudflare Worker)
The Worker (`theocompass-api/src/index.ts`) connects the Next.js frontend to the D1 database. 

**Current Endpoints:**
*   `GET /api/questions?mode=quick`: Dynamically fetches the quiz questions and nested answers. It uses SQL `WHERE` clauses (e.g., `WHERE include_quick = 1`) and `ORDER BY` to serve the correct sequence based on the selected quiz mode.
*   `GET /api/coordinates`: Serves the precomputed dimensional data for the frontend chart visualizations.

## 6. Frontend State & "Silence" Logic
The frontend tracks user progress in a Next.js client component (`userAnswers` state). 
A unique mechanic is the "Silence" options, which bypass the standard Certainty/Tolerance sliders and auto-inject specific logic:
*   **Apathetic Silence** ("Not relevant to me"): Injects `Certainty: 0, Tolerance: 2`.
*   **Hostile Silence** ("I reject this framing"): Injects `Certainty: 3, Tolerance: 1`.

## 7. Next Immediate Tasks (Where you come in!)
The pipeline, database, and question-serving API are fully operational. Here is what we need to build next:

1.  **The Calculate Endpoint (`POST /api/calculate`):** 
    We need to build the API endpoint that receives the JSON payload of the user's 30 answers. This endpoint will fetch the denomination baseline data from D1, run the distance algorithm, and return the Top 10 matching denominations.
2.  **Results Dashboard (Frontend):** 
    Build the UI to display the calculated matches, including a 12-axis diverging bar chart and an interactive tag cloud (using Chart.js or similar React libraries).
