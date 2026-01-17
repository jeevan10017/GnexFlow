import React, { useState } from 'react';
import { X, Sparkles, ArrowRight } from "lucide-react";

const PromptModal = ({ isOpen, onClose, onSubmit, mode, isDarkMode }) => {
  const [prompt, setPrompt] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(prompt);
    setPrompt(""); 
  };

  // --- CLASSIC THEME ---
  const theme = {
    overlay: "bg-black/50",
    container: isDarkMode ? "bg-black border border-stone-800" : "bg-white border border-stone-200",
    text: isDarkMode ? "text-white" : "text-black",
    headerBorder: isDarkMode ? "border-stone-800" : "border-stone-100",
    inputBg: isDarkMode ? "bg-[#111] border-stone-700 text-white" : "bg-stone-50 border-stone-200 text-black",
    btnPrimary: isDarkMode 
      ? "bg-white text-black hover:bg-stone-200" 
      : "bg-black text-white hover:bg-stone-800",
    btnSecondary: isDarkMode 
      ? "bg-stone-800 text-white hover:bg-stone-700" 
      : "bg-stone-100 text-black hover:bg-stone-200",
  };

  return (
    <div className={`fixed inset-0 flex items-center justify-center z-[60] p-4 ${theme.overlay} backdrop-blur-sm`}>
      <div className={`${theme.container} w-full max-w-md rounded-xl shadow-2xl overflow-hidden`}>
        
        {/* Header */}
        <div className={`px-6 py-4 flex justify-between items-center border-b ${theme.headerBorder}`}>
          <h3 className={`font-bold text-lg flex items-center gap-2 ${theme.text}`}>
            <Sparkles className="w-4 h-4" />
            {mode === 'image' ? "Refine Image" : "Describe UI"}
          </h3>
          <button onClick={onClose} className={`hover:opacity-50 p-1 ${theme.text}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={`block text-xs font-bold uppercase tracking-wider opacity-60 mb-2 ${theme.text}`}>
              Custom Instructions (Optional)
            </label>
            <textarea
              autoFocus
              className={`w-full h-32 p-4 rounded-lg resize-none outline-none border focus:ring-1 focus:ring-stone-500 transition-all ${theme.inputBg}`}
              placeholder={mode === 'image' 
                ? "e.g., Make it minimalist line art..." 
                : "e.g., Use a dark theme with rounded buttons..."}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
             <button 
               type="button" 
               onClick={() => onSubmit("")} 
               className={`flex-1 py-3 rounded-lg font-bold text-sm transition-colors ${theme.btnSecondary}`}
             >
               Skip
             </button>
             
             <button 
               type="submit"
               className={`flex-[2] py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-95 ${theme.btnPrimary}`}
             >
               Generate <ArrowRight className="w-4 h-4" />
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PromptModal;