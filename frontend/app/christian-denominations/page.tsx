"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import html2canvas from "html2canvas-pro";
import CompassChart from "./CompassChart"; 
import TheologicalLabelCloud from "./TheologicalLabelCloud"; 
import { useRouter } from 'next/navigation';

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

// --- QUIZ CATEGORY LABELS ---
const QUIZ_CATEGORY_LABELS: Record<string, string> = {
  "GOD": "The Nature of God, Christ, & the Holy Spirit",
  "CHR": "The Church: Its Nature and Structure",
  "SCR": "Scripture and Authority",
  "SAL": "Humanity, Sin, and Salvation",
  "SAC": "Sacraments and Rites",
  "WOR": "Worship and Spiritual Life",
  "ESC": "The Last Things (Eschatology)",
  "ETH": "Christian Ethics and Life in the World",
  "MET": "Overarching Theological Approaches",
};

// --- COMPONENT: Expandable Denomination Card ---
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
  const [userAnswers, setUserAnswers] = useState<Record<string, UserResponse>>({}); 

  // --- LOCAL STORAGE & HYDRATION STATE ---
  const [isLoaded, setIsLoaded] = useState(false); // Prevents UI flicker/save before load

  // --- RESULTS STATE ---
  const [results, setResults] = useState<any[]>([]);
  const [userCoords, setUserCoords] = useState<Record<string, number>>({});
  const [userTolerance, setUserTolerance] = useState<number>(50);
  const [userLabels, setUserLabels] = useState([]);
  const [isCalculating, setIsCalculating] = useState(false);

  // --- SCREENSHOT REF ---
  const exportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // --- ROUTER & MODALS ---
  const router = useRouter();
  const [showBackModal, setShowBackModal] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false); 
  const [devCode, setDevCode] = useState("");

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

  // Helper arrays
  const certaintyLabels = ["Not Sure", "Leaning", "Pretty Sure", "Certain"];
  const certaintyTextColors = ["text-slate-400", "text-sky-500", "text-blue-600", "text-brand-dark"];
  const toleranceLabels = ["Salvation Issue", "Opposed", "Discerning", "Charitable", "Accepting"];

  // ==========================================
  // LOCAL STORAGE LOGIC
  // ==========================================

  // 1. LOAD PROGRESS ON MOUNT
  useEffect(() => {
    const savedData = localStorage.getItem('theocompass_quiz_progress');
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        // Only restore if we have valid data
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions);
          setUserAnswers(data.userAnswers || {});
          setCurrentQuestionIndex(data.currentQuestionIndex || 0);
          setSelectedMode(data.selectedMode || null);
          setCurrentView("quiz"); // Jump straight to quiz
        }
      } catch (e) {
        console.error("Failed to load saved progress", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // 2. SAVE PROGRESS ON CHANGE
  useEffect(() => {
    // Only save if component is loaded and we are in quiz mode
    if (isLoaded && currentView === "quiz" && questions.length > 0) {
      const dataToSave = {
        questions,
        userAnswers,
        currentQuestionIndex,
        selectedMode
      };
      localStorage.setItem('theocompass_quiz_progress', JSON.stringify(dataToSave));
    }
    
    // 3. CLEAR PROGRESS ON RESULTS
    if (currentView === "results") {
      localStorage.removeItem('theocompass_quiz_progress');
    }
  }, [isLoaded, currentView, questions, userAnswers, currentQuestionIndex, selectedMode]);

  // 4. SYNC UI STATE (Restores visual state for current question after refresh)
  useEffect(() => {
    if (currentView === "quiz" && currentQuestion && userAnswers[currentQuestion.id]) {
      restoreQuestionState(userAnswers[currentQuestion.id]);
    } else if (currentView === "quiz") {
      resetQuestionState();
    }
  }, [currentQuestionIndex, currentView, userAnswers]); // Dependencies matter here

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleConfirmBack = () => {
    router.push('/');
  };

  const handleConfirmDev = () => {
    handleDevAutoFill(); 
    setShowDevModal(false);
  };

  const handleConfirmRestart = () => {
    localStorage.removeItem('theocompass_quiz_progress');
    setCurrentView("mode-select");
    resetQuestionState();
    setUserAnswers({});
    setCurrentQuestionIndex(0);
    setQuestions([]);
    setShowRestartModal(false);
  };

  const startInstructions = async (mode: "quick" | "standard" | "deep") => {
    setSelectedMode(mode);
    setCurrentView("instructions");
    setIsLoading(true);
    setError(null);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
      const response = await fetch(`${apiUrl}/api/questions?mode=${mode}`);


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
    setCertainty(2); 
    setTolerance(2); 
  };

  const handleSilenceClick = (type: "apathetic" | "hostile") => {
    setSelectedAnswer(`silence_${type}`); 
    setIsSilenceSelected(true);
    setSilenceType(type);
    
    if (type === "apathetic") {
      setCertainty(0); 
      setTolerance(2); 
    } else if (type === "hostile") {
      setCertainty(3); 
      setTolerance(1); 
    }
  };

  const toggleInfo = (e: React.MouseEvent, answerId: string) => {
    e.stopPropagation();
    setExpandedInfo(expandedInfo === answerId ? null : answerId);
  };

  const handleNext = async () => {
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

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      // UI sync handled by useEffect
    } else {
      // END OF QUIZ
      setIsCalculating(true);
      setCurrentView("results");
      
      try {
        const res = await fetch(`${apiUrl}/api/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newAnswers)
        });
        
        const data = await res.json();
        
        if (data.status === "success") {
          setResults(data.matches); 
          setUserCoords(data.userDimCoords || {});
          setUserTolerance(data.userTolerance ?? 50);
          setUserLabels(data.userLabels || []);
        } else {
          console.error("Calculation failed");
        }
      } catch (error) {
        console.error("API error:", error);
      } finally {
        setIsCalculating(false);
      }
    }
  };

  const handleDevAutoFill = async () => {
    const dummyAnswers: Record<string, UserResponse> = {};
    questions.forEach((q) => {
      const randomAnswerIndex = Math.floor(Math.random() * q.answers.length);
      const randomCertainty = Math.floor(Math.random() * 4);
      const randomTolerance = Math.floor(Math.random() * 5);
      dummyAnswers[q.id] = {
        questionId: q.id,
        answerId: q.answers[randomAnswerIndex].id, 
        certainty: randomCertainty,
        tolerance: randomTolerance,
        isSilence: false
      };
    });

    setUserAnswers(dummyAnswers);
    setIsCalculating(true);
    setCurrentView("results");
    
    try {
      const res = await fetch(`${apiUrl}/api/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dummyAnswers)
      });
      
      const data = await res.json();
      
      if (data.status === "success") {
        setResults(data.matches); 
        setUserCoords(data.userDimCoords || {});
        setUserTolerance(data.userTolerance || 50);
        setUserLabels(data.userLabels || []);
      } else {
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
      // UI sync handled by useEffect
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

  const handleDownloadImage = async () => {
    if (!exportRef.current) return;
    setIsExporting(true);
    
    try {
      exportRef.current.style.position = 'static';
      exportRef.current.style.left = 'auto';
      
      const canvas = await html2canvas(exportRef.current, {
        scale: 2, 
        useCORS: true,
        backgroundColor: "#0f172a", 
      });
      
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "TheoCompass-Results.png";
      link.href = dataURL;
      link.click();
    } catch (err) {
      console.error("Failed to generate image", err);
    } finally {
      if (exportRef.current) {
        exportRef.current.style.position = 'absolute';
        exportRef.current.style.left = '-9999px';
      }
      setIsExporting(false);
    }
  };

  // --- RENDER HELPERS ---
  // Header component reused multiple times
  const PageHeader = ({ showRestart = false }: { showRestart?: boolean }) => (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
      <div className="p-4 flex items-center justify-center relative border-b border-slate-100">
        <button 
          onClick={() => setShowBackModal(true)}
          className="absolute left-4 flex items-center gap-2 cursor-pointer hover:opacity-80 transition"
        >
          <Image src="/logo.png" alt="TheoCompass Logo" width={40} height={40} className="object-contain" />
        </button>
        <button 
          onClick={() => setShowBackModal(true)}
          className="font-serif font-bold text-xl text-brand-primary tracking-tight cursor-pointer hover:opacity-80 transition"
        >
          TheoCompass
        </button>
        {showRestart && (
          <button 
            onClick={() => setShowRestartModal(true)}
            className="absolute right-4 text-xs text-slate-400 hover:text-red-600 transition underline"
          >
            Restart
          </button>
        )}
      </div>
      <div className="px-4 py-2 bg-white">
        <button 
          onClick={() => setShowBackModal(true)}
          className="flex items-center text-sm text-slate-600 hover:text-brand-primary transition font-medium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Main Page
        </button>
      </div>
    </header>
  );

  // Modals component reused
  const Modals = () => (
    <>
      {/* Back Modal */}
      {showBackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Leave Quiz?</h3>
            <p className="text-slate-600 mb-6">Your progress is saved automatically. You can resume later.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowBackModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition">Cancel</button>
              <button onClick={handleConfirmBack} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition">Yes, go back</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Dev Modal */}
      {showDevModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Auto-Finish Quiz?</h3>
            <p className="text-slate-600 mb-6">Are you sure? The results will be generated randomly.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDevModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition">Cancel</button>
              <button onClick={handleConfirmDev} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition">Yes, generate</button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Modal */}
      {showRestartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Restart Quiz?</h3>
            <p className="text-slate-600 mb-6">This will delete your saved progress and start from the beginning.</p>
            {/* SECRET CODE INPUT */}
            <div className="mb-4 border-t pt-4 border-slate-100">
              <input 
                type="password" 
                placeholder="Enter code..." 
                value={devCode}
                onChange={(e) => setDevCode(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-slate-400 focus:outline-none focus:border-slate-400"
              />
              
              {/* IF CORRECT CODE, SHOW DEV BUTTON */}
              {devCode === "mod" && (
                <button 
                  onClick={() => {
                    setShowRestartModal(false);
                    setShowDevModal(true); // Open the dev confirmation modal
                  }}
                  className="w-full mt-2 bg-purple-100 text-purple-700 text-xs font-bold py-1.5 rounded hover:bg-purple-200 transition"
                >
                  🚀 Unlock Dev Tools
                </button>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowRestartModal(false);
                  setDevCode(""); // Reset code on close
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmRestart}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition"
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );


  // ==========================================
  // VIEW 1: MODE SELECT
  // ==========================================
  if (currentView === "mode-select") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <PageHeader />
        <Modals />
        <main className="flex-grow flex flex-col items-center justify-center p-6 max-w-4xl mx-auto">
          <h1 className="font-serif text-3xl md:text-5xl font-bold mb-4 text-center">Select Quiz Mode</h1>
          <p className="text-slate-600 mb-10 text-center max-w-xl">Choose how deep you want to go. Progress is saved automatically.</p>
          
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
        <PageHeader />
        <Modals />
        <main className="flex-grow p-6 max-w-2xl mx-auto w-full flex flex-col">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm mt-8">
            <h1 className="font-serif text-3xl font-bold mb-6 text-blue-900">How to navigate the quiz</h1>
            <div className="space-y-6 text-slate-600 mb-8">
              <p>TheoCompass measures not just <em>what</em> you believe, but <em>how</em> you hold those beliefs.</p>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-2">1. Select your Stance</h3>
                <p className="text-sm">Choose the answer that best represents your view. Use the <span className="inline-block w-5 h-5 bg-slate-200 text-center rounded-full text-xs font-serif italic mx-1">i</span> button if you need a detailed definition.</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="font-bold text-blue-700 mb-2">2. Set your Certainty</h3>
                <p className="text-sm">How confident are you in this specific belief?</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="font-bold text-red-600 mb-2">3. Set your Tolerance</h3>
                <p className="text-sm">What is your posture toward Christians who disagree with you?</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-2">4. Or, Choose Silence</h3>
                <p className="text-sm mb-2">If a question does not fit your theology, you can bypass the sliders entirely:</p>
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
  if (currentView === "results") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 relative overflow-x-hidden">
        
        {/* --- UPDATED HIDDEN EXPORT CARD --- */}
        <div 
          ref={exportRef} 
          className="absolute w-[1000px] bg-slate-50 text-slate-900 overflow-hidden shadow-2xl ring-1 ring-slate-200 font-sans" 
          style={{ left: '-9999px', top: '0' }}
        >
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-12 py-8 flex justify-between items-center border-b-4 border-blue-600/40">
            <div>
              <div className="text-4xl font-bold font-serif tracking-tight">TheoCompass v2.0 Pre-Demo</div>
              <div className="text-blue-300 text-lg font-bold tracking-widest uppercase mt-2">Theological Alignment Report</div>
            </div>
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-slate-700 overflow-hidden p-1.5">
               <Image src="/logo.png" alt="Logo" width={56} height={56} className="object-contain" />
            </div>
          </div>

          {/* Top Match Hero */}
          <div className="relative bg-white text-center py-12 px-10 border-b border-slate-200 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50/50 via-white to-white pointer-events-none"></div>
            <div className="relative z-10">
              <div className="text-lg font-bold text-slate-400 uppercase tracking-widest mb-3">Closest Theological Alignment</div>
              <h1 className="text-5xl font-bold font-serif text-slate-900 leading-tight mb-6">
                {results.length > 0 ? results[0].name : "Calculating..."}
              </h1>
              <div className="inline-flex items-center gap-4 bg-slate-900 px-8 py-3 rounded-full shadow-md border border-slate-800">
                <span className="text-4xl font-bold text-white">{results.length > 0 ? results[0].matchPercentage : 0}%</span>
                <span className="text-sm font-bold text-blue-300 uppercase tracking-widest">Match</span>
              </div>
            </div>
          </div>

          {/* Main Content Grid: Top 5 + Bar Chart */}
          <div className="grid grid-cols-12 gap-6 p-8">
            
            {/* LEFT COLUMN: Top 5 List */}
            <div className="col-span-5 bg-white rounded-2xl p-8 shadow-sm border border-slate-200 flex flex-col">
              <div className="text-lg font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-100 pb-3">Top 5 Traditions</div>
              <div className="space-y-4 flex-grow">
                {results.slice(0, 5).map((d: any, i: number) => (
                  <div key={d.id} className={`flex justify-between items-center p-4 rounded-xl transition-colors ${i === 0 ? 'bg-blue-50/50 border border-blue-100 shadow-sm' : 'bg-slate-50 border border-slate-100'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${i === 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {i + 1}
                      </div>
                      <span className={`font-semibold text-sm ${i === 0 ? 'text-blue-950 font-serif text-base' : 'text-slate-700'}`}>{d.name}</span>
                    </div>
                    <span className={`font-bold text-sm ${i === 0 ? 'text-blue-700' : 'text-slate-500'}`}>{d.matchPercentage}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT COLUMN: 13-Axis Fingerprint Chart */}
            <div className="col-span-7 bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
              <div className="text-lg font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-100 pb-3">Theological Fingerprint</div>
              <div className="flex flex-col gap-3">
                {Object.entries(AXIS_LABELS).map(([key, labels]) => {
                  const score = userCoords[key];
                  if (score === undefined) return null;
                  const isRight = score <= 50;
                  const strength = isRight ? (50 - score) : (score - 50);
                  const barWidth = `${(strength / 50) * 100}%`;

                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-[125px] text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right truncate">{labels.left}</div>
                      
                      {/* Fixed Diverging Bar Structure */}
                      <div className="flex-grow h-2.5 bg-slate-100 rounded-full relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300 z-10"></div>
                        
                        <div className="absolute right-1/2 top-0 bottom-0 flex justify-end w-1/2">
                          {!isRight && <div className="h-full bg-slate-700 rounded-l-full transition-all" style={{ width: barWidth }}></div>}
                        </div>
                        
                        <div className="absolute left-1/2 top-0 bottom-0 flex justify-start w-1/2">
                          {isRight && <div className="h-full bg-blue-600 rounded-r-full transition-all" style={{ width: barWidth }}></div>}
                        </div>
                      </div>
                      
                      <div className="w-[125px] text-[10px] font-medium text-slate-500 uppercase tracking-wider text-left truncate">{labels.right}</div>
                    </div>
                  );
                })}

                 {/* Tolerance Axis */}
                 <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100">
                    <div className="w-[100px] text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right truncate">Accepting</div>
                    <div className="flex-grow h-2.5 bg-slate-100 rounded-full relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300 z-10"></div>
                        
                        <div className="absolute right-1/2 top-0 bottom-0 flex justify-end w-1/2">
                            {userTolerance >= 50 && <div className="h-full bg-amber-500 rounded-l-full" style={{ width: `${((userTolerance - 50) / 50) * 100}%` }} />}
                        </div>
                        
                        <div className="absolute left-1/2 top-0 bottom-0 flex justify-start w-1/2">
                             {userTolerance <= 50 && <div className="h-full bg-amber-500 rounded-r-full" style={{ width: `${((50 - userTolerance) / 50) * 100}%` }} />}
                        </div>
                    </div>
                    <div className="w-[100px] text-[10px] font-bold text-amber-600 uppercase tracking-wider text-left truncate">Dogmatic</div>
                 </div>
              </div>
            </div>
          </div>

          {/* Compass Chart Section */}
          <div className="h-full bg-white rounded-2xl p-8 shadow-sm border border-slate-200 flex flex-col">
              <CompassChart 
                userCoords={userCoords} 
                userTolerance={userTolerance} 
                isExport={true}  // NEW: trigger PNG styles
              />
          </div>

          {/* Footer */}
          <div className="bg-slate-900 px-12 py-10 text-center border-t-4 border-slate-800">
            <p className="font-serif italic text-lg text-slate-300 mb-3">
              "He is before all things, and in him all things hold together." — Colossians 1:17
            </p>
            <div className="w-16 h-px bg-slate-700 mx-auto my-4"></div>
            <div className="text-sm font-medium text-slate-400 mb-1">Built for informed decision, not persuasion.</div>
            <div className="text-base text-slate-500 font-mono mt-2">
                theocompass.com • r/TheoCompass • © 2026 Oroq / TheoCompass Project
            </div>
          </div>
        </div>
        {/* --- END HIDDEN EXPORT CARD --- */}



        {/* --- PAGE HEADER --- */}

      
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">

        {/* RESTART MODAL (For Results Page) */}
          {showRestartModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Retake Quiz?</h3>
                <p className="text-slate-600 mb-4">This will clear your current results and start a new session.</p>
                
                {/* Optional: You can keep the secret code input here too if you want, 
                    or remove it for the results page since the quiz is already done. */}
                
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setShowRestartModal(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmRestart}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition"
                  >
                    Restart
                  </button>
                </div>
              </div>
            </div>
          )}
        
        {/* ROW 1: Logo and Title (Centered) */}
        <div className="p-4 flex items-center justify-center relative border-b border-slate-100">
          
          {/* Logo (Left) - Opens Modal */}
          <button 
            onClick={() => setShowBackModal(true)}
            className="absolute left-4 flex items-center gap-2 cursor-pointer hover:opacity-80 transition"
          >
            <Image 
              src="/logo.png" 
              alt="TheoCompass Logo" 
              width={40} 
              height={40} 
              className="object-contain" 
            />
          </button>

          {/* Title (Center) - Opens Modal */}
          <button 
            onClick={() => setShowBackModal(true)}
            className="font-serif font-bold text-xl text-brand-primary tracking-tight cursor-pointer hover:opacity-80 transition"
          >
            TheoCompass
          </button>
          
        </div>

        {/* ROW 2: Back Button Banner */}
        <div className="px-4 py-2 bg-white">
          <button 
            onClick={() => setShowBackModal(true)}
            className="flex items-center text-sm text-slate-600 hover:text-brand-primary transition font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Main Page
          </button>
        </div>
        
      </header>

              {/* --- MODAL: Confirm Back / Home --- */}
        {showBackModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Leave Quiz?</h3>
              <p className="text-slate-600 mb-6">Are you sure you want to go back? Your current progress might be lost.</p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setShowBackModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmBack}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition"
                >
                  Yes, go back
                </button>
              </div>
            </div>
          </div>
        )}


        <main className="flex-grow p-4 md:p-8 max-w-4xl mx-auto w-full flex flex-col">
          {isCalculating ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-6">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-800 rounded-full animate-spin"></div>
              <h2 className="text-xl font-serif font-bold text-slate-700 animate-pulse">Calculating Alignment...</h2>
            </div>
          ) : (
            <div className="animate-fade-in-up">
              <div className="text-center mb-10">
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Your Results</span>
                <h1 className="font-serif text-3xl md:text-5xl font-bold mt-4 mb-4 text-slate-900">Your Theological Matches</h1>
                <p className="text-slate-600 max-w-xl mx-auto">Based on your stances, certainty, and tolerance, here are the traditions that most closely align with your framework.</p>
              </div>

              {/* TOP MATCH - Highlighted */}
              {results.length > 0 && (
                <div className="bg-white rounded-2xl border-2 border-blue-600 shadow-xl overflow-hidden mb-8 relative">
                  <div className="absolute top-0 right-0 bg-blue-600 text-white font-bold px-4 py-1 rounded-bl-lg text-sm shadow-sm">
                    #1 Match
                  </div>
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
                  <div className="bg-slate-50 p-6 md:p-8">
                    <p className="text-slate-700 text-base md:text-lg leading-relaxed font-medium">
                      {results[0].description || "No description available for this tradition."}
                    </p>
                  </div>
                </div>
              )}

              {/* RUNNER UPS */}
              <h3 className="font-bold text-slate-800 mb-4 text-lg border-b pb-2">Runner-Up Traditions</h3>
              <div className="flex flex-col gap-2 mb-12">
                {results.slice(1).map((denom: any, index: number) => (
                  <DenominationCard key={denom.id} denom={denom} rank={index + 2} />
                ))}
              </div>

              {/* THEOLOGICAL FINGERPRINT (13-AXIS CHART) */}
              <div className="mt-12 mb-8">
                <h3 className="font-serif text-2xl font-bold text-slate-800 mb-2">Your Theological Fingerprint</h3>
                <p className="text-slate-600 mb-8 text-sm">This diverging chart maps your calculated position across the 12 hidden dimensions of Christian theology, plus your overall dogmatism.</p>
                
                <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6">
                  
                  {Object.entries(AXIS_LABELS).map(([key, labels]) => {
                    const score = userCoords[key];
                    if (score === undefined || score === null) return null;
                    
                    const isRight = score <= 50;
                    const strength = isRight ? (50 - score) : (score - 50);
                    const barWidth = `${(strength / 50) * 100}%`;
                    
                    return (
                      <div key={key} className="flex flex-col relative group">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 z-10 px-1">
                          <span className={!isRight ? "text-blue-700" : ""}>{labels.left}</span>
                          <span className={isRight ? "text-blue-700" : ""}>{labels.right}</span>
                        </div>
                        
                        <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
                          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-300 z-10"></div>
                          <div className="w-1/2 h-full relative flex justify-end">
                            {!isRight && <div className="h-full bg-blue-500 rounded-l-full" style={{ width: barWidth }}></div>}
                          </div>
                          <div className="w-1/2 h-full relative flex justify-start">
                            {isRight && <div className="h-full bg-blue-700 rounded-r-full" style={{ width: barWidth }}></div>}
                          </div>
                        </div>

                        <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-3 py-1 rounded shadow-lg whitespace-nowrap z-20">
                          {labels.desc} ({score}/100)
                        </div>
                      </div>
                    );
                  })}

                  <hr className="my-2 border-slate-200" />

                  {/* The 13th Axis: Tolerance */}
                  <div className="flex flex-col relative group pt-2">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 z-10 px-1">
                      <span className={userTolerance >= 50 ? "text-amber-600" : ""}>Accepting / Open</span>
                      <span className={userTolerance <= 50 ? "text-amber-600" : ""}>Dogmatic / Strict</span>
                    </div>
                    <div className="relative w-full h-5 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-300 z-10"></div>
                      <div className="w-1/2 h-full relative flex justify-end">
                        {userTolerance >= 50 && <div className="h-full bg-amber-500 rounded-l-full" style={{ width: `${((userTolerance - 50) / 50) * 100}%` }} />}
                      </div>
                      <div className="w-1/2 h-full relative flex justify-start">
                        {userTolerance <= 50 && <div className="h-full bg-amber-500 rounded-r-full" style={{ width: `${((50 - userTolerance) / 50) * 100}%` }} />}
                      </div>
                    </div>
                    <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-3 py-1 rounded shadow-lg whitespace-nowrap z-20">
                      Overall Theological Posture ({userTolerance}/100)
                    </div>
                  </div>

                </div>
              </div>

              {/* 2D SCATTER PLOT - ADJUSTED HEIGHT */}
              <div className="mb-16">
                 
                 {/* Adjusted height to h-[500px] to prevent overlap */}
                 <div className=" bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className=" relative">
                       <CompassChart 
                         userCoords={userCoords} 
                         userTolerance={userTolerance} 
                       />
                    </div>
                 </div>
              </div>

              {/* LABEL CLOUD */}
              <div className=" bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <TheologicalLabelCloud userLabels={userLabels} />
              </div>

              {/* NEXT STEPS & SHARE FOOTER */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 mb-8">
                
                {/* Save / Share Card */}
                <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-8 rounded-2xl text-white shadow-xl text-center flex flex-col justify-center items-center">
                  <h4 className="font-serif font-bold text-2xl mb-2 text-blue-100">Save Your Results</h4>
                  <p className="text-sm text-blue-200 mb-6 opacity-80">
                    Download a clean summary image of your top matches and compass to share on social media.
                  </p>
                  <div className="flex flex-col gap-3 w-full sm:w-auto">
                    <button 
                      onClick={handleDownloadImage} 
                      disabled={isExporting}
                      className={`bg-white text-blue-900 font-bold py-3 px-8 rounded-full shadow-lg transition-transform flex items-center justify-center gap-2 ${isExporting ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105'}`}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {isExporting ? "Generating PNG..." : "Download Image"}
                    </button>
                    <a href="https://www.reddit.com/r/TheoCompass/submit/?type=IMAGE" target="_blank" rel="noreferrer" className="text-blue-200 font-medium text-sm hover:text-white underline decoration-blue-500/50 underline-offset-4 transition-colors">
                      Post on r/TheoCompass
                    </a>
                  </div>
                </div>

                {/* Support Card */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center flex flex-col justify-center items-center">
                  <h4 className="font-bold text-slate-800 text-lg mb-2">Deep Dive Visualizations</h4>
                  <p className="text-sm text-slate-500 mb-6">
                    Coming Soon: <span className="font-medium text-slate-700">Historical/Creedal Timeline</span> & <span className="font-medium text-slate-700">Creedal Alignment Score.</span>
                  </p>
                  <div className="w-full h-px bg-slate-100 mb-6"></div>
                  <h4 className="font-bold text-slate-800 text-lg mb-2">Support TheoCompass</h4>
                  <p className="text-sm text-slate-500 mb-6 max-w-sm">
                    Help me expand the database to 230+ denominations and build the full v2.0 experience.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <a href="https://ko-fi.com/oroq" target="_blank" rel="noreferrer" className="bg-[#FF5E5B] hover:bg-[#E55350] text-white py-2 px-6 rounded-full font-bold shadow transition-colors flex items-center gap-2">
                      Support on Ko-Fi
                    </a>
                    <button 
                      onClick={() => setShowRestartModal(true)} 
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-6 rounded-full font-bold transition-colors"
                    >
                      Retake Quiz
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}
        </main>
        
        {/* GLOBAL FOOTER */}
        <footer className="w-full bg-slate-900 text-slate-300 py-10 px-6 text-center mt-auto">
          <div className="max-w-4xl mx-auto flex flex-col items-center">
            <p className="font-serif italic text-lg mb-6 text-slate-400">
              "He is before all things, and in him all things hold together." — Colossians 1:17
            </p>
            <div className="flex gap-6 mb-8 text-sm">
              <a href="https://theocompass.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">TheoCompass.com</a>
              <a href="https://www.reddit.com/r/TheoCompass" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">r/TheoCompass</a>
              <a href="https://ko-fi.com/oroq" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">Support on Ko-fi</a>
              <a href="mailto:theocompass.project@gmail.com" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-xs text-slate-500 mb-2">Built for informed decision, not persuasion.</p>
            <p className="text-xs text-slate-500">© 2026 Oroq / TheoCompass Project</p>
          </div>
        </footer>
      </div>
    );
  }




  // ==========================================
  // VIEW 3: THE ACTUAL QUIZ
  // ==========================================
  if (!currentQuestion) return <div className="p-10 text-center">Error: No question data found.</div>;

return (
  <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
    <PageHeader showRestart={true} />
    
      {/* --- ALL MODALS DEFINED DIRECTLY BELOW HEADER --- */}

      {/* 1. Back Modal */}
      {showBackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Leave Quiz?</h3>
            <p className="text-slate-600 mb-6">Your progress is saved automatically. You can resume later.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowBackModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition">Cancel</button>
              <button onClick={handleConfirmBack} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition">Yes, go back</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Dev Modal (The one that wasn't showing) */}
      {showDevModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Auto-Finish Quiz?</h3>
            <p className="text-slate-600 mb-6">Are you sure? The results will be generated randomly.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowDevModal(false)} 
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmDev} 
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition"
              >
                Yes, generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Restart Modal (With Secret Code) */}
      {showRestartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Restart Quiz?</h3>
            <p className="text-slate-600 mb-4">This will delete your saved progress.</p>
            
            {/* Secret Code Input */}
            <div className="mb-4 border-t pt-4 border-slate-100">
              <input 
                type="password" 
                placeholder="Enter code..." 
                value={devCode}
                onChange={(e) => setDevCode(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-slate-400 focus:outline-none focus:border-slate-400"
              />
              
              {devCode === "mod" && (
                <button 
                  onClick={() => {
                    setShowRestartModal(false);
                    setShowDevModal(true); // This opens Modal #2 above
                    setDevCode("");
                  }}
                  className="w-full mt-2 bg-purple-100 text-purple-700 text-xs font-bold py-1.5 rounded hover:bg-purple-200 transition"
                >
                  🚀 Unlock Dev Tools
                </button>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowRestartModal(false);
                  setDevCode("");
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmRestart}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition"
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-grow w-full max-w-2xl mx-auto px-4 py-8 md:py-12 flex flex-col">
        <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">
          Category: {QUIZ_CATEGORY_LABELS[currentQuestion.category] || currentQuestion.category}
        </div>
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-slate-900 mb-8 leading-snug">
          {currentQuestion.question}
        </h1>

        {/* ANSWERS */}
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

        {/* SILENCE OPTIONS */}
        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <button 
            onClick={() => handleSilenceClick("apathetic")}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
              silenceType === "apathetic" ? "bg-slate-200 border-slate-400 text-slate-800 shadow-inner" : "bg-transparent border-slate-300 text-slate-500 hover:bg-slate-100"
            }`}
          >
            Apathetic Silence
          </button>
          <button 
            onClick={() => handleSilenceClick("hostile")}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
              silenceType === "hostile" ? "bg-red-50 border-red-300 text-red-800 shadow-inner" : "bg-transparent border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
            }`}
          >
            Hostile Silence
          </button>
        </div>

        {/* SLIDERS */}
        {selectedAnswer && !isSilenceSelected && (
          <div className="bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm mb-8 animate-fade-in-up">
            <div className="mb-10">
              <p className="text-sm text-slate-500 italic mb-3">How confident are you in this particular stance?</p>
              <div className="flex justify-between text-sm mb-2 font-medium">
                <span className="text-slate-800 font-bold">Certainty</span>
                <span className={`font-bold ${certaintyTextColors[certainty]}`}>{certaintyLabels[certainty]}</span>
              </div>
              <input type="range" min="0" max="3" step="1" value={certainty} onChange={(e) => setCertainty(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 italic mb-3">What posture do you have toward Christians who disagree?</p>
              <div className="flex justify-between text-sm mb-2 font-medium">
                <span className="text-slate-800 font-bold">Tolerance</span>
                <span className={`font-bold ${
                  tolerance === 0 ? "text-red-600" : tolerance === 1 ? "text-orange-500" : tolerance === 2 ? "text-yellow-600" : tolerance === 3 ? "text-green-500" : "text-emerald-600"
                }`}>{toleranceLabels[tolerance]}</span>
              </div>
              <input type="range" min="0" max="4" step="1" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>
        )}

        {/* NAV FOOTER */}
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
