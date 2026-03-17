"use client"; // 1. Required for interactivity

import Image from "next/image";
import Link from "next/link";
import { useState } from "react"; // 2. Import useState

export default function Home() {
  // 3. State to track if mobile menu is open
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50 text-slate-900">
      
      {/* 1. Header */}
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 py-4 px-6 md:px-12 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3 group">
          <Image 
            src="/logo.png" 
            alt="TheoCompass Logo" 
            width={40} 
            height={40} 
            className="rounded transition-transform group-hover:scale-105"
          />
          <span className="font-serif font-bold text-xl text-slate-800 tracking-tight">TheoCompass</span>
        </Link>
        
        {/* Desktop Nav */}
        <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-500">
          <Link href="#about" className="hover:text-blue-700 transition-colors">About</Link>
          <a href="https://www.reddit.com/r/TheoCompass" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500 transition-colors">Community</a>
          <a href="https://ko-fi.com/oroq" target="_blank" rel="noopener noreferrer" className="hover:text-pink-500 transition-colors">Support</a>
        </nav>

        {/* 4. Mobile Menu Button (Functional Now) */}
        <div className="md:hidden">
           <button 
             onClick={() => setIsMenuOpen(!isMenuOpen)} 
             className="text-slate-600 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
             aria-label="Toggle Menu"
           >
             {isMenuOpen ? (
               // "X" Icon when open
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
               </svg>
             ) : (
               // "Hamburger" Icon when closed
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
               </svg>
             )}
           </button>
        </div>
      </header>

      {/* 5. Mobile Dropdown Menu (Renders below header) */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 shadow-sm z-40">
          <nav className="flex flex-col gap-4 p-6 text-base font-medium text-slate-700">
            <Link href="#about" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-700 transition-colors">About the Project</Link>
            <a href="https://www.reddit.com/r/TheoCompass" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500 transition-colors">Community</a>
            <a href="https://ko-fi.com/oroq" target="_blank" rel="noopener noreferrer" className="hover:text-pink-500 transition-colors">Support</a>
          </nav>
        </div>
      )}

      {/* 2. Hero Section - With Background Image */}
      <main className="relative min-h-[90vh] flex flex-col items-center justify-center w-full overflow-hidden">
        
        {/* --- BACKGROUND IMAGE --- */}
        <div className="absolute inset-0 z-0">
          <Image 
            src="/banner.png" 
            alt="TheoCompass Background" 
            fill
            className="object-cover object-center"
            priority
          />
          {/* Dark Gradient Overlay - Crucial for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/60 to-slate-900/90" />
        </div>

        {/* --- CONTENT (Text & Buttons) --- */}
        <div className="relative z-10 w-full max-w-5xl mx-auto px-6 py-20 text-center flex flex-col items-center">
          
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            v2.0 Public Alpha Live
          </div>

          {/* Changed Text to White for contrast */}
          <h1 className="font-serif text-4xl md:text-6xl font-bold text-white mb-6 leading-tight tracking-tight drop-shadow-md">
            Find your theological <span className="text-blue-300">alignment.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-200 mb-8 max-w-2xl mx-auto leading-relaxed">
            A nuanced quiz that maps your beliefs across 120 theological questions. 
            We analyze not just <span className="font-medium text-white">what</span> you believe, 
            but your certainty and posture toward others.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <Link 
              href="/christian-denominations" 
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-10 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 text-lg ring-1 ring-white/10"
            >
              Take the Quiz
            </Link>
            <Link 
              href="#about" 
              className="bg-white/10 backdrop-blur-sm border border-white/30 hover:bg-white/20 text-white font-bold py-4 px-10 rounded-full shadow-sm hover:shadow-md transition-all text-lg"
            >
              Learn More
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-slate-300 text-sm font-medium uppercase tracking-wider">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              Free & Open Source
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>
              30+ Traditions
            </span>
          </div>
        </div>
      </main>

      {/* 3. About / Roadmap Section */}
      <section id="about" className="w-full bg-white py-20 px-6 border-t border-slate-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-4">The Roadmap</h2>
            <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed">
              TheoCompass is more than a quiz—it's a growing platform for theological self-discovery. Here is what is currently available and what is coming next.
            </p>
          </div>

          {/* Project Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Active Project - Highlighted */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-600 p-8 flex flex-col relative overflow-hidden transform hover:scale-[1.02] transition-transform">
              <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full w-max mb-4 border border-blue-200">Active Module</span>
              <h3 className="font-serif font-bold text-2xl mb-2 text-slate-900">Denomination Alignment Quiz v2.0 Public Alpha</h3>
              <p className="text-slate-500 text-sm mb-6 flex-grow leading-relaxed">
                Match your beliefs to over 30 different Christian denominations and movements across history using our 12-axis scoring model.
              </p>
              <Link href="/christian-denominations" className="bg-blue-600 text-white text-center font-bold text-sm py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-md">
                Enter Module →
              </Link>
            </div>

            {/* Future Project 1 - Roadmap Style */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 flex flex-col relative group hover:border-slate-300 transition-colors">
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full w-max mb-4 border border-amber-200">Phase 2</span>
              <h3 className="font-serif font-bold text-2xl mb-2 text-slate-700">Philosophical Compass</h3>
              <p className="text-slate-400 text-sm mb-6 flex-grow leading-relaxed">
                Explore the philosophical '-isms' (Platonism, Existentialism, etc.) that form the bedrock of religious belief.
              </p>
              <span className="text-slate-400 font-bold text-sm mt-auto border-t border-slate-200 pt-4">
                Planned
              </span>
            </div>

            {/* Future Project 2 - Roadmap Style */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 flex flex-col relative group hover:border-slate-300 transition-colors">
              <span className="bg-slate-200 text-slate-600 text-xs font-bold px-3 py-1 rounded-full w-max mb-4">Phase 3</span>
              <h3 className="font-serif font-bold text-2xl mb-2 text-slate-700">Hermeneutics Module</h3>
              <p className="text-slate-400 text-sm mb-6 flex-grow leading-relaxed">
                Align your Bible interpretation style across key passages to major hermeneutical traditions.
              </p>
              <span className="text-slate-400 font-bold text-sm mt-auto border-t border-slate-200 pt-4">
                Planned
              </span>
            </div>

          </div>
        </div>
      </section>

      {/* 4. Footer */}
      <footer className="w-full bg-slate-900 text-slate-400 py-12 px-6 text-center">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          <p className="font-serif italic text-lg mb-6 text-slate-300">
            "He is before all things, and in him all things hold together." — Colossians 1:17
          </p>
          <div className="flex gap-6 mb-8 text-sm">
            <a href="https://www.reddit.com/r/TheoCompass" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Community</a>
            <a href="https://ko-fi.com/oroq" target="_blank" rel="noopener noreferrer" className="hover:text-pink-400 transition-colors">Support</a>
            <a href="mailto:theocompass.project@gmail.com" className="hover:text-white transition-colors">Contact</a>
          </div>
          <div className="border-t border-slate-800 pt-6 w-full max-w-md">
            <p className="text-xs text-slate-500 mb-1">Built for informed decision, not persuasion.</p>
            <p className="text-xs text-slate-600">© 2026 Oroq / TheoCompass Project</p>
          </div>
        </div>
      </footer>
    </div>
  );
}