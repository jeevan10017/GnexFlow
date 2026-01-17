import React, { useState, useEffect } from 'react';
import { X, Copy, Download, Code, Eye, Loader2, Check } from "lucide-react";

const CodeModal = ({ isOpen, onClose, data, isLoading, isDarkMode }) => {
  const [viewMode, setViewMode] = useState('preview'); 
  const [copied, setCopied] = useState(false);
  const [displayContent, setDisplayContent] = useState("");

  // --- Sanitize and Force SVG Size ---
  useEffect(() => {
    if (data?.type === "SVG Art" && data?.code) {
      let cleanSvg = data.code;
      
      const svgStartIndex = cleanSvg.indexOf("<svg");
      if (svgStartIndex > -1) {
        cleanSvg = cleanSvg.substring(svgStartIndex);
      }
      
      // Inject sizing styles
      cleanSvg = cleanSvg.replace(
        /<svg([^>]*)>/, 
        (match, attributes) => {
          return `<svg ${attributes} style="width: 100%; height: 100%; min-height: 300px;" width="100%" height="100%">`;
        }
      );
      setDisplayContent(cleanSvg);
    } else {
      setDisplayContent(data?.code || "");
    }
  }, [data]);

  if (!isOpen) return null;

  // --- ACTIONS ---
  const handleCopy = () => {
    navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!data?.code) return;
    const blob = new Blob([data.code], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `genai_art_${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- CLASSIC THEME (Strict Black & White) ---
  const theme = {
    overlay: "bg-black/40",
    container: isDarkMode ? "bg-black border border-stone-800" : "bg-white border border-stone-200",
    text: isDarkMode ? "text-white" : "text-black",
    header: isDarkMode ? "border-stone-800 bg-stone-900" : "border-stone-200 bg-stone-50",
    
    // Primary Button: Black bg (Light) / White bg (Dark)
    btnPrimary: isDarkMode 
      ? "bg-white text-black hover:bg-stone-200" 
      : "bg-black text-white hover:bg-stone-800",
      
    // Secondary Button: Dark Gray bg (Light) / Light Gray bg (Dark)
    btnSecondary: isDarkMode 
      ? "bg-stone-800 text-white hover:bg-stone-700" 
      : "bg-stone-200 text-black hover:bg-stone-300",
      
    codeBg: isDarkMode ? "bg-[#111]" : "bg-stone-50",
    codeText: isDarkMode ? "text-stone-300" : "text-stone-800",
  };

  return (
    <div className={`fixed inset-0 flex items-center justify-center z-[100] p-4 ${theme.overlay} backdrop-blur-sm`}>
      <div className={`${theme.container} w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden transition-colors duration-200`}>
        
        {/* --- 1. HEADER --- */}
        <div className={`px-6 py-4 flex justify-between items-center border-b ${theme.header}`}>
          <div className="flex items-center gap-3">
             {isLoading ? (
                <h2 className={`text-lg font-bold ${theme.text} opacity-80`}>
                    Generating...
                </h2>
             ) : (
                <h2 className={`text-lg font-bold ${theme.text}`}>
                    {data?.type === "SVG Art" ? "Vector Art" : "Generated Code"}
                </h2>
             )}
          </div>

          <div className="flex items-center gap-2">
            {!isLoading && data?.type === "SVG Art" && (
                <div className={`flex p-1 rounded-lg border ${isDarkMode ? "border-stone-700" : "border-stone-200"} mr-4`}>
                    <button 
                        onClick={() => setViewMode('preview')}
                        className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'preview' ? theme.btnPrimary : 'opacity-60 hover:opacity-100 ' + theme.text}`}
                    >
                        <Eye className="w-3 h-3" /> Preview
                    </button>
                    <button 
                         onClick={() => setViewMode('code')}
                         className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'code' ? theme.btnPrimary : 'opacity-60 hover:opacity-100 ' + theme.text}`}
                    >
                        <Code className="w-3 h-3" /> Code
                    </button>
                </div>
            )}
            <button 
              onClick={onClose} 
              className={`p-2 rounded-full transition-colors ${isDarkMode ? "hover:bg-stone-800 text-white" : "hover:bg-stone-200 text-black"}`}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* --- 2. BODY --- */}
        <div className="flex-1 overflow-hidden relative">
          {isLoading ? (
            <div className={`flex flex-col items-center justify-center h-full space-y-4 ${theme.text}`}>
               <Loader2 className="w-10 h-10 animate-spin" />
               <p className="text-sm opacity-60 font-medium">Processing Request...</p>
            </div>
          ) : (
            <div className="h-full w-full overflow-auto custom-scrollbar">
                
                {/* PREVIEW MODE */}
                {data?.type === "SVG Art" && viewMode === 'preview' ? (
                     <div className={`w-full h-full min-h-[400px] flex items-center justify-center p-8 ${isDarkMode ? "bg-[#111]" : "bg-stone-100"}`}>
                        <div 
                            className="w-full h-full flex justify-center items-center"
                            dangerouslySetInnerHTML={{ __html: displayContent }}
                        />
                     </div>
                ) : (
                /* CODE MODE */
                <div className={`p-6 min-h-full font-mono text-sm ${theme.codeBg} ${theme.codeText}`}>
                    <pre className="whitespace-pre-wrap break-words leading-relaxed">
                        {data?.code}
                    </pre>
                </div>
                )}
            </div>
          )}

          {/* --- 3. FOOTER ACTIONS --- */}
          {!isLoading && (
              <div className="absolute bottom-6 right-8 flex flex-col gap-3">
                 {data?.type === "SVG Art" && (
                    <button 
                        onClick={handleDownload}
                        className={`flex items-center justify-center gap-1 px-2 py-2 rounded-lg shadow-md font-bold  ${theme.btnSecondary}`}
                    >
                        <Download className="w-4 h-4" />
                        Download SVG
                    </button>
                 )}
                 <button 
                    onClick={handleCopy}
                    className={`flex items-center justify-center gap-1 px-2 py-2 rounded-lg shadow-md font-bold  ${theme.btnPrimary}`}
                 >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied" : "Copy Code"}
                 </button>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeModal;