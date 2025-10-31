import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { AnalysisMode, LogType } from '../types';
import CameraIcon from './icons/CameraIcon';
import PlayIcon from './icons/PlayIcon';
import PauseIcon from './icons/PauseIcon';
import QuestionMarkCircleIcon from './icons/QuestionMarkCircleIcon';

// Declare global variables from included scripts
declare const tf: any;
declare const cocoSsd: any;
declare const Hands: any;
declare const drawConnectors: any;
declare const drawLandmarks: any;

const GESTURE_HOLD_DURATION = 1000; // ms

interface VideoFeedProps {
  selectedCameraId: string | null;
  isSystemActive: boolean;
  onStreamError: (message: string) => void;
  analysisMode: AnalysisMode;
  onClientDetection: (type: LogType, message: string) => void;
  onToggleSystemActive: () => void;
  onSwitchAnalysisMode: () => void;
  onObjectsDetected: (objects: string[]) => void;
}

export interface VideoFeedHandle {
    captureFrame: () => Promise<string>;
}

const VideoFeed = forwardRef<VideoFeedHandle, VideoFeedProps>(({ 
    selectedCameraId, 
    isSystemActive, 
    onStreamError,
    analysisMode,
    onClientDetection,
    onToggleSystemActive,
    onSwitchAnalysisMode,
    onObjectsDetected,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const [models, setModels] = useState<{ object?: any; hand?: any }>({});
  const [modelsLoading, setModelsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing AI engine...');

  const handResultsRef = useRef<any>(null);
  const lastGestureRef = useRef<string | null>(null);
  const gestureActionTimeoutRef = useRef<number | null>(null);
  const visualFeedbackRef = useRef<{ message: string; expiry: number } | null>(null);
  const isSystemActiveRef = useRef(isSystemActive);

  const objectsLogIntervalRef = useRef<number | null>(null);
  const detectedObjectsRef = useRef<{[key: string]: number}>({});

  // Refs to hold latest callbacks to prevent stale closures in `onResults`
  const onClientDetectionRef = useRef(onClientDetection);
  useEffect(() => { onClientDetectionRef.current = onClientDetection; }, [onClientDetection]);
  
  const onToggleSystemActiveRef = useRef(onToggleSystemActive);
  useEffect(() => { onToggleSystemActiveRef.current = onToggleSystemActive; }, [onToggleSystemActive]);

  const onSwitchAnalysisModeRef = useRef(onSwitchAnalysisMode);
  useEffect(() => { onSwitchAnalysisModeRef.current = onSwitchAnalysisMode; }, [onSwitchAnalysisMode]);

  useEffect(() => {
    isSystemActiveRef.current = isSystemActive;
  }, [isSystemActive]);
  
  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      return new Promise((resolve, reject) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState === 4) {
          const context = canvas.getContext('2d');
          if (context) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            resolve(dataUrl);
          } else {
            reject("Could not get canvas context.");
          }
        } else {
          reject("Video not ready or canvas not available.");
        }
      });
    }
  }));

  const classifyHandGesture = useCallback((landmarks: any[]) => {
      const isFist = () => {
          return landmarks[8].y > landmarks[6].y && 
                 landmarks[12].y > landmarks[10].y &&
                 landmarks[16].y > landmarks[14].y &&
                 landmarks[20].y > landmarks[18].y;
      };
      const isOpenHand = () => {
          return landmarks[8].y < landmarks[6].y &&
                 landmarks[12].y < landmarks[10].y &&
                 landmarks[16].y < landmarks[14].y &&
                 landmarks[20].y < landmarks[18].y;
      }
      if (isFist()) return "Closed Fist";
      if (isOpenHand()) return "Open Hand";
      return null;
  }, []);

  // Load ML models - This effect should only run once.
  useEffect(() => {
    const loadModels = async () => {
      try {
        setModelsLoading(true);
        setLoadingMessage('Initializing AI engine...');

        // Explicitly set backend and wait for it to be ready for stability.
        setLoadingMessage('Setting TensorFlow.js backend...');
        await tf.setBackend('webgl');
        await tf.ready();

        setLoadingMessage('Loading object detection model (COCO-SSD)...');
        const objectDetector = await cocoSsd.load();
        
        setLoadingMessage('Loading hand gesture model (MediaPipe)...');
        const handDetector = new Hands({locateFile: (file: string) => {
          // Pin version to match the script tag in index.html for consistency.
          return `https://cdn.jsdelivr.net/npm/@medipe/hands@0.4.1675469240/${file}`;
        }});
        handDetector.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        handDetector.onResults((results: any) => {
            handResultsRef.current = results;
            let currentGesture: string | null = null;
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                currentGesture = classifyHandGesture(results.multiHandLandmarks[0]);
            }
            if (currentGesture && currentGesture !== lastGestureRef.current) {
                onClientDetectionRef.current(LogType.Gesture, `Gesture detected: ${currentGesture}`);
            }

            if (currentGesture !== lastGestureRef.current) {
                if (gestureActionTimeoutRef.current) {
                    clearTimeout(gestureActionTimeoutRef.current);
                    gestureActionTimeoutRef.current = null;
                }
                lastGestureRef.current = currentGesture;

                if (currentGesture === 'Closed Fist' || currentGesture === 'Open Hand') {
                    gestureActionTimeoutRef.current = window.setTimeout(() => {
                        if (lastGestureRef.current === 'Closed Fist') {
                            onToggleSystemActiveRef.current();
                            visualFeedbackRef.current = { message: isSystemActiveRef.current ? 'SYSTEM PAUSED' : 'SYSTEM RESUMED', expiry: Date.now() + 2000 };
                        } else if (lastGestureRef.current === 'Open Hand') {
                            onSwitchAnalysisModeRef.current();
                            visualFeedbackRef.current = { message: 'MODE SWITCHED', expiry: Date.now() + 2000 };
                        }
                        lastGestureRef.current = null; // Prevent re-triggering
                    }, GESTURE_HOLD_DURATION);
                }
            }
        });

        setLoadingMessage('Finalizing setup...');
        setModels({ object: objectDetector, hand: handDetector });
        onClientDetectionRef.current(LogType.System, "Hello. I am Jarvis, the reasoning layer for the VISTA system. How can I assist you?");

        setTimeout(() => {
            setModelsLoading(false);
        }, 500);

      } catch (error) {
        console.error("Failed to load models:", error);
        setLoadingMessage('Error loading models. Check console for details.');
        onClientDetectionRef.current(LogType.Error, "Could not load models. This might be a network issue or a content blocker preventing access to model files.");
      }
    };
    loadModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classifyHandGesture]);
  
  // Setup and teardown camera stream
  useEffect(() => {
    const startStream = async () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (selectedCameraId) {
        try {
          const constraints = {
            video: {
              deviceId: { exact: selectedCameraId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
            console.error('Error accessing camera:', err);
            onStreamError('Could not access the selected camera. Please check permissions and device availability.');
        }
      }
    };
    startStream();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedCameraId, onStreamError]);

  // Real-time detection logging interval
  useEffect(() => {
    if (objectsLogIntervalRef.current) {
        clearInterval(objectsLogIntervalRef.current);
        objectsLogIntervalRef.current = null;
    }

    if (isSystemActive && analysisMode === AnalysisMode.ObjectDetection) {
        objectsLogIntervalRef.current = window.setInterval(() => {
            const objects = detectedObjectsRef.current;
            if (Object.keys(objects).length > 0) {
                const message = "Currently detecting: " + Object.entries(objects)
                    .map(([name, count]: [string, number]) => `${count} ${name}${count > 1 ? 's' : ''}`)
                    .join(', ');
                onClientDetection(LogType.Analysis, message);
            }
        }, 5000); // Log summary every 5 seconds
    }
    return () => {
      if (objectsLogIntervalRef.current) {
        clearInterval(objectsLogIntervalRef.current);
      }
    }
  }, [isSystemActive, analysisMode, onClientDetection]);

  const drawObjectDetections = (predictions: any[], ctx: CanvasRenderingContext2D) => {
    const objectCounts: { [key: string]: number } = {};

    predictions.forEach(prediction => {
      const count = (objectCounts[prediction.class] || 0) + 1;
      objectCounts[prediction.class] = count;

      const [x, y, width, height]: [number, number, number, number] = prediction.bbox;
      const text = `${prediction.class} ${count} (${Math.round(prediction.score * 100)}%)`;

      const color = '#10B981'; // Emerald 500 from Tailwind
      const textColor = '#FFFFFF';
      const boxLineWidth = 4;
      const font = 'bold 16px sans-serif';
      
      ctx.font = font;
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = 16; // approximate
      const horizontalPadding = 4;
      const verticalPadding = 4;
      const labelHeight = textHeight + (verticalPadding * 2);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = boxLineWidth;
      ctx.strokeRect(x, y, width, height);

      let labelYPosition = y - labelHeight;
      if (labelYPosition < 0) {
        labelYPosition = y;
      }
      
      ctx.fillStyle = color;
      ctx.fillRect(
        x,
        labelYPosition,
        textWidth + (horizontalPadding * 2),
        labelHeight
      );

      ctx.fillStyle = textColor;
      ctx.fillText(text, x + horizontalPadding, labelYPosition + textHeight + verticalPadding);
    });
  };

  // Main detection loop
  useEffect(() => {
    const detectionLoop = async () => {
        if (!videoRef.current || videoRef.current.readyState !== 4) {
            animationFrameId.current = requestAnimationFrame(detectionLoop);
            return;
        }
        
        const video = videoRef.current;
        const overlay = overlayCanvasRef.current;
        if (!overlay) return;
        const ctx = overlay.getContext('2d');
        if (!ctx) return;
        
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        // Always process hand gestures in this mode
        if (analysisMode === AnalysisMode.HandGesture && models.hand) {
            await models.hand.send({image: video});
            const results = handResultsRef.current;
            if (results && results.multiHandLandmarks) {
                const gesture = classifyHandGesture(results.multiHandLandmarks[0]);
                for (const landmarks of results.multiHandLandmarks) {
                    const gestureColor = gesture === 'Open Hand' ? '#22c55e' : gesture === 'Closed Fist' ? '#facc15' : '#00aaff';
                    drawConnectors(ctx, landmarks, Hands.HAND_CONNECTIONS, {color: gestureColor, lineWidth: 5});
                    drawLandmarks(ctx, landmarks, {color: '#eeeeee', lineWidth: 2});

                    if (gesture && landmarks === results.multiHandLandmarks[0]) {
                        const wrist = landmarks[0];
                        if (wrist) {
                            ctx.fillStyle = gestureColor;
                            ctx.font = 'bold 20px sans-serif';
                            ctx.textAlign = 'left';
                            ctx.fillText(gesture, wrist.x * overlay.width + 10, wrist.y * overlay.height - 20);
                        }
                    }
                }
            }
        }

        // Process object detection only if active
        if (isSystemActive && analysisMode === AnalysisMode.ObjectDetection && models.object) {
            const predictions = await models.object.detect(video);
            drawObjectDetections(predictions, ctx);
            const currentObjects: {[key: string]: number} = {};
            predictions.forEach((p: any) => {
                currentObjects[p.class] = (currentObjects[p.class] || 0) + 1;
            });
            
            // Debounce reporting detected objects
            if(JSON.stringify(Object.keys(detectedObjectsRef.current)) !== JSON.stringify(Object.keys(currentObjects))) {
                onObjectsDetected(Object.keys(currentObjects));
            }
            detectedObjectsRef.current = currentObjects;
        }

        // Draw visual feedback for triggered actions
        if (visualFeedbackRef.current && visualFeedbackRef.current.expiry > Date.now()) {
            ctx.fillStyle = 'rgba(0, 170, 255, 0.85)';
            ctx.fillRect(0, overlay.height / 2 - 35, overlay.width, 70);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 36px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(visualFeedbackRef.current.message, overlay.width / 2, overlay.height / 2);
        } else if (visualFeedbackRef.current) {
            visualFeedbackRef.current = null;
        }

        animationFrameId.current = requestAnimationFrame(detectionLoop);
    };

    if (!modelsLoading) {
      animationFrameId.current = requestAnimationFrame(detectionLoop);
    } else {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      const overlay = overlayCanvasRef.current;
      if (overlay) {
          const ctx = overlay.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
    }

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [isSystemActive, analysisMode, models, modelsLoading, classifyHandGesture, onClientDetection, onObjectsDetected]);


  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden shadow-lg flex items-center justify-center">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={overlayCanvasRef} className="absolute top-0 left-0 w-full h-full object-cover" />

      {!selectedCameraId && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 text-vista-text-muted">
          <CameraIcon className="w-16 h-16 mb-4" />
          <p className="text-lg">Select a camera to begin</p>
        </div>
      )}
       {modelsLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 text-vista-text">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-vista-accent mb-4"></div>
          <p className="text-lg font-semibold">Loading VISTA Engine</p>
          <p className="text-sm text-vista-text-muted mt-1">{loadingMessage}</p>
        </div>
      )}
      {analysisMode === AnalysisMode.ContextualQnA && !modelsLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-60 text-vista-text pointer-events-none">
            <QuestionMarkCircleIcon className="w-16 h-16 mb-4 text-vista-accent opacity-80" />
            <h3 className="text-xl font-bold">Contextual Q&A Mode</h3>
            <p className="text-md text-vista-text-muted">Ask Jarvis about what you see.</p>
        </div>
      )}
      <div className="absolute top-4 right-4 flex items-center space-x-2 bg-black bg-opacity-50 p-2 rounded-lg">
        <span className={`w-3 h-3 rounded-full ${isSystemActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
        <span className="text-sm font-medium">{isSystemActive ? 'ACTIVE' : 'PAUSED'}</span>
        {isSystemActive ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
      </div>
    </div>
  );
});

export default VideoFeed;