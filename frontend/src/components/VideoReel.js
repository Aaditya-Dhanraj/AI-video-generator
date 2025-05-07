// VideoReel.jsx
import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * VideoReel Component
 * 
 * A fullscreen vertical scrolling video player similar to Instagram Reels or YouTube Stories
 * 
 * @param {Object} props
 * @param {Array} props.videos - Array of video objects with urls and optional metadata
 * @param {number} props.startIndex - Initial video index to display (default: 0)
 * @param {boolean} props.autoPlay - Whether to autoplay videos when they come into view (default: true)
 * @param {boolean} props.loop - Whether to loop videos (default: true)
 * @param {boolean} props.showControls - Whether to show video controls on tap (default: true)
 * @param {boolean} props.preloadNext - Whether to preload the next video (default: true)
 * @param {Function} props.onVideoChange - Callback when active video changes
 * @param {Function} props.onVideoEnd - Callback when a video ends
 * @param {Function} props.onBack - Callback when back button is pressed
 */
const VideoReel = ({ 
  videos = [], 
  startIndex = 0,
  autoPlay = true,
  loop = true,
  showControls = true,
  preloadNext = true,
  onVideoChange = () => {},
  onVideoEnd = () => {},
  onBack = () => {}
}) => {
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isControlsVisible, setIsControlsVisible] = useState(false);
  const [loadedVideos, setLoadedVideos] = useState({});
  const [buffering, setBuffering] = useState({});
  const [progress, setProgress] = useState(0);
  
  const videoRefs = useRef([]);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const observerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const initialLoadRef = useRef(true);
  const initialBufferingSetRef = useRef(false);

  // Format video array to ensure it has all required properties
  const formattedVideos = useCallback(() => {
    return videos.map((video, index) => {
      if (typeof video === 'string') {
        return { 
          id: `video-${index}`,
          url: video,
          title: `Video ${index + 1}`,
          description: ''
        };
      }
      return {
        id: video.id || `video-${index}`,
        url: video.url || '', // Handle possible undefined URL
        title: video.title || `Video ${index + 1}`,
        description: video.description || '',
        thumbnail: video.thumbnail || ''
      };
    });
  }, [videos]);

  // Setup initial buffering state for each video - ONLY ONCE
  useEffect(() => {
    if (!initialBufferingSetRef.current) {
      const initialBuffering = {};
      videos.forEach((_, index) => {
        initialBuffering[index] = index === activeIndex;
      });
      setBuffering(initialBuffering);
      initialBufferingSetRef.current = true;
    }
  }, [videos, activeIndex]);

  // Setup Intersection Observer to detect which video is in view
  useEffect(() => {
    if (!containerRef.current) return;
    
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.7 // 70% visibility to trigger
    };

    const handleIntersect = (entries) => {
      entries.forEach(entry => {
        if (!entry.target.dataset?.index) return;
        
        const videoIndex = parseInt(entry.target.dataset.index, 10);
        
        if (entry.isIntersecting) {
          setActiveIndex(videoIndex);
          if (autoPlay && isPlaying) {
            playVideo(videoIndex);
          }
        } else {
          pauseVideo(videoIndex);
        }
      });
    };

    observerRef.current = new IntersectionObserver(handleIntersect, options);
    
    // Observe all video elements
    videoRefs.current.forEach((video, index) => {
      if (video && video.parentElement) {
        video.parentElement.dataset.index = index;
        observerRef.current.observe(video.parentElement);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [autoPlay, isPlaying]);

  // Handle preloading of next video
  useEffect(() => {
    if (preloadNext && activeIndex < videos.length - 1) {
      const nextVideo = videoRefs.current[activeIndex + 1];
      if (nextVideo) {
        nextVideo.load();
        setLoadedVideos(prev => ({
          ...prev, 
          [activeIndex + 1]: true
        }));
      }
    }
  }, [activeIndex, videos.length, preloadNext]);

  // Scroll to initial video when component mounts - ONLY ONCE
  useEffect(() => {
    if (initialLoadRef.current && videoRefs.current[startIndex]?.parentElement) {
      videoRefs.current[startIndex].parentElement.scrollIntoView({ behavior: 'auto' });
      initialLoadRef.current = false;
      
      // Auto play the initial video after a short delay to allow scrolling
      const timer = setTimeout(() => {
        if (autoPlay) {
          playVideo(startIndex);
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [startIndex, autoPlay]);

  // Track progress of current video
  useEffect(() => {
    let intervalId;
    
    if (isPlaying && videoRefs.current[activeIndex]) {
      const updateProgress = () => {
        const video = videoRefs.current[activeIndex];
        if (video && !video.paused) {
          const value = (video.currentTime / video.duration) * 100;
          setProgress(isNaN(value) ? 0 : value);
        }
      };
      
      intervalId = setInterval(updateProgress, 100);
      progressIntervalRef.current = intervalId;
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPlaying, activeIndex]);

  // Cleanup all resources when component unmounts
  useEffect(() => {
    return () => {
      // Clear all intervals and timeouts
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      
      // Stop all videos and remove event listeners
      videoRefs.current.forEach(video => {
        if (video) {
          video.pause();
          video.oncanplay = null;
          video.onloadeddata = null;
          video.onended = null;
        }
      });
      
      // Disconnect observer
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Handle video end event - using stable reference with useCallback
  const handleVideoEnd = useCallback(() => {
    onVideoEnd(activeIndex);
    // If not the last video and autoplay is on, scroll to next video
    if (activeIndex < videos.length - 1 && autoPlay) {
      const nextElem = videoRefs.current[activeIndex + 1]?.parentElement;
      if (nextElem) {
        nextElem.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [activeIndex, autoPlay, videos.length, onVideoEnd]);

  // Play video at given index - using function outside of component rendering
  const playVideo = useCallback((index) => {
    const video = videoRefs.current[index];
    if (!video) return;
    
    // Set onended handler
    video.onended = handleVideoEnd;
    
    // Handle loading states
    if (!loadedVideos[index]) {
      // Start buffering for this video
      setBuffering(prev => ({ ...prev, [index]: true }));
      
      // Set up canplay event handler to track when video is ready
      video.oncanplay = () => {
        setBuffering(prev => ({ ...prev, [index]: false }));
        setLoadedVideos(prev => ({ ...prev, [index]: true }));
      };
      
      // Also set up loadeddata event handler as a backup
      video.onloadeddata = () => {
        setBuffering(prev => ({ ...prev, [index]: false }));
        setLoadedVideos(prev => ({ ...prev, [index]: true }));
      };
    } else {
      // Video was previously loaded
      setBuffering(prev => ({ ...prev, [index]: false }));
    }
    
    // Play the video
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          // Extra safety - make sure buffering is false once playing starts
          setBuffering(prev => ({ ...prev, [index]: false }));
        })
        .catch(error => {
          console.error("Video play error:", error);
          setIsPlaying(false);
          // If autoplay is blocked by browser, disable buffering
          setBuffering(prev => ({ ...prev, [index]: false }));
        });
    }
  }, [handleVideoEnd, loadedVideos]);

  // Pause video at given index
  const pauseVideo = useCallback((index) => {
    const video = videoRefs.current[index];
    if (video && !video.paused) {
      video.pause();
    }
  }, []);

  // Toggle play/pause for active video
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pauseVideo(activeIndex);
      setIsPlaying(false);
    } else {
      playVideo(activeIndex);
      setIsPlaying(true);
    }
    toggleControls();
  }, [isPlaying, activeIndex, pauseVideo, playVideo]);

  // Show controls overlay temporarily
  const toggleControls = useCallback(() => {
    setIsControlsVisible(true);
    
    // Clear any existing timeout
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    // Hide controls after 3 seconds
    controlsTimeoutRef.current = setTimeout(() => {
      setIsControlsVisible(false);
    }, 3000);
  }, []);

  // Handle back button press
  const handleBackButton = useCallback((e) => {
    // Clean up all resources before unmounting
    videoRefs.current.forEach(video => {
      if (video) {
        video.pause();
      }
    });
    
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Call the onBack callback
    onBack(e);
  }, [onBack]);

  // Handle screen tap/click to toggle controls
  const handleScreenTap = useCallback(() => {
    toggleControls();
  }, [toggleControls]);

  // Handle scroll to set video position
  const handleProgressBarClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const video = videoRefs.current[activeIndex];
    
    if (video) {
      video.currentTime = pos * video.duration;
      setProgress(pos * 100);
    }
  }, [activeIndex]);

  // Handle swipe gestures for navigation
  const handleSwipe = useCallback((direction) => {
    if (direction === 'up' && activeIndex < videos.length - 1) {
      const nextElem = videoRefs.current[activeIndex + 1]?.parentElement;
      if (nextElem) {
        nextElem.scrollIntoView({ behavior: 'smooth' });
      }
    } else if (direction === 'down' && activeIndex > 0) {
      const prevElem = videoRefs.current[activeIndex - 1]?.parentElement;
      if (prevElem) {
        prevElem.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [activeIndex, videos.length]);

  // Update callback when active video changes - with dependency array to prevent loop
  useEffect(() => {
    // Only call this when activeIndex actually changes
    onVideoChange(activeIndex);
  }, [activeIndex, onVideoChange]);

  // Safety check for empty video array
  if (videos.length === 0) {
    return <div className="h-screen w-full flex items-center justify-center text-white">No videos available</div>;
  }

  // Get processed videos
  const processedVideos = formattedVideos();

  return (
    <div 
      ref={containerRef}
      className="video-reel-container h-screen w-full overflow-y-scroll snap-y snap-mandatory"
    >
      {/* Back button - fixed position at top left */}
      <button 
        onClick={handleBackButton}
        className="fixed top-4 left-4 z-50 bg-black bg-opacity-50 text-white p-2 rounded-full"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Video counter - fixed position at top right */}
      <div className="fixed top-4 right-4 z-50 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full">
        {activeIndex + 1} / {videos.length}
      </div>

      {processedVideos.map((video, index) => (
        <div 
          key={video.id} 
          className="video-item relative h-screen w-full snap-start snap-always overflow-hidden"
        >
          {/* Video */}
          <video
            ref={el => videoRefs.current[index] = el}
            className="absolute inset-0 h-full w-full object-cover"
            src={video.url}
            poster={video.thumbnail}
            loop={loop}
            playsInline
            muted={false}
            preload={index === activeIndex || index === activeIndex + 1 ? "auto" : "none"}
          />
          
          {/* Tap overlay */}
          <div 
            className="absolute inset-0 z-10" 
            onClick={handleScreenTap}
            onDoubleClick={togglePlayPause}
          />
          
          {/* Controls overlay */}
          {isControlsVisible && index === activeIndex && (
            <div className="controls-overlay absolute inset-0 z-20 flex flex-col justify-between bg-black bg-opacity-20 p-4">
              {/* Top overlay with title */}
              <div className="top-overlay p-2">
                <h3 className="text-lg font-bold text-white">{video.title}</h3>
                <p className="text-sm text-white">{video.description}</p>
              </div>
              
              {/* Center play/pause button */}
              <div className="flex-1 flex items-center justify-center">
                <button 
                  className="text-white bg-opacity-50 bg-black rounded-full p-4"
                  onClick={togglePlayPause}
                >
                  {isPlaying ? (
                    <svg className="w-12 h-12" viewBox="0 0 24 24" fill="white">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  ) : (
                    <svg className="w-12 h-12" viewBox="0 0 24 24" fill="white">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
              </div>
              
              {/* Bottom overlay with progress */}
              <div className="bottom-overlay">
                {/* Progress bar */}
                <div 
                  className="progress-bar h-1 w-full bg-gray-600 cursor-pointer"
                  onClick={handleProgressBarClick}
                >
                  <div 
                    className="progress-filled h-full bg-white" 
                    style={{ width: `${index === activeIndex ? progress : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Buffering indicator - only show when specifically buffering */}
          {buffering[index] && (
            <div className="absolute inset-0 flex items-center justify-center z-30 bg-black bg-opacity-30">
              <div className="loading-spinner h-12 w-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          
          {/* Navigation hints */}
          {index === activeIndex && !buffering[index] && (
            <>
              {index > 0 && (
                <div 
                  className="swipe-up-indicator absolute top-2 left-1/2 transform -translate-x-1/2 text-white opacity-50"
                  onClick={() => handleSwipe('down')}
                >
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="white">
                    <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
                  </svg>
                </div>
              )}
              {index < videos.length - 1 && (
                <div 
                  className="swipe-down-indicator absolute bottom-2 left-1/2 transform -translate-x-1/2 text-white opacity-50"
                  onClick={() => handleSwipe('up')}
                >
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="white">
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                  </svg>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default React.memo(VideoReel);