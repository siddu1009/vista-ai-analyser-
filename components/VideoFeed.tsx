import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { AnalysisMode } from '../types';

interface VideoFeedProps {
  isActive: boolean;
  mode: AnalysisMode;
  deviceId: string;
  onToggleActive: () => void;
  onCycleMode: () => void;
  onObjectsDetected: (objects: { class: string; score: number }[]) => void;
}

const VideoFeed = forwardRef<{ captureFrame: () => string | null }, VideoFeedProps>(
  ({ isActive, mode, deviceId, onToggleActive, onCycleMode, onObjectsDetected }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const modelRef = useRef<any>(null); // For cocoSsd or Hands model
    const animationFrameId = useRef<number>();
    const lastGestureTime = useRef(0);
    const gestureHeldTime = useRef(0);
    const lastGesture = useRef<string | null>(null);

    const [feedbackText, setFeedbackText] = useState('');
    const [feedbackTimeout, setFeedbackTimeout] = useState<number | null>(null);

    const showFeedback = useCallback((text: string, duration: number = 1500) => {
        setFeedbackText(text);
        if (feedbackTimeout) clearTimeout(feedbackTimeout);
        const timeout = window.setTimeout(() => setFeedbackText(''), duration);
        setFeedbackTimeout(timeout);
    }, [feedbackTimeout]);

    // FIX: Moved onHandResults before the useEffect that uses it to resolve the "used before declaration" error.
    const onHandResults = useCallback((results: any) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (results.multiHandLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
                (window as any).drawConnectors(ctx, landmarks, (window as any).HAND_CONNECTIONS, { color: '#00aaff', lineWidth: 5 });
                (window as any).drawLandmarks(ctx, landmarks, { color: '#ffffff', lineWidth: 2 });
            }

            // Gesture detection logic
            const now = Date.now();
            if (results.multiHandLandmarks.length === 1) {
                const landmarks = results.multiHandLandmarks[0];
                const wrist = landmarks[0];
                const thumbTip = landmarks[4];
                const indexTip = landmarks[8];
                const middleTip = landmarks[12];
                const ringTip = landmarks[16];
                const pinkyTip = landmarks[20];
                
                const isFist = 
                    Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y) < Math.hypot(wrist.x - indexTip.x, wrist.y - indexTip.y) * 0.3 &&
                    Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y) < Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y) &&
                    Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y) < Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y) &&
                    Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y) < Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);

                const isOpenHand = 
                    Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y) > Math.hypot(wrist.x - indexTip.x, wrist.y - indexTip.y) * 0.5 &&
                    Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y) > Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y) * 0.9 &&
                    Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y) > Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y) * 0.9 &&
                    Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y) > Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y) * 0.9;

                let currentGesture = null;
                if(isFist) currentGesture = 'fist';
                else if(isOpenHand) currentGesture = 'open';

                if(currentGesture && currentGesture === lastGesture.current) {
                    gestureHeldTime.current += now - lastGestureTime.current;
                } else {
                    lastGesture.current = currentGesture;
                    gestureHeldTime.current = 0;
                }

                if (gestureHeldTime.current > 1000) { // 1 second hold
                    if (lastGesture.current === 'fist') {
                        onToggleActive();
                        showFeedback('SYSTEM PAUSED');
                    } else if (lastGesture.current === 'open') {
                        onCycleMode();
                        showFeedback('MODE CYCLED');
                    }
                    gestureHeldTime.current = -2000; // Cooldown
                }
            }
            lastGestureTime.current = now;
        } else {
            lastGesture.current = null;
            gestureHeldTime.current = 0;
        }

    }, [onCycleMode, onToggleActive, showFeedback]);

    // Load ML models based on mode
    useEffect(() => {
        const loadModel = () => {
            // Clear previous model reference
            if (modelRef.current) {
                if (typeof modelRef.current.dispose === 'function') {
                    modelRef.current.dispose();
                } else if (typeof modelRef.current.close === 'function') {
                    modelRef.current.close();
                }
                modelRef.current = null;
            }

            if (mode === AnalysisMode.ObjectDetection) {
                const tryLoadCoco = () => {
                    if ((window as any).cocoSsd) {
                        showFeedback('Loading Object Detection Model...');
                        (window as any).cocoSsd.load().then((loadedModel: any) => {
                            modelRef.current = loadedModel;
                            showFeedback('Model Loaded!', 1000);
                        }).catch((err: any) => console.error("COCO-SSD failed to load", err));
                    } else {
                        setTimeout(tryLoadCoco, 300); // Check again soon
                    }
                };
                tryLoadCoco();
            } else if (mode === AnalysisMode.HandGesture) {
                const tryLoadHands = () => {
                    if ((window as any).Hands && (window as any).drawConnectors && (window as any).HAND_CONNECTIONS) {
                        showFeedback('Loading Hand Gesture Model...');
                        const hands = new (window as any).Hands({
                            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                        });
                        hands.setOptions({
                            maxNumHands: 2,
                            modelComplexity: 1,
                            minDetectionConfidence: 0.5,
                            minTrackingConfidence: 0.5
                        });
                        hands.onResults(onHandResults);
                        modelRef.current = hands;
                        showFeedback('Model Loaded!', 1000);
                    } else {
                        setTimeout(tryLoadHands, 300); // Check again soon
                    }
                };
                tryLoadHands();
            }
        };

        if (isActive) {
            loadModel();
        } else {
            if (modelRef.current) {
                 if (typeof modelRef.current.dispose === 'function') {
                    modelRef.current.dispose();
                } else if (typeof modelRef.current.close === 'function') {
                    modelRef.current.close();
                }
                modelRef.current = null;
            }
        }

        return () => {
             if (modelRef.current) {
                // FIX: Check for both dispose (tfjs) and close (mediapipe) to prevent memory leaks.
                if (typeof modelRef.current.dispose === 'function') {
                    modelRef.current.dispose();
                } else if (typeof modelRef.current.close === 'function') {
                    modelRef.current.close();
                }
                modelRef.current = null;
            }
        };
    }, [mode, isActive, onHandResults, showFeedback]);


    // FIX: Robustly handle starting and stopping the video stream to prevent errors.
    useEffect(() => {
      let stream: MediaStream | null = null;

      const startVideo = async () => {
        // First, ensure any existing stream is stopped.
        if (videoRef.current && videoRef.current.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }

        if (isActive && deviceId && videoRef.current) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          } catch (err) {
            console.error("Error accessing camera:", err);
            showFeedback('COULD NOT START VIDEO', 3000);
          }
        }
      };

      startVideo();

      // The cleanup function is crucial. It runs when dependencies change or the component unmounts.
      return () => {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      };
    }, [isActive, deviceId, showFeedback]);

    useEffect(() => {
      const loop = async () => {
        if (isActive && videoRef.current && videoRef.current.readyState >= 3) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (canvas) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            if (mode === AnalysisMode.ObjectDetection && modelRef.current && (window as any).tf) {
                 // FIX: Manually create and dispose of tensors to prevent GPU memory leaks.
                const tf = (window as any).tf;
                const videoTensor = tf.browser.fromPixels(video);
                const predictions = await modelRef.current.detect(videoTensor);
                videoTensor.dispose(); // IMPORTANT: Release tensor memory

                onObjectsDetected(predictions);
                const ctx = canvas?.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0,0, canvas.width, canvas.height);
                    predictions.forEach((prediction: any) => {
                        ctx.beginPath();
                        ctx.rect(...prediction.bbox);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#00aaff';
                        ctx.fillStyle = '#00aaff';
                        ctx.stroke();
                        ctx.font = '18px Orbitron';
                        ctx.fillText(`${prediction.class} (${Math.round(prediction.score * 100)}%)`, prediction.bbox[0], prediction.bbox[1] > 10 ? prediction.bbox[1] - 5 : 10);
                    });
                }
            } else if (mode === AnalysisMode.HandGesture && modelRef.current) {
                await modelRef.current.send({ image: video });
            } else {
                const ctx = canvas?.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0,0, canvas.width, canvas.height);
                }
            }
        }
        animationFrameId.current = requestAnimationFrame(loop);
      };

      animationFrameId.current = requestAnimationFrame(loop);

      return () => {
        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
        }
      };
    }, [isActive, mode, onObjectsDetected]);

    useImperativeHandle(ref, () => ({
      captureFrame: () => {
        if (videoRef.current && canvasRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
          }
        }
        return null;
      },
    }));

    return (
      <div className="relative w-full h-full bg-black rounded-lg overflow-hidden shadow-lg">
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
        {!isActive && (
            <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
                <h2 className="text-3xl font-display text-gray-400">SYSTEM PAUSED</h2>
            </div>
        )}
        {isActive && mode === AnalysisMode.ContextualQA && (
             <div className="absolute top-4 left-4 bg-black bg-opacity-50 p-2 rounded">
                <h2 className="text-xl font-display text-vista-accent">CONTEXTUAL Q&A MODE</h2>
                <p>Ask Jarvis about the scene.</p>
            </div>
        )}
         {feedbackText && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center transition-opacity duration-300">
                <h2 className="text-4xl font-display text-vista-accent animate-pulse">{feedbackText}</h2>
            </div>
        )}
      </div>
    );
  }
);

export default VideoFeed;