import React, { useState, useEffect, useCallback, useRef } from 'react';
import { uploadImageToSupabase, saveImageToDatabase, fetchPricingData } from './supabase.js';
import { compressAndOptimizeImage, formatFileSize } from './utils/imageCompression.js';
import { ProcessingIndicator } from './components/ProgressBar.jsx';

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
  const [isSearching, setIsSearching] = useState(false);

  // Image Handling & Gallery State
  const [gallery, setGallery] = useState([]); // {id, dataUrl, file}
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [error, setError] = useState(null);

  // Processing state for better user feedback
  const [processingState, setProcessingState] = useState('idle'); // idle, uploading, processing, complete, error
  const [processingMessage, setProcessingMessage] = useState('');
  const [compressionInfo, setCompressionInfo] = useState(null);
  
  // Pricing state (simplified)
  const [priceResult, setPriceResult] = useState(null);

  // Mobile-specific state
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  
  // Race condition prevention
  const pendingSearchQuery = useRef(null);
  const searchAbortController = useRef(null);
  const uploadAbortController = useRef(null);
  const isProcessingUpload = useRef(false);

  // --- Constants & Config ---
  const SEARCH_ENGINE_ID = '825ca1503c1bd4d00';

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

  // --- Image Validation & Upload ---
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

  const uploadToSupabase = async (file) => {
    try {
      setError(null);
      console.log('Uploading image to Supabase...');
      
      // Upload image to Supabase Storage
      const { filePath, publicUrl } = await uploadImageToSupabase(file);
      console.log('Image uploaded successfully:', publicUrl);
      
      // Save to database
      const dbRecord = await saveImageToDatabase(publicUrl, file.name);
      console.log('Image data saved to database:', dbRecord);
      
      return { publicUrl, dbRecord };
    } catch (error) {
      console.error('Failed to upload to Supabase:', error);
      
      // Enhanced error handling with specific error types
      let userFriendlyMessage = 'Upload failed. Please try again.';
      
      if (error.message.includes('not configured')) {
        userFriendlyMessage = 'Service configuration error. Please check your settings and try again.';
      } else if (error.message.includes('storage')) {
        userFriendlyMessage = 'File storage error. Please check your connection and try again.';
      } else if (error.message.includes('database')) {
        userFriendlyMessage = 'Database error. Please try again in a few moments.';
      } else if (error.message.includes('network') || error.code === 'NETWORK_ERROR') {
        userFriendlyMessage = 'Network error. Please check your internet connection and try again.';
      }
      
      setError(userFriendlyMessage);
      throw new Error(userFriendlyMessage);
    }
  };

  // --- Handlers ---
  const processFiles = async (files) => {
    // Prevent concurrent uploads
    if (isProcessingUpload.current) {
      console.log('Upload already in progress, ignoring...');
      return;
    }
    
    isProcessingUpload.current = true;
    
    // Cancel any previous upload
    if (uploadAbortController.current) {
      uploadAbortController.current.abort();
    }
    uploadAbortController.current = new AbortController();
    
    setError(null); // Clear previous errors
    setCompressionInfo(null);
    
    // Limit to only one image
    const file = files[0];
    if (!file) {
      isProcessingUpload.current = false;
      return;
    }
    
    const validationError = await validateFile(file);
    if (validationError) {
        setError(validationError);
        isProcessingUpload.current = false;
        return;
    }
    
    try {
        // Check if operation was cancelled
        if (uploadAbortController.current.signal.aborted) {
          isProcessingUpload.current = false;
          return;
        }
        
        // Step 1: Compress image
        setProcessingState('uploading');
        setProcessingMessage('Optimizing image...');
        
        const compressionResult = await compressAndOptimizeImage(file);
        
        // Check if operation was cancelled after compression
        if (uploadAbortController.current.signal.aborted) {
          isProcessingUpload.current = false;
          return;
        }
        
        setCompressionInfo({
            originalSize: compressionResult.originalSize || file.size,
            compressedSize: compressionResult.blob.size,
            ratio: compressionResult.compressionRatio || 1,
            dimensions: compressionResult.dimensions
        });
        
        console.log('Image compression complete:', {
            originalSize: formatFileSize(compressionResult.originalSize || file.size),
            compressedSize: formatFileSize(compressionResult.blob.size),
            ratio: `${(compressionResult.compressionRatio || 1).toFixed(1)}x`
        });
        
        // Step 2: Upload to Supabase
        setProcessingMessage('Uploading to cloud storage...');
        const { publicUrl, dbRecord } = await uploadToSupabase(compressionResult.blob);
        
        // Check if operation was cancelled after upload
        if (uploadAbortController.current.signal.aborted) {
          isProcessingUpload.current = false;
          return;
        }
        
        // Step 3: Create local preview for UI
        setProcessingMessage('Finalizing...');
        const reader = new FileReader();
        reader.readAsDataURL(compressionResult.blob);
        const dataUrl = await new Promise(resolve => reader.onload = e => resolve(e.target.result));
        
        const newImage = { 
            id: dbRecord.id || Date.now() + Math.random(), 
            dataUrl, 
            file: compressionResult.blob, // Use compressed version
            originalFile: file, // Keep reference to original
            publicUrl, // Store the Supabase URL
            dbRecord,   // Store the database record
            compressionInfo: compressionResult
        };
        
        // Replace gallery with single image
        setGallery([newImage]);
        setSelectedImageIndex(0);
        setIsUploadOpen(false);
        
        // Upload complete - set state to idle
        setProcessingState('idle');
        setProcessingMessage('');
        
        console.log('Image processed successfully:', newImage);
        
    } catch (uploadError) {
        console.error('Upload process failed:', uploadError);
        if (!uploadAbortController.current.signal.aborted) {
          setProcessingState('error');
          setProcessingMessage('Upload failed. Please try again.');
          
          // Still create local preview if upload fails
          try {
              const reader = new FileReader();
              reader.readAsDataURL(file);
              const dataUrl = await new Promise(resolve => reader.onload = e => resolve(e.target.result));
              const newImage = { id: Date.now() + Math.random(), dataUrl, file };
              
              setGallery([newImage]);
              setSelectedImageIndex(0);
              setIsUploadOpen(false);
          } catch (previewError) {
              console.error('Failed to create preview:', previewError);
              setError('Failed to process image. Please try again.');
          }
          
          // Clear error state after 5 seconds
          setTimeout(() => {
              setProcessingState('idle');
              setProcessingMessage('');
          }, 5000);
        }
    } finally {
        isProcessingUpload.current = false;
        uploadAbortController.current = null;
    }
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
  
  // --- Fixed Pricing Logic with Real Polling ---
  const handleCalculatePrice = async () => {
      if (gallery.length === 0) return;
      
      setProcessingState('processing');
      setProcessingMessage('Uploading image to Supabase...');
      setError(null);
      setPriceResult(null);

      try {
          const selectedImage = gallery[selectedImageIndex];
          let publicUrl, dbRecord;
          
          // Check if image is already uploaded to Supabase
          if (selectedImage.publicUrl && selectedImage.dbRecord) {
              console.log('✅ Using existing Supabase data');
              publicUrl = selectedImage.publicUrl;
              dbRecord = selectedImage.dbRecord;
          } else {
              console.log('⬆️ Uploading image to Supabase...');
              const uploadResult = await uploadToSupabase(selectedImage.file);
              publicUrl = uploadResult.publicUrl;
              dbRecord = uploadResult.dbRecord;
              
              // Update the gallery item with Supabase data
              const updatedGallery = [...gallery];
              updatedGallery[selectedImageIndex] = {
                  ...selectedImage,
                  publicUrl,
                  dbRecord
              };
              setGallery(updatedGallery);
          }
          
          console.log('📊 Database record created:', dbRecord);
          setProcessingMessage('AI is analyzing your cake design...');
          
          // Show initial processing state
          setPriceResult({
              priceAddon: 'Processing...',
              cakeDesignDetails: 'AI is analyzing your design...',
              cakeType: 'Determining...',
              height: 'Calculating...',
              rowId: dbRecord.rowid,
              supabaseUrl: publicUrl,
              hasRealData: false
          });
          
          // Fixed polling logic
          let attempts = 0;
          const maxAttempts = 8; // 8 attempts * 5 seconds = 40 seconds
          
          const pollForData = async () => {
              try {
                  attempts++;
                  console.log(`🔍 Polling attempt ${attempts}/${maxAttempts}`);
                  
                  const data = await fetchPricingData(dbRecord.rowid);
                  console.log('📊 Polled data:', data);
                  
                  if (data && data.priceaddon !== null && data.priceaddon !== undefined) {
                      // Found pricing data!
                      console.log('✅ Pricing data found:', data.priceaddon);
                      setPriceResult({
                          priceAddon: `+₱${data.priceaddon}`,
                          cakeDesignDetails: data.infoaddon || 'Design analyzed',
                          cakeType: data.type || 'Custom',
                          height: data.thickness || 'Standard',
                          rowId: data.rowid,
                          supabaseUrl: publicUrl,
                          hasRealData: true
                      });
                      setProcessingState('complete');
                      setProcessingMessage('Analysis complete!');
                      console.log('✅ Real data loaded successfully');
                      return; // Stop polling
                  }
                  
                  // Continue polling if we haven't reached max attempts
                  if (attempts < maxAttempts) {
                      console.log(`⏰ Scheduling next poll in 5 seconds (attempt ${attempts + 1}/${maxAttempts})`);
                      setTimeout(pollForData, 5000);
                  } else {
                      // Max attempts reached, show refresh option
                      console.log('⚠️ Max polling attempts reached');
                      setPriceResult(prevResult => ({
                          ...prevResult,
                          priceAddon: 'Still processing...',
                          cakeDesignDetails: 'Analysis taking longer than expected - please refresh',
                          cakeType: 'Still processing...',
                          height: 'Still processing...',
                          hasRealData: false,
                          needsRefresh: true
                      }));
                      setProcessingState('complete');
                      setProcessingMessage('Processing may take longer - please refresh!');
                      console.log('⚠️ Refresh option enabled');
                  }
              } catch (error) {
                  console.error('❌ Polling error:', error);
                  if (attempts < maxAttempts) {
                      console.log(`🔁 Retrying after error in 5 seconds`);
                      setTimeout(pollForData, 5000);
                  } else {
                      setPriceResult(prevResult => ({
                          ...prevResult,
                          priceAddon: 'Error',
                          cakeDesignDetails: 'Please refresh to try again',
                          cakeType: 'Error',
                          height: 'Error',
                          hasRealData: false,
                          needsRefresh: true
                      }));
                      setProcessingState('error');
                      setProcessingMessage('Error occurred - please refresh!');
                      console.log('❌ Error state set');
                  }
              }
          };
          
          // Start polling after 5 seconds
          console.log('⏰ Starting polling in 5 seconds...');
          setTimeout(pollForData, 5000);
          
      } catch (err) {
          console.error('❌ Price calculation failed:', err);
          setError(`Failed to calculate price: ${err.message}`);
          setProcessingState('error');
          setProcessingMessage('Failed to start analysis');
      }
  };
  
  // Simplified refresh function
  const handleRefreshPrice = async () => {
      if (!priceResult || !priceResult.rowId) return;
      
      setProcessingState('processing');
      setProcessingMessage('Refreshing pricing data...');
      
      try {
          const data = await fetchPricingData(priceResult.rowId);
          console.log('Refresh fetched data:', data);
          
          if (data && data.priceaddon !== null && data.priceaddon !== undefined) {
              setPriceResult({
                  priceAddon: `+₱${data.priceaddon}`,
                  cakeDesignDetails: data.infoaddon || 'Design analyzed',
                  cakeType: data.type || 'Custom',
                  height: data.thickness || 'Standard',
                  rowId: data.rowid,
                  supabaseUrl: priceResult.supabaseUrl,
                  hasRealData: true
              });
              setProcessingState('complete');
              setProcessingMessage('Pricing data refreshed!');
              setError(null);
          } else {
              setError('Pricing data not ready yet. Please try again in a few seconds.');
              setProcessingState('idle');
              setProcessingMessage('');
          }
      } catch (error) {
          console.error('Refresh failed:', error);
          setError('Failed to refresh pricing. Please try again.');
          setProcessingState('idle');
          setProcessingMessage('');
      }
  };
  
  // Cleanup on component unmount
  useEffect(() => {
      return () => {
          // Cleanup search operations
          if (searchAbortController.current) {
              searchAbortController.current.abort();
              searchAbortController.current = null;
          }
          // Cleanup upload operations
          if (uploadAbortController.current) {
              uploadAbortController.current.abort();
              uploadAbortController.current = null;
          }
          // Reset refs
          isProcessingUpload.current = false;
          pendingSearchQuery.current = null;
      };
  }, []);

  // --- Google CSE Handlers & Effects ---
  const executeCseSearch = useCallback((query) => {
    if (!query || !query.trim()) {
      console.log('No query provided, skipping search');
      setIsSearching(false);
      return;
    }
    
    if (!window.google?.search?.cse?.element) {
      console.log('Google CSE not available yet');
      setIsSearching(false);
      return;
    }
    
    // Cancel previous search if in progress
    if (searchAbortController.current) {
      searchAbortController.current.abort();
    }
    searchAbortController.current = new AbortController();
    
    console.log('Executing search for:', query);
    setIsSearching(true);
    
    try {
      // Create a fresh CSE element with unique name each time
      const uniqueName = 'results_' + Date.now();
      const cseElement = window.google.search.cse.element.render({ 
        div: 'google-search-container', 
        tag: 'searchresults-only',
        gname: uniqueName,
        attributes: { searchType: 'image', disableWebSearch: true } 
      });
      
      if (cseElement && typeof cseElement.execute === 'function') {
        cseElement.execute(query);
        console.log('Search executed successfully for:', query);
        // Set searching to false after a delay to allow results to load
        setTimeout(() => {
          if (!searchAbortController.current.signal.aborted) {
            setIsSearching(false);
          }
        }, 1000);
      } else {
        console.error('CSE element or execute method not available');
        setIsSearching(false);
      }
    } catch (err) {
      console.error('executeCseSearch error:', err);
      if (!searchAbortController.current.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, []);
  

  const handleSearch = () => { 
    if (searchQuery.trim()) {
      setIsCSELoaded(false); // Reset loading state
      
      // Clear the search container
      const container = document.getElementById('google-search-container');
      if (container) {
        container.innerHTML = '';
      }
      
      setShowResults(true); // This will trigger useEffect to handle the search
    }
  };
  const handleKeyDown = (e) => { 
    // Allow standard keyboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+A, etc.)
    if (e.ctrlKey || e.metaKey) {
      // Let the browser handle standard shortcuts like copy, paste, select all
      return true; // Explicitly allow these events to bubble up
    }
    
    // Handle Enter key for search
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
      return false;
    }
    
    // Handle Escape key to close results
    if (e.key === 'Escape' && showResults) {
      e.preventDefault();
      closeResults();
      return false;
    }
  };
  const closeResults = () => setShowResults(false);

  useEffect(() => {
    if (!showResults) return;
    
    // Prevent double execution
    if (isSearching) {
      console.log('Already searching, skipping...');
      return;
    }
    
    if (!searchQuery || !searchQuery.trim()) {
      console.log('No query to search');
      return;
    }
    
    // Check if this is the same query to prevent duplicate searches
    if (pendingSearchQuery.current === searchQuery) {
      console.log('Same query already processed, skipping...');
      return;
    }
    
    pendingSearchQuery.current = searchQuery;
    console.log('useEffect triggered for search:', searchQuery);
    
    // Small delay to ensure the search container is ready
    const timeoutId = setTimeout(() => {
      if (document.getElementById('google-cse-script')) {
        console.log('CSE script already loaded, executing search');
        executeCseSearch(searchQuery);
        return;
      }
      
      console.log('Initializing Google CSE...');
      // Initialize Google CSE if not already loaded
      window.__gcse = { 
        parsetags: 'explicit', 
        callback: () => { 
          console.log('Google CSE loaded successfully');
          setIsCSELoaded(true); 
          executeCseSearch(searchQuery); 
        } 
      };
      
      
      const script = document.createElement('script');
      script.id = 'google-cse-script';
      script.async = true;
      script.src = `https://cse.google.com/cse.js?cx=${SEARCH_ENGINE_ID}`;
      script.onload = () => {
        console.log('CSE script loaded');
      };
      document.head.appendChild(script);
    }, 200);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [showResults, searchQuery, executeCseSearch]);

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
                                className="p-3 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" 
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
                            onClick={() => processingState === 'idle' && document.getElementById('fileInput').click()} 
                            className={`border-2 border-dashed border-gray-300 rounded-xl p-8 sm:p-12 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all duration-300 min-h-[120px] ${
                              processingState !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                              {processingState !== 'idle' ? (
                                <div className="mb-4">
                                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
                                  <p className="text-purple-700 font-medium text-sm sm:text-base">
                                    Uploading to Supabase...
                                  </p>
                                </div>
                              ) : (
                                <>
                                  <div className="mb-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                  </div>
                                  <p className="text-gray-700 font-medium text-sm sm:text-base">
                                    Drag an image here, paste, or <span className="text-blue-600 font-semibold">tap to upload</span>
                                  </p>
                                  <p className="text-gray-500 text-xs sm:text-sm mt-2">
                                    Will be uploaded to Supabase storage
                                  </p>
                                </>
                              )}
                          </div>
                          <input id="fileInput" type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={processingState !== 'idle'} />
                      </div>
                   </div>
               ) : (
                  // Search View - Mobile-First Responsive Layout
                  <div className="w-full">
                    {/* Mobile Layout (stacked) */}
                    <div className="md:hidden space-y-3">
                      {/* Search bar gets its own row */}
                      <div className="bg-white rounded-2xl shadow-xl p-2 border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
                        <div className="flex items-center">
                          <input 
                            type="text" 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            onKeyDown={handleKeyDown} 
                            placeholder="Search for cake designs..." 
                            className="flex-grow px-4 py-4 text-base outline-none rounded-xl bg-transparent" 
                            onPaste={handlePaste}
                          />
                          <button 
                            onClick={handleSearch} 
                            className="p-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:opacity-90 active:scale-95 transition-all duration-200 ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center" 
                            aria-label="Search"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                          </button>
                        </div>
                      </div>
                      
                      {/* Upload button is separate, full-width */}
                      <button 
                        onClick={() => setIsUploadOpen(true)} 
                        className="w-full bg-white rounded-2xl shadow-lg border border-gray-200 hover:shadow-xl active:scale-[0.98] transition-all duration-300 p-4 flex items-center justify-center space-x-3 min-h-[56px]" 
                        aria-label="Upload Image"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-gray-700 font-medium">Upload a cake image</span>
                      </button>
                    </div>
                    
                    {/* Desktop Layout (original horizontal) */}
                    <div className="hidden md:flex bg-white rounded-full shadow-xl p-1 sm:p-2 items-center border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
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
                          className="p-3 sm:p-4 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:opacity-90 active:scale-95 transition-all duration-200 mx-1 sm:mx-2 min-w-[44px] min-h-[44px] flex items-center justify-center" 
                          aria-label="Search"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </button>
                        <div className="w-px h-6 sm:h-8 bg-gray-200"></div>
                        <button 
                          onClick={() => setIsUploadOpen(true)} 
                          className="p-3 sm:p-4 rounded-full hover:bg-gray-100 active:scale-95 cursor-pointer transition-all duration-200 ml-1 sm:ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center" 
                          aria-label="Upload Image"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </button>
                    </div>
                  </div>
               )}
            </div>
          )}
          
          {/* === Gallery & Pricing View === */}
          {gallery.length > 0 && !showResults && (
              <div className="mt-8 p-6 bg-white rounded-xl shadow-lg w-full max-w-2xl text-center animate-fade-in">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg sm:text-xl font-semibold">Your Cake Design</h3>
                    {gallery[selectedImageIndex].publicUrl && (
                      <div className="flex items-center space-x-2 bg-green-100 px-3 py-1 rounded-full">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-green-700 text-xs font-medium">Uploaded to Supabase</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Main Image */}
                  <img 
                    src={gallery[selectedImageIndex].dataUrl} 
                    alt="Selected cake" 
                    className="w-full h-80 object-cover rounded-lg mb-4" 
                  />

                  {/* Actions & Results */}
                  <div className="mt-4">
                      {/* Show processing indicator during pricing calculation */}
                      {processingState === 'processing' && (
                          <div className="mb-4">
                              <ProcessingIndicator 
                                  state={processingState}
                                  message={processingMessage}
                                  duration={40}
                              />
                          </div>
                      )}
                      
                      {priceResult ? (
                          // Price Result View
                          <div className="text-left p-4 bg-green-50 rounded-lg border border-green-200">
                             <h4 className="font-bold text-xl sm:text-2xl text-green-800 mb-2">Price-addon: {priceResult.priceAddon}</h4>
                             <div className="space-y-2 text-green-700">
                                 <p><span className="font-medium">Cake Design Details:</span> {priceResult.cakeDesignDetails}</p>
                                 <p><span className="font-medium">Cake Type:</span> {priceResult.cakeType}</p>
                                 <p><span className="font-medium">Height:</span> {priceResult.height}</p>
                             </div>
                             
                             {/* Show refresh button if data is not complete */}
                             {priceResult.needsRefresh && (
                                 <div className="mt-3">
                                     <button 
                                         onClick={handleRefreshPrice}
                                         disabled={processingState !== 'idle'}
                                         className="bg-blue-500 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-600 active:scale-95 transition-all duration-200 disabled:opacity-50 min-h-[44px]"
                                     >
                                         {processingState === 'processing' ? 'Refreshing...' : 'Refresh Price'}
                                     </button>
                                     <p className="text-sm text-blue-600 mt-1">AI analysis may take up to 40 seconds. Please try refreshing if data is not ready.</p>
                                 </div>
                             )}
                             
                             {/* Display UUID and Supabase confirmation */}
                             {priceResult.rowId && (
                                 <div className="mt-3 p-3 bg-white rounded border border-green-300">
                                     <div className="flex items-center space-x-2 mb-2">
                                         <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                         <span className="text-green-700 text-sm font-medium">
                                             {priceResult.hasRealData ? 'Successfully processed by AI' : 'Processing in progress'}
                                         </span>
                                     </div>
                                     <p className="text-gray-600 text-xs sm:text-sm">
                                         <span className="font-medium">Row ID:</span> <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">{priceResult.rowId}</span>
                                     </p>
                                     {priceResult.supabaseUrl && (
                                         <p className="text-gray-600 text-xs mt-1">
                                             <span className="font-medium">Image URL:</span> <a href={priceResult.supabaseUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs break-all">{priceResult.supabaseUrl}</a>
                                         </p>
                                     )}
                                 </div>
                             )}
                             
                              <button 
                                onClick={() => {setPriceResult(null); setGallery([]);}} 
                                className="mt-4 w-full bg-gray-200 text-gray-800 py-4 rounded-lg font-medium hover:bg-gray-300 active:scale-[0.98] transition-all duration-200 min-h-[48px]"
                              >
                               Start Over
                             </button>
                          </div>
                      ) : (
                          // Calculate Button View
                          <div className="space-y-3">
                               <button 
                                 onClick={handleCalculatePrice} 
                                 disabled={processingState !== 'idle'} 
                                 className="bg-gradient-to-r from-pink-500 to-purple-500 text-white px-8 py-4 rounded-full font-medium hover:opacity-90 active:scale-95 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed w-full min-h-[48px]"
                               >
                                  {processingState !== 'idle' ? 'Calculating...' : 'Calculate Price with AI'}
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
                  {error && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start space-x-3">
                        <svg className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-red-800 text-sm sm:text-base font-medium">Error</p>
                          <p className="text-red-700 text-sm mt-1">{error}</p>
                          <button 
                            onClick={() => setError(null)} 
                            className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
          )}
          
          {/* === Search Results View === */}
          {showResults && (
            <div className="w-full max-w-6xl mx-auto animate-fade-in">
              {/* Search Bar - Responsive Layout */}
              <div className="mb-6">
                {/* Mobile Compact Search Bar */}
                <div className="md:hidden bg-white rounded-2xl shadow-lg p-2 border border-gray-200">
                  <div className="flex items-center">
                    <input 
                      type="text" 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      onKeyDown={handleKeyDown} 
                      placeholder="Search for cake designs..." 
                      className="flex-grow px-3 py-3 text-base outline-none rounded-xl bg-transparent" 
                      onPaste={handlePaste}
                    />
                    <button 
                      onClick={handleSearch} 
                      className="p-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:opacity-90 active:scale-95 transition-all duration-200 ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center" 
                      aria-label="Search"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </button>
                    <button 
                      onClick={closeResults} 
                      className="p-3 rounded-lg hover:bg-gray-100 active:scale-95 cursor-pointer transition-all duration-200 ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center" 
                      aria-label="Close Search"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                  </div>
                </div>
                
                {/* Desktop Search Bar */}
                <div className="hidden md:flex bg-white rounded-full shadow-xl p-1 sm:p-2 items-center border border-gray-200 hover:shadow-2xl transition-shadow duration-300">
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
                      className="p-3 sm:p-4 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:opacity-90 active:scale-95 transition-all duration-200 mx-1 sm:mx-2 min-w-[44px] min-h-[44px] flex items-center justify-center" 
                      aria-label="Search"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </button>
                    <div className="w-px h-6 sm:h-8 bg-gray-200"></div>
                    <button 
                      onClick={closeResults} 
                      className="p-3 sm:p-4 rounded-full hover:bg-gray-100 active:scale-95 cursor-pointer transition-all duration-200 ml-1 sm:ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center" 
                      aria-label="Close Search"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
              </div>
              
              {/* Results Container */}
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 sm:p-6">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-4">
                    Search results for: <span className="text-purple-600">
                      "{searchQuery}"
                    </span>
                  </h3>
                </div>
                
                <div id="google-search-container" className="min-h-[300px] sm:min-h-[400px]"></div>
                {(!isCSELoaded || isSearching) && (
                  <div className="text-center py-8 text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto mb-4"></div>
                    <p className="text-sm sm:text-base">{isSearching ? 'Searching...' : 'Loading search results...'}</p>
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