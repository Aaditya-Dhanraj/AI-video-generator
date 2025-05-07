import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Trash2 } from 'lucide-react';
import axiosInstance from '../axiosInstance';
import VideoReel from './VideoReel';

const VideoGallery = () => {
  const [activeTab, setActiveTab] = useState('gallery');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [celebrityName, setCelebrityName] = useState('');
  const [expertise, setExpertise] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [reelStartIdx, setReelStartIdx] = useState(0);
  const [startReel, setStartReel] = useState(false);

  // Fetch videos on component mount
  const fetchVideos = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('http://localhost:8080/api/update');
      if (response.data.success) {
        // Parse the videoArr string to an actual array
        const parsedVideos = JSON.parse(response.data.videoArr);
        setVideos(parsedVideos);
      } else {
        setError('Failed to fetch videos');
      }
    } catch (err) {
      setError('An error occurred while fetching videos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchVideos();
  }, []);

  const handleCreateVideo = async(e) => {
    e.preventDefault();
    if (!celebrityName || !expertise) {
      setError('Please fill in all fields');
      return;
    }

    setIsCreating(true);
    setError(null);
    
    try {
      const response = await axiosInstance.post('http://localhost:8080/api/videos', {
        celebName: celebrityName,
        sports: expertise,
      });
      
      // Debug the response structure
      console.log('Response data:', response.data);
      
      if (response.data.success) {
        // Check if response.data.data is an object as expected
        if (response.data.data && typeof response.data.data === 'object') {
          // Add the new video to the videos array
          setVideos(prevVideos => [response.data.data, ...prevVideos]);
        } else {
          console.error('Unexpected data format received:', response.data.data);
          setError('Received unexpected data format from server');
        }

        // Reset form
        setCelebrityName('');
        setExpertise('');
        setCreateSuccess(true);
        
        // Clear success message after delay
        setTimeout(() => setCreateSuccess(false), 3000);
      } else {
        setError(response.data.message || 'Failed to create video');
      }
    } catch (err) {
      console.error('Error creating video:', err);
      setError(err.response?.data?.message || 'An error occurred while creating video');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteVideo = async (videoId) => {
    if (!videoId) {
      console.error('No video ID provided for deletion');
      return;
    }

    setIsDeleting(true);
    try {
      const response = await axiosInstance.post(`http://localhost:8080/api/update?videoId=${videoId}`);
      
      if (response.data.success) {
        // Remove the deleted video from state
        setVideos(prevVideos => prevVideos.filter(video => video.title !== videoId));
        
        // Show success message
        setDeleteSuccess(true);
        setTimeout(() => setDeleteSuccess(false), 3000);
      } else {
        setError(response.data.message || 'Failed to delete video');
      }
    } catch (err) {
      console.error('Error deleting video:', err);
      setError(err.response?.data?.message || 'An error occurred while deleting the video');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartReel = (startIdx) => {
    setReelStartIdx(startIdx);
    setStartReel(true);
  }

  return(
    <>
      {startReel ? (
        <VideoReel
          startIndex={reelStartIdx}
          autoPlay={true}
          showControls={true}
          loop={true}
          preloadNext={true}
          videos={videos}
          onBack={() => setStartReel(false)}
        />
      ) : (
        <div className="min-h-screen bg-black text-white">
          {/* Navigation Bar */}
          <nav className="sticky top-0 bg-black border-b border-gray-800 z-10">
            <div className="max-w-7xl mx-auto px-4 flex justify-between w-full">
              <div className="flex justify-center h-16 w-full">
                <div className="flex mt-1.5">
                  <div className="ml-10 flex items-center space-x-4">
                    <NavButton 
                      active={activeTab === 'gallery'} 
                      onClick={() => setActiveTab('gallery')}
                      label="Gallery"
                      icon={<div className="w-5 h-5 grid grid-cols-2 gap-0.5">
                        <div className="bg-current rounded-sm"></div>
                        <div className="bg-current rounded-sm"></div>
                        <div className="bg-current rounded-sm"></div>
                        <div className="bg-current rounded-sm"></div>
                      </div>}
                    />
                    <NavButton 
                      active={activeTab === 'create'} 
                      onClick={() => setActiveTab('create')}
                      label="Create"
                      icon={<Play className="w-5 h-5" />}
                    />
                    <NavButton 
                      active={activeTab === 'profile'} 
                      onClick={() => setActiveTab('profile')}
                      label="Profile"
                      icon={<div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-current"></div>
                      </div>}
                    />
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto p-4">
            {/* Delete Success Message */}
            {deleteSuccess && (
              <div className="bg-green-500 bg-opacity-20 border border-green-500 rounded-md p-4 mb-6">
                Video deleted successfully!
              </div>
            )}

            {/* Tab content with sliding transitions */}
            <div className="relative overflow-hidden">
            
              {/* Profile Tab (placeholder for future use) */}
              <div 
                className={`transition-all duration-300 ${
                  activeTab === 'profile' 
                    ? 'translate-x-0 opacity-100' 
                    : '-translate-x-full absolute opacity-0'
                }`}
              >
                <h2 className="text-2xl font-bold mb-6">Profile</h2>
                <p className="text-gray-400">Profile section under development</p>
              </div>

              
              {/* Gallery Tab */}
              <div 
                className={`transition-all duration-300 ${
                  activeTab === 'gallery' 
                    ? 'translate-x-0 opacity-100' 
                    : '-translate-x-full absolute opacity-0'
                }`}
              >            
                {loading && !error && (
                  <LoadingSpinner message="Loading videos..." />
                )}
                
                {error && (
                  <ErrorMessage message={error} onRetry={fetchVideos} />
                )}
                
                {!loading && !error && videos.length === 0 && (
                  <p className="text-center text-gray-400 my-12">No videos found. Create some!</p>
                )}
                
                {!loading && !error && videos.length > 0 && (
                  <VideoGrid 
                    videos={videos} 
                    handleStartReel={handleStartReel} 
                    handleDeleteVideo={handleDeleteVideo}
                    isDeleting={isDeleting}
                  />
                )}
              </div>

              {/* Create Tab */}
              <div 
                className={`transition-all duration-300 ${
                  activeTab === 'create' 
                    ? 'translate-x-0 opacity-100' 
                    : '-translate-x-full absolute opacity-0'
                }`}
              >
                <h2 className="text-2xl font-bold mb-6">Create New Video</h2>
                
                {createSuccess && (
                  <div className="bg-green-500 bg-opacity-20 border border-green-500 rounded-md p-4 mb-6">
                    Video created successfully!
                  </div>
                )}
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2" htmlFor="celebrity-name">
                      Sports celebrity's name
                    </label>
                    <input
                      id="celebrity-name"
                      type="text"
                      value={celebrityName}
                      onChange={(e) => setCelebrityName(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter celebrity name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2" htmlFor="expertise">
                      Field of expertise
                    </label>
                    <input
                      id="expertise"
                      type="text"
                      value={expertise}
                      onChange={(e) => setExpertise(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter field of expertise"
                    />
                  </div>
                  
                  {error && (
                    <div className="text-red-500 text-sm">{error}</div>
                  )}
                  
                  <button
                    onClick={handleCreateVideo}
                    disabled={isCreating}
                    className={`w-full flex items-center justify-center px-4 py-3 bg-blue-600 rounded-md font-medium ${
                      isCreating ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700'
                    }`}
                  >
                    {isCreating ? (
                      <>
                        <span className="animate-spin mr-2">
                          <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </span>
                        Processing Video...
                      </>
                    ) : (
                      'Create Video'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      )}
    </>
  );
};

// Navigation Button Component
const NavButton = ({ active, onClick, label, icon }) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center px-3 py-2 text-sm font-medium transition-colors duration-200 ${
        active ? 'text-blue-500' : 'text-gray-400 hover:text-white'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <div className="mb-1">
        {icon}
      </div>
      <span>{label}</span>
    </button>
  );
};

// Video Grid Component
const VideoGrid = ({ videos, handleStartReel, handleDeleteVideo, isDeleting }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {videos.map((video, index) => (
        <VideoCard 
          key={index} 
          video={video} 
          videoIdx={index} 
          handleStartReel={handleStartReel} 
          handleDeleteVideo={handleDeleteVideo}
          isDeleting={isDeleting}
        />
      ))}
    </div>
  );
};

// Video Card Component
const VideoCard = ({ video, videoIdx, handleStartReel, handleDeleteVideo, isDeleting }) => {
  // Format view count (e.g. 1200000 -> 1.2M)
  const formatViewCount = (count) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count;
  };

  // Prevent event propagation when clicking delete button
  const handleDeleteClick = (e, id) => {
    e.stopPropagation();
    handleDeleteVideo(id);
  };

  // Extract timestamp from video URL or use a placeholder
  // In a real app, you would use actual view counts from the API
  const viewCount = Math.floor(Math.random() * 10000000); // Random view count for demo
  
  // Format creation date
  const createdAt = new Date(video.createdAt).toLocaleDateString();

  return (
    <div 
      onClick={() => handleStartReel(videoIdx)} 
      className="relative bg-gray-900 rounded-md overflow-hidden group cursor-pointer"
    >
      <div className="relative pb-[177.77%]">
        <img 
          src={video.thumbnail} 
          alt={video.title}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            // Fallback for broken images
            e.target.src = 'https://via.placeholder.com/300x500?text=Thumbnail';
          }}
        />
        <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 bg-white bg-opacity-80 rounded-full flex items-center justify-center">
            <Play className="w-6 h-6 text-black" />
          </div>
        </div>
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs font-medium">
          {formatViewCount(viewCount)}
        </div>
        
        {/* Delete button */}
        <button
          onClick={(e)=>handleDeleteClick(e, video.title)}
          disabled={isDeleting}
          className="absolute top-2 right-2 bg-red-500 bg-opacity-80 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
          title="Delete video"
        >
          <Trash2 className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
};

// Loading Spinner
const LoadingSpinner = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="mt-4 text-gray-400">{message}</p>
    </div>
  );
};

// Error Message
const ErrorMessage = ({ message, onRetry }) => {
  return (
    <div className="text-center p-8">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500 bg-opacity-10 text-red-500 mb-4">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      </div>
      <h3 className="text-lg font-medium mb-2">Error</h3>
      <p className="text-gray-400 mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
      >
        Try Again
      </button>
    </div>
  );
};

export default VideoGallery;