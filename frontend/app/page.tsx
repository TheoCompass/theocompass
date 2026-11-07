"use client"; // Required for interactivity

import Image from "next/image";
import Link from "next/link";
import { useState } from "react"; 

export default function Home() {
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
         <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-500 items-center">
           <Link href="#products" className="hover:text-blue-700 transition-colors">Products</Link>
           <Link href="#roadmap" className="hover:text-blue-700 transition-colors">Roadmap</Link>
           <a href="https://www.reddit.com/r/TheoCompass" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 px-3 py-1.5 rounded-full text-xs font-bold transition-all">💬 Community</a>
           <a href="https://ko-fi.com/oroq" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-pink-50 hover:bg-pink-100 text-pink-600 border border-pink-200 px-3 py-1.5 rounded-full text-xs font-bold transition-all">❤️ Support</a>
         </nav>

        {/* Mobile Menu Button */}
        <div className="md:hidden">
           <button 
             onClick={() => setIsMenuOpen(!isMenuOpen)} 
             className="text-slate-600 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
             aria-label="Toggle Menu"
           >
             {isMenuOpen ? (
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
               </svg>
             ) : (
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
               </svg>
             )}
           </button>
        </div>
        {/* Mobile Dropdown Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 shadow-sm z-40 absolute w-full left-0 top-full">
          <nav className="flex flex-col gap-4 p-6 text-base font-medium text-slate-700">
             <Link href="#products" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-700 transition-colors">Products</Link>
             <Link href="#roadmap" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-700 transition-colors">Roadmap</Link>
             <a href="https://www.reddit.com/r/TheoCompass" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-orange-500 hover:text-orange-600 font-semibold transition-colors">💬 Community</a>
             <a href="https://ko-fi.com/oroq" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-pink-500 hover:text-pink-600 font-semibold transition-colors">❤️ Support</a>
          </nav>
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <main className="relative min-h-[90vh] flex flex-col items-center justify-center w-full overflow-hidden">
        <div className="absolute inset-0 z-0 bg-slate-900">
          <Image 
            src="/banner.png" 
            alt="TheoCompass Background" 
            fill
            className="object-cover object-center opacity-40"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b" />
        </div>

        <div className="relative z-10 w-full max-w-5xl mx-auto px-6 py-20 text-center flex flex-col items-center">
           <div className="mb-6 inline-flex items-center gap-2 bg-amber-500/15 backdrop-blur-md border border-amber-400/30 text-amber-100 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
             <span className="relative flex h-2 w-2">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
             </span>
             🚀 v2.0 Open Beta is Live!
           </div>

          <h1 className="font-serif text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight drop-shadow-lg">
            Find your theological <span className="text-blue-400">alignment.</span>
          </h1>
          
           <p className="text-lg md:text-xl text-slate-200 mb-10 max-w-2xl mx-auto leading-relaxed drop-shadow">
             Explore the theological landscape. Match your beliefs against <span className="font-bold text-white">230+ Christian denominations</span> across 13 dimensions.
             We analyze not just <span className="font-bold text-white">what</span> you believe, 
             but your certainty and posture toward others.
           </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <Link 
              href="/christian-denominations" 
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-10 rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1 text-lg ring-1 ring-white/20"
            >
              Take the Quiz
            </Link>
            <Link 
              href="#roadmap" 
              className="bg-white/10 backdrop-blur-md border border-white/30 hover:bg-white/20 text-white font-bold py-4 px-10 rounded-full shadow-lg transition-all text-lg"
            >
              View Roadmap
            </Link>
          </div>
        </div>
      </main>

      {/* 3. Active Products Section */}
      <section id="products" className="w-full bg-slate-50 py-24 px-6 relative z-10 -mt-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 md:p-12 flex flex-col md:flex-row gap-8 items-center transform hover:-translate-y-1 transition-transform duration-300">
            <div className="flex-1">
              <span className="text-amber-600 font-bold tracking-widest uppercase text-xs mb-2 block">Now in Open Beta</span>
              <h2 className="font-serif text-3xl font-bold text-slate-900 mb-4">Denomination Alignment Quiz</h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                Now powered by <strong>230+ Christian denominations</strong> across history. The open beta unlocks our full theological database — match your beliefs to traditions from Apostolic to Pentecostal, and see exactly where you align.
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2.5 py-1 rounded">13 Dimensions</span>
                <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2.5 py-1 rounded">30 Questions</span>
                <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-1 rounded border border-amber-200">230+ Denominations</span>
              </div>
              <Link href="/christian-denominations" className="inline-flex items-center font-bold text-blue-600 hover:text-blue-800 transition-colors">
                Take the Quiz <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </Link>
            </div>
            <div className="w-full md:w-1/3 aspect-square rounded-2xl overflow-hidden shadow-inner shrink-0 relative bg-slate-100 border border-slate-200">
              <Image 
                src="/compass-family.png" 
                alt="TheoCompass family alignment chart showing 30 Christian tradition clusters"
                fill
                className="object-contain p-3"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 4. What's New in Open Beta */}
      <section className="w-full bg-white py-24 px-6 border-t border-slate-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-4">What's New in Open Beta</h2>
            <p className="text-slate-600 leading-relaxed max-w-xl mx-auto">
              Since the Alpha, we've been hard at work. Here's what the Open Beta brings to the table.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Database */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 hover:border-amber-300 hover:shadow-md transition-all group">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-4 text-xl group-hover:scale-110 transition-transform">
                📚
              </div>
              <h3 className="font-bold text-slate-900 mb-2">230+ Denominations</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Our full theological database is now live — spanning traditions from Apostolic to Pentecostal, across every major branch of Christianity.
              </p>
            </div>

            {/* Card 2: Visual Overhaul */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-md transition-all group">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-4 text-xl group-hover:scale-110 transition-transform">
                🎨
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Redesigned Results</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                A complete visual overhaul of the results page — featuring an interactive compass chart, theological fingerprint breakdown, and a dynamic label cloud.
              </p>
            </div>

            {/* Card 3: Side-by-Side Compare */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 hover:border-emerald-300 hover:shadow-md transition-all group">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center mb-4 text-xl group-hover:scale-110 transition-transform">
                🔬
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Compare Side-by-Side</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Expand any denomination card to see axis-by-axis alignment against your profile — discover exactly where you overlap and where you diverge.
              </p>
            </div>
          </div>

          {/* Community CTA ribbon */}
          <div className="mt-12 bg-gradient-to-r from-orange-50 to-pink-50 border border-orange-200/60 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-bold text-slate-800 mb-1">Shape the future of TheoCompass</p>
              <p className="text-sm text-slate-600">Join the Reddit community to discuss results, suggest features, and help calibrate the algorithm.</p>
            </div>
            <a 
              href="https://www.reddit.com/r/TheoCompass" 
              target="_blank" 
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-full transition-all shadow-md hover:shadow-lg text-sm"
            >
              💬 Join the Community
            </a>
          </div>
        </div>
      </section>

      {/* 5. Support the Project */}
      <section className="w-full bg-slate-50 py-24 px-6 border-t border-slate-100">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-gradient-to-br from-pink-50 to-amber-50 border border-pink-200/60 rounded-2xl p-8 md:p-10">
            <div className="text-4xl mb-4">☕</div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-slate-900 mb-4">Support the Project</h2>
            <p className="text-slate-600 leading-relaxed max-w-xl mx-auto mb-6">
              Each month of development involves dozens of hours of work, from deep theological research to coding the quiz and its scoring models. This goal helps sustain the project's momentum and directly funds the time and effort required to build the next phase of TheoCompass.
            </p>
            <a 
              href="https://ko-fi.com/oroq" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-pink-500 hover:bg-pink-600 text-white font-bold px-8 py-3 rounded-full shadow-md hover:shadow-lg transition-all text-sm"
            >
              ❤️ Support on Ko‑fi
            </a>
          </div>
        </div>
      </section>

      {/* 6. Development Roadmap Section (Vertical Timeline) */}
      <section id="roadmap" className="w-full bg-white py-24 px-6 border-t border-slate-100">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-4">Development Roadmap</h2>
            <p className="text-slate-600 leading-relaxed max-w-xl mx-auto">
              TheoCompass is under active development. We are building the most comprehensive theological mapping tool on the internet. Here is where we are heading.
            </p>
          </div>

          {/* Timeline Container */}
          <div className="relative border-l-2 border-slate-200 ml-4 md:ml-12 space-y-12 pb-8">
            
            {/* Phase 1: Complete */}
            <div className="relative pl-8 md:pl-12">
              <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-300 ring-4 ring-white"></div>
              <span className="text-slate-400 font-bold tracking-widest uppercase text-xs block mb-1">Phase 1 • Complete</span>
              <h3 className="text-xl font-bold text-slate-900 mb-2">v2.0 Open Beta</h3>
              <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                The core engine was successfully stress-tested with the 13-axis algorithm, silence mechanics, and posture multipliers using a 30-question test against 30 major traditions.
              </p>
            </div>

            {/* Phase 2: Live Now */}
            <div className="relative pl-8 md:pl-12">
              <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-amber-500 ring-4 ring-white"></div>
              <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-amber-500 animate-ping opacity-50"></div>
              <span className="text-amber-600 font-bold tracking-widest uppercase text-xs block mb-1">Phase 2 • Live Now</span>
              <h3 className="text-xl font-bold text-slate-900 mb-2">v2.0 Open Beta</h3>
              <p className="text-slate-600 mb-3 text-sm leading-relaxed">
                The full 230+ denomination database is live! We are gathering community feedback to calibrate the algorithm and refine the user experience.
              </p>
              <ul className="text-sm text-slate-500 list-disc pl-4 space-y-1">
                <li>Full 230+ denomination dataset</li>
                <li>Redesigned results with compass chart & label cloud</li>
                <li>Side-by-side denomination comparison</li>
              </ul>
            </div>

            {/* Phase 3: Launch */}
            <div className="relative pl-8 md:pl-12 group">
              <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-200 border-2 border-slate-300 ring-4 ring-white group-hover:border-blue-400 transition-colors"></div>
              <span className="text-slate-500 font-bold tracking-widest uppercase text-xs block mb-1">Phase 3 • Planned</span>
              <h3 className="text-xl font-bold text-slate-900 mb-2">v2.0 Official Launch</h3>
              <p className="text-slate-600 mb-3 text-sm leading-relaxed">
                The complete standard experience. Unlocking the larger test and introducing user infrastructure for saving and sharing theology.
              </p>
              <ul className="text-sm text-slate-500 list-disc pl-4 space-y-1">
                <li>Standard Mode (~60 Questions)</li>
                <li>User accounts to save & share results</li>
                <li>Anonymous opt-in for the Global Theology Map</li>
              </ul>
            </div>

            {/* Phase 4: Deep Dive */}
            <div className="relative pl-8 md:pl-12 group">
              <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-200 border-2 border-slate-300 ring-4 ring-white group-hover:border-blue-400 transition-colors"></div>
              <span className="text-slate-500 font-bold tracking-widest uppercase text-xs block mb-1">Phase 4 • Future</span>
              <h3 className="text-xl font-bold text-slate-900 mb-2">The Deep Dive Expansion</h3>
              <p className="text-slate-600 mb-3 text-sm leading-relaxed">
                For the ultimate theology nerds and students. A massive test exploring the absolute granular depths of Christian doctrine.
              </p>
              <ul className="text-sm text-slate-500 list-disc pl-4 space-y-1">
                <li>Deep Dive Mode (120 Questions)</li>
                <li>Side-by-side user comparison tool</li>
                <li>Creedal Alignment scoring</li>
              </ul>
            </div>

          </div>
          
          {/* Platform Future Note */}
          <div className="mt-12 p-6 bg-blue-50 border border-blue-100 rounded-xl text-center">
            <p className="text-sm font-medium text-blue-800">
              <strong>Beyond Phase 4:</strong> TheoCompass will expand to include the Worldview Quiz, the Global Theology Heatmap, and community-requested features.
            </p>
          </div>

        </div>
      </section>

      {/* 5. Footer */}
      <footer className="w-full bg-slate-900 text-slate-400 py-12 px-6 text-center border-t border-slate-800">
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
