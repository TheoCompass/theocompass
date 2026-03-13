"use client";

import { useState } from "react";
import Link from "next/link";
import CompassChart from "./CompassChart"; // adjust path if you put it in a subfolder


// --- TYPES ---
interface Answer {
  id: string;
  text: string;
  desc: string;
}

interface Question {
  id: string;
  category: string;
  question: string;
  answers: Answer[];
}

// Track the user's choices
interface UserResponse {
  questionId: string;
  answerId: string;
  certainty: number;
  tolerance: number;
  isSilence: boolean;
  silenceType?: "apathetic" | "hostile";
}


// --- CHART CONFIGURATION ---
const AXIS_LABELS: Record<string, { left: string, right: string, desc: string }> = {
  theolconslib: { left: "Progressive", right: "Orthodox", desc: "View of scripture, tradition, and orthodoxy" },
  socialconslib: { left: "Liberal", right: "Conservative", desc: "Stance on ethics, gender, and society" },
  counterpromodern: { left: "Accommodating", right: "Counter-Cultural", desc: "Relationship to secular culture" },
  supernat: { left: "Naturalistic", right: "Supernatural", desc: "Expectation of miracles and spiritual forces" },
  cultsepeng: { left: "Engaged", right: "Separatist", desc: "Approach to worldly institutions and politics" },
  clericegal: { left: "Egalitarian", right: "Hierarchical", desc: "Church governance and ordination" },
  divhumagency: { left: "Human Free Will", right: "Divine Sovereignty", desc: "The mechanics of salvation (Arminian/Calvinist)" },
  communindiv: { left: "Individualist", right: "Communitarian", desc: "Focus of faith and church life" },
  liturgspont: { left: "Spontaneous", right: "Liturgical", desc: "Style and structure of worship" },
  sacramfunct: { left: "Functional/Symbolic", right: "Sacramental", desc: "Efficacy of Baptism and Communion" },
  literalcrit: { left: "Critical", right: "Literal", desc: "Method of reading the Bible" },
  intellectexper: { left: "Experiential", right: "Intellectual", desc: "Primary mode of knowing God" }
};

// --- NEW COMPONENT: Expandable Denomination Card ---
export function DenominationCard({ denom, rank }: { denom: any, rank: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-3 overflow-hidden transition-all duration-200 hover:border-slate-300">
      <div 
        className="p-4 flex justify-between items-center cursor-pointer select-none bg-white hover:bg-slate-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <div className="text-slate-300 font-bold w-4">{rank}.</div>
          <div>
            <h4 className={`font-bold text-slate-800 transition-colors ${isOpen ? "text-blue-700" : "group-hover:text-blue-700"}`}>
              {denom.name}
            </h4>
            <div className="text-xs text-slate-500">{denom.family}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="font-bold text-lg text-slate-700 bg-slate-50 px-3 py-1 rounded-lg">
            {denom.matchPercentage}%
          </div>
          <div className={`text-slate-400 transform transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50">
          <div className="flex gap-4 mt-3 mb-3 text-xs text-slate-500 font-mono">
            {denom.founded_year && <span>🗓 Founded: {denom.founded_year}</span>}
            {denom.region_origin && <span>🌍 Origin: {denom.region_origin}</span>}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            {denom.description || "No description available for this tradition."}
          </p>
        </div>
      )}
    </div>
  );
}



export default function QuizPage() {
  // --- APP STATE ---
  const [currentView, setCurrentView] = useState<"mode-select" | "instructions" | "quiz" | "results">("mode-select");
  const [selectedMode, setSelectedMode] = useState<"quick" | "standard" | "deep" | null>(null);

  // --- DATA STATE ---
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- QUIZ STATE ---
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, UserResponse>>({}); // Stores all answers

  // --- RESULTS STATE ---
  const [results, setResults] = useState<any[]>([]);
  const [userCoords, setUserCoords] = useState<Record<string, number>>({});
  const [userTolerance, setUserTolerance] = useState<number>(50);

  const [isCalculating, setIsCalculating] = useState(false);
  
  // Current question temporary state
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [isSilenceSelected, setIsSilenceSelected] = useState(false);
  const [silenceType, setSilenceType] = useState<"apathetic" | "hostile" | null>(null);
  
  const [certainty, setCertainty] = useState(2); 
  const [tolerance, setTolerance] = useState(2); 

  // --- DERIVED VARIABLES ---
  const totalQuestions = questions.length;
  const currentQuestion = questions[currentQuestionIndex];
  const progressPercentage = totalQuestions > 0 ? ((currentQuestionIndex) / totalQuestions) * 100 : 0;
  const hasPrimaryKeyword = currentQuestion?.question.toLowerCase().includes("primary");

  // Helper arrays for sliders
  const certaintyLabels = ["Not Sure", "Leaning", "Pretty Sure", "Certain"];
  const certaintyTextColors = ["text-slate-400", "text-sky-500", "text-blue-600", "text-brand-dark"];
  const toleranceLabels = ["Salvation Issue", "Opposed", "Discerning", "Charitable", "Accepting"];

  // --- HANDLERS ---
  const startInstructions = async (mode: "quick" | "standard" | "deep") => {
    setSelectedMode(mode);
    setCurrentView("instructions");
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://127.0.0.1:8787/api/questions?mode=${mode}`);
      if (!response.ok) throw new Error("Failed to fetch questions");
      
      const data = await response.json();
      setQuestions(data);
    } catch (err) {
      console.error(err);
      setError("Could not load questions. Make sure your database API is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const startQuiz = () => setCurrentView("quiz");

  const handleStandardAnswerClick = (answerId: string) => {
    setSelectedAnswer(answerId);
    setIsSilenceSelected(false);
    setSilenceType(null);
    setCertainty(2); // Default
    setTolerance(2); // Default
  };

  const handleSilenceClick = (type: "apathetic" | "hostile") => {
    setSelectedAnswer(`silence_${type}`); // Fake ID for state logic
    setIsSilenceSelected(true);
    setSilenceType(type);
    
    if (type === "apathetic") {
      setCertainty(0); // Not Sure
      setTolerance(2); // Discerning
    } else if (type === "hostile") {
      setCertainty(3); // Certain
      setTolerance(1); // Opposed
    }
  };

  const toggleInfo = (e: React.MouseEvent, answerId: string) => {
    e.stopPropagation();
    setExpandedInfo(expandedInfo === answerId ? null : answerId);
  };

  const handleNext = async () => {
    // 1. Save the current answer
    const currentQ = questions[currentQuestionIndex];
    const newAnswers = { ...userAnswers };
    
    newAnswers[currentQ.id] = {
      questionId: currentQ.id,
      answerId: selectedAnswer || "skipped",
      certainty,
      tolerance,
      isSilence: isSilenceSelected,
      silenceType: silenceType || undefined
    };
    
    setUserAnswers(newAnswers);

    // 2. Check if we are at the end
    if (currentQuestionIndex < questions.length - 1) {
      // Go to next question
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      
      // Load previous state if it exists, otherwise reset
      const nextQId = questions[currentQuestionIndex + 1].id;
      if (newAnswers[nextQId]) {
        restoreQuestionState(newAnswers[nextQId]);
      } else {
        resetQuestionState();
      }
    } else {
      // WE ARE AT THE END! Time to calculate.
      setIsCalculating(true);
      setCurrentView("results");
      
      try {
        const res = await fetch("http://127.0.0.1:8787/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newAnswers)
        });
        
        const data = await res.json();
        
      if (data.status === "success") {
        setResults(data.matches); 
        setUserCoords(data.userDimCoords || {});
        setUserTolerance(data.userTolerance ?? 50);

      }

         else {
          console.error("Calculation failed");
        }
      } catch (error) {
        console.error("API error:", error);
      } finally {
        setIsCalculating(false);
      }
    }
  };

  // ==========================================
  // DEV HELPER: Auto-fill and calculate
  // ==========================================
  const handleDevAutoFill = async () => {
    const dummyAnswers: Record<string, UserResponse> = {};
    
    // Loop through all questions and pick a random answer 
    questions.forEach((q) => {
      const randomAnswerIndex = Math.floor(Math.random() * q.answers.length);
      
      // Generate a random certainty (0 to 3)
      const randomCertainty = Math.floor(Math.random() * 4);
      
      // Generate a random tolerance (0 to 4)
      const randomTolerance = Math.floor(Math.random() * 5);

      dummyAnswers[q.id] = {
        questionId: q.id,
        answerId: q.answers[randomAnswerIndex].id, 
        certainty: randomCertainty,
        tolerance: randomTolerance,
        isSilence: false
      };
    });


    // Update state to hold the dummy answers
    setUserAnswers(dummyAnswers);
    
    // Switch UI directly to results
    setIsCalculating(true);
    setCurrentView("results");

    console.log("DEV PAYLOAD:", dummyAnswers);
    
    try {
      const res = await fetch("http://127.0.0.1:8787/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dummyAnswers)
      });
      
      const data = await res.json();
      console.log("SERVER RESPONSE:", data);
      
      if (data.status === "success") {
        setResults(data.matches); 
        setUserCoords(data.userDimCoords || {});
        setUserTolerance(data.userTolerance || 50);
      }

       else {
        console.error("Calculation failed:", data.error);
      }
    } catch (error) {
      console.error("Failed to calculate:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      const prevQId = questions[currentQuestionIndex - 1].id;
      restoreQuestionState(userAnswers[prevQId]);
    }
  };

  const resetQuestionState = () => {
    setSelectedAnswer(null);
    setExpandedInfo(null);
    setIsSilenceSelected(false);
    setSilenceType(null);
    setCertainty(2);
    setTolerance(2);
  };

  const restoreQuestionState = (savedAns: UserResponse) => {
    setSelectedAnswer(savedAns.answerId);
    setCertainty(savedAns.certainty);
    setTolerance(savedAns.tolerance);
    setIsSilenceSelected(savedAns.isSilence);
    setSilenceType(savedAns.silenceType || null);
    setExpandedInfo(null);
  };

  // ==========================================
  // VIEW 1: MODE SELECT
  // ==========================================
  if (currentView === "mode-select") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <header className="bg-white border-b border-slate-200 p-4 text-center shadow-sm">
          <Link href="/" className="font-serif font-bold text-blue-900 text-xl">TheoCompass</Link>
        </header>
        <main className="flex-grow flex flex-col items-center justify-center p-6 max-w-4xl mx-auto">
          <h1 className="font-serif text-3xl md:text-5xl font-bold mb-4 text-center">Select Quiz Mode</h1>
          <p className="text-slate-600 mb-10 text-center max-w-xl">Choose how deep you want to go into the theological landscape. The pre-demo version is currently limited to the Quick Match.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            <button onClick={() => startInstructions("quick")} className="bg-white p-6 rounded-2xl border-2 border-blue-900 shadow-md hover:shadow-lg transition-all text-left group">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-2xl group-hover:text-blue-700 transition-colors">Quick</h2>
                <span className="bg-blue-100 text-blue-900 text-xs font-bold px-2 py-1 rounded">30 Qs</span>
              </div>
              <p className="text-slate-500 text-sm">A streamlined overview of the most defining Christian doctrines.</p>
            </button>
            <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 opacity-70 cursor-not-allowed text-left">
              <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-2xl text-slate-400">Standard</h2><span className="bg-slate-200 text-slate-500 text-xs font-bold px-2 py-1 rounded">70 Qs</span></div>
              <p className="text-slate-400 text-sm">The recommended TheoCompass experience.</p>
            </div>
            <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 opacity-70 cursor-not-allowed text-left">
              <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-2xl text-slate-400">Deep</h2><span className="bg-slate-200 text-slate-500 text-xs font-bold px-2 py-1 rounded">120 Qs</span></div>
              <p className="text-slate-400 text-sm">The ultimate theological audit.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: INSTRUCTIONS
  // ==========================================
  if (currentView === "instructions") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <header className="bg-white border-b border-slate-200 p-4 text-center shadow-sm">
          <span className="font-serif font-bold text-blue-900 text-xl">TheoCompass</span>
        </header>
        <main className="flex-grow p-6 max-w-2xl mx-auto w-full flex flex-col">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm mt-8">
            <h1 className="font-serif text-3xl font-bold mb-6 text-blue-900">How to navigate the quiz</h1>
            <div className="space-y-6 text-slate-600 mb-8">
              <p>TheoCompass measures not just <em>what</em> you believe, but <em>how</em> you hold those beliefs. For each question:</p>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-2">1. Select your Stance</h3>
                <p className="text-sm">Choose the answer that best represents your view. Use the <span className="inline-block w-5 h-5 bg-slate-200 text-center rounded-full text-xs font-serif italic mx-1">i</span> button if you need a detailed definition.</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="font-bold text-blue-700 mb-2">2. Set your Certainty</h3>
                <p className="text-sm">How confident are you in this specific belief? (Not Sure → Certain)</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="font-bold text-red-600 mb-2">3. Set your Tolerance</h3>
                <p className="text-sm">What is your posture toward other Christians who disagree with you? Is it a "Salvation Issue", or are you "Accepting"?</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-2">4. Or, Choose Silence</h3>
                <p className="text-sm mb-2">If a question does not fit your theology, you can bypass the sliders entirely:</p>
                <ul className="text-sm space-y-2">
                  <li><span className="font-medium text-slate-700">Apathetic Silence:</span> The topic isn't relevant to you. This creates a soft, neutral stance (low certainty, medium tolerance).</li>
                  <li><span className="font-medium text-slate-700">Hostile Silence:</span> You fundamentally reject the question's premise. This creates a strong penalty against denominations that affirm it (high certainty, low tolerance).</li>
                </ul>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm text-center">
                {error} <br/>
                <button onClick={() => startInstructions(selectedMode!)} className="mt-2 underline font-bold">Try Again</button>
              </div>
            )}

            <button 
              onClick={startQuiz} 
              disabled={isLoading || !!error}
              className={`w-full py-4 rounded-xl font-bold shadow-md transition-all text-lg ${
                isLoading || error ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-blue-900 hover:bg-blue-800 text-white"
              }`}
            >
              {isLoading ? "Loading Database..." : error ? "Database Error" : "I understand, let's begin"}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW 4: RESULTS DASHBOARD
  // ==========================================
  // WE PUT THIS BEFORE THE QUIZ VIEW
  if (currentView === "results") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <header className="bg-white border-b border-slate-200 p-4 text-center shadow-sm">
          <Link href="/" className="font-serif font-bold text-blue-900 text-xl">TheoCompass</Link>
        </header>

        <main className="flex-grow p-4 md:p-8 max-w-4xl mx-auto w-full flex flex-col">
          {isCalculating ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-6">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-800 rounded-full animate-spin"></div>
              <h2 className="text-xl font-serif font-bold text-slate-700 animate-pulse">Calculating 12-Dimensional Alignment...</h2>
              <p className="text-sm text-slate-500 text-center max-w-md">Running Euclidean distances, applying posture amplifiers, and factoring schism drag across 230 denominations.</p>
            </div>
          ) : (
            <div className="animate-fade-in-up">
              <div className="text-center mb-10">
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Your Results</span>
                <h1 className="font-serif text-3xl md:text-5xl font-bold mt-4 mb-4 text-slate-900">Your Theological Matches</h1>
                <p className="text-slate-600 max-w-xl mx-auto">Based on your stances, certainty, and tolerance, here are the historical and modern traditions that most closely align with your theological framework.</p>
              </div>

              {/* TOP MATCH - Highlighted */}
              {results.length > 0 && (
                <div className="bg-white rounded-2xl border-2 border-blue-600 shadow-xl overflow-hidden mb-8 relative">
                  <div className="absolute top-0 right-0 bg-blue-600 text-white font-bold px-4 py-1 rounded-bl-lg text-sm shadow-sm">
                    #1 Match
                  </div>
                  
                  {/* Top Header Section */}
                  <div className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 border-b border-slate-100">
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{results[0].family}</div>
                      <h2 className="font-serif text-2xl md:text-4xl font-bold text-blue-900">{results[0].name}</h2>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-blue-50 rounded-full w-32 h-32 border-4 border-blue-100 shrink-0 shadow-inner">
                      <span className="text-3xl font-bold text-blue-700">{results[0].matchPercentage}%</span>
                      <span className="text-xs text-blue-500 uppercase font-bold tracking-widest mt-1">Match</span>
                    </div>
                  </div>

                  {/* Description Section */}
                  <div className="bg-slate-50 p-6 md:p-8">
                    <div className="flex gap-4 mb-4 text-xs text-slate-500 font-mono">
                      {results[0].founded_year && <span>🗓 Founded: {results[0].founded_year}</span>}
                      {results[0].region_origin && <span>🌍 Origin: {results[0].region_origin}</span>}
                    </div>
                    <p className="text-slate-700 text-base md:text-lg leading-relaxed font-medium">
                      {results[0].description || "No description available for this tradition."}
                    </p>
                  </div>
                </div>
              )}


              {/* RUNNER UPS - Accordion List */}
              <h3 className="font-bold text-slate-800 mb-4 text-lg border-b pb-2">Runner-Up Traditions</h3>
              <div className="flex flex-col gap-2">
                {results.slice(1).map((denom: any, index: number) => (
                  <DenominationCard key={denom.id} denom={denom} rank={index + 2} />
                ))}
              </div>


                            {/* THEOLOGICAL FINGERPRINT (12-AXIS CHART) */}
              <div className="mt-12 mb-8">
                <h3 className="font-serif text-2xl font-bold text-slate-800 mb-2">Your Theological Fingerprint</h3>
                <p className="text-slate-600 mb-8 text-sm">This diverging chart maps your calculated position across the 12 hidden dimensions of Christian theology, plus your overall dogmatism.</p>
                
                <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6">
                  
                  {/* The 12 Dimensions */}
                  {Object.entries(AXIS_LABELS).map(([key, labels]) => {
                    const score = userCoords[key];
                    if (score === undefined || score === null) return null; // Skip if no data
                    
                    // New (100→0 left→right to match compass)
                    const isRight = score <= 50;  // Changed: 0 = Traditional = RIGHT
                    const strength = isRight ? (50 - score) : (score - 50);  // Changed: strength from center
                    const barWidth = `${(strength / 50) * 100}%`;
                    
                    return (
                      <div key={key} className="flex flex-col relative group">
                        {/* Labels */}
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 z-10 px-1">
                          <span className={!isRight ? "text-blue-700" : ""}>{labels.left}</span>
                          <span className={isRight ? "text-blue-700" : ""}>{labels.right}</span>
                        </div>
                        
                        {/* Background Track */}
                        <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
                          {/* Center Line */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-300 z-10"></div>
                          
                          {/* Left Half (0-50) */}
                          <div className="w-1/2 h-full relative flex justify-end">
                            {!isRight && (
                              <div 
                                className="h-full bg-blue-500 rounded-l-full" 
                                style={{ width: barWidth }}
                              ></div>
                            )}
                          </div>
                          
                          {/* Right Half (50-100) */}
                          <div className="w-1/2 h-full relative flex justify-start">
                            {isRight && (
                              <div 
                                className="h-full bg-blue-700 rounded-r-full" 
                                style={{ width: barWidth }}
                              ></div>
                            )}
                          </div>
                        </div>

                        {/* Tooltip on Hover */}
                        <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-3 py-1 rounded shadow-lg whitespace-nowrap z-20">
                          {labels.desc} ({score}/100)
                        </div>
                      </div>
                    );
                  })}

                  <hr className="my-2 border-slate-200" />

                  {/* The 13th Axis: Tolerance / Posture - Dogmatic on RIGHT */}
                  <div className="flex flex-col relative group pt-2">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 z-10 px-1">
                      <span className={userTolerance >= 50 ? "text-amber-600" : ""}>Accepting / Open</span>
                      <span className={userTolerance <= 50 ? "text-amber-600" : ""}>Dogmatic / Strict</span>
                    </div>
                    <div className="relative w-full h-5 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-300 z-10"></div>
                      
                      {/* LEFT SIDE: Accepting (high scores extend LEFT) */}
                      <div className="w-1/2 h-full relative flex justify-end ">
                        {userTolerance >= 50 && (
                          <div 
                            className="h-full bg-amber-500 rounded-l-full" 
                            style={{ width: `${((userTolerance - 50) / 50) * 100}%` }}
                          />
                        )}
                      </div>
                      
                      {/* RIGHT SIDE: Dogmatic (low scores extend RIGHT) */}
                      <div className="w-1/2 h-full relative flex justify-start ">
                        {userTolerance <= 50 && (
                          <div 
                            className="h-full bg-amber-500 rounded-r-full" 
                            style={{ width: `${((50 - userTolerance) / 50) * 100}%` }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-3 py-1 rounded shadow-lg whitespace-nowrap z-20">
                      Overall Theological Posture ({userTolerance}/100)
                    </div>
                  </div>

                </div>
              </div>

              {/* 2D SCATTER PLOT */}
              <CompassChart userCoords={userCoords} userTolerance={userTolerance} />




              {/* Next Steps / Features Coming Soon */}
              <div className="mt-12 bg-slate-100 p-6 rounded-xl border border-slate-200 text-center">
                <h4 className="font-bold text-slate-700 mb-2">Deep Dive Visualizations</h4>
                <p className="text-sm text-slate-500 mb-4">The Theological Compass (12-Axis Diverging Bar Chart) and Deep Comparison Heatmaps are coming soon.</p>
                <button className="bg-white border border-slate-300 text-slate-600 px-6 py-2 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors" onClick={() => window.location.reload()}>
                  Take the Quiz Again
                </button>
              </div>

            </div>
          )}
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: THE ACTUAL QUIZ (Fallback View)
  // ==========================================
  if (!currentQuestion) return <div className="p-10 text-center">Error: No question data found.</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex justify-between items-center">
            <Link href="/" className="font-serif font-bold text-blue-900 text-lg">TheoCompass</Link>
            
            {/* DEV BUTTON START */}
            <button 
              onClick={handleDevAutoFill} 
              className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded border border-red-300 hover:bg-red-200"
            >
              🐛 DEV: Auto-Finish
            </button>
            {/* DEV BUTTON END */}

            <span className="text-sm font-bold text-slate-500 bg-slate-100 py-1 px-3 rounded-full">
              Q {currentQuestionIndex + 1} of {totalQuestions}
            </span>
          </div>
        <div className="w-full h-1.5 bg-slate-100">
          <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }}></div>
        </div>
      </header>

      <main className="flex-grow w-full max-w-2xl mx-auto px-4 py-8 md:py-12 flex flex-col">
        <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">
          Category: {currentQuestion.category}
        </div>
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-slate-900 mb-8 leading-snug">
          {currentQuestion.question}
        </h1>

        {/* --- STANDARD ANSWERS --- */}
        <div className="flex flex-col gap-3 mb-6">
          {currentQuestion.answers.map((ans) => {
            const isSelected = selectedAnswer === ans.id;
            const isInfoOpen = expandedInfo === ans.id;
            return (
              <div key={ans.id} className="flex flex-col">
                <button
                  onClick={() => handleStandardAnswerClick(ans.id)}
                  className={`text-left p-4 rounded-xl border-2 transition-all flex justify-between items-center ${
                    isSelected ? "border-blue-600 bg-blue-50 shadow-md" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span className={`font-medium pr-4 ${isSelected ? "text-blue-800" : "text-slate-700"}`}>{ans.text}</span>
                  <div 
                    onClick={(e) => toggleInfo(e, ans.id)}
                    className={`min-w-8 min-h-8 w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${
                      isInfoOpen ? "bg-blue-600 text-white border-blue-600" : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    <span className="text-sm font-serif italic">i</span>
                  </div>
                </button>
                {isInfoOpen && (
                  <div className="mt-2 p-4 bg-white rounded-lg text-sm text-slate-600 border border-slate-200 shadow-inner">
                    <strong className="text-slate-800">Further Context:</strong> <br/>{ans.desc}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* --- SILENCE OPTIONS --- */}
        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <button 
            onClick={() => handleSilenceClick("apathetic")}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
              silenceType === "apathetic" ? "bg-slate-200 border-slate-400 text-slate-800 shadow-inner" : "bg-transparent border-slate-300 text-slate-500 hover:bg-slate-100"
            }`}
          >
            Apathetic Silence
            <span className="block text-xs font-normal opacity-70 mt-1">Not theologically relevant to me.</span>
          </button>

          <button 
            onClick={() => handleSilenceClick("hostile")}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
              silenceType === "hostile" ? "bg-red-50 border-red-300 text-red-800 shadow-inner" : "bg-transparent border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
            }`}
          >
            Hostile Silence
            <span className="block text-xs font-normal opacity-70 mt-1">I reject this question's framing.</span>
          </button>
        </div>

        {/* --- CERTAINTY / TOLERANCE SLIDERS --- */}
        {selectedAnswer && !isSilenceSelected && (
          <div className="bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm mb-8 animate-fade-in-up">
            <div className="mb-10">
              <p className="text-sm text-slate-500 italic mb-3">How confident are you in this particular stance?</p>
              <div className="flex justify-between text-sm mb-2 font-medium">
                <span className="text-slate-800 font-bold">Certainty</span>
                <span className={`font-bold ${certaintyTextColors[certainty]}`}>{certaintyLabels[certainty]}</span>
              </div>
              <input type="range" min="0" max="3" step="1" value={certainty} onChange={(e) => setCertainty(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
              <div className="flex justify-between text-xs text-slate-400 mt-2 px-1"><span>Not Sure</span><span>Leaning</span><span>Pretty Sure</span><span>Certain</span></div>
            </div>
            <div>
              <p className="text-sm text-slate-500 italic mb-3">{hasPrimaryKeyword ? "What posture do you have toward Christians who disagree that your view should be primary?" : "What posture do you have toward Christians who disagree with you?"}</p>
              <div className="flex justify-between text-sm mb-2 font-medium">
                <span className="text-slate-800 font-bold">Tolerance</span>
                <span className={`font-bold ${
                  tolerance === 0 ? "text-red-600" : 
                  tolerance === 1 ? "text-orange-500" : 
                  tolerance === 2 ? "text-yellow-600" : 
                  tolerance === 3 ? "text-green-500" : "text-emerald-600"
                }`}>{toleranceLabels[tolerance]}</span>
              </div>
              <input type="range" min="0" max="4" step="1" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
              <div className="flex justify-between text-xs text-slate-400 mt-2 px-1"><span>Issue</span><span>Opposed</span><span>Discern</span><span>Charity</span><span>Accept</span></div>
            </div>
          </div>
        )}

        {/* --- NAVIGATION FOOTER --- */}
        <div className="mt-auto pt-4 pb-8 flex justify-between items-center border-t border-slate-200">
          <button onClick={handleBack} className={`font-bold text-slate-500 hover:text-blue-700 transition-colors ${currentQuestionIndex === 0 ? "invisible" : ""}`}>← Back</button>
          <button 
            onClick={handleNext} 
            disabled={!selectedAnswer && !isSilenceSelected} 
            className={`py-3 px-8 rounded-full font-bold text-lg transition-all ${(selectedAnswer || isSilenceSelected) ? "bg-slate-900 text-white hover:bg-black shadow-lg hover:-translate-y-1" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
          >
            {currentQuestionIndex === questions.length - 1 ? "See Results" : "Next →"}
          </button>
        </div>
      </main>
    </div>
  );
}
