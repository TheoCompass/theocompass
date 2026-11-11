"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import html2canvas from "html2canvas-pro";
import CompassChart from "./CompassChart"; 
import { useRouter } from 'next/navigation';
import { trackEvent } from '../../lib/gtag';
import { APP_STAGE } from '../../lib/site';
import { Info } from "lucide-react";
import type { Question, UserResponse } from './_types';
import { AXIS_LABELS, FINGERPRINT_CATEGORIES, QUIZ_CATEGORY_LABELS } from './_constants';
import { normalizeAxisKey } from './_helpers';
import { PageHeader } from './_components/_PageHeader';
import { Modals } from './_components/_Modals';
import { ModeSelectCards } from './_components/_ModeSelectCards';
import { AxisSlider, QuizQuestionView } from './_components/_QuizQuestionView';
import { ResultsDashboard } from './_components/_ResultsDashboard';
import ExportCard from './_components/_ExportCard';
import ExportLabelsCard from './_components/_ExportLabelsCard';
import ExportFingerprintCard from './_components/_ExportFingerprintCard';

/**
 * The one definition of what a finished quiz looks like in localStorage.
 *
 * `handleNext` and the results page's "Save results" exit both write through
 * here, so the key and the stored shape cannot drift apart.
 */
function persistFinalResults(snapshot: {
  matches: unknown[];
  familyMatches: unknown[];
  userDimCoords: Record<string, number>;
  userTolerance: number;
  userCertainty: number;
  userLabels: unknown[];
  selectedMode: "quick" | "standard" | "deep" | null;
  answeredCount: number;
}) {
  try {
    localStorage.setItem(
      "theocompass_final_results",
      JSON.stringify({ ...snapshot, timestamp: new Date().getTime() })
    );
  } catch (err) {
    console.error("Failed to save results", err);
  }
}

export default function QuizController() {
  // --- APP STATE ---
  const [currentView, setCurrentView] = useState<"mode-select" | "instructions" | "quiz" | "results">("mode-select");
  const [selectedMode, setSelectedMode] = useState<"quick" | "standard" | "deep" | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // --- DATA STATE ---
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answeredQuestionCount, setAnsweredQuestionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- QUIZ STATE ---
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, UserResponse>>({}); 

  // --- LOCAL STORAGE & HYDRATION STATE ---
  const [isLoaded, setIsLoaded] = useState(false);

  // --- RESULTS STATE ---
  const [results, setResults] = useState<any[]>([]);
  const [familyMatches, setFamilyMatches] = useState<any[]>([]);
  const [userCoords, setUserCoords] = useState<Record<string, number>>({});
  const [showSpecific, setShowSpecific] = useState(true);
  // 0.5: global "active only" filter, shared by the results page AND the export image
  const [activeOnly, setActiveOnly] = useState(false);
  const [userTolerance, setUserTolerance] = useState<number>(50);
  // 14th axis: separate meta-axis computed server-side (priority-weighted avg of C).
  const [userCertainty, setUserCertainty] = useState<number>(50);
  const [userLabels, setUserLabels] = useState([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [compareDenomId, setCompareDenomId] = useState<string | null>(null);
  const [expandedAxis, setExpandedAxis] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // --- COORDINATES LOOKUP (for comparison) ---
  const [allCoordinates, setAllCoordinates] = useState<Map<string, {
    name: string;
    family: string;
    dimCoords: Record<string, number>;
    isActive?: boolean;
    estMembers?: number | null;
  }>>(new Map());

  // --- SCREENSHOT REFS ---
  const exportRef = useRef<HTMLDivElement>(null);
  const exportLabelsRef = useRef<HTMLDivElement>(null);
  const exportFingerprintRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingLabels, setIsExportingLabels] = useState(false);
  const [isExportingFingerprint, setIsExportingFingerprint] = useState(false);

  // --- ROUTER & MODALS ---
  const router = useRouter();
  const [showBackModal, setShowBackModal] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false); 
  const [devCode, setDevCode] = useState("");
  const [showSaveToast, setShowSaveToast] = useState(false);
  /**
   * Set when the user leaves the results without saving, so a calculation that
   * is still in flight cannot write the result back after the fact.
   */
  const skipResultsSaveRef = useRef(false);
  const [quizAnimKey, setQuizAnimKey] = useState(0);
  /** Set before bumping quizAnimKey, so Back can slide in from the left. */
  const [quizAnimDir, setQuizAnimDir] = useState<"next" | "prev">("next");

  // Instructions view state
  const [tutorialStep, setTutorialStep] = useState(0);
  const [demoInfoOpen, setDemoInfoOpen] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);

  // Current question temporary state
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [isSilenceSelected, setIsSilenceSelected] = useState(false);
  const [silenceType, setSilenceType] = useState<"apathetic" | "hostile" | null>(null);
  const [certainty, setCertainty] = useState(2); 
  const [tolerance, setTolerance] = useState(2);

  // Enhanced UX state
  const [showShortcutHint, setShowShortcutHint] = useState(true);
  const [showCategoryTransition, setShowCategoryTransition] = useState(false);
  const [transitionCategoryName, setTransitionCategoryName] = useState("");
  const [hasShownFirstInfoPulse, setHasShownFirstInfoPulse] = useState(false);
  const [transitionCategoryCode, setTransitionCategoryCode] = useState("");

  // --- DERIVED VARIABLES ---
  const totalQuestions = questions.length;
  const currentQuestion = questions[currentQuestionIndex];
  const progressPercentage = totalQuestions > 0 ? ((currentQuestionIndex) / totalQuestions) * 100 : 0;
  const hasPrimaryKeyword = currentQuestion?.question.toLowerCase().includes("primary");

  // --- FETCH COORDINATES & MERGE INTO RESULTS ---
  useEffect(() => {
    if (currentView !== "results" || results.length === 0) return;

    const fetchCoordinates = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
        const res = await fetch(`${apiUrl}/api/coordinates`);
        if (!res.ok) return;
        const rows: any[] = await res.json();

        const map = new Map<string, {
          name: string;
          family: string;
          dimCoords: Record<string, number>;
          isActive?: boolean;
          estMembers?: number | null;
        }>();

        for (const row of rows) {
          if (row.mode !== "quick") continue;
          const denomId = row.denomination_id;
          if (map.has(denomId)) continue;

          const dimCoords: Record<string, number> = {};
          for (const key of Object.keys(row)) {
            if (key.endsWith("_avg")) {
              const shortKey = normalizeAxisKey(key);
              if (AXIS_LABELS[shortKey]) {
                dimCoords[shortKey] = row[key];
              }
            }
            if (key === "tolerance_score") {
              dimCoords["tolerance"] = row[key];
            }
            if (key === "certainty_score") {
              dimCoords["certainty"] = row[key];
            }
          }

          map.set(denomId, {
            name: row.name || denomId,
            family: row.family || "",
            dimCoords,
            isActive: row.is_active === 1 || row.is_active === true,
            estMembers: row.est_members_global ?? null,
          });
        }

        setAllCoordinates(map);

        const enriched = results.map((r: any) => {
          const coord = map.get(r.id);
          if (coord && coord.dimCoords && Object.keys(coord.dimCoords).length > 0) {
            return { ...r, dimCoords: coord.dimCoords };
          }
          return r;
        });
        setResults(enriched);
      } catch (err) {
        console.error("Failed to fetch coordinates", err);
      }
    };

    fetchCoordinates();
  }, [currentView, results.length]);

  // --- LOCAL STORAGE LOGIC ---

  // 1. INITIAL LOAD (Runs once on mount)
  useEffect(() => {
    const savedResults = localStorage.getItem('theocompass_final_results');
    if (savedResults) {
      try {
        const data = JSON.parse(savedResults);
        setResults(data.matches);
        setFamilyMatches(data.familyMatches || []);
        setUserCoords(data.userDimCoords);
        setUserTolerance(data.userTolerance);
        setUserCertainty(data.userCertainty ?? 50);
        setUserLabels(data.userLabels);
        setSelectedMode(data.selectedMode || null);
        setAnsweredQuestionCount(data.answeredCount || 0);
        setCurrentView("results");
        setIsLoaded(true);
        return;
      } catch (e) {
        console.error("Failed to load saved results", e);
      }
    }

    const savedData = localStorage.getItem('theocompass_quiz_progress');
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions);
          setUserAnswers(data.userAnswers);
          setCurrentQuestionIndex(data.currentQuestionIndex || 0);
          setSelectedMode(data.selectedMode || null);
          setCurrentView("quiz");
        }
      } catch (e) {
        console.error("Failed to load saved progress", e);
      }
    }
    
    setIsLoaded(true);
  }, []);

  // 2. SAVE QUIZ PROGRESS (Runs when quiz data changes)
  useEffect(() => {
    if (isLoaded && currentView === "quiz" && questions.length > 0 && Object.keys(userAnswers).length > 0) {
      const dataToSave = {
        questions,
        userAnswers,
        currentQuestionIndex,
        selectedMode
      };
      localStorage.setItem('theocompass_quiz_progress', JSON.stringify(dataToSave));
      triggerSaveToast();
    }
  }, [isLoaded, currentView, questions, userAnswers, currentQuestionIndex, selectedMode]);

  // 3. SYNC UI STATE (Restores visual state for current question after refresh)
  useEffect(() => {
    if (currentView === "quiz" && currentQuestion && userAnswers[currentQuestion.id]) {
      restoreQuestionState(userAnswers[currentQuestion.id]);
    } else if (currentView === "quiz") {
      resetQuestionState();
    }
  }, [currentQuestionIndex, currentView, userAnswers]);

  // 4. Prevent Next.js hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleConfirmBack = () => {
    router.push('/');
  };

  /**
   * Results exit, option one: keep the finished result in this browser, then go
   * to the main page. The start screen reads this key and opens on the results.
   */
  const handleSaveResultsAndLeave = () => {
    if (results.length > 0) {
      persistFinalResults({
        matches: results,
        familyMatches,
        userDimCoords: userCoords,
        userTolerance,
        userCertainty,
        userLabels,
        selectedMode,
        answeredCount: answeredQuestionCount || questions.length,
      });
    }
    localStorage.removeItem('theocompass_quiz_progress');
    setShowBackModal(false);
    router.push('/');
  };

  /** Results exit, option two: forget the result so the next visit starts fresh. */
  const handleDiscardResultsAndLeave = () => {
    skipResultsSaveRef.current = true;
    localStorage.removeItem('theocompass_final_results');
    localStorage.removeItem('theocompass_quiz_progress');
    setShowBackModal(false);
    router.push('/');
  };

  const handleConfirmDev = () => {
    handleDevAutoFill(); 
    setShowDevModal(false);
  };

  const handleConfirmRestart = () => {
    skipResultsSaveRef.current = false;
    localStorage.removeItem('theocompass_quiz_progress');
    localStorage.removeItem('theocompass_final_results');
    setCurrentView("mode-select");
    resetQuestionState();
    setUserAnswers({});
    setCurrentQuestionIndex(0);
    setQuestions([]);
    setResults([]);
    setFamilyMatches([]);
    setUserCoords({});
    setUserTolerance(50);
    setUserCertainty(50);
    setUserLabels([]);
    setShowSpecific(true);
    setActiveOnly(false);
    setShowRestartModal(false);
  };

  const startInstructions = async (mode: "quick" | "standard" | "deep") => {
    skipResultsSaveRef.current = false;
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

  const triggerSaveToast = () => {
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 1600);
  };

  const handleSilenceClick = (type: "apathetic" | "hostile") => {
    if (isSilenceSelected && silenceType === type) {
      setIsSilenceSelected(false);
      setSilenceType(null);
      setSelectedAnswer(null);
      setCertainty(2);
      setTolerance(2);
      return;
    }
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
    if (!hasShownFirstInfoPulse) {
      setHasShownFirstInfoPulse(true);
    }
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
      const nextIndex = currentQuestionIndex + 1;
      const nextQuestion = questions[nextIndex];
      const currentCategory = QUIZ_CATEGORY_LABELS[currentQuestion.category] || currentQuestion.category;
      const nextCategory = QUIZ_CATEGORY_LABELS[nextQuestion?.category] || nextQuestion?.category;
      
      if (nextQuestion && currentCategory !== nextCategory) {
        setTransitionCategoryName(nextCategory);
        setTransitionCategoryCode(nextQuestion.category);
        setShowCategoryTransition(true);
      }
      
      setCurrentQuestionIndex(nextIndex);
      setQuizAnimDir("next");
      setQuizAnimKey(prev => prev + 1);
    } else {
      setIsCalculating(true);
      setCurrentView("results");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
      try {
        const res = await fetch(`${apiUrl}/api/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newAnswers)
        });
        
        const data = await res.json();
        
        if (data.status === "success") {
          setResults(data.matches); 
          setFamilyMatches(data.familyMatches || []);
          setUserCoords(data.userDimCoords || {});
          setUserTolerance(data.userTolerance ?? 50);
          setUserCertainty(data.userCertainty ?? 50);
          setUserLabels(data.userLabels || []);
          
          trackEvent('quiz_complete', {
            quiz_mode: selectedMode || 'quick',
            questions_answered: Object.keys(newAnswers).length,
            top_match: data.matches[0]?.name || 'unknown',
            top_match_score: data.matches[0]?.matchPercentage || 0,
            user_tolerance: data.userTolerance ?? 50,
            user_certainty: data.userCertainty ?? 50
          });

          const answerCount = Object.keys(newAnswers).length;
          setAnsweredQuestionCount(answerCount);

          if (!skipResultsSaveRef.current) {
            persistFinalResults({
              matches: data.matches,
              familyMatches: data.familyMatches || [],
              userDimCoords: data.userDimCoords,
              userTolerance: data.userTolerance ?? 50,
              userCertainty: data.userCertainty ?? 50,
              userLabels: data.userLabels,
              selectedMode,
              answeredCount: answerCount,
            });
          }

          localStorage.removeItem('theocompass_quiz_progress');
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

  useEffect(() => {
    if (currentView === "quiz") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentQuestionIndex, currentView]);

  const handleDevAutoFill = async () => {
    const dummyAnswers: Record<string, UserResponse> = {};
    questions.forEach(q => {
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
    setCurrentView('results');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

    try {
      const res = await fetch(`${apiUrl}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dummyAnswers)
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setResults(data.matches);
        setFamilyMatches(data.familyMatches || []);
        setUserCoords(data.userDimCoords);
        setUserTolerance(data.userTolerance ?? 50);
        setUserCertainty(data.userCertainty ?? 50);
        setUserLabels(data.userLabels);
      } else {
        console.error("Calculation failed:", data.error);
      }
    } catch (error) {
      console.error("Failed to calculate:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleDevDenomFill = async (denomId: string) => {
    setIsCalculating(true);
    setCurrentView('results');
    setShowDevModal(false);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

    try {
      const profileRes = await fetch(`${apiUrl}/api/dev/profile?id=${denomId}`);
      const profileData = await profileRes.json();

      if (!profileRes.ok) {
        alert(`API Error: ${profileData.error || profileRes.statusText}`);
        throw new Error(profileData.error || "Failed to fetch dev profile");
      }

      if (profileData.error) {
         console.error("API Error:", profileData.error);
         alert("Error finding Denomination: " + profileData.error);
         return;
      }

      const finalAnswers: Record<string, UserResponse> = {};
      questions.forEach(q => {
        if (profileData[q.id]) {
          finalAnswers[q.id] = profileData[q.id];
        }
      });

      setUserAnswers(finalAnswers);

      const calcRes = await fetch(`${apiUrl}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalAnswers)
      });
      const data = await calcRes.json();
      
      if (data.status === 'success') {
        setResults(data.matches);
        setFamilyMatches(data.familyMatches || []);
        setUserCoords(data.userDimCoords);
        setUserTolerance(data.userTolerance ?? 50);
        setUserCertainty(data.userCertainty ?? 50);
        setUserLabels(data.userLabels);
      } else {
        console.error("Calculation failed:", data.error);
      }
    } catch (error) {
      console.error("Failed to execute dev test:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setQuizAnimDir("prev");
      setQuizAnimKey(prev => prev + 1);
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

  const handleDownloadFingerprint = async () => {
    if (!exportFingerprintRef.current) return;
    setIsExportingFingerprint(true);
    
    try {
      exportFingerprintRef.current.style.position = 'static';
      exportFingerprintRef.current.style.left = 'auto';
      
      const canvas = await html2canvas(exportFingerprintRef.current, {
        scale: 2, 
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "TheoCompass-Fingerprint.png";
      link.href = dataURL;
      link.click();

      trackEvent('download_fingerprint_image', {
        quiz_mode: selectedMode || 'quick',
      });

    } catch (err) {
      console.error("Failed to generate fingerprint image", err);
    } finally {
      if (exportFingerprintRef.current) {
        exportFingerprintRef.current.style.position = 'absolute';
        exportFingerprintRef.current.style.left = '-9999px';
      }
      setIsExportingFingerprint(false);
    }
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
        backgroundColor: "#ffffff",
      });
      
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "TheoCompass-Results.png";
      link.href = dataURL;
      link.click();

      trackEvent('download_results_image', {
        top_match: results[0]?.name || 'unknown',
        top_match_score: results[0]?.matchPercentage || 0,
        quiz_mode: selectedMode || 'quick'
      });

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

  const handleDownloadLabels = async () => {
    if (!exportLabelsRef.current) return;
    setIsExportingLabels(true);
    
    try {
      exportLabelsRef.current.style.position = 'static';
      exportLabelsRef.current.style.left = 'auto';
      
      const canvas = await html2canvas(exportLabelsRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "TheoCompass-Belief-Labels.png";
      link.href = dataURL;
      link.click();

      trackEvent('download_labels_image', {
        quiz_mode: selectedMode || 'quick',
        user_labels: userLabels.join(',')
      });

    } catch (err) {
      console.error("Failed to generate labels image", err);
    } finally {
      if (exportLabelsRef.current) {
        exportLabelsRef.current.style.position = 'absolute';
        exportLabelsRef.current.style.left = '-9999px';
      }
      setIsExportingLabels(false);
    }
  };

  // Memoize shuffle
  const shuffledAnswers = useMemo(() => {
    if (!currentQuestion || !currentQuestion.answers) return [];
    
    const shuffled = [...currentQuestion.answers];
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }, [currentQuestion?.id]);

  const displayAnswers = isMounted && currentQuestion 
    ? shuffledAnswers 
    : (currentQuestion?.answers || []);

  // KEYBOARD SHORTCUTS (quiz view only)
  useEffect(() => {
    if (currentView !== "quiz") return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const numKey = parseInt(e.key);
      if (numKey >= 1 && numKey <= displayAnswers.length) {
        e.preventDefault();
        handleStandardAnswerClick(displayAnswers[numKey - 1].id);
        return;
      }
      
      if (e.key === "Enter" && (selectedAnswer || isSilenceSelected)) {
        e.preventDefault();
        handleNext();
        return;
      }

      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleSilenceClick("apathetic");
        return;
      }
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        handleSilenceClick("hostile");
        return;
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentView, displayAnswers, selectedAnswer, isSilenceSelected]);


  // One definition, four return branches. This prop list was pasted into each
  // of them, so adding one meant remembering all four.
  const modals = (
    <Modals
      showBackModal={showBackModal}
      showDevModal={showDevModal}
      showRestartModal={showRestartModal}
      devCode={devCode}
      onUnlockDevTools={() => {
        setShowRestartModal(false);
        setShowDevModal(true);
      }}
      onCloseBackModal={() => setShowBackModal(false)}
      onCloseDevModal={() => setShowDevModal(false)}
      onCloseRestartModal={() => {
        setShowRestartModal(false);
        setDevCode("");
      }}
      onConfirmBack={handleConfirmBack}
      onConfirmDev={handleConfirmDev}
      onConfirmRestart={handleConfirmRestart}
      onDevDenomFill={handleDevDenomFill}
      onSetDevCode={setDevCode}
      backContext={currentView === "results" ? "results" : "progress"}
      onSaveAndLeave={handleSaveResultsAndLeave}
      onDiscardAndLeave={handleDiscardResultsAndLeave}
    />
  );

  // ==========================================
  // VIEW 1: MODE SELECT
  // ==========================================
  if (currentView === "mode-select") {
    const savedData = typeof window !== 'undefined' ? localStorage.getItem('theocompass_quiz_progress') : null;
    let savedMode: string | null = null;
    if (savedData && isMounted) {
      try {
        const parsed = JSON.parse(savedData);
        savedMode = parsed.selectedMode || null;
      } catch {}
    }

    return (
      <div className="min-h-screen bg-paper flex flex-col font-sans text-ink">
        <PageHeader
          showRestart={false}
          onLogoClick={() => setShowBackModal(true)}
          onTitleClick={() => setShowBackModal(true)}
          onBackClick={() => setShowBackModal(true)}
          onRestartClick={() => setShowRestartModal(true)}
        />

        {modals}
        <main id="main-content" className="flex-grow flex flex-col items-center justify-center p-6 max-w-4xl mx-auto animate-fade-in-up">
          <span className="meta">TheoCompass · {APP_STAGE}</span>
          <h1 className="font-display text-3xl md:text-4xl mt-2 mb-3 text-center text-ink">
            How deep do you want to go?
          </h1>
          <p className="text-ink-soft mb-8 text-center max-w-xl text-sm leading-relaxed">
            30 to 120 questions on the doctrines that separate traditions. Progress
            is saved automatically.
          </p>

          <ModeSelectCards savedMode={savedMode} onSelectQuick={() => startInstructions("quick")} />
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: INSTRUCTIONS
  // ==========================================
  if (currentView === "instructions") {
    const totalSteps = 4;
    
    const steps = [
      {
        title: "Select your Stance",
        color: "text-ink",
        content: (
          <div>
            <p className="text-sm text-ink-soft mb-4">Choose the answer that best represents your view. Tap <strong className="text-cerulean-900">Context</strong> for a detailed definition.</p>
            
            <div className="border border-rule bg-paper px-3 py-2.5">
              <div className="flex justify-between items-center">
                <span className="font-medium text-accent-deep">Example: Transubstantiation</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setDemoInfoOpen(!demoInfoOpen); }}
                  aria-expanded={demoInfoOpen}
                  className={`flex shrink-0 items-center gap-1.5 border px-2 py-2 text-2xs font-medium transition-colors ${
                    demoInfoOpen
                      ? "border-cerulean-900 bg-cerulean-900 text-white"
                      : "border-rule bg-paper-raised text-ink-muted"
                  }`}
                >
                  <Info aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="whitespace-nowrap">{demoInfoOpen ? "Hide" : "Context"}</span>
                </button>
              </div>
              
              {demoInfoOpen && (
                <div className="mt-2 border border-cerulean-200 bg-cerulean-50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  <span className="meta block">Further context</span>
                  The bread and wine become the actual body and blood of Christ during the Eucharist, while maintaining their physical appearances.
                </div>
              )}
            </div>
            
            <p className="text-xs text-ink-muted mt-2">
              The same <strong className="text-cerulean-900 font-medium">Context</strong> button sits on every answer during the quiz.
            </p>
          </div>
        ),
      },
      {
        title: "Set your Certainty",
        color: "text-accent",
        content: (
          <div>
            <p className="text-sm text-ink-soft mb-4">How confident are you in this specific belief?</p>
            <div className="mt-1 border border-rule bg-paper px-3 py-3 pointer-events-none select-none">
              <AxisSlider
                legend="Certainty"
                labels={["Not Sure", "Leaning", "Pretty Sure", "Certain"]}
                shortLabels={["Not sure", "Leaning", "Pretty sure", "Certain"]}
                value={2}
                onChange={() => {}}
              />
            </div>
          </div>
        ),
      },
      {
        title: "Set Tolerance",
        color: "text-accent",
        content: (
          <div>
            <p className="text-sm text-ink-soft mb-4">How many of the other options do you consider valid? This affects how exclusive your match is.</p>
            <div className="mt-1 border border-rule bg-paper px-3 py-3 pointer-events-none select-none">
              <AxisSlider
                legend="How many views are acceptable?"
                labels={["None Valid", "None for Fellowship", "A Few Valid", "Most Valid", "All Valid"]}
                shortLabels={["None", "No fellowship", "A few", "Most", "All"]}
                value={2}
                onChange={() => {}}
              />
              <p className="mt-2 text-2xs leading-snug text-ink-muted">
                A few other options are valid, but require theological discernment.
              </p>
            </div>
          </div>
        ),
      },
      {
        title: "Or, Choose Silence",
        color: "text-ink",
        content: (
          <div>
            <p className="text-sm text-ink-soft mb-4">If a question doesn't fit your theology, bypass the sliders entirely:</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="border border-rule bg-paper px-3 py-2.5">
                <span className="block text-mini font-medium text-ink">
                  Apathetic silence
                </span>
                <p className="mt-0.5 text-2xs leading-snug text-ink-muted">
                  The topic is not relevant to you. Creates a soft, neutral stance.
                </p>
              </div>
              <div className="border border-punch-300 bg-punch-soft px-3 py-2.5">
                <span className="block text-mini font-medium text-punch-ink">
                  Hostile silence
                </span>
                <p className="mt-0.5 text-2xs leading-snug text-ink-soft">
                  You reject the question's premise. Penalises traditions that affirm it.
                </p>
              </div>
            </div>
          </div>
        ),
      },
    ];
    
    return (
      <div className="min-h-screen bg-paper flex flex-col font-sans text-ink">
        <PageHeader
          showRestart={false}
          onLogoClick={() => setShowBackModal(true)}
          onTitleClick={() => setShowBackModal(true)}
          onBackClick={() => setShowBackModal(true)}
          onRestartClick={() => setShowRestartModal(true)}
        />
        {modals}
       <main id="main-content" className="mx-auto flex w-full max-w-[56rem] flex-grow flex-col px-4 py-6 md:px-8 md:py-10 animate-fade-in">
          <div className="border border-rule bg-paper-raised px-4 py-6 sm:px-8 sm:py-8">
            <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight text-ink">How to navigate the quiz</h1>
            <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
              TheoCompass measures not just <em>what</em> you believe, but <em>how</em> you hold those beliefs.
            </p>
            
            <div className="mt-5 flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTutorialStep(i)}
                  className={`h-[3px] transition-all ${
                    i === tutorialStep ? "w-6 bg-cerulean-900" : "w-3 bg-rule-strong hover:bg-ink-muted"
                  }`}
                  aria-label={`Step ${i + 1}`}
                />
              ))}
            </div>
            
            <div className="mb-4 min-h-[150px] border border-rule bg-paper px-3.5 py-4 animate-fade-in-up" key={tutorialStep}>
              <div className="flex items-center gap-2 mb-3">
                <span className="num flex h-5 min-w-5 items-center justify-center bg-cerulean-900 px-1 font-mono text-3xs font-bold text-white">
                  {tutorialStep + 1}
                </span>
                <h3 className={`font-display text-base leading-tight ${steps[tutorialStep].color}`}>{steps[tutorialStep].title}</h3>
              </div>
              {steps[tutorialStep].content}
            </div>
            
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTutorialStep(Math.max(0, tutorialStep - 1))}
                disabled={tutorialStep === 0}
                className={`text-sm font-medium transition-colors ${
                  tutorialStep === 0 ? "text-rule-strong cursor-not-allowed" : "text-ink-soft hover:text-accent"
                }`}
              >
                ← Previous
              </button>
              <span className="text-xs text-ink-muted font-medium">
                Step {tutorialStep + 1} of {totalSteps}
              </span>
              <button
                type="button"
                onClick={() => setTutorialStep(Math.min(totalSteps - 1, tutorialStep + 1))}
                disabled={tutorialStep === totalSteps - 1}
                className={`text-sm font-medium transition-colors ${
                  tutorialStep === totalSteps - 1 ? "text-rule-strong cursor-not-allowed" : "text-ink-soft hover:text-accent"
                }`}
              >
                Next →
              </button>
            </div>

            {error && (
              <div className="mb-3 flex items-center justify-between border border-punch-300 bg-punch-soft px-3 py-2 text-xs text-punch-ink">
                <span>{error}</span>
                <button onClick={() => startInstructions(selectedMode!)} className="ml-4 underline font-bold whitespace-nowrap">Try Again</button>
              </div>
            )}

            <div className="mb-3 flex items-start gap-2 border border-rule bg-muted-soft px-3 py-2 text-2xs leading-snug text-ink-soft">
              
              <span><span className="font-semibold">During the quiz:</span> Press <kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs min-w-[18px] text-center">1</kbd>–<kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs min-w-[18px] text-center">4</kbd> to select, <kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs">Enter</kbd> to confirm, <kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs">S</kbd> / <kbd className="inline-block border border-rule-strong bg-paper-raised px-1 font-mono font-bold text-3xs">H</kbd> for silence.</span>
            </div>

            <button 
              onClick={startQuiz} 
              disabled={isLoading || !!error || tutorialStep < totalSteps - 1}
              className={`mt-2 w-full px-5 py-2.5 text-sm font-medium transition-colors ${
                isLoading || error ? "bg-rule text-ink-muted cursor-not-allowed" : 
                tutorialStep < totalSteps - 1 ? "bg-rule text-ink-muted cursor-not-allowed" :
                "bg-accent hover:bg-accent-deep text-white"
              }`}
            >
              {isLoading ? "Loading Database..." : 
               error ? "Database Error" : 
               tutorialStep < totalSteps - 1 ? "Review all 4 steps to continue →" : 
               "Start Quiz"}
            </button>
            
            {skipConfirm ? (
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-xs text-ink-muted">Skip tutorial?</span>
                <button
                  type="button"
                  onClick={() => { setSkipConfirm(false); startQuiz(); }}
                  disabled={isLoading || !!error}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isLoading || error ? "bg-rule text-ink-muted cursor-not-allowed" : "bg-cerulean-100 text-cerulean-900 hover:bg-cerulean-200"
                  }`}
                >
                  Yes, skip
                </button>
                <button
                  type="button"
                  onClick={() => setSkipConfirm(false)}
                  className="text-xs text-ink-muted hover:text-ink-soft underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSkipConfirm(true)}
                disabled={isLoading || !!error}
                className={`w-full text-center text-sm mt-3 transition-colors ${
                  isLoading || error ? "text-rule-strong cursor-not-allowed" : "text-ink-muted hover:text-accent"
                }`}
              >
                Skip tutorial, start quiz
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW 4: RESULTS DASHBOARD
  // ==========================================
  if (currentView === 'results') {
    const displayFamilies = selectedMode === "quick" && !showSpecific && familyMatches.length > 0;
    const exportCoordsWithTolerance: Record<string, number> = {
      ...userCoords,
      tolerance: userTolerance,
      certainty: userCertainty,
    };

    return (
      <div className="min-h-screen bg-paper flex flex-col font-sans text-ink relative overflow-x-hidden">
        {/* HIDDEN EXPORT CARDS */}
        <ExportCard
          ref={exportRef}
          results={results}
          familyMatches={familyMatches}
          userCoords={userCoords}
          userTolerance={userTolerance}
          userCertainty={userCertainty}
          selectedMode={selectedMode}
          showSpecific={showSpecific}
          displayFamilies={displayFamilies}
          activeOnly={activeOnly}
          allCoordinates={allCoordinates}
          timestamp={new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          questionCount={answeredQuestionCount || questions.length}
        />

        <ExportLabelsCard
          userLabels={userLabels}
          selectedMode={selectedMode}
          questionCount={answeredQuestionCount || questions.length}
          onRef={(el: HTMLDivElement | null) => { exportLabelsRef.current = el; }}
        />

        <ExportFingerprintCard
          userCoords={userCoords}
          userTolerance={userTolerance}
          userCertainty={userCertainty}
          selectedMode={selectedMode}
          questionCount={answeredQuestionCount || questions.length}
          onRef={(el: HTMLDivElement | null) => { exportFingerprintRef.current = el; }}
        />

        <PageHeader
          showRestart={true}
          onLogoClick={() => setShowBackModal(true)}
          onTitleClick={() => setShowBackModal(true)}
          onBackClick={() => setShowBackModal(true)}
          onRestartClick={() => setShowRestartModal(true)}
        />
        {modals}

        <ResultsDashboard
          results={results}
          familyMatches={familyMatches}
          userCoords={userCoords}
          userTolerance={userTolerance}
          userCertainty={userCertainty}
          userLabels={userLabels}
          selectedMode={selectedMode}
          isCalculating={isCalculating}
          showSpecific={showSpecific}
          compareDenomId={compareDenomId}
          expandedAxis={expandedAxis}
          collapsedCategories={collapsedCategories}
          allCoordinates={allCoordinates}
          isExporting={isExporting}
          isExportingLabels={isExportingLabels}
          isExportingFingerprint={isExportingFingerprint}
          activeOnly={activeOnly}
          onSetActiveOnly={setActiveOnly}
          onSetShowSpecific={setShowSpecific}
          onSetCompareDenomId={setCompareDenomId}
          onSetExpandedAxis={setExpandedAxis}
          onSetCollapsedCategories={setCollapsedCategories}
          onDownloadImage={handleDownloadImage}
          onDownloadLabels={handleDownloadLabels}
          onDownloadFingerprint={handleDownloadFingerprint}
          onRetake={() => setShowRestartModal(true)}
        />

        {/* GLOBAL FOOTER */}
        <footer className="mt-auto w-full border-t border-rule bg-paper py-8 px-6 text-center">
          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <p className="mb-5 max-w-md font-serif text-base italic leading-relaxed text-ink-soft">
              “He is before all things, and in him all things hold together.”
              <span className="mt-1 block text-xs not-italic text-ink-muted">
                Colossians 1:17
              </span>
            </p>
            <div className="meta flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <a href="https://theocompass.com" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-ink">TheoCompass.com</a>
              <a href="https://www.reddit.com/r/TheoCompass" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-ink">r/TheoCompass</a>
              <a href="https://ko-fi.com/oroq" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-accent">Support on Ko-fi</a>
              <a href="mailto:theocompass.project@gmail.com" className="transition-colors hover:text-ink">Contact</a>
            </div>
            <div className="mt-6 space-y-1 border-t border-rule pt-4 text-2xs text-ink-muted">
              <p>Built for informed decisions, not persuasion.</p>
              <p>© 2026 Oroq / TheoCompass Project</p>
            </div>
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
    <div className="min-h-screen bg-paper flex flex-col font-sans text-ink">
      <PageHeader
        showRestart={true}
        onLogoClick={() => setShowBackModal(true)}
        onTitleClick={() => setShowBackModal(true)}
        onBackClick={() => setShowBackModal(true)}
        onRestartClick={() => setShowRestartModal(true)}
      />
      
      {modals}

      {showSaveToast && (
        <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 pointer-events-none">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 border border-rule-strong bg-paper-raised px-3 py-1.5 text-xs font-medium text-ink animate-scale-in-out"
          >
            <svg className="h-3.5 w-3.5 text-sage" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Progress saved
          </div>
        </div>
      )}

      <QuizQuestionView
        currentQuestion={currentQuestion}
        questions={questions}
        currentQuestionIndex={currentQuestionIndex}
        totalQuestions={totalQuestions}
        progressPercentage={progressPercentage}
        hasPrimaryKeyword={hasPrimaryKeyword}
        displayAnswers={displayAnswers}
        selectedAnswer={selectedAnswer}
        expandedInfo={expandedInfo}
        isSilenceSelected={isSilenceSelected}
        silenceType={silenceType}
        certainty={certainty}
        tolerance={tolerance}
        hasShownFirstInfoPulse={hasShownFirstInfoPulse}
        showShortcutHint={showShortcutHint}
        showCategoryTransition={showCategoryTransition}
        transitionCategoryName={transitionCategoryName}
        transitionCategoryCode={transitionCategoryCode}
        quizAnimKey={quizAnimKey}
        quizAnimDir={quizAnimDir}
        userAnswers={userAnswers}
        onStandardAnswerClick={handleStandardAnswerClick}
        onToggleInfo={toggleInfo}
        onSilenceClick={handleSilenceClick}
        onSetCertainty={setCertainty}
        onSetTolerance={setTolerance}
        onNext={handleNext}
        onBack={handleBack}
        onDismissShortcutHint={() => setShowShortcutHint(false)}
        onDismissCategoryTransition={() => setShowCategoryTransition(false)}
      />
    </div>
  );
}