import React, { useState, useEffect, useCallback } from 'react';

// --- Helper Functions ---

// 1. Converts a Base64 Data URL to a Blob object
function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) throw new Error("Invalid Data URL");
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// --- Main App Component ---

export default function App() {
  // Search & UI State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [isCSELoaded, setIsCSELoaded] = useState(false);
  const [activeCakeType, setActiveCakeType] = useState('All');

  // Image Handling & Gallery State
  const [gallery, setGallery] = useState([]); // {id, dataUrl, file}
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [error, setError] = useState(null);

  // API & Pricing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [priceResult, setPriceResult] = useState(null);

  // Mobile-specific state
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // --- Constants & Config ---
  const SEARCH_ENGINE_ID = '825ca1503c1bd4d00';
  const CAKE_TYPES = ['All', '1 Tier', '2 Tier', '3 Tier', 'Square', 'Rectangle', 'Cupcakes'];

  // --- Mobile Keyboard Detection ---
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const heightDiff = window.innerHeight - window.visualViewport.height;
        setIsKeyboardOpen(heightDiff > 150);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport.removeEventListener('resize', handleResize);
    }
  }, []);

  // --- Image Validation ---
  const validateFile = (file) => {
    const MAX_SIZE_MB = 10;
    const MIN_DIMENSION = 200;
    
    if (!file.type.startsWith('image/')) {
        return `Invalid file type. Please upload an image.`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        return `File is too large. Maximum size is ${MAX_SIZE_MB}MB.`;
    }
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const image = new Image();
            image.src = e.target.result;
            image.onload = () => {
                if (image.width < MIN_DIMENSION || image.height < MIN_DIMENSION) {
                    resolve(`Image is too small. Minimum dimensions are ${MIN_DIMENSION}x${MIN_DIMENSION}px.`);
                } else {
                    resolve(null); // No error
                }
            };
            image.onerror = () => resolve('Could not read image dimensions.');
        };
        reader.onerror = () => resolve('Failed to read file.');
    });
  };

  // --- Handlers ---
  const processFiles = async (files) => {
    setError(null); // Clear previous errors
    
    // Limit to only one image
    const file = files[0];
    if (!file) return;
    
    const validationError = await validateFile(file);
    if (validationError) {
        setError(validationError);
        return;
    }
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    const dataUrl = await new Promise(resolve => reader.onload = e => resolve(e.target.result));
    const newImage = { id: Date.now() + Math.random(), dataUrl, file };
    
    // Replace gallery with single image
    setGallery([newImage]);
    setSelectedImageIndex(0);
    setIsUploadOpen(false);
  };

  const handleFileChange = (e) => processFiles(Array.from(e.target.files));
  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles([files[0]]); // Only process first image
  };
  const handlePaste = (e) => {
     const files = Array.from(e.clipboardData.files).filter(file => file.type.startsWith('image/'));
     if (files.length > 0) processFiles([files[0]]); // Only process first image
  };
  const handleDragOver = (e) => e.preventDefault();
  
  // --- Pricing Logic (Mock) ---
  const handleCalculatePrice = async () => {
      if (gallery.length === 0) return;
      
      setIsProcessing(true);
      setError(null);
      setPriceResult(null);

      // In a real app, you would upload to Supabase/S3 and then call your API.
      // For this example, we'll simulate an API call.
      try {
          // const publicUrl = await uploadImageToSupabase(gallery[selectedImageIndex].file);
          // const response = await fetch('/api/price-by-url', { ... });
          
          // --- MOCK API CALL ---
          await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network latency
          const mockPrice = (Math.random() * 100 + 50).toFixed(2);
          setPriceResult({
              price: `$${mockPrice}`,
              breakdown: [
                  `Base Cake: $${(mockPrice * 0.4).toFixed(2)}`,
                  `Fondant/Icing: $${(mockPrice * 0.3).toFixed(2)}`,
                  `Complexity: $${(mockPrice * 0.3).toFixed(2)}`,
              ]
          });
          // --- END MOCK ---
          
      } catch (err) {
          console.error(err);
          setError("Failed to get price. Please try again.");
      } finally {
          setIsProcessing(false);
      }
  };

  // --- Google CSE Handlers & Effects ---
  const executeCseSearch = (query) => {
    if (!query || !query.trim() || !window.google?.search?.cse?.element) return;
    
    // Add cake type to search query if not 'All'
    const searchTerm = activeCakeType === 'All' ? query : `${query} ${activeCakeType} cake`;
    
    try {
      const cseElement = window.google.search.cse.element.getElement('results') || 
        window.google.search.cse.element.render({ 
          div: 'google-search-container', 
          tag: 'searchresults-only',
          gname: 'results',
          attributes: { searchType: 'image', disableWebSearch: true } 
        });
      cseElement.execute(searchTerm);
    } catch (err) {
      console.error('executeCseSearch error', err);
    }
  };
  
  const handleCakeTypeChange = (cakeType) => {
    setActiveCakeType(cakeType);
    // Re-execute search with new cake type
    if (searchQuery.trim()) {
      setTimeout(() => executeCseSearch(searchQuery), 100);
    }
  };
  const handleSearch = () => { if (searchQuery.trim()) setShowResults(true); };
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch(); };
  const closeResults = () => setShowResults(false);

  useEffect(() => {
    if (!showResults) return;
    if (document.getElementById('google-cse-script')) {
      executeCseSearch(searchQuery);
      return;
    }
    window.__gcse = { parsetags: 'explicit', callback: () => { setIsCSELoaded(true); executeCseSearch(searchQuery); } };
    const script = document.createElement('script');
    script.id = 'google-cse-script';
    script.async = true;
    script.src = `https://cse.google.com/cse.js?cx=${SEARCH_ENGINE_ID}`;
    document.head.appendChild(script);
    return () => {
      const cseScript = document.getElementById('google-cse-script');
      if (cseScript) cseScript.parentNode.removeChild(cseScript);
    };
  }, [showResults, searchQuery, activeCakeType]);

  useEffect(() => {
    if (!showResults) return;
    const targetNode = document.getElementById('google-search-container');
    if (!targetNode) return;
    const hideUnwantedElements = (node) => {
      const selectors = '.gcse-result-tabs, .gsc-tabsArea, .gsc-above-wrapper-area, .gsc-above-wrapper-area-container';
      node.querySelectorAll(selectors).forEach(el => el.style.display = 'none');
    };
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) hideUnwantedElements(node);
          });
        }
      }
    });
    observer.observe(targetNode, { childList: true, subtree: true });
    hideUnwantedElements(targetNode);
    return () => observer.disconnect();
  }, [showResults]);

  // --- Component Render ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background decoration - reduced for mobile */}
      <div className="absolute top-10 left-4 w-16 h-16 sm:w-32 sm:h-32 sm:top-20 sm:left-10 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-bounce"></div>
      <div className="absolute top-20 right-8 w-20 h-20 sm:w-40 sm:h-40 sm:top-40 sm:right-20 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-bounce" style={{animationDelay: '1s'}}></div>
      <div className="absolute bottom-10 left-1/4 w-16 h-16 sm:w-32 sm:h-32 sm:bottom-20 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-bounce" style={{animationDelay: '2s'}}></div>
      
      {/* Main Content */}
      <div className="z-10 w-full flex flex-col items-center justify-center p-4">
        <div className="mb-8 sm:mb-12 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent mb-4">
            Cake Genie
          </h1>
          <p className="text-gray-600 text-base sm:text-lg">Find any cake design & get AI-powered pricing</p>
        </div>
        
        {/* Main Content Area */}
        <div className="w-full flex flex-col items-center">
          {/* === Initial View: Search or Upload === */}
          {!showResults && gallery.length === 0 && (
            <div className="w-full max-w-md sm:max-w-3xl mx-auto">
               {isUploadOpen ? (
                  // Upload View
                   <div className="w-full">
                      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 sm:p-6 animate-fade-in">
                          <div className="flex justify-between items-center mb-4 sm:mb-6">
                              <h3 className="text-base sm:text-lg font-semibold text-gray-700">Upload Your Cake Design</h3>
                              <button 
                                onClick={() => setIsUploadOpen(false)} 
                                className="touch-target p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors" 
                                aria-label="Close"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                              </button>
                          </div>
                          <div 
                            onDragOver={handleDragOver} 
                            onDrop={handleDrop} 
                            onClick={() => document.getElementById('fileInput').click()} 
                            className="border-2 border-dashed border-gray-300 rounded-xl p-8 sm:p-12 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all duration-300 touch-target"
                          >
                              <div className="mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                              </div>
                              <p className="text-gray-700 font-medium text-sm sm:text-base">
                                Drag an image here, paste, or <span className="text-blue-600 font-semibold">tap to upload</span>
                              </p>
                          </div>
                          <input id="fileInput" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                      </div>
                   </div>
               ) : (
                  // Search View
                  <div className="bg-white rounded-full shadow-xl p-1 sm:p-2 flex items-center border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
                      <input 
                        type="text" 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        onKeyDown={handleKeyDown} 
                        placeholder="Search for cake designs..." 
                        className="flex-grow px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg outline-none rounded-full bg-transparent" 
                        onPaste={handlePaste}
                      />
                      <button 
                        onClick={handleSearch} 
                        className="touch-target p-2 sm:p-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:opacity-90 transition-opacity duration-200 mx-1 sm:mx-2" 
                        aria-label="Search"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                      </button>
                      <div className="w-px h-6 sm:h-8 bg-gray-200"></div>
                      <button 
                        onClick={() => setIsUploadOpen(true)} 
                        className="touch-target p-2 sm:p-3 rounded-full hover:bg-gray-100 cursor-pointer transition-colors duration-200 ml-1 sm:ml-2" 
                        aria-label="Upload Image"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                      </button>
                  </div>
               )}
            </div>
          )}
          
          {/* === Gallery & Pricing View === */}
          {gallery.length > 0 && !showResults && (
              <div className="mt-8 p-6 bg-white rounded-xl shadow-lg w-full max-w-2xl text-center animate-fade-in">
                  <h3 className="text-lg sm:text-xl font-semibold mb-4">Your Cake Design</h3>
                  
                  {/* Main Image */}
                  <img 
                    src={gallery[selectedImageIndex].dataUrl} 
                    alt="Selected cake" 
                    className="w-full h-80 object-cover rounded-lg mb-4" 
                  />

                  {/* Actions & Results */}
                  <div className="mt-4">
                      {priceResult ? (
                          // Price Result View
                          <div className="text-left p-4 bg-green-50 rounded-lg border border-green-200">
                             <h4 className="font-bold text-xl sm:text-2xl text-green-800 mb-2">Estimated Price: {priceResult.price}</h4>
                             <ul className="list-disc list-inside mt-2 text-green-700 space-y-1">
                                  {priceResult.breakdown.map((item, i) => <li key={i} className="text-sm sm:text-base">{item}</li>)}
                             </ul>
                             <button 
                               onClick={() => {setPriceResult(null); setGallery([]);}} 
                               className="mt-4 w-full bg-gray-200 text-gray-800 py-3 rounded-lg font-medium touch-target hover:bg-gray-300 transition-colors"
                             >
                               Start Over
                             </button>
                          </div>
                      ) : (
                          // Calculate Button View
                          <div className="space-y-3">
                               <button 
                                 onClick={handleCalculatePrice} 
                                 disabled={isProcessing} 
                                 className="bg-gradient-to-r from-pink-500 to-purple-500 text-white px-8 py-3 rounded-full font-medium hover:opacity-90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed w-full"
                               >
                                  {isProcessing ? 'Calculating...' : 'Calculate Price with AI'}
                              </button>
                              <button 
                                onClick={() => setGallery([])} 
                                className="mt-2 text-sm text-gray-500 hover:text-gray-700"
                              >
                                Clear image
                              </button>
                          </div>
                      )}
                  </div>
                  {error && <p className="text-red-500 mt-4 text-sm sm:text-base">{error}</p>}
              </div>
          )}
          
          {/* === Search Results View === */}
          {showResults && (
            <div className="w-full max-w-6xl mx-auto animate-fade-in">
              {/* Search Bar - Fixed at Top */}
              <div className="bg-white rounded-full shadow-xl p-1 sm:p-2 flex items-center border border-gray-200 hover:shadow-2xl transition-shadow duration-300 mb-6">
                  <input 
                    type="text" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    onKeyDown={handleKeyDown} 
                    placeholder="Search for cake designs..." 
                    className="flex-grow px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg outline-none rounded-full bg-transparent" 
                    onPaste={handlePaste}
                  />
                  <button 
                    onClick={handleSearch} 
                    className="touch-target p-2 sm:p-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:opacity-90 transition-opacity duration-200 mx-1 sm:mx-2" 
                    aria-label="Search"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                  </button>
                  <div className="w-px h-6 sm:h-8 bg-gray-200"></div>
                  <button 
                    onClick={closeResults} 
                    className="touch-target p-2 sm:p-3 rounded-full hover:bg-gray-100 cursor-pointer transition-colors duration-200 ml-1 sm:ml-2" 
                    aria-label="Close Search"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                  </button>
              </div>
              
              {/* Results Container */}
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 sm:p-6">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-4">
                    Search results for: <span className="text-purple-600">"{searchQuery}"</span>
                  </h3>
                  
                  {/* Cake Type Tabs */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {CAKE_TYPES.map((cakeType) => (
                      <button
                        key={cakeType}
                        onClick={() => handleCakeTypeChange(cakeType)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                          activeCakeType === cakeType
                            ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {cakeType}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div id="google-search-container" className="min-h-[300px] sm:min-h-[400px]"></div>
                {!isCSELoaded && (
                  <div className="text-center py-8 text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto mb-4"></div>
                    <p className="text-sm sm:text-base">Loading search results...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-6 text-gray-500 text-sm z-10">Made with ❤️ by Cake Genie • AI-Powered Cake Pricing</div>
    </div>
  );
}