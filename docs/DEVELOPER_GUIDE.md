# TheoCompass: Developer Onboarding Guide

Welcome to the TheoCompass project! This document outlines the backend architecture, data flow, and current state of the application. 

## 1. High-Level Overview
TheoCompass is a highly nuanced theological alignment tool. Unlike standard personality quizzes, it calculates a user's alignment with over 230 Christian denominations based on 3 dimensions for every question:
1. **The Stance:** What they believe.
2. **Certainty (C):** How confident they are (0 to 3).
3. **Tolerance (T):** How they view Christians who disagree (0 to 4).

Because the math to calculate Euclidean distances across 120 questions for 230 denominations is highly complex, our backend is designed to run efficiently on a hybrid **Cloudflare D1 + KV** architecture, utilizing V8 isolates to keep API response times lightning fast.

## 2. Tech Stack
We are using a modern, serverless edge stack:
* **Frontend:** Next.js (React, Tailwind CSS, TypeScript) hosted on Cloudflare Pages.
* **Backend API:** Cloudflare Workers (TypeScript).
* **Database:** Cloudflare D1 (Serverless SQLite) for relational data and querying.
* **Cache:** Cloudflare KV Cache for storing precomputed denomination mathematical baselines.
* **Data Pipeline (ETL):** Node.js (`build_precomputed.js`) and Python (`generate_sql_seed.py`) scripts.

## 3. The Data Pipeline (How Data gets to the DB)
The "source of truth" for this project is a series of master CSV files managed by the domain expert. 
* **Step 1:** Raw CSVs containing questions, answers, and scoring matrices are edited.
* **Step 2:** `node scripts/build_precomputed.js` runs heavy mathematical models to format distance arrays, and writes `denomination_profiles.json`.
* **Step 3:** `python scripts/generate_sql_seed.py` merges the relational data into a massive `seed.sql` file.
* **Step 4:** The `seed.sql` file is executed against D1, and the `denomination_profiles.json` is uploaded to KV via Wrangler.

## 4. Database Schema Summary
The D1 SQLite database contains several key tables:
* `questions`: Holds the question text, categories, and sequencing flags.
* `answer_options`: Holds the answers linked to `question_id` and their theological labels.
* `denominations`: Holds denomination metadata (names, families, descriptions).
* `denomination_answers` / `denomination_selected_options`: Normalized tables handling how every denomination effectively answered the quiz (including split answers) and their historical Certainty/Tolerance.
* `answer_scoring` / `hidden_dimensions`: The mathematical weights for the backend calculation engine.
* `denomination_compass_coordinates`: Precomputed dimensions for Scattermaps.

## 5. The API (Cloudflare Worker)
The Worker (`theocompass-api/src/index.ts`) connects the Next.js frontend to D1 and KV.
**Current Endpoints:**
* `GET /api/questions?mode=quick`: Dynamically fetches the quiz questions and nested answers based on the selected mode.
* `GET /api/coordinates`: Serves the precomputed dimensional data for the frontend chart visualizations.
* `GET /api/dev/profile?id=DENOM_XXX`: Pulls a specific denomination's answers directly from D1 (used for dev testing).
* `POST /api/calculate`: **The Core Engine.** Receives the user's answers, fetches the mathematical baselines for the 230 denominations directly from **KV Memory**, pulls the user scoring math from D1, runs the 13-dimensional Euclidean distance algorithm (applying Posture Amplifiers and Schism Drag), and returns the Top 10 matches with formatted 13-axis coordinates and theological labels.

## 6. Frontend State & Silence Logic
The frontend tracks user progress in a Next.js client component (`userAnswers` state). A unique mechanic is the **Silence options**, which bypass the standard Certainty/Tolerance sliders and auto-inject specific logic directly into the payload:
* **Apathetic Silence** ("Not relevant to me"): Injects Certainty 0, Tolerance 2. 
* **Hostile Silence** ("I reject this framing"): Injects Certainty 3, Tolerance 1. 
The backend handles these automatically, forcing neutral coordinates (50) and applying amplified distance penalties.

## 7. Dev Tools (Auto-Finish)
To speed up testing the Results UI without clicking through 30+ questions, the frontend includes a hidden Developer Tool. 
* Open the **Restart** modal from the header.
* Type the secret code: `mod`.
* Click **Unlock Dev Tools**.
This allows you to either generate random dummy answers or pull a specific denomination's perfect profile from D1 to ensure the match percentage equals 100%.

## 8. Current Status & Next Immediate Tasks
The core backend pipeline, D1 database, KV cache, Euclidean calculation engine, and Results Dashboard are fully operational. The backend is perfectly parsing split answers, descriptions, and scaling tolerance correctly.

### Next Immediate Tasks (Where we are now):
1. **Wiki / Deep Dive Pages:** 
   Build dynamic routes (e.g., `/denomination/[id]`) so users can click on a Top 10 result and see a side-by-side comparison of exactly *how* that denomination answered the questions compared to the user.
2. **Open Beta Database Expansion:**
   Transition the system from the 30 "Pre-Demo" denominations to the full 230+ master list. Monitor the `Math CPU Time` logged in the Cloudflare Worker to ensure the loop stays well under execution limits.
3. **Standard & Deep Modes:**
   The frontend currently locks users into the 30-question "Quick" mode. Unlock the "Standard" (70 Qs) and "Deep" (120 Qs) modes by ensuring the frontend correctly passes the URL parameters to the API.
4. **Mobile Optimization & Polish:**
   Review all UI elements (especially the 12-axis diverging chart and Recharts tooltips) on mobile viewports to ensure scaling and touch targets are optimal.
